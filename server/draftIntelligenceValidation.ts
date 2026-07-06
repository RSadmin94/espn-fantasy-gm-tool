/**
 * draftIntelligenceValidation.ts — Phase 2A.1 internal QA framework.
 * Read-only measurement; does not modify draft behavior.
 */

import { performance } from "node:perf_hooks";
import {
  normOwnerKey,
  OFFENSE_DNA_POSITIONS,
  type OwnerDraftDnaContext,
} from "./ownerDraftDnaModel";
import {
  computeOwnerAuthenticityReport,
  type MockPickRow,
} from "./ownerAuthenticityScore";
import {
  buildMockDraft,
  type MockDraftInputs,
} from "./draftWarRoomRouter";
import { DEFAULT_OWNER_DNA_TUNING } from "./ownerDraftDnaTuning";
import {
  runMockDraftSimulation,
} from "./ownerDraftDnaSimulation";
import type {
  HistoricalProfileBundle,
  LeagueHistoricalProfile,
  OwnerHistoricalProfile,
  PositionDistribution,
} from "./draftValidationHistory";
import type { PickIntelligence, PickPrimaryFactor } from "./draftPickIntelligence";
import type { DraftDecision } from "./draftDecisionEngine";
import { buildFactorInfluenceReport, type FactorInfluenceReport } from "./draftDecisionEngine";

// ── Shared helpers ────────────────────────────────────────────────────────────

export interface ValidationPickRow extends MockPickRow {
  adp: number | null;
  pickIntelligence: PickIntelligence | null;
  draftDecision?: DraftDecision | null;
  reasoning: string;
}

export interface SlimRegressionRow {
  pick: number;
  round: number;
  owner: string;
  player: string;
  pos: string;
  factor: string | null;
}

function distributionSimilarityPct(a: PositionDistribution, b: PositionDistribution): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let l1 = 0;
  for (const k of keys) l1 += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return Math.round(Math.max(0, 1 - l1 / 2) * 1000) / 10;
}

function roundVectorSimilarityPct(
  a: Record<string, number>,
  b: Record<string, number>,
  positions: string[],
): number {
  if (!positions.length) return 0;
  const maxRound = 16;
  let sumDiff = 0;
  let count = 0;
  for (const pos of positions) {
    if (a[pos] == null && b[pos] == null) continue;
    sumDiff += Math.abs((a[pos] ?? maxRound) - (b[pos] ?? maxRound)) / maxRound;
    count++;
  }
  if (!count) return 0;
  return Math.round(Math.max(0, 1 - sumDiff / count) * 1000) / 10;
}

function buildSimulatedOwnerProfile(
  ownerKey: string,
  ownerName: string,
  picks: MockPickRow[],
): {
  positionDistribution: PositionDistribution;
  avgRoundByPosition: Record<string, number>;
  avgFirstQbRound: number | null;
  avgFirstTeRound: number | null;
  rbWrBalance: number | null;
} {
  const offense = picks.filter((p) => !p.isKeeperSlot && OFFENSE_DNA_POSITIONS.has(p.position));
  const posCounts = new Map<string, number>();
  const roundSum = new Map<string, number>();
  const roundCount = new Map<string, number>();

  for (const p of offense) {
    posCounts.set(p.position, (posCounts.get(p.position) ?? 0) + 1);
    roundSum.set(p.position, (roundSum.get(p.position) ?? 0) + p.round);
    roundCount.set(p.position, (roundCount.get(p.position) ?? 0) + 1);
  }

  const total = [...posCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const positionDistribution: PositionDistribution = {};
  for (const [pos, c] of posCounts) positionDistribution[pos] = c / total;

  const avgRoundByPosition: Record<string, number> = {};
  for (const [pos, sum] of roundSum) {
    avgRoundByPosition[pos] = sum / (roundCount.get(pos) ?? 1);
  }

  const firstQb = offense.find((p) => p.position === "QB");
  const firstTe = offense.find((p) => p.position === "TE");
  const rb = positionDistribution.RB ?? 0;
  const wr = positionDistribution.WR ?? 0;

  return {
    positionDistribution,
    avgRoundByPosition,
    avgFirstQbRound: firstQb?.round ?? null,
    avgFirstTeRound: firstTe?.round ?? null,
    rbWrBalance: rb + wr > 0 ? rb / (rb + wr) : null,
  };
}

function buildSimulatedLeagueProfile(picks: MockPickRow[]): LeagueHistoricalProfile {
  const offense = picks.filter((p) => !p.isKeeperSlot && OFFENSE_DNA_POSITIONS.has(p.position));
  const dp = picks.filter((p) => !p.isKeeperSlot && p.position === "DP");
  const posCounts = new Map<string, number>();
  const roundSum = new Map<string, number>();
  const roundCount = new Map<string, number>();
  const byRound = new Map<number, Map<string, number>>();

  for (const p of [...offense, ...dp]) {
    posCounts.set(p.position, (posCounts.get(p.position) ?? 0) + 1);
    roundSum.set(p.position, (roundSum.get(p.position) ?? 0) + p.round);
    roundCount.set(p.position, (roundCount.get(p.position) ?? 0) + 1);
    if (!byRound.has(p.round)) byRound.set(p.round, new Map());
    const rm = byRound.get(p.round)!;
    rm.set(p.position, (rm.get(p.position) ?? 0) + 1);
  }

  const total = [...posCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const positionDistribution: PositionDistribution = {};
  for (const [pos, c] of posCounts) positionDistribution[pos] = c / total;

  const avgRoundByPosition: Record<string, number> = {};
  for (const [pos, sum] of roundSum) {
    avgRoundByPosition[pos] = sum / (roundCount.get(pos) ?? 1);
  }

  const positionDistributionByRound: Record<number, PositionDistribution> = {};
  for (const [round, rm] of byRound) {
    const rt = [...rm.values()].reduce((a, b) => a + b, 0) || 1;
    const dist: PositionDistribution = {};
    for (const [pos, c] of rm) dist[pos] = c / rt;
    positionDistributionByRound[round] = dist;
  }

  const firstByPos = (pos: string) => picks.find((p) => !p.isKeeperSlot && p.position === pos)?.round ?? null;
  const rb = positionDistribution.RB ?? 0;
  const wr = positionDistribution.WR ?? 0;

  return {
    offensePickCount: offense.length,
    positionDistribution,
    positionDistributionByRound,
    avgRoundByPosition,
    avgFirstQbRound: firstByPos("QB"),
    avgFirstTeRound: firstByPos("TE"),
    avgFirstRbRound: firstByPos("RB"),
    avgFirstWrRound: firstByPos("WR"),
    avgFirstDpRound: picks.find((p) => p.position === "DP")?.round ?? null,
    rbWrBalance: rb + wr > 0 ? rb / (rb + wr) : null,
  };
}

function toValidationPickRows(picks: ReturnType<typeof buildMockDraft>): ValidationPickRow[] {
  return picks.map((p) => ({
    pickNumber: p.pickNumber,
    round: p.round,
    ownerName: p.ownerName,
    player: p.player,
    position: p.position,
    primaryFactor: p.pickIntelligence?.primaryFactor ?? null,
    isKeeperSlot: p.isKeeperSlot ?? false,
    adp: p.adp ?? null,
    pickIntelligence: p.pickIntelligence ?? null,
    draftDecision: p.draftDecision ?? null,
    reasoning: p.reasoning ?? "",
  }));
}

export function runFullMockDraftSimulation(
  inputs: MockDraftInputs,
  opts?: { disableDna?: boolean; stochasticSeed?: number },
): ValidationPickRow[] {
  const mock = buildMockDraft({
    ...inputs,
    ownerDnaContext: opts?.disableDna ? null : inputs.ownerDnaContext,
    dnaTuning: DEFAULT_OWNER_DNA_TUNING,
    stochasticSeed: opts?.stochasticSeed,
  });
  return toValidationPickRows(mock);
}

function slimRow(p: MockPickRow | SlimRegressionRow): SlimRegressionRow {
  if ("pick" in p) return p;
  return {
    pick: p.pickNumber,
    round: p.round,
    owner: p.ownerName,
    player: p.player,
    pos: p.position,
    factor: p.primaryFactor ?? null,
  };
}

// ── 1. Owner Authenticity Dashboard ───────────────────────────────────────────

export interface OwnerAuthenticityDashboardRow {
  owner: string;
  ownerKey: string;
  authenticityPct: number;
  positionMatchPct: number;
  roundMatchPct: number;
  historicalPositionDistribution: PositionDistribution;
  simulatedPositionDistribution: PositionDistribution;
  historicalAvgRoundByPosition: Record<string, number>;
  simulatedAvgRoundByPosition: Record<string, number>;
  historicalQbTiming: number | null;
  simulatedQbTiming: number | null;
  historicalTeTiming: number | null;
  simulatedTeTiming: number | null;
  historicalRbWrBalance: number | null;
  simulatedRbWrBalance: number | null;
}

export function buildOwnerAuthenticityDashboard(params: {
  historical: HistoricalProfileBundle;
  simulatedPicks: MockPickRow[];
}): OwnerAuthenticityDashboardRow[] {
  const { historical, simulatedPicks } = params;
  const histByKey = new Map(historical.owners.map((o) => [o.ownerKey, o]));
  const simByOwner = new Map<string, MockPickRow[]>();

  for (const p of simulatedPicks) {
    const k = normOwnerKey(p.ownerName);
    if (!simByOwner.has(k)) simByOwner.set(k, []);
    simByOwner.get(k)!.push(p);
  }

  const rows: OwnerAuthenticityDashboardRow[] = [];
  for (const [ownerKey, simPicks] of simByOwner) {
    const hist = histByKey.get(ownerKey);
    const ownerName = simPicks[0]?.ownerName ?? ownerKey;
    const sim = buildSimulatedOwnerProfile(ownerKey, ownerName, simPicks);

    const positionMatchPct = hist
      ? distributionSimilarityPct(hist.positionDistribution, sim.positionDistribution)
      : 0;
    const positions = [...new Set([
      ...Object.keys(hist?.positionDistribution ?? {}),
      ...Object.keys(sim.positionDistribution),
    ])];
    const roundMatchPct = hist
      ? roundVectorSimilarityPct(hist.avgRoundByPosition, sim.avgRoundByPosition, positions)
      : 0;
    const authenticityPct = Math.round((positionMatchPct * 0.55 + roundMatchPct * 0.45) * 10) / 10;

    rows.push({
      owner: ownerName,
      ownerKey,
      authenticityPct,
      positionMatchPct,
      roundMatchPct,
      historicalPositionDistribution: hist?.positionDistribution ?? {},
      simulatedPositionDistribution: sim.positionDistribution,
      historicalAvgRoundByPosition: hist?.avgRoundByPosition ?? {},
      simulatedAvgRoundByPosition: sim.avgRoundByPosition,
      historicalQbTiming: hist?.avgFirstQbRound ?? null,
      simulatedQbTiming: sim.avgFirstQbRound,
      historicalTeTiming: hist?.avgFirstTeRound ?? null,
      simulatedTeTiming: sim.avgFirstTeRound,
      historicalRbWrBalance: hist?.rbWrBalance ?? null,
      simulatedRbWrBalance: sim.rbWrBalance,
    });
  }

  return rows.sort((a, b) => b.authenticityPct - a.authenticityPct);
}

// ── 2. League Authenticity Dashboard ──────────────────────────────────────────

export interface LeagueAuthenticityDashboard {
  historical: LeagueHistoricalProfile;
  simulated: LeagueHistoricalProfile;
  positionDistributionSimilarityPct: number;
  avgRoundSimilarityPct: number;
  overallSimilarityPct: number;
  avgQbRound: { historical: number | null; simulated: number | null };
  avgTeRound: { historical: number | null; simulated: number | null };
  avgFirstRb: { historical: number | null; simulated: number | null };
  avgFirstWr: { historical: number | null; simulated: number | null };
  avgFirstDp: { historical: number | null; simulated: number | null };
  reachFrequencyPct: { historical: number; simulated: number };
  valueFrequencyPct: { historical: number; simulated: number };
}

function reachValueRates(picks: MockPickRow[], poolAdp: Map<string, number>): { reach: number; value: number } {
  let reach = 0;
  let value = 0;
  let counted = 0;
  for (const p of picks) {
    if (p.isKeeperSlot) continue;
    const adp = poolAdp.get(p.player.toLowerCase());
    if (adp == null) continue;
    counted++;
    const delta = p.pickNumber - adp;
    if (delta < -12) value++;
    else if (delta > 12) reach++;
  }
  if (!counted) return { reach: 0, value: 0 };
  return { reach: (reach / counted) * 100, value: (value / counted) * 100 };
}

export function buildLeagueAuthenticityDashboard(params: {
  historical: HistoricalProfileBundle;
  simulatedPicks: MockPickRow[];
  playerPool: MockDraftInputs["playerPool"];
}): LeagueAuthenticityDashboard {
  const { historical, simulatedPicks, playerPool } = params;
  const sim = buildSimulatedLeagueProfile(simulatedPicks);
  const hist = historical.league;

  const posSim = distributionSimilarityPct(hist.positionDistribution, sim.positionDistribution);
  const positions = [...new Set([...Object.keys(hist.avgRoundByPosition), ...Object.keys(sim.avgRoundByPosition)])];
  const roundSim = roundVectorSimilarityPct(hist.avgRoundByPosition, sim.avgRoundByPosition, positions);
  const overallSimilarityPct = Math.round((posSim * 0.5 + roundSim * 0.5) * 10) / 10;

  const poolAdp = new Map<string, number>(
    playerPool.map((p: MockDraftInputs["playerPool"][number]) => [p.name.toLowerCase(), p.adp ?? 9999]),
  );
  const simReachValue = reachValueRates(simulatedPicks, poolAdp);

  return {
    historical: hist,
    simulated: sim,
    positionDistributionSimilarityPct: posSim,
    avgRoundSimilarityPct: roundSim,
    overallSimilarityPct,
    avgQbRound: { historical: hist.avgFirstQbRound, simulated: sim.avgFirstQbRound },
    avgTeRound: { historical: hist.avgFirstTeRound, simulated: sim.avgFirstTeRound },
    avgFirstRb: { historical: hist.avgFirstRbRound, simulated: sim.avgFirstRbRound },
    avgFirstWr: { historical: hist.avgFirstWrRound, simulated: sim.avgFirstWrRound },
    avgFirstDp: { historical: hist.avgFirstDpRound, simulated: sim.avgFirstDpRound },
    reachFrequencyPct: { historical: 0, simulated: Math.round(simReachValue.reach * 10) / 10 },
    valueFrequencyPct: { historical: 0, simulated: Math.round(simReachValue.value * 10) / 10 },
  };
}

// ── 3. Draft Stability Test ───────────────────────────────────────────────────

export interface PlayerStabilityRow {
  player: string;
  position: string;
  meanPick: number;
  stdDev: number;
  earliestPick: number;
  latestPick: number;
  pickSpread: number;
}

export interface DraftStabilityReport {
  simulationCount: number;
  playerCount: number;
  meanStdDev: number;
  mostVolatile: PlayerStabilityRow[];
  mostStable: PlayerStabilityRow[];
  flaggedVolatile: PlayerStabilityRow[];
}

export function buildDraftStabilityReport(
  runs: MockPickRow[][],
): DraftStabilityReport {
  const byPlayer = new Map<string, number[]>();
  const meta = new Map<string, { position: string }>();

  for (const run of runs) {
    for (const p of run) {
      if (p.isKeeperSlot) continue;
      if (!byPlayer.has(p.player)) byPlayer.set(p.player, []);
      byPlayer.get(p.player)!.push(p.pickNumber);
      meta.set(p.player, { position: p.position });
    }
  }

  const rows: PlayerStabilityRow[] = [];
  for (const [player, picks] of byPlayer) {
    const n = picks.length;
    const mean = picks.reduce((a, b) => a + b, 0) / n;
    const variance = picks.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    rows.push({
      player,
      position: meta.get(player)?.position ?? "?",
      meanPick: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 100) / 100,
      earliestPick: Math.min(...picks),
      latestPick: Math.max(...picks),
      pickSpread: Math.max(...picks) - Math.min(...picks),
    });
  }

  rows.sort((a, b) => b.stdDev - a.stdDev);
  const meanStdDev = rows.length
    ? rows.reduce((s, r) => s + r.stdDev, 0) / rows.length
    : 0;

  return {
    simulationCount: runs.length,
    playerCount: rows.length,
    meanStdDev: Math.round(meanStdDev * 100) / 100,
    mostVolatile: rows.slice(0, 10),
    mostStable: [...rows].sort((a, b) => a.stdDev - b.stdDev).slice(0, 10),
    flaggedVolatile: rows.filter((r) => r.pickSpread >= 40),
  };
}

// ── 4. DNA Influence Report ───────────────────────────────────────────────────

export interface DnaInfluenceByOwner {
  owner: string;
  directNudges: number;
  positions: Record<string, number>;
}

export interface DnaInfluenceReport {
  totalOwnerDnaNudges: number;
  directNudges: number;
  cascadedPickDiffs: number;
  avgAdpMovement: number;
  largestAdpMovement: { player: string; owner: string; pick: number; adpDelta: number } | null;
  byOwner: DnaInfluenceByOwner[];
  byPosition: Record<string, number>;
}

export function buildDnaInfluenceReport(params: {
  dnaPicks: MockPickRow[];
  baselinePicks: MockPickRow[];
  fullDnaPicks: ValidationPickRow[];
}): DnaInfluenceReport {
  const { dnaPicks, baselinePicks, fullDnaPicks } = params;

  let cascaded = 0;
  for (let i = 0; i < Math.min(dnaPicks.length, baselinePicks.length); i++) {
    const d = dnaPicks[i]!;
    const b = baselinePicks[i]!;
    if (d.player !== b.player || d.position !== b.position) cascaded++;
  }

  const direct = dnaPicks.filter((p) => p.primaryFactor === "OWNER_DNA");
  const directNudges = direct.length;
  const cascadedPickDiffs = Math.max(0, cascaded - directNudges);

  const adpMovements: number[] = [];
  let largest: DnaInfluenceReport["largestAdpMovement"] = null;

  for (const p of fullDnaPicks) {
    if (p.primaryFactor !== "OWNER_DNA" || p.adp == null) continue;
    const base = baselinePicks.find((b) => b.player === p.player);
    const basePick = base?.pickNumber ?? p.pickNumber;
    const delta = Math.abs(p.pickNumber - basePick);
    adpMovements.push(delta);
    if (!largest || delta > largest.adpDelta) {
      largest = { player: p.player, owner: p.ownerName, pick: p.pickNumber, adpDelta: delta };
    }
  }

  const byOwnerMap = new Map<string, DnaInfluenceByOwner>();
  const byPosition: Record<string, number> = {};

  for (const p of direct) {
    const key = normOwnerKey(p.ownerName);
    if (!byOwnerMap.has(key)) {
      byOwnerMap.set(key, { owner: p.ownerName, directNudges: 0, positions: {} });
    }
    const row = byOwnerMap.get(key)!;
    row.directNudges++;
    row.positions[p.position] = (row.positions[p.position] ?? 0) + 1;
    byPosition[p.position] = (byPosition[p.position] ?? 0) + 1;
  }

  return {
    totalOwnerDnaNudges: directNudges,
    directNudges,
    cascadedPickDiffs,
    avgAdpMovement: adpMovements.length
      ? Math.round((adpMovements.reduce((a, b) => a + b, 0) / adpMovements.length) * 10) / 10
      : 0,
    largestAdpMovement: largest,
    byOwner: [...byOwnerMap.values()].sort((a, b) => b.directNudges - a.directNudges),
    byPosition,
  };
}

// ── 5. Draft Explanation Coverage ─────────────────────────────────────────────

export interface ExplainabilityReport {
  totalNonBpaPicks: number;
  explainedCount: number;
  explainedPct: number;
  missingExplanations: Array<{ pick: number; owner: string; player: string; factor: string | null }>;
  conflictingExplanations: Array<{ pick: number; owner: string; player: string; reason: string }>;
}

const NON_BPA_FACTORS = new Set<PickPrimaryFactor>([
  "ROSTER_NEED", "POSITION_CAP", "LEAGUE_TIMING", "OWNER_DNA",
]);

export function buildExplainabilityReport(picks: ValidationPickRow[]): ExplainabilityReport {
  const missing: ExplainabilityReport["missingExplanations"] = [];
  const conflicting: ExplainabilityReport["conflictingExplanations"] = [];
  let nonBpa = 0;
  let explained = 0;

  for (const p of picks) {
    if (p.isKeeperSlot) continue;
    const factor = p.pickIntelligence?.primaryFactor ?? (p.primaryFactor as PickPrimaryFactor | null);
    const isNonBpa = factor != null && NON_BPA_FACTORS.has(factor);
    if (!isNonBpa) continue;
    nonBpa++;

    const text = p.draftDecision?.explanation?.trim()
      || p.pickIntelligence?.plainEnglish?.trim()
      || p.reasoning?.trim()
      || "";
    if (text.length > 10) {
      explained++;
    } else {
      missing.push({
        pick: p.pickNumber,
        owner: p.ownerName,
        player: p.player,
        factor: factor ?? null,
      });
    }

    const blocked = p.pickIntelligence?.blockedOverrides ?? [];
    if (blocked.length > 0 && factor === "OWNER_DNA") {
      conflicting.push({
        pick: p.pickNumber,
        owner: p.ownerName,
        player: p.player,
        reason: `DNA applied with ${blocked.length} blocked override(s) logged`,
      });
    }
  }

  return {
    totalNonBpaPicks: nonBpa,
    explainedCount: explained,
    explainedPct: nonBpa ? Math.round((explained / nonBpa) * 1000) / 10 : 100,
    missingExplanations: missing.slice(0, 25),
    conflictingExplanations: conflicting,
  };
}

// ── 6. Regression Report ──────────────────────────────────────────────────────

export interface RegressionReport {
  productionLabel: string;
  changedPickCount: number;
  changedPositionCount: number;
  changedRoundCount: number;
  garrett: { production: SlimRegressionRow | null; current: SlimRegressionRow | null };
  warner: { production: SlimRegressionRow | null; current: SlimRegressionRow | null };
  dpCount: { production: number; current: number };
  qbTimingDelta: number | null;
  teTimingDelta: number | null;
  first20: Array<{ pick: number; production: string; current: string; changed: boolean }>;
  summary: string;
}

export function buildRegressionReport(params: {
  productionBaseline: SlimRegressionRow[];
  currentPicks: MockPickRow[];
  productionLabel?: string;
}): RegressionReport {
  const { productionBaseline, currentPicks, productionLabel = "6405f04" } = params;
  const current = currentPicks.map((p) => slimRow(p));

  let changedPick = 0;
  let changedPos = 0;
  let changedRound = 0;

  for (let i = 0; i < Math.min(productionBaseline.length, current.length); i++) {
    const b = productionBaseline[i]!;
    const c = current[i]!;
    if (b.player !== c.player) changedPick++;
    if (b.pos !== c.pos) changedPos++;
    if (b.round !== c.round) changedRound++;
  }

  const find = (rows: SlimRegressionRow[], re: RegExp) => rows.find((r) => re.test(r.player)) ?? null;
  const dpCount = (rows: SlimRegressionRow[]) => rows.filter((r) => r.pos === "DP").length;

  const prodQb = productionBaseline.find((r) => r.pos === "QB" && r.round <= 6);
  const curQb = current.find((r) => r.pos === "QB" && r.round <= 6);
  const prodTe = productionBaseline.find((r) => r.pos === "TE");
  const curTe = current.find((r) => r.pos === "TE");

  const first20 = Array.from({ length: 20 }, (_, i) => {
    const b = productionBaseline[i];
    const c = current[i];
    return {
      pick: i + 1,
      production: b?.player ?? "—",
      current: c?.player ?? "—",
      changed: b?.player !== c?.player,
    };
  });

  const garrettProd = find(productionBaseline, /Myles Garrett/i);
  const garrettCur = find(current, /Myles Garrett/i);
  const warnerProd = find(productionBaseline, /Fred Warner/i);
  const warnerCur = find(current, /Fred Warner/i);

  const summaryParts = [
    `${changedPick} player changes vs ${productionLabel}`,
    `Garrett ${garrettProd?.pick ?? "?"}→${garrettCur?.pick ?? "?"}`,
    `Warner ${warnerProd?.pick ?? "?"}→${warnerCur?.pick ?? "?"}`,
    `DP ${dpCount(productionBaseline)}→${dpCount(current)}`,
    `first-20 unchanged: ${first20.filter((r) => !r.changed).length}/20`,
  ];

  return {
    productionLabel,
    changedPickCount: changedPick,
    changedPositionCount: changedPos,
    changedRoundCount: changedRound,
    garrett: { production: garrettProd, current: garrettCur },
    warner: { production: warnerProd, current: warnerCur },
    dpCount: { production: dpCount(productionBaseline), current: dpCount(current) },
    qbTimingDelta: prodQb && curQb ? curQb.pick - prodQb.pick : null,
    teTimingDelta: prodTe && curTe ? curTe.pick - prodTe.pick : null,
    first20,
    summary: summaryParts.join("; "),
  };
}

// ── 7. Performance ────────────────────────────────────────────────────────────

export interface PerformanceReport {
  buildMockDraftMs: { withDna: number; withoutDna: number; dnaOverheadMs: number };
  authenticityMs: number;
  stability100RunsMs: number;
  totalValidationMs: number;
}

// ── 8. Full Validation Report ─────────────────────────────────────────────────

export interface DraftIntelligenceValidationReport {
  generatedAt: string;
  leagueId: string;
  season: number;
  overallGrade: string;
  scores: {
    ownerAuthenticity: number;
    leagueAuthenticity: number;
    stability: number;
    explainability: number;
    regression: number;
  };
  ownerAuthenticity: OwnerAuthenticityDashboardRow[];
  leagueAuthenticity: LeagueAuthenticityDashboard;
  stability: DraftStabilityReport;
  dnaInfluence: DnaInfluenceReport;
  explainability: ExplainabilityReport;
  factorInfluence: FactorInfluenceReport;
  regression: RegressionReport;
  performance: PerformanceReport;
  legacyAuthenticity: ReturnType<typeof computeOwnerAuthenticityReport>;
  weakestOwners: OwnerAuthenticityDashboardRow[];
  strongestOwners: OwnerAuthenticityDashboardRow[];
  realismGaps: string[];
}

function letterGrade(score: number): string {
  if (score >= 93) return "A";
  if (score >= 87) return "A-";
  if (score >= 83) return "B+";
  if (score >= 80) return "B";
  if (score >= 77) return "B-";
  if (score >= 73) return "C+";
  if (score >= 70) return "C";
  if (score >= 67) return "C-";
  if (score >= 63) return "D+";
  if (score >= 60) return "D";
  return "F";
}

function stabilityScore(report: DraftStabilityReport): number {
  const volatilePenalty = report.flaggedVolatile.length * 8;
  const stdDevPenalty = Math.min(30, report.meanStdDev * 3);
  return Math.max(0, Math.round(100 - volatilePenalty - stdDevPenalty));
}

function regressionScore(report: RegressionReport): number {
  let score = 100;
  if (report.garrett.production?.pick !== report.garrett.current?.pick) score -= 15;
  if (report.warner.production?.pick !== report.warner.current?.pick) score -= 15;
  if (report.dpCount.production !== report.dpCount.current) score -= 20;
  const first20Changes = report.first20.filter((r) => r.changed).length;
  score -= first20Changes * 5;
  return Math.max(0, score);
}

function identifyRealismGaps(params: {
  ownerRows: OwnerAuthenticityDashboardRow[];
  league: LeagueAuthenticityDashboard;
  explainability: ExplainabilityReport;
  stability: DraftStabilityReport;
  regression: RegressionReport;
}): string[] {
  const gaps: string[] = [];
  const weak = params.ownerRows.filter((o) => o.authenticityPct < 80);
  if (weak.length) {
    gaps.push(`${weak.length} owner(s) below 80% authenticity: ${weak.map((o) => o.owner).join(", ")}`);
  }
  if (params.league.overallSimilarityPct < 85) {
    gaps.push(`League position/round similarity ${params.league.overallSimilarityPct}% (target ≥85%)`);
  }
  if (params.explainability.explainedPct < 90) {
    gaps.push(`Only ${params.explainability.explainedPct}% of non-BPA picks have explanations`);
  }
  if (params.stability.flaggedVolatile.length) {
    gaps.push(`${params.stability.flaggedVolatile.length} player(s) with ≥40-pick spread across 100 stochastic runs`);
  }
  if (params.regression.changedPickCount > 80) {
    gaps.push(`${params.regression.changedPickCount} cascaded pick diffs vs production baseline`);
  }
  return gaps;
}

export function formatValidationReportText(report: DraftIntelligenceValidationReport): string {
  const lines: string[] = [
    "══════════════════════════════════════════════════════════════",
    "        DRAFT INTELLIGENCE VALIDATION REPORT",
    "══════════════════════════════════════════════════════════════",
    `Generated: ${report.generatedAt}`,
    `League ${report.leagueId} · Season ${report.season}`,
    "",
    `OVERALL GRADE: ${report.overallGrade}`,
    `  Owner Authenticity:  ${report.scores.ownerAuthenticity}%`,
    `  League Authenticity: ${report.scores.leagueAuthenticity}%`,
    `  Stability:           ${report.scores.stability}%`,
    `  Explainability:      ${report.scores.explainability}%`,
    `  Regression:          ${report.scores.regression}%`,
    "",
    "── Owner Authenticity (sortable) ──",
    "Owner | Authenticity | Pos Match | Round Match | QB hist→sim | TE hist→sim",
  ];

  for (const o of report.ownerAuthenticity) {
    lines.push(
      `${o.owner} | ${o.authenticityPct}% | ${o.positionMatchPct}% | ${o.roundMatchPct}% | ` +
      `${o.historicalQbTiming?.toFixed(1) ?? "—"}→${o.simulatedQbTiming ?? "—"} | ` +
      `${o.historicalTeTiming?.toFixed(1) ?? "—"}→${o.simulatedTeTiming ?? "—"}`,
    );
  }

  lines.push(
    "",
    "── League Authenticity ──",
    `Overall similarity: ${report.leagueAuthenticity.overallSimilarityPct}%`,
    `QB timing: hist ${report.leagueAuthenticity.avgQbRound.historical?.toFixed(1) ?? "—"} → sim ${report.leagueAuthenticity.avgQbRound.simulated ?? "—"}`,
    `TE timing: hist ${report.leagueAuthenticity.avgTeRound.historical?.toFixed(1) ?? "—"} → sim ${report.leagueAuthenticity.avgTeRound.simulated ?? "—"}`,
    `First RB: hist ${report.leagueAuthenticity.avgFirstRb.historical?.toFixed(1) ?? "—"} → sim ${report.leagueAuthenticity.avgFirstRb.simulated ?? "—"}`,
    `First WR: hist ${report.leagueAuthenticity.avgFirstWr.historical?.toFixed(1) ?? "—"} → sim ${report.leagueAuthenticity.avgFirstWr.simulated ?? "—"}`,
    `First DP: hist ${report.leagueAuthenticity.avgFirstDp.historical?.toFixed(1) ?? "—"} → sim ${report.leagueAuthenticity.avgFirstDp.simulated ?? "—"}`,
    `Reach frequency (sim): ${report.leagueAuthenticity.reachFrequencyPct.simulated}%`,
    "",
    "── Stability (100 stochastic simulations) ──",
    `Mean std dev: ${report.stability.meanStdDev} picks · Flagged volatile (≥40 spread): ${report.stability.flaggedVolatile.length}`,
    ...report.stability.mostVolatile.slice(0, 5).map(
      (p) => `  volatile: ${p.player} σ=${p.stdDev} spread=${p.pickSpread} (${p.earliestPick}-${p.latestPick})`,
    ),
    "",
    "── DNA Influence ──",
    `Direct nudges: ${report.dnaInfluence.directNudges} · Cascaded diffs: ${report.dnaInfluence.cascadedPickDiffs}`,
    `Avg ADP movement: ${report.dnaInfluence.avgAdpMovement}`,
    ...report.dnaInfluence.byOwner.map((o) => `  ${o.owner}: ${o.directNudges} nudge(s)`),
    "",
    "── Explainability ──",
    `${report.explainability.explainedPct}% explained (${report.explainability.explainedCount}/${report.explainability.totalNonBpaPicks} non-BPA)`,
    `Missing: ${report.explainability.missingExplanations.length} · Conflicts: ${report.explainability.conflictingExplanations.length}`,
    "",
    "── Decision Factor Influence ──",
    ...report.factorInfluence.factors.slice(0, 8).map(
      (f) => `  ${f.label}: applied ${f.appliedPct}% · supported ${f.supportedPct}% · blocked ${f.blockedPct}% · conf ${f.avgConfidence} · infl ${f.avgInfluence}`,
    ),
    "",
    "── Regression vs production ──",
    report.regression.summary,
    "",
    "── Performance ──",
    `buildMockDraft: ${report.performance.buildMockDraftMs.withDna}ms (DNA) / ${report.performance.buildMockDraftMs.withoutDna}ms (baseline)`,
    `Authenticity scoring: ${report.performance.authenticityMs}ms · 100 stability runs: ${report.performance.stability100RunsMs}ms`,
    "",
    "── Weakest owners ──",
    ...report.weakestOwners.map((o) => `  ${o.owner}: ${o.authenticityPct}%`),
    "",
    "── Strongest owners ──",
    ...report.strongestOwners.map((o) => `  ${o.owner}: ${o.authenticityPct}%`),
    "",
    "── Remaining realism gaps ──",
    ...(report.realismGaps.length ? report.realismGaps.map((g) => `  • ${g}`) : ["  (none flagged)"]),
    "══════════════════════════════════════════════════════════════",
  );
  return lines.join("\n");
}

export function runDraftIntelligenceValidation(params: {
  inputs: MockDraftInputs;
  historical: HistoricalProfileBundle;
  productionBaseline: SlimRegressionRow[];
  leagueId: string;
  season: number;
  simulationCount?: number;
}): DraftIntelligenceValidationReport {
  const tStart = performance.now();
  const { inputs, historical, productionBaseline, leagueId, season } = params;
  const simulationCount = params.simulationCount ?? 100;
  const ctx = inputs.ownerDnaContext;
  if (!ctx) throw new Error("ownerDnaContext required");

  const t0 = performance.now();
  runFullMockDraftSimulation(inputs, { disableDna: true });
  const withoutDnaMs = performance.now() - t0;

  const t1 = performance.now();
  const fullDnaPicks = runFullMockDraftSimulation(inputs);
  const withDnaMs = performance.now() - t1;

  const dnaPicks = fullDnaPicks.map((p) => ({
    pickNumber: p.pickNumber,
    round: p.round,
    ownerName: p.ownerName,
    player: p.player,
    position: p.position,
    primaryFactor: p.primaryFactor,
    isKeeperSlot: p.isKeeperSlot,
  }));

  const t2 = performance.now();
  const baselinePicks = runMockDraftSimulation(inputs, { disableDna: true });
  const ownerRows = buildOwnerAuthenticityDashboard({ historical, simulatedPicks: dnaPicks });
  const leagueDash = buildLeagueAuthenticityDashboard({
    historical,
    simulatedPicks: dnaPicks,
    playerPool: inputs.playerPool,
  });
  const legacyAuth = computeOwnerAuthenticityReport({
    mockPicks: dnaPicks,
    baselinePicks,
    phase1Top14Baseline: baselinePicks.slice(0, 14),
    ownerDnaContext: ctx,
  });
  const authenticityMs = performance.now() - t2;

  const t3 = performance.now();
  const stabilityRuns: MockPickRow[][] = [];
  for (let i = 0; i < simulationCount; i++) {
    stabilityRuns.push(runMockDraftSimulation(inputs, { stochasticSeed: 1000 + i }));
  }
  const stability100RunsMs = performance.now() - t3;
  const stability = buildDraftStabilityReport(stabilityRuns);

  const dnaInfluence = buildDnaInfluenceReport({
    dnaPicks,
    baselinePicks,
    fullDnaPicks,
  });
  const explainability = buildExplainabilityReport(fullDnaPicks);
  const factorInfluence = buildFactorInfluenceReport(fullDnaPicks);
  const regression = buildRegressionReport({ productionBaseline, currentPicks: dnaPicks });

  const ownerScore = ownerRows.length
    ? Math.round(ownerRows.reduce((s, o) => s + o.authenticityPct, 0) / ownerRows.length)
    : 0;
  const scores = {
    ownerAuthenticity: ownerScore,
    leagueAuthenticity: Math.round(leagueDash.overallSimilarityPct),
    stability: stabilityScore(stability),
    explainability: Math.round(explainability.explainedPct),
    regression: regressionScore(regression),
  };
  const composite = (
    scores.ownerAuthenticity * 0.25 +
    scores.leagueAuthenticity * 0.25 +
    scores.stability * 0.2 +
    scores.explainability * 0.15 +
    scores.regression * 0.15
  );

  const weakestOwners = [...ownerRows].sort((a, b) => a.authenticityPct - b.authenticityPct).slice(0, 5);
  const strongestOwners = ownerRows.slice(0, 5);
  const realismGaps = identifyRealismGaps({
    ownerRows,
    league: leagueDash,
    explainability,
    stability,
    regression,
  });

  return {
    generatedAt: new Date().toISOString(),
    leagueId,
    season,
    overallGrade: letterGrade(composite),
    scores,
    ownerAuthenticity: ownerRows,
    leagueAuthenticity: leagueDash,
    stability,
    dnaInfluence,
    explainability,
    factorInfluence,
    regression,
    performance: {
      buildMockDraftMs: {
        withDna: Math.round(withDnaMs),
        withoutDna: Math.round(withoutDnaMs),
        dnaOverheadMs: Math.round(withDnaMs - withoutDnaMs),
      },
      authenticityMs: Math.round(authenticityMs),
      stability100RunsMs: Math.round(stability100RunsMs),
      totalValidationMs: Math.round(performance.now() - tStart),
    },
    legacyAuthenticity: legacyAuth,
    weakestOwners,
    strongestOwners,
    realismGaps,
  };
}
