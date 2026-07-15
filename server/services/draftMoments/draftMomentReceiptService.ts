/**
 * Draft Moment Engine — receipt collection.
 *
 * Reuses existing authorities (ESPN ADP map, league roster rules, draft_picks history, gmTeams
 * identity, rivalry service, DP-timing profile). It DERIVES only the four values that no service
 * owns (ADP delta, tier-cliff gap, position-run count, earliest-timing anomaly) — it never
 * recreates another service's business logic.
 *
 * `loadReceiptContext` is the async/DB half (used by the builder). `collectReceipts` is pure given
 * a context, so unit tests can pass a fixed context with no DB.
 */
import { IDP_POSITIONS, type DraftMomentReceipt, type MomentConfig, DEFAULT_MOMENT_CONFIG } from "./draftMomentTypes";
import type { ClassifierInput } from "./draftMomentClassifier";
import type { ResolvedOwner } from "./draftMomentIdentityService";

export const normName = (n: unknown) => String(n ?? "").toLowerCase().replace(/[.''`]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").trim();

export interface RegistryEntry { norm: string; position: string; adp: number | null }

export interface ReceiptContext {
  leagueId: string;
  adpByName: Map<string, number>;
  registry: RegistryEntry[];
  historyByKey: Map<string, Map<string, Array<{ season: number; round: number }>>>;
  seasonsByKey: Map<string, Set<number>>;
  rivalById: Map<string, { rivalName: string; heat: string }>;
  focalMemberId: string;
  /** DP draft window in OVERALL-PICK numbers (verified fields from PositionTimingProfile). */
  dpWindow: { startPick: number | null; endPick: number | null } | null;
  teamCount: number;
  starters: Record<string, number>;
}

export interface MockPickLike {
  overall: number;
  round: number;
  roundPick: number;
  teamId: string;
  ownerName: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string | null;
}

export interface CollectResult {
  receipts: DraftMomentReceipt[];
  facts: ClassifierInput;
  adp: number | null;
}

const R = (r: Omit<DraftMomentReceipt, "confidence"> & { confidence?: number }): DraftMomentReceipt =>
  ({ ...r, confidence: r.confidence ?? (r.status === "available" ? 0.9 : 0) });

export function collectReceipts(
  pick: MockPickLike,
  ctx: ReceiptContext,
  owner: ResolvedOwner,
  rosterBefore: Record<string, number>,
  recentPositions: string[],
  drafted: Set<string>,
  config: MomentConfig = DEFAULT_MOMENT_CONFIG,
): CollectResult {
  const pos = String(pick.position ?? "?").toUpperCase();
  const isIdp = IDP_POSITIONS.has(pos);
  const round = pick.round;
  const plN = normName(pick.playerName);
  const receipts: DraftMomentReceipt[] = [];

  // identity receipt
  receipts.push(R({ id: "identity", type: "identity", status: "available", source: owner.identitySource, authority: "ownerIdentity", value: { scope: owner.identityScope, ownerId: owner.ownerId }, supportedClaim: `${owner.ownerName} selected ${pick.playerName} (${pos}) at pick ${pick.overall}, round ${round}.` }));

  // ADP + delta
  const adp = ctx.adpByName.get(plN) ?? null;
  const delta = adp != null ? Number((pick.overall - adp).toFixed(1)) : null;
  receipts.push(adp != null
    ? R({ id: "adp", type: "adp", status: "available", source: "espnInfoMap+registry", authority: "ESPN", value: adp, supportedClaim: `${pick.playerName} ADP ${adp}.` })
    : R({ id: "adp", type: "adp", status: "unsupported", source: "espnInfoMap+registry", authority: "ESPN", notes: "ADP not found for player name" }));
  receipts.push(delta != null
    ? R({ id: "adpDelta", type: "adpDelta", status: "available", source: "derived(overall-adp)", authority: "derived", value: delta, supportedClaim: delta < 0 ? `${owner.ownerName} took ${pick.playerName} ${Math.abs(delta)} picks ahead of ADP.` : `${pick.playerName} fell ${delta} picks past ADP.` })
    : R({ id: "adpDelta", type: "adpDelta", status: "unsupported", source: "derived", authority: "derived" }));

  // roster need / starter requirement
  const startReq = ctx.starters[pos] ?? 0;
  receipts.push(startReq > 0
    ? R({ id: "rosterNeed", type: "rosterNeed", status: "available", source: "leagueRosterRules", authority: "leagueRosterRules", confidence: 0.8, value: { have: rosterBefore[pos] ?? 0, need: startReq, needsStarter: (rosterBefore[pos] ?? 0) < startReq }, supportedClaim: (rosterBefore[pos] ?? 0) < startReq ? `${owner.ownerName} still needed a starting ${pos}.` : undefined })
    : R({ id: "rosterNeed", type: "rosterNeed", status: "not_applicable", source: "leagueRosterRules", authority: "leagueRosterRules", notes: `league does not start ${pos}` }));

  // position run (derived)
  const runIncl = recentPositions.slice(-config.positionRunWindow).filter((p) => p === pos).length + 1;
  receipts.push(R({ id: "positionRun", type: "positionRun", status: "available", source: "derived(window)", authority: "derived", confidence: 0.85, value: { includingThis: runIncl, window: config.positionRunWindow }, supportedClaim: runIncl >= 3 ? `${runIncl} ${pos}s in the last ${config.positionRunWindow} picks.` : undefined }));

  // tier cliff (offense only; IDP explicitly excluded from ADP-based scoring)
  let tierGap: number | null = null;
  if (!isIdp && adp != null) {
    const next = ctx.registry
      .filter((x) => x.position === pos && x.adp != null && !drafted.has(x.norm) && x.norm !== plN)
      .sort((a, b) => (a.adp as number) - (b.adp as number))[0];
    if (next && next.adp != null) { tierGap = Number((next.adp - adp).toFixed(1)); }
    receipts.push(tierGap != null
      ? R({ id: "tierCliff", type: "tierCliff", status: "available", source: "derived(board ADP gap)", authority: "derived", confidence: 0.8, value: { gapToNext: tierGap }, supportedClaim: tierGap >= config.tierCliff.moderateGap ? `The next ${pos} on the board sits +${tierGap} ADP.` : undefined })
      : R({ id: "tierCliff", type: "tierCliff", status: "unsupported", source: "derived", authority: "derived" }));
  } else {
    receipts.push(R({ id: "tierCliff", type: "tierCliff", status: "not_applicable", source: "derived", authority: "derived", notes: isIdp ? "IDP not scored via offense ADP" : "no ADP" }));
  }

  // owner/franchise frequency + earliest-timing anomaly (from draft_picks by historyKey)
  const posHist = ctx.historyByKey.get(owner.historyKey)?.get(pos) ?? [];
  const seasons = ctx.seasonsByKey.get(owner.historyKey)?.size ?? 0;
  const idKind = owner.identityScope === "person" ? "draft_picks/person" : "draft_picks/franchise";
  let timingFacts: ClassifierInput["ownerTiming"] = null;
  if (seasons >= 2 && posHist.length) {
    const earliest = Math.min(...posHist.map((h) => h.round));
    const latest = Math.max(...posHist.map((h) => h.round));
    const seasonsWithPos = new Set(posHist.map((h) => h.season)).size;
    const anomaly = round < earliest ? "earliest_ever" : round > latest ? "latest_ever" : null;
    timingFacts = { anomaly, priorEarliest: earliest, seasons };
    const subject = owner.identityScope === "person" ? owner.ownerName : "This franchise";
    receipts.push(R({ id: "ownerFrequency", type: "ownerFrequency", status: "available", source: idKind, authority: "draft_picks", confidence: 0.7, value: { seasons, seasonsWithPos }, supportedClaim: `${subject} has drafted a ${pos} in ${seasonsWithPos} of ${seasons} tracked drafts.` }));
    receipts.push(R({ id: "ownerTiming", type: "ownerTiming", status: "available", source: idKind, authority: "draft_picks", confidence: 0.7, value: { thisRound: round, priorEarliest: earliest, priorLatest: latest, anomaly }, supportedClaim: anomaly === "earliest_ever" ? `${subject === "This franchise" ? "This franchise has not drafted a " + pos + " this early" : subject + "'s earliest " + pos} in tracked history (prev R${earliest}).` : undefined }));
  } else {
    receipts.push(R({ id: "ownerFrequency", type: "ownerFrequency", status: "unsupported", source: idKind, authority: "draft_picks", notes: `<2 tracked seasons for ${owner.identityScope}` }));
    receipts.push(R({ id: "ownerTiming", type: "ownerTiming", status: "unsupported", source: idKind, authority: "draft_picks" }));
  }

  // DP timing (IDP only) — deviation in rounds OUTSIDE the verified DP window (overall-pick bounds)
  let dpDeviation: number | null = null;
  if (isIdp) {
    const w = ctx.dpWindow;
    if (w && (w.startPick != null || w.endPick != null)) {
      const tc = Math.max(1, ctx.teamCount);
      let devRounds = 0;
      if (w.startPick != null && pick.overall < w.startPick) devRounds = Math.round((w.startPick - pick.overall) / tc);
      else if (w.endPick != null && pick.overall > w.endPick) devRounds = Math.round((pick.overall - w.endPick) / tc);
      dpDeviation = devRounds;
      receipts.push(R({ id: "dpTiming", type: "dpTiming", status: "available", source: "leagueDraftTimingProfile.dp", authority: "leagueDraftTimingProfile", confidence: 0.75, value: { windowStartPick: w.startPick, windowEndPick: w.endPick, thisPick: pick.overall, deviationRounds: devRounds }, supportedClaim: devRounds >= config.dpTiming.moderateDeviation ? `This IDP was taken ${devRounds} rounds outside the league's typical defender window.` : undefined }));
    } else {
      receipts.push(R({ id: "dpTiming", type: "dpTiming", status: "unsupported", source: "leagueDraftTimingProfile.dp", authority: "leagueDraftTimingProfile", notes: "no dp window profile" }));
    }
  } else {
    receipts.push(R({ id: "dpTiming", type: "dpTiming", status: "not_applicable", source: "leagueDraftTimingProfile.dp", authority: "leagueDraftTimingProfile", notes: "DP-window applies to IDP only" }));
  }

  // rivalry (memberId match; context only unless a specific impact receipt exists — which it never does here)
  if (ctx.focalMemberId) {
    const hit = owner.ownerId && (owner.ownerId === ctx.focalMemberId || ctx.rivalById.has(owner.ownerId))
      ? (ctx.rivalById.get(owner.ownerId) ?? { rivalName: "(focal user)", heat: "-" }) : null;
    receipts.push(hit
      ? R({ id: "rivalry", type: "rivalry", status: "available", source: "rivalryService(memberId)", authority: "rivalryService", confidence: 0.6, value: { matchKey: "gmTeams.ownerId===RivalryPair.rivalId", rival: hit.rivalName, heat: hit.heat }, supportedClaim: `${owner.ownerName} is in the focal user's tracked rival set (${hit.heat}).` })
      : R({ id: "rivalry", type: "rivalry", status: "not_applicable", source: "rivalryService", authority: "rivalryService", notes: "owner not in focal rival set" }));
  } else {
    receipts.push(R({ id: "rivalry", type: "rivalry", status: "unsupported", source: "rivalryService", authority: "rivalryService" }));
  }
  // specific rivalry IMPACT is never computed here → explicit not_applicable so validator blocks impact language
  receipts.push(R({ id: "rivalryImpact", type: "rivalryImpact", status: "not_applicable", source: "n/a", authority: "n/a", notes: "specific pick-vs-rival impact not computed" }));

  const facts: ClassifierInput = {
    position: pos,
    round,
    adpDelta: delta,
    tierCliffGap: tierGap,
    positionRunIncludingThis: runIncl,
    ownerTiming: timingFacts,
    dpDeviation,
  };
  return { receipts, facts, adp };
}
