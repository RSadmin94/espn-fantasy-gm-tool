/**
 * Draft Moment Engine — builder / orchestrator.
 *
 * PURE post-processor over an already-finished mock draft. `buildDraftMomentsFromContext` is
 * dependency-free (tests pass a fixed context + resolver). `buildDraftMoments` is the async wrapper
 * that loads the context from existing services/tables. A per-pick failure degrades that pick to a
 * routine selection-only moment; it never interrupts or alters the draft.
 */
import { DEFAULT_MOMENT_CONFIG, type DraftMoment, type MomentConfig } from "./draftMomentTypes";
import { classifyMoment } from "./draftMomentClassifier";
import { collectReceipts, normName, type MockPickLike, type ReceiptContext, type RegistryEntry } from "./draftMomentReceiptService";
import { finalizeClaims, degradeToRoutine } from "./draftMomentEvidenceValidator";
import { buildIdentityResolver, loadTeamSeasonRows, type IdentityResolver, type TeamSeasonRow } from "./draftMomentIdentityService";
import { parseDraftPickTeamNameFromRawPick } from "../../resolveDraftPickOwner";

const STORY_BY_SIGNAL: Record<string, string> = {
  REACH: "REACH", STEAL: "STEAL", TIER_CLIFF: "TIER_BREAK", PATTERN_BREAK: "PATTERN_BREAK",
  CONSEQUENTIAL_RUN: "POSITION_RUN", DP_TIMING: "DP_TIMING",
};

export interface BuildContext {
  leagueId: string;
  draftId: string;
  season: number;
  seed?: string;
  mockPicks: MockPickLike[];
  ctx: ReceiptContext;
  resolver: IdentityResolver;
  config?: MomentConfig;
}

/** PURE: build a DraftMoment[] from a finished mock + a prepared context. No I/O. */
export function buildDraftMomentsFromContext(b: BuildContext): DraftMoment[] {
  const config = b.config ?? DEFAULT_MOMENT_CONFIG;
  const picks = [...b.mockPicks].sort((a, b2) => a.overall - b2.overall);
  const rosterByKey = new Map<string, Record<string, number>>();
  const drafted = new Set<string>();
  const recent: string[] = [];
  const moments: DraftMoment[] = [];

  for (const pick of picks) {
    const pos = String(pick.position ?? "?").toUpperCase();
    let moment: DraftMoment;
    try {
      const owner = b.resolver.resolve(b.season, pick.teamId, pick.ownerName); // current-season resolution
      const before = { ...(rosterByKey.get(owner.historyKey) ?? {}) };
      const { receipts, facts } = collectReceipts(pick, b.ctx, owner, before, recent, drafted, config);
      const { signals, level } = classifyMoment(facts, config);
      const fin = finalizeClaims({ receipts, owner });
      const budget = config.commentary[level];
      const stories = signals.map((s) => STORY_BY_SIGNAL[s.name] ?? s.name);
      moment = {
        eventId: `${b.leagueId}:${b.draftId}:${pick.overall}`,
        leagueId: b.leagueId,
        draftId: b.draftId,
        seed: b.seed,
        overallPick: pick.overall,
        round: pick.round,
        roundPick: pick.roundPick,
        owner: { teamId: owner.teamId, ownerId: owner.ownerId, ownerName: owner.ownerName, identityScope: owner.identityScope, identitySource: owner.identitySource },
        player: { playerId: pick.playerId, playerName: pick.playerName, position: pos, nflTeam: pick.nflTeam, adp: b.ctx.adpByName.get(normName(pick.playerName)) ?? null },
        rosterBeforePick: before,
        receipts,
        signals: signals.map((s) => `${s.name}${s.strong ? "(strong)" : ""}`),
        level,
        permittedClaims: fin.permittedClaims,
        forbiddenClaimCategories: fin.forbiddenClaimCategories,
        primaryStoryline: stories[0] ?? null,
        secondaryStoryline: stories[1] ?? null,
        commentaryBudget: { enabled: budget.enabled, maxSentences: budget.maxSentences, maxWords: budget.maxWords },
        validation: fin.validation,
      };
      if (!fin.validation.valid) moment = degradeToRoutine(moment, fin.validation.errors[0] ?? "validation failed");
    } catch (err: any) {
      // never let a moment failure touch the draft: emit a safe selection-only routine object
      moment = degradeToRoutine({
        eventId: `${b.leagueId}:${b.draftId}:${pick.overall}`, leagueId: b.leagueId, draftId: b.draftId, seed: b.seed,
        overallPick: pick.overall, round: pick.round, roundPick: pick.roundPick,
        owner: { teamId: String(pick.teamId), ownerId: null, ownerName: pick.ownerName, identityScope: "franchise", identitySource: "error-fallback" },
        player: { playerId: pick.playerId, playerName: pick.playerName, position: pos, nflTeam: pick.nflTeam, adp: null },
        rosterBeforePick: {}, receipts: [], signals: [], level: "routine", permittedClaims: [], forbiddenClaimCategories: [],
        primaryStoryline: null, secondaryStoryline: null, commentaryBudget: { enabled: false, maxSentences: 0, maxWords: 0 },
        validation: { valid: false, errors: [], warnings: [] },
      }, `builder error: ${String(err?.message).slice(0, 80)}`);
    }
    moments.push(moment);
    // advance state AFTER building (so rosterBefore is correct)
    drafted.add(normName(pick.playerName));
    recent.push(pos);
    const owner = b.resolver.resolve(b.season, pick.teamId, pick.ownerName);
    const rb = rosterByKey.get(owner.historyKey) ?? {}; rb[pos] = (rb[pos] ?? 0) + 1; rosterByKey.set(owner.historyKey, rb);
  }
  return moments;
}

export interface LoadArgs {
  db: any; sql: any; leagueId: string; season: number;
  mockDraft: any[]; teamCount: number; focalUserId?: number;
  gmTeams: any; getEspnPlayerInfoMap: () => Promise<Map<string, any>>;
  rosterRulesFromLineupSlotCounts: (a: any) => any;
  computeRivalryScores?: (userId?: number, leagueId?: string) => Promise<any[]>;
  computeLeaguePositionTimingProfiles?: (o: any) => Promise<any>;
  config?: MomentConfig;
}

/** ASYNC: load the context from existing services/tables and build moments for a finished mock. */
export async function buildDraftMoments(a: LoadArgs): Promise<{ moments: DraftMoment[]; personViaOwnerId: number; personViaFallback: number; totalRows: number }> {
  const teamRows: TeamSeasonRow[] = await loadTeamSeasonRows(a.db, a.gmTeams, a.leagueId);
  const resolver = buildIdentityResolver(teamRows);

  // ADP map + registry
  const [reg] = (await a.db.execute(a.sql`SELECT espnPlayerId, fullName, position FROM gm_player_registry WHERE fullName IS NOT NULL AND fullName<>''`)) as any;
  const espnInfo = await a.getEspnPlayerInfoMap().catch(() => new Map());
  const adpByName = new Map<string, number>();
  const registry: RegistryEntry[] = [];
  for (const r of reg) {
    const info = espnInfo.get(String(r.espnPlayerId));
    const adp = info?.adp != null ? Number(info.adp) : null;
    if (adp != null) adpByName.set(normName(r.fullName), adp);
    registry.push({ norm: normName(r.fullName), position: String(r.position).toUpperCase(), adp });
  }

  // history keyed by identity historyKey (also measures person-resolution coverage before/after fallback)
  const [hist] = (await a.db.execute(a.sql`SELECT season, roundId, teamId, position, rawPick FROM draft_picks WHERE leagueId=${a.leagueId} AND playerName IS NOT NULL AND playerName<>'' AND position<>'?'`)) as any;
  const historyByKey = new Map<string, Map<string, Array<{ season: number; round: number }>>>();
  const seasonsByKey = new Map<string, Set<number>>();
  let personViaOwnerId = 0, personViaFallback = 0;
  for (const h of hist) {
    const teamName = parseDraftPickTeamNameFromRawPick(typeof h.rawPick === "string" ? h.rawPick : (h.rawPick ? JSON.stringify(h.rawPick) : undefined));
    const owner = resolver.resolve(Number(h.season), h.teamId, undefined, teamName);
    if (owner.identityScope === "person") {
      if (owner.identitySource === "gmTeams.ownerId") personViaOwnerId++; else personViaFallback++;
    }
    const key = owner.historyKey, p = String(h.position).toUpperCase();
    (seasonsByKey.get(key) ?? seasonsByKey.set(key, new Set()).get(key)!).add(Number(h.season));
    const pm = historyByKey.get(key) ?? historyByKey.set(key, new Map()).get(key)!;
    if (!pm.has(p)) pm.set(p, []);
    pm.get(p)!.push({ season: Number(h.season), round: Number(h.roundId) });
  }

  // rivalry
  let rivalById = new Map<string, { rivalName: string; heat: string }>(); let focalMemberId = "";
  if (a.computeRivalryScores && a.focalUserId != null) {
    try { const pairs = await a.computeRivalryScores(a.focalUserId, a.leagueId); focalMemberId = pairs[0]?.memberId ? String(pairs[0].memberId) : ""; for (const p of pairs) rivalById.set(String(p.rivalId), { rivalName: p.rivalName, heat: p.heatLabel }); } catch { }
  }

  // DP timing — read the VERIFIED window fields off PositionTimingProfile.dp (overall-pick bounds)
  let dpWindow: { startPick: number | null; endPick: number | null } | null = null;
  if (a.computeLeaguePositionTimingProfiles) {
    try {
      const prof = await a.computeLeaguePositionTimingProfiles({ db: a.db, sql: a.sql, leagueId: a.leagueId });
      const dp = prof?.dp;
      if (dp) dpWindow = { startPick: dp.windowStartPick ?? null, endPick: dp.windowEndPick ?? null };
    } catch { }
  }

  // starter rules
  let starters: Record<string, number> = { QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1, DP: 1 };
  try {
    const [pl] = (await a.db.execute(a.sql`SELECT payload FROM espn_raw_cache WHERE leagueId=${a.leagueId} AND season=${a.season} AND viewName='combined' LIMIT 1`)) as any;
    const payload = pl[0]?.payload ? (typeof pl[0].payload === "string" ? JSON.parse(pl[0].payload) : pl[0].payload) : null;
    starters = a.rosterRulesFromLineupSlotCounts({ leagueId: a.leagueId, lineupSlotCounts: payload?.settings?.rosterSettings?.lineupSlotCounts }).starters;
  } catch { }

  const ctx: ReceiptContext = { leagueId: a.leagueId, adpByName, registry, historyByKey, seasonsByKey, rivalById, focalMemberId, dpWindow, teamCount: a.teamCount, starters };

  const mockPicks: MockPickLike[] = a.mockDraft.map((pk: any) => {
    const overall = Number(pk.overall ?? pk.overallPick ?? pk.pickNumber);
    return {
      overall, round: Number(pk.round ?? pk.roundId ?? Math.ceil(overall / Math.max(1, a.teamCount))),
      roundPick: Number(pk.roundPick ?? ((overall - 1) % Math.max(1, a.teamCount)) + 1),
      teamId: String(pk.teamId ?? ""), ownerName: String(pk.ownerName ?? pk.teamId ?? ""),
      playerId: String(pk.playerId ?? ""), playerName: String(pk.player ?? pk.playerName ?? "?"),
      position: String(pk.position ?? "?").toUpperCase(), nflTeam: pk.proTeam ?? pk.nflTeam ?? null,
    };
  });

  const moments = buildDraftMomentsFromContext({ leagueId: a.leagueId, draftId: `mock-${a.leagueId}-${a.season}`, season: a.season, seed: `${a.leagueId}:${a.season}`, mockPicks, ctx, resolver, config: a.config });
  return { moments, personViaOwnerId, personViaFallback, totalRows: hist.length };
}
