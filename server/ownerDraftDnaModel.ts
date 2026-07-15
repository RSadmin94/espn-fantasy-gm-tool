/**
 * ownerDraftDnaModel.ts — Phase 2a probabilistic owner draft tendency (offense slice).
 *
 * Owner behavior is a probability signal blended into position choice inside an ADP reach band.
 * Sparse history falls back to league-level recency-weighted rates. Does not select players —
 * only nudges position; ESPN ADP still picks WHO within the position.
 */

import { normalizeDefensivePosition } from "./leagueIdpDraftProfile";

export type DnaConfidence = "High" | "Medium" | "Low";

/** Phase 2a: offense only — DP remains on Phase 1 league-timing path. */
export const OFFENSE_DNA_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

const RECENCY_LAMBDA = 0.4;
const WEIGHTS = { tendency: 0.35, need: 0.25, talent: 0.30, timing: 0.10 } as const;
/** Max ADP slots behind BPA unless CRITICAL roster need at target position. */
const INFERIOR_ADP_SLOTS = 6;
const INFERIOR_ADP_SLOTS_CRITICAL = 12;
/** Owner blended tendency must exceed league norm by at least this (conservative release). */
const LEAGUE_TENDENCY_DELTA = 0.10;
/** Owner tendency must beat BPA-position tendency by at least this. */
const BPA_TENDENCY_DELTA = 0.08;
/** Minimum softmax margin over second-best position (unless HIGH/CRITICAL need). */
const MIN_PROB_MARGIN = 0.20;
/** Near-miss blocked override — attach pickIntelligence when within this of thresholds. */
const CLOSE_TENDENCY_DELTA = 0.08;
const CLOSE_PROB_MARGIN = 0.15;
/** Influence decay after consecutive applied DNA nudges (resets on any non-DNA pick). */
export const OWNER_DNA_DECAY_MULTIPLIERS = [1.0, 0.65, 0.40, 0.20] as const;
/** Min score gap (0–100) between top-two position candidates to skip DNA entirely. */
export const CLOSE_DECISION_GAP = 12;

export interface OwnerDraftDnaModel {
  ownerKey: string;
  ownerName: string;
  pickCount: number;
  seasonCount: number;
  confidence: DnaConfidence;
  confidenceWeight: number;
  /** round → position → recency-weighted rate (sums to 1 per round). */
  roundPosRate: Map<number, Map<string, number>>;
}

export interface LeagueDnaBaseline {
  /** round → position → recency-weighted league rate. */
  roundPosRate: Map<number, Map<string, number>>;
  totalPicks: number;
}

export interface OwnerDraftDnaContext {
  league: LeagueDnaBaseline;
  byOwnerKey: Map<string, OwnerDraftDnaModel>;
}

export interface PositionProbability {
  position: string;
  probability: number;
  score: number;
  components: { tendency: number; need: number; talent: number; timing: number };
}

export interface OwnerDnaNudgeResult {
  applied: boolean;
  /** Blocked override that nearly passed — eligible for pickIntelligence only. */
  closeBlocked: boolean;
  /** Close-decision gate was evaluated and passed. */
  closeGatePassed: boolean;
  position: string | null;
  player: { name: string; position: string; adp: number | null } | null;
  positionProbabilities: PositionProbability[];
  explanation: string | null;
  blockedReason: string | null;
  /** Structured sections for UI-ready pickIntelligence. */
  structuredSections: Array<{ title: string; lines: string[] }>;
}

export interface DraftPoolPlayer {
  name: string;
  position: string;
  adp: number | null;
  projectedPoints?: number;
  marketValue?: number | null;
}

export interface CloseDecisionCandidate {
  position: string;
  playerName: string;
  adp: number | null;
  adpSlot: number;
  score: number;
  needUrgency: string | null;
}

export interface CloseDecisionResult {
  isClose: boolean;
  reason: string;
  candidates: CloseDecisionCandidate[];
  bpaPosition: string;
  topScore: number;
  secondScore: number;
  scoreGap: number;
}

export function normOwnerKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Decay multiplier from consecutive applied DNA nudges since last BPA/need pick. */
export function ownerDnaDecayMultiplier(consecutiveAppliedNudges: number): number {
  const idx = Math.min(Math.max(0, consecutiveAppliedNudges), OWNER_DNA_DECAY_MULTIPLIERS.length - 1);
  return OWNER_DNA_DECAY_MULTIPLIERS[idx]!;
}

function candidateValueScore(
  player: DraftPoolPlayer,
  adpSlot: number,
  needUrgency: string | undefined,
  bpaProjection: number,
): number {
  let score = Math.max(0, 100 - adpSlot * 5);
  if (player.marketValue != null) {
    score = score * 0.35 + player.marketValue * 0.65;
  } else if (bpaProjection > 0 && (player.projectedPoints ?? 0) > 0) {
    const projRatio = Math.min(1.15, (player.projectedPoints ?? 0) / bpaProjection);
    score = score * 0.45 + projRatio * 85 * 0.55;
  }
  score += needScore(needUrgency) * 10;
  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

/**
 * Close Decision Gate — skip owner DNA unless top position candidates are genuinely close.
 * Obvious BPA wins (large score gap) should not trigger personality evaluation.
 */
export function evaluateCloseDecisionGate(params: {
  undrafted: DraftPoolPlayer[];
  bpa: DraftPoolPlayer;
  reachSlots: number;
  counts: Record<string, number>;
  cap: (pos: string) => number;
  teamNeeds: Array<{ position: string; urgency: string }>;
}): CloseDecisionResult {
  const { undrafted, bpa, reachSlots, counts, cap, teamNeeds } = params;
  const needByPos = new Map(teamNeeds.map((n) => [n.position, n.urgency]));
  const bpaProjection = bpa.projectedPoints ?? 0;

  const candidates: CloseDecisionCandidate[] = [];
  for (const pos of OFFENSE_DNA_POSITIONS) {
    if ((counts[pos] ?? 0) >= cap(pos)) continue;
    const idx = undrafted.findIndex((p) => p.position === pos);
    if (idx < 0 || idx > reachSlots) continue;
    const player = undrafted[idx]!;
    const urg = needByPos.get(pos) ?? null;
    candidates.push({
      position: pos,
      playerName: player.name,
      adp: player.adp,
      adpSlot: idx,
      needUrgency: urg,
      score: candidateValueScore(player, idx, urg ?? undefined, bpaProjection),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const topScore = candidates[0]?.score ?? 0;
  const secondScore = candidates[1]?.score ?? 0;
  const scoreGap = topScore - secondScore;
  const bpaPos = bpa.position;

  if (candidates.length < 2) {
    return {
      isClose: false,
      reason: "Only one viable offense candidate in band — obvious choice, DNA skipped.",
      candidates,
      bpaPosition: bpaPos,
      topScore,
      secondScore,
      scoreGap,
    };
  }

  const isClose = scoreGap < CLOSE_DECISION_GAP;
  const reason = isClose
    ? `Close decision: ${candidates[0]!.position} (${topScore}) vs ${candidates[1]!.position} (${secondScore}) — gap ${scoreGap.toFixed(0)}.`
    : `Obvious value: ${candidates[0]!.position} (${topScore}) leads ${candidates[1]!.position} (${secondScore}) by ${scoreGap.toFixed(0)} — DNA skipped.`;

  return { isClose, reason, candidates, bpaPosition: bpaPos, topScore, secondScore, scoreGap };
}

function buildStructuredSections(params: {
  applied: boolean;
  closeBlocked: boolean;
  closeDecision: CloseDecisionResult;
  ownerModel: OwnerDraftDnaModel | null;
  top: PositionProbability | null;
  bpa: DraftPoolPlayer;
  legacyPick: DraftPoolPlayer;
  needUrgency: string | null;
  topPlayer: DraftPoolPlayer | null;
  decayMultiplier: number;
  consecutiveAppliedNudges: number;
}): Array<{ title: string; lines: string[] }> {
  const {
    applied, closeBlocked, closeDecision, ownerModel, top, bpa, legacyPick,
    needUrgency, topPlayer, decayMultiplier, consecutiveAppliedNudges,
  } = params;
  const sections: Array<{ title: string; lines: string[] }> = [];

  const boardLines = closeDecision.candidates.slice(0, 4).map(
    (c) => `${c.position}: ${c.playerName} — score ${c.score}${c.adpSlot > 0 ? ` (+${c.adpSlot} ADP slots)` : " (BPA)"}`,
  );
  if (topPlayer && topPlayer.position !== bpa.position) {
    const slot = closeDecision.candidates.find((c) => c.position === topPlayer.position)?.adpSlot;
    if (slot != null) boardLines.push(`${topPlayer.position} only ${slot} ADP slot${slot === 1 ? "" : "s"} behind BPA`);
  }
  sections.push({ title: "Board", lines: boardLines });

  if (top && ownerModel) {
    const pct = Math.round(top.probability * 100);
    const tendPct = Math.round(top.components.tendency * 100);
    sections.push({
      title: "Owner DNA",
      lines: [
        `${pct}% ${top.position} lean`,
        `${tendPct}% historical ${top.position} tendency`,
        `${ownerModel.confidence} confidence (${ownerModel.pickCount} picks)`,
        consecutiveAppliedNudges > 0
          ? `Influence decay: ${Math.round(decayMultiplier * 100)}% after ${consecutiveAppliedNudges} consecutive nudge${consecutiveAppliedNudges > 1 ? "s" : ""}`
          : "Influence decay: 100% (reset after value pick)",
      ],
    });
  }

  if (needUrgency) {
    sections.push({
      title: "Roster",
      lines: [`${needUrgency} need at ${top?.position ?? legacyPick.position}`],
    });
  }

  const decisionLines: string[] = [];
  if (applied) {
    decisionLines.push("Owner Draft DNA tipped a close decision.");
  } else if (closeBlocked && top) {
    decisionLines.push(`Owner historically prefers ${top.position} here.`);
    decisionLines.push("However,");
    decisionLines.push(`${bpa.position} was clearly superior value.`);
    decisionLines.push("Owner tendency suppressed.");
  } else {
    decisionLines.push("Owner DNA evaluated but did not override value.");
  }
  sections.push({ title: "Decision", lines: decisionLines });

  return sections;
}

function seasonWeight(season: number, currentSeason: number): number {
  return Math.exp(RECENCY_LAMBDA * (season - currentSeason));
}

function computeConfidence(pickCount: number, seasonCount: number): { confidence: DnaConfidence; weight: number } {
  if (pickCount >= 40 && seasonCount >= 4) return { confidence: "High", weight: 0.85 };
  if (pickCount >= 15 && seasonCount >= 2) return { confidence: "Medium", weight: 0.7 };
  return { confidence: "Low", weight: 0.2 };
}

function softmax(scores: Array<{ pos: string; s: number }>, temperature: number): Map<string, number> {
  if (!scores.length) return new Map();
  const maxS = Math.max(...scores.map((x) => x.s));
  const exps = scores.map(({ pos, s }) => ({ pos, e: Math.exp((s - maxS) / temperature) }));
  const sum = exps.reduce((a, x) => a + x.e, 0) || 1;
  return new Map(exps.map(({ pos, e }) => [pos, Math.round((e / sum) * 1000) / 1000]));
}

function rateAtRound(
  roundPosRate: Map<number, Map<string, number>>,
  round: number,
  pos: string,
): number {
  const roundMap = roundPosRate.get(round);
  if (roundMap?.has(pos)) return roundMap.get(pos)!;
  const prev = roundPosRate.get(round - 1)?.get(pos) ?? 0;
  const next = roundPosRate.get(round + 1)?.get(pos) ?? 0;
  if (prev || next) return (prev + next) / (prev && next ? 2 : 1);
  return 0;
}

function needScore(urgency: string | undefined): number {
  switch (String(urgency ?? "").toUpperCase()) {
    case "CRITICAL": return 1;
    case "HIGH": return 0.75;
    case "MEDIUM": return 0.5;
    case "LOW": return 0.25;
    default: return 0;
  }
}

function buildRoundPosRates(
  picks: Array<{ season: number; roundId: number; position: string }>,
  currentSeason: number,
): Map<number, Map<string, number>> {
  const acc = new Map<number, Map<string, number>>();
  for (const p of picks) {
    const r = Number(p.roundId);
    const pos = normalizeDefensivePosition(p.position);
    if (!OFFENSE_DNA_POSITIONS.has(pos)) continue;
    const w = seasonWeight(p.season, currentSeason);
    if (!acc.has(r)) acc.set(r, new Map());
    const m = acc.get(r)!;
    m.set(pos, (m.get(pos) ?? 0) + w);
  }
  for (const [, m] of acc) {
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [pos, v] of m) m.set(pos, v / total);
  }
  return acc;
}

export async function loadOwnerDraftDnaContext(opts: {
  db: { execute: (q: any) => Promise<any> };
  sql: (strings: TemplateStringsArray, ...vals: any[]) => any;
  leagueId: string;
  currentSeason: number;
}): Promise<OwnerDraftDnaContext> {
  // FOLLOW-UP: consolidate with computeDraftDnaFromOwnedPicks / leagueDraftTendencies
  // (duplicate draft_picks attribution query — out of scope for Phase 2a release).
  const { db, sql, leagueId, currentSeason } = opts;
  const [rows] = (await db.execute(sql`
    SELECT d.season, d.roundId, d.position, d.playerName, d.isKeeper, t.ownerName
    FROM draft_picks d
    JOIN teams t ON t.leagueId = d.leagueId AND t.season = d.season AND t.teamId = d.teamId
    WHERE d.leagueId = ${leagueId}
      AND d.playerName IS NOT NULL AND d.playerName != ''
      AND d.isKeeper = 0
  `)) as [Array<{ season: number; roundId: number; position: string; ownerName: string }>];

  const openOffense = rows
    .filter((r) => {
      const pos = normalizeDefensivePosition(String(r.position ?? ""));
      return pos && pos !== "?" && OFFENSE_DNA_POSITIONS.has(pos);
    })
    .map((r) => ({
      season: Number(r.season),
      roundId: Number(r.roundId),
      position: normalizeDefensivePosition(String(r.position)),
      ownerKey: normOwnerKey(String(r.ownerName ?? "")),
    }))
    .filter((r) => r.ownerKey.length > 0);

  const leagueRoundPosRate = buildRoundPosRates(openOffense, currentSeason);

  const byOwner = new Map<string, Array<{ season: number; roundId: number; position: string }>>();
  for (const p of openOffense) {
    if (!byOwner.has(p.ownerKey)) byOwner.set(p.ownerKey, []);
    byOwner.get(p.ownerKey)!.push(p);
  }

  const byOwnerKey = new Map<string, OwnerDraftDnaModel>();
  for (const [ownerKey, ownerPicks] of byOwner) {
    const seasons = new Set(ownerPicks.map((p) => p.season));
    const { confidence, weight } = computeConfidence(ownerPicks.length, seasons.size);
    byOwnerKey.set(ownerKey, {
      ownerKey,
      ownerName: ownerKey,
      pickCount: ownerPicks.length,
      seasonCount: seasons.size,
      confidence,
      confidenceWeight: weight,
      roundPosRate: buildRoundPosRates(ownerPicks, currentSeason),
    });
  }

  return {
    league: { roundPosRate: leagueRoundPosRate, totalPicks: openOffense.length },
    byOwnerKey,
  };
}

export function resolveOwnerDnaModel(
  ctx: OwnerDraftDnaContext | null | undefined,
  ownerName: string,
): OwnerDraftDnaModel | null {
  if (!ctx) return null;
  const key = normOwnerKey(ownerName);
  return ctx.byOwnerKey.get(key) ?? null;
}

function effectiveTendency(
  model: OwnerDraftDnaModel | null,
  league: LeagueDnaBaseline,
  round: number,
  pos: string,
): number {
  const ownerRate = model ? rateAtRound(model.roundPosRate, round, pos) : 0;
  const leagueRate = rateAtRound(league.roundPosRate, round, pos);
  const cw = model?.confidenceWeight ?? 0;
  return cw * ownerRate + (1 - cw) * leagueRate;
}

function temperatureFor(confidence: DnaConfidence | undefined): number {
  if (confidence === "High") return 0.15;
  if (confidence === "Medium") return 0.25;
  return 0.4;
}

export function evaluateOwnerDnaNudge(params: {
  ownerName: string;
  ownerModel: OwnerDraftDnaModel | null;
  dnaContext: OwnerDraftDnaContext;
  round: number;
  pickNum: number;
  undrafted: DraftPoolPlayer[];
  bpa: DraftPoolPlayer;
  legacyPick: DraftPoolPlayer;
  closeDecision: CloseDecisionResult;
  decayMultiplier: number;
  consecutiveAppliedNudges: number;
  teamNeeds: Array<{ position: string; urgency: string }>;
  reachSlots: number;
  counts: Record<string, number>;
  cap: (pos: string) => number;
}): OwnerDnaNudgeResult {
  const {
    ownerName, ownerModel, dnaContext, round, undrafted, bpa, legacyPick,
    closeDecision, decayMultiplier, consecutiveAppliedNudges,
    teamNeeds, reachSlots, counts, cap,
  } = params;

  const needByPos = new Map(teamNeeds.map((n) => [n.position, n.urgency]));
  const bpaIdx = 0;

  const scored: Array<{ pos: string; s: number; components: PositionProbability["components"] }> = [];

  for (const pos of OFFENSE_DNA_POSITIONS) {
    if ((counts[pos] ?? 0) >= cap(pos)) continue;
    const idx = undrafted.findIndex((p) => p.position === pos);
    if (idx < 0 || idx > reachSlots) continue;

    const tendency = effectiveTendency(ownerModel, dnaContext.league, round, pos) * decayMultiplier;
    const need = needScore(needByPos.get(pos));
    const talent = 1 - idx / Math.max(reachSlots, 1);
    const timing = 1;

    const s =
      WEIGHTS.tendency * tendency +
      WEIGHTS.need * need +
      WEIGHTS.talent * talent +
      WEIGHTS.timing * timing;

    scored.push({ pos, s, components: { tendency, need, talent, timing } });
  }

  const buildSections = (
    applied: boolean,
    closeBlocked: boolean,
    top: PositionProbability | null,
    topPlayer: DraftPoolPlayer | null,
    needUrg: string | null,
  ) => buildStructuredSections({
    applied,
    closeBlocked,
    closeDecision,
    ownerModel,
    top,
    bpa,
    legacyPick,
    needUrgency: needUrg,
    topPlayer,
    decayMultiplier,
    consecutiveAppliedNudges,
  });

  const noResult = (blockedReason: string | null, partial: Partial<OwnerDnaNudgeResult> = {}): OwnerDnaNudgeResult => {
    const top = partial.positionProbabilities?.[0] ?? null;
    const topPlayer = partial.player
      ? undrafted.find((p) => p.name === partial.player!.name) ?? null
      : null;
    const needUrg = top?.position ? (needByPos.get(top.position) ?? null) : null;
    return {
      applied: false,
      closeBlocked: false,
      closeGatePassed: true,
      position: null,
      player: null,
      positionProbabilities: [],
      explanation: null,
      blockedReason,
      structuredSections: buildSections(false, partial.closeBlocked ?? false, top, topPlayer, needUrg),
      ...partial,
    };
  };

  if (!scored.length) {
    return noResult("No offense positions in ADP reach band.");
  }

  const temp = temperatureFor(ownerModel?.confidence);
  const probs = softmax(scored.map(({ pos, s }) => ({ pos, s })), temp);

  const positionProbabilities: PositionProbability[] = scored
    .map(({ pos, s, components }) => ({
      position: pos,
      probability: probs.get(pos) ?? 0,
      score: s,
      components,
    }))
    .sort((a, b) => b.probability - a.probability);

  const top = positionProbabilities[0]!;
  const secondProb = positionProbabilities[1]?.probability ?? 0;
  const topIdx = undrafted.findIndex((p) => p.position === top.position);
  const topPlayer = undrafted[topIdx]!;

  const bpaPos = bpa.position;
  const bpaTendency = effectiveTendency(ownerModel, dnaContext.league, round, bpaPos);

  const urg = needByPos.get(top.position);
  const needBoost = needScore(urg) >= 0.75;
  const leagueTendency = rateAtRound(dnaContext.league.roundPosRate, round, top.position);
  const probMargin = top.probability - secondProb;
  const minProbToNudge = ownerModel?.confidence === "High" ? 0.45 : ownerModel?.confidence === "Medium" ? 0.50 : 0.55;

  const isCloseBlocked = (blockedReason: string): boolean => {
    if (top.position === bpaPos) return false;
    const tendencyDelta = top.components.tendency - leagueTendency;
    const inferiorGap = topIdx - bpaIdx;
    return (
      tendencyDelta >= CLOSE_TENDENCY_DELTA
      || probMargin >= CLOSE_PROB_MARGIN
      || (inferiorGap > INFERIOR_ADP_SLOTS && inferiorGap <= INFERIOR_ADP_SLOTS + 2)
    );
  };

  if (scored.length === 1 && !needBoost) {
    return noResult("Only one offense position in reach band — owner lean not applied.", {
      position: top.position,
      player: { name: topPlayer.name, position: topPlayer.position, adp: topPlayer.adp },
      positionProbabilities,
    });
  }

  if (top.position === bpaPos) {
    return noResult(null, {
      position: top.position,
      player: { name: topPlayer.name, position: topPlayer.position, adp: topPlayer.adp },
      positionProbabilities,
      structuredSections: [],
    });
  }

  if (top.components.tendency < leagueTendency + LEAGUE_TENDENCY_DELTA && !needBoost) {
    const reason = `${top.position} tendency (${Math.round(top.components.tendency * 100)}%) does not exceed league norm by ${Math.round(LEAGUE_TENDENCY_DELTA * 100)}% (${Math.round(leagueTendency * 100)}%) — value held.`;
    return noResult(reason, {
      position: top.position,
      player: { name: topPlayer.name, position: topPlayer.position, adp: topPlayer.adp },
      positionProbabilities,
      closeBlocked: isCloseBlocked(reason),
    });
  }

  const urgForInferior = needByPos.get(top.position);
  const isCritical = urgForInferior === "CRITICAL";
  const maxInferior = isCritical ? INFERIOR_ADP_SLOTS_CRITICAL : INFERIOR_ADP_SLOTS;
  if (topIdx - bpaIdx > maxInferior) {
    const reason = `${top.position} best available (ADP slot +${topIdx}) is more than ${INFERIOR_ADP_SLOTS} slots behind BPA — owner lean not applied.`;
    return noResult(reason, {
      position: top.position,
      player: null,
      positionProbabilities,
      closeBlocked: !isCritical && isCloseBlocked(reason),
    });
  }

  if ((top.probability < minProbToNudge || probMargin < MIN_PROB_MARGIN) && !needBoost) {
    const reason = `Owner ${top.position} lean (${Math.round(top.probability * 100)}%, margin ${Math.round(probMargin * 100)}%) too weak vs BPA ${bpaPos} — value held.`;
    return noResult(reason, {
      position: top.position,
      player: { name: topPlayer.name, position: topPlayer.position, adp: topPlayer.adp },
      positionProbabilities,
      closeBlocked: isCloseBlocked(reason),
    });
  }

  if (top.components.tendency < bpaTendency + BPA_TENDENCY_DELTA && !needBoost) {
    const reason = `${top.position} owner tendency does not beat ${bpaPos} by ${Math.round(BPA_TENDENCY_DELTA * 100)}% (${Math.round(top.components.tendency * 100)}% vs ${Math.round(bpaTendency * 100)}%) — value held.`;
    return noResult(reason, {
      position: top.position,
      player: { name: topPlayer.name, position: topPlayer.position, adp: topPlayer.adp },
      positionProbabilities,
      closeBlocked: isCloseBlocked(reason),
    });
  }

  const pct = Math.round(top.probability * 100);
  const tendPct = Math.round(top.components.tendency * 100);
  const needPct = Math.round(top.components.need * 100);
  const src = (ownerModel?.confidenceWeight ?? 0) >= 0.5 ? "recent draft history" : "league draft norms";
  const explanation =
    `${ownerName} had a ${pct}% ${top.position} lean here based on ${src} (${tendPct}% tendency` +
    (needPct > 0 ? `, ${needPct}% roster need` : "") +
    `) — ${topPlayer.name} (ADP ${topPlayer.adp ?? "n/a"}) within reach on a close board.`;

  return {
    applied: true,
    closeBlocked: false,
    closeGatePassed: true,
    position: top.position,
    player: { name: topPlayer.name, position: topPlayer.position, adp: topPlayer.adp },
    positionProbabilities,
    explanation,
    blockedReason: null,
    structuredSections: buildSections(true, false, top, topPlayer, urg ?? null),
  };
}

export function sampleOwnerProbabilitiesAtRound(
  model: OwnerDraftDnaModel | null,
  league: LeagueDnaBaseline,
  round: number,
): Array<{ position: string; ownerRate: number; leagueRate: number; blended: number }> {
  const out: Array<{ position: string; ownerRate: number; leagueRate: number; blended: number }> = [];
  for (const pos of OFFENSE_DNA_POSITIONS) {
    const ownerRate = model ? rateAtRound(model.roundPosRate, round, pos) : 0;
    const leagueRate = rateAtRound(league.roundPosRate, round, pos);
    const blended = effectiveTendency(model, league, round, pos);
    if (blended > 0.01) out.push({ position: pos, ownerRate, leagueRate, blended });
  }
  return out.sort((a, b) => b.blended - a.blended);
}
