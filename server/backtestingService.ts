/**
 * server/backtestingService.ts
 *
 * DB helpers and accuracy-computation functions for the backtesting dashboard.
 *
 * Tables:
 *   start_sit_decisions       — start/sit recommendations + actual outcomes
 *   trade_decisions           — trade evaluations + Rod's decision + outcome rating
 *   monte_carlo_calibration   — win-probability predictions + actual matchup results
 *   champ_equity_predictions  — weekly champ % predictions + season-end reality
 */

import { getDb } from "./db";
import {
  startSitDecisions,
  tradeDecisions,
  monteCarloCalibration,
  champEquityPredictions,
  weeklyPlayerStats,
  type InsertStartSitDecision,
  type InsertTradeDecision,
  type InsertMonteCarloCalibration,
  type InsertChampEquityPrediction,
  type StartSitDecision,
  type TradeDecision,
  type MonteCarloCalibration,
  type ChampEquityPrediction,
} from "../drizzle/schema";
import { eq, and, isNull, desc, asc, sql } from "drizzle-orm";

// ─── Start/Sit Helpers ────────────────────────────────────────────────────────

export async function logStartSitDecision(data: InsertStartSitDecision): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.insert(startSitDecisions).values(data).$returningId();
  return row.id;
}

export async function getStartSitDecisions(season?: number): Promise<StartSitDecision[]> {
  const db = await getDb();
  if (!db) return [];
  if (season) {
    return db.select().from(startSitDecisions).where(eq(startSitDecisions.season, season)).orderBy(desc(startSitDecisions.createdAt));
  }
  return db.select().from(startSitDecisions).orderBy(desc(startSitDecisions.createdAt));
}

export async function resolveStartSitDecision(
  id: number,
  playerAActualPoints: number,
  playerBActualPoints: number
): Promise<"CORRECT" | "INCORRECT" | "PUSH"> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rec = await db.select().from(startSitDecisions).where(eq(startSitDecisions.id, id)).limit(1);
  if (!rec[0]) throw new Error("Decision not found");

  const { recommendation } = rec[0];
  let outcome: "CORRECT" | "INCORRECT" | "PUSH";
  const diff = playerAActualPoints - playerBActualPoints;

  if (Math.abs(diff) < 50) {
    outcome = "PUSH"; // within 0.5 pts
  } else if (recommendation === "A" && diff > 0) {
    outcome = "CORRECT";
  } else if (recommendation === "B" && diff < 0) {
    outcome = "CORRECT";
  } else if (recommendation === "TOSS_UP") {
    outcome = "PUSH";
  } else {
    outcome = "INCORRECT";
  }

  await db.update(startSitDecisions).set({
    playerAActualPoints,
    playerBActualPoints,
    outcome,
    resolvedAt: new Date(),
  }).where(eq(startSitDecisions.id, id));

  return outcome;
}

// Auto-resolve start/sit decisions using weekly stats cache
export async function autoResolveStartSitFromCache(season: number, week: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const pending = await db.select().from(startSitDecisions).where(
    and(
      eq(startSitDecisions.season, season),
      eq(startSitDecisions.week, week),
      isNull(startSitDecisions.outcome)
    )
  );

  let resolved = 0;
  for (const dec of pending) {
    const lastNameA = dec.playerAName.split(" ").slice(1).join(" ") || dec.playerAName;
    const lastNameB = dec.playerBName.split(" ").slice(1).join(" ") || dec.playerBName;

    const [statsA] = await db.select().from(weeklyPlayerStats).where(
      and(
        eq(weeklyPlayerStats.season, season),
        eq(weeklyPlayerStats.week, week),
        sql`LOWER(${weeklyPlayerStats.playerName}) LIKE LOWER(${`%${lastNameA}%`})`
      )
    ).limit(1);

    const [statsB] = await db.select().from(weeklyPlayerStats).where(
      and(
        eq(weeklyPlayerStats.season, season),
        eq(weeklyPlayerStats.week, week),
        sql`LOWER(${weeklyPlayerStats.playerName}) LIKE LOWER(${`%${lastNameB}%`})`
      )
    ).limit(1);

    if (statsA && statsB) {
      await resolveStartSitDecision(dec.id, statsA.fantasyPoints ?? 0, statsB.fantasyPoints ?? 0);
      resolved++;
    }
  }
  return resolved;
}

// ─── Trade Decision Helpers ───────────────────────────────────────────────────

export async function logTradeDecision(data: InsertTradeDecision): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.insert(tradeDecisions).values(data).$returningId();
  return row.id;
}

export async function getTradeDecisions(season?: number): Promise<TradeDecision[]> {
  const db = await getDb();
  if (!db) return [];
  if (season) {
    return db.select().from(tradeDecisions).where(eq(tradeDecisions.season, season)).orderBy(desc(tradeDecisions.createdAt));
  }
  return db.select().from(tradeDecisions).orderBy(desc(tradeDecisions.createdAt));
}

export async function updateTradeDecision(
  id: number,
  update: {
    rodDecision?: "ACCEPTED" | "REJECTED" | "PENDING";
    outcomeRating?: "GREAT" | "GOOD" | "NEUTRAL" | "BAD" | "TERRIBLE";
    outcomeNotes?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tradeDecisions).set({
    ...update,
    ...(update.outcomeRating ? { resolvedAt: new Date() } : {}),
  }).where(eq(tradeDecisions.id, id));
}

// ─── Monte Carlo Calibration Helpers ─────────────────────────────────────────

export async function logMonteCarloPrediction(data: InsertMonteCarloCalibration): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.insert(monteCarloCalibration).values(data).$returningId();
  return row.id;
}

export async function resolveMonteCarloPrediction(
  id: number,
  actualScore: number,
  actualOpponentScore: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const actualWon = actualScore > actualOpponentScore ? 1 : 0;
  await db.update(monteCarloCalibration).set({
    actualScore,
    actualOpponentScore,
    actualWon,
    resolvedAt: new Date(),
  }).where(eq(monteCarloCalibration.id, id));
  return actualWon;
}

export async function getMonteCarloPredictions(season?: number): Promise<MonteCarloCalibration[]> {
  const db = await getDb();
  if (!db) return [];
  if (season) {
    return db.select().from(monteCarloCalibration).where(eq(monteCarloCalibration.season, season)).orderBy(desc(monteCarloCalibration.createdAt));
  }
  return db.select().from(monteCarloCalibration).orderBy(desc(monteCarloCalibration.createdAt));
}

// ─── Champ Equity Helpers ─────────────────────────────────────────────────────

export async function logChampEquityPrediction(data: InsertChampEquityPrediction): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.insert(champEquityPredictions).values(data).$returningId();
  return row.id;
}

export async function resolveChampEquityPrediction(
  season: number,
  teamName: string,
  actuallyWonChamp: boolean,
  actuallyMadePlayoffs: boolean,
  finalRank: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(champEquityPredictions).set({
    actuallyWonChamp: actuallyWonChamp ? 1 : 0,
    actuallyMadePlayoffs: actuallyMadePlayoffs ? 1 : 0,
    finalRank,
    resolvedAt: new Date(),
  }).where(
    and(
      eq(champEquityPredictions.season, season),
      eq(champEquityPredictions.teamName, teamName)
    )
  );
}

export async function getChampEquityPredictions(season?: number): Promise<ChampEquityPrediction[]> {
  const db = await getDb();
  if (!db) return [];
  if (season) {
    return db.select().from(champEquityPredictions).where(eq(champEquityPredictions.season, season)).orderBy(asc(champEquityPredictions.week));
  }
  return db.select().from(champEquityPredictions).orderBy(asc(champEquityPredictions.week));
}

// ─── Accuracy Metrics ─────────────────────────────────────────────────────────

export interface StartSitAccuracy {
  total: number;
  correct: number;
  incorrect: number;
  pushes: number;
  pending: number;
  hitRate: number;
  hitRateWithPush: number;
  byPosition: Record<string, { total: number; correct: number; hitRate: number }>;
  recentTrend: Array<{
    week: number;
    season: number;
    outcome: string | null;
    playerA: string;
    playerB: string;
    rec: string;
  }>;
}

export async function calcStartSitAccuracy(season?: number): Promise<StartSitAccuracy> {
  const rows = await getStartSitDecisions(season);

  const resolved = rows.filter((r: StartSitDecision) => r.outcome !== null);
  const correct = resolved.filter((r: StartSitDecision) => r.outcome === "CORRECT").length;
  const incorrect = resolved.filter((r: StartSitDecision) => r.outcome === "INCORRECT").length;
  const pushes = resolved.filter((r: StartSitDecision) => r.outcome === "PUSH").length;
  const pending = rows.filter((r: StartSitDecision) => r.outcome === null).length;

  const decisive = correct + incorrect;
  const hitRate = decisive > 0 ? Math.round((correct / decisive) * 100) : 0;
  const hitRateWithPush =
    resolved.length > 0
      ? Math.round(((correct + pushes * 0.5) / resolved.length) * 100)
      : 0;

  const byPosition: StartSitAccuracy["byPosition"] = {};
  for (const r of resolved) {
    const pos = r.playerAPosition;
    if (!byPosition[pos]) byPosition[pos] = { total: 0, correct: 0, hitRate: 0 };
    byPosition[pos].total++;
    if (r.outcome === "CORRECT") byPosition[pos].correct++;
  }
  for (const pos of Object.keys(byPosition)) {
    const p = byPosition[pos];
    byPosition[pos].hitRate = p.total > 0 ? Math.round((p.correct / p.total) * 100) : 0;
  }

  const recentTrend = rows.slice(0, 20).map((r: StartSitDecision) => ({
    week: r.week,
    season: r.season,
    outcome: r.outcome,
    playerA: r.playerAName,
    playerB: r.playerBName,
    rec: r.recommendation,
  }));

  return { total: rows.length, correct, incorrect, pushes, pending, hitRate, hitRateWithPush, byPosition, recentTrend };
}

export interface MonteCarloCalibrationReport {
  total: number;
  resolved: number;
  pending: number;
  calibrationBuckets: Array<{
    bucket: string;
    predicted: number;
    actual: number;
    count: number;
  }>;
  brierScore: number;
  overallAccuracy: number;
}

export async function calcMonteCarloCalibration(season?: number): Promise<MonteCarloCalibrationReport> {
  const rows = await getMonteCarloPredictions(season);
  const resolved = rows.filter((r: MonteCarloCalibration) => r.actualWon !== null);
  const pending = rows.length - resolved.length;

  const bucketDefs = [
    { label: "<40%", min: 0, max: 40 },
    { label: "40-50%", min: 40, max: 50 },
    { label: "50-60%", min: 50, max: 60 },
    { label: "60-70%", min: 60, max: 70 },
    { label: "70-80%", min: 70, max: 80 },
    { label: ">80%", min: 80, max: 101 },
  ];

  const calibrationBuckets = bucketDefs.map(({ label, min, max }) => {
    const inBucket = resolved.filter(
      (r: MonteCarloCalibration) => r.predictedWinPct >= min && r.predictedWinPct < max
    );
    const wins = inBucket.filter((r: MonteCarloCalibration) => r.actualWon === 1).length;
    const midpoint = Math.round((min + Math.min(max, 100)) / 2);
    return {
      bucket: label,
      predicted: midpoint,
      actual: inBucket.length > 0 ? Math.round((wins / inBucket.length) * 100) : 0,
      count: inBucket.length,
    };
  });

  const brierScore =
    resolved.length > 0
      ? Math.round(
          (resolved.reduce((sum: number, r: MonteCarloCalibration) => {
            const p = r.predictedWinPct / 100;
            const a = r.actualWon ?? 0;
            return sum + (p - a) ** 2;
          }, 0) / resolved.length) * 1000
        ) / 1000
      : 0;

  const correctPredictions = resolved.filter(
    (r: MonteCarloCalibration) =>
      (r.predictedWinPct >= 50 && r.actualWon === 1) ||
      (r.predictedWinPct < 50 && r.actualWon === 0)
  ).length;
  const overallAccuracy =
    resolved.length > 0 ? Math.round((correctPredictions / resolved.length) * 100) : 0;

  return { total: rows.length, resolved: resolved.length, pending, calibrationBuckets, brierScore, overallAccuracy };
}

export interface TradeDecisionReport {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
  byVerdict: Record<string, { total: number; accepted: number; rejected: number }>;
  outcomeBreakdown: Record<string, number>;
  acceptedWins: number;
  rejectedLosses: number;
  recentDecisions: Array<{
    id: number;
    season: number;
    week: number;
    verdict: string;
    rodDecision: string;
    outcomeRating: string | null;
    assetsGiven: unknown;
    assetsReceived: unknown;
  }>;
}

export async function calcTradeDecisionReport(season?: number): Promise<TradeDecisionReport> {
  const rows = await getTradeDecisions(season);

  const accepted = rows.filter((r: TradeDecision) => r.rodDecision === "ACCEPTED").length;
  const rejected = rows.filter((r: TradeDecision) => r.rodDecision === "REJECTED").length;
  const pending = rows.filter((r: TradeDecision) => r.rodDecision === "PENDING").length;

  const byVerdict: TradeDecisionReport["byVerdict"] = {};
  for (const r of rows) {
    if (!byVerdict[r.verdict]) byVerdict[r.verdict] = { total: 0, accepted: 0, rejected: 0 };
    byVerdict[r.verdict].total++;
    if (r.rodDecision === "ACCEPTED") byVerdict[r.verdict].accepted++;
    if (r.rodDecision === "REJECTED") byVerdict[r.verdict].rejected++;
  }

  const outcomeBreakdown: Record<string, number> = {};
  for (const r of rows) {
    if (r.outcomeRating) {
      outcomeBreakdown[r.outcomeRating] = (outcomeBreakdown[r.outcomeRating] ?? 0) + 1;
    }
  }

  const acceptedWins = rows.filter(
    (r: TradeDecision) => r.rodDecision === "ACCEPTED" && r.verdict === "WIN"
  ).length;
  const rejectedLosses = rows.filter(
    (r: TradeDecision) => r.rodDecision === "REJECTED" && r.verdict === "LOSS"
  ).length;

  const recentDecisions = rows.slice(0, 20).map((r: TradeDecision) => ({
    id: r.id,
    season: r.season,
    week: r.week,
    verdict: r.verdict,
    rodDecision: r.rodDecision,
    outcomeRating: r.outcomeRating,
    assetsGiven: r.assetsGiven,
    assetsReceived: r.assetsReceived,
  }));

  return { total: rows.length, accepted, rejected, pending, byVerdict, outcomeBreakdown, acceptedWins, rejectedLosses, recentDecisions };
}

export interface ChampEquityReport {
  total: number;
  resolved: number;
  pending: number;
  rodPredictions: Array<{
    season: number;
    week: number;
    predictedChampPct: number;
    actuallyWonChamp: number | null;
  }>;
  champCalibration: Array<{
    bucket: string;
    predicted: number;
    actualChampRate: number;
    count: number;
  }>;
  playoffCalibration: Array<{
    bucket: string;
    predicted: number;
    actualPlayoffRate: number;
    count: number;
  }>;
}

export async function calcChampEquityReport(season?: number): Promise<ChampEquityReport> {
  const rows = await getChampEquityPredictions(season);
  const resolved = rows.filter((r: ChampEquityPrediction) => r.actuallyWonChamp !== null);
  const pending = rows.length - resolved.length;

  const rodPredictions = rows
    .filter((r: ChampEquityPrediction) =>
      r.teamName.toLowerCase().includes("rod") ||
      r.teamName.toLowerCase().includes("sellers") ||
      r.teamName.toLowerCase().includes("atlantas")
    )
    .map((r: ChampEquityPrediction) => ({
      season: r.season,
      week: r.week,
      predictedChampPct: r.predictedChampPct,
      actuallyWonChamp: r.actuallyWonChamp,
    }));

  const champBuckets = [
    { label: "<5%", min: 0, max: 500 },
    { label: "5-15%", min: 500, max: 1500 },
    { label: "15-30%", min: 1500, max: 3000 },
    { label: "30-50%", min: 3000, max: 5000 },
    { label: ">50%", min: 5000, max: 10001 },
  ];

  const champCalibration = champBuckets.map(({ label, min, max }) => {
    const inBucket = resolved.filter(
      (r: ChampEquityPrediction) => r.predictedChampPct >= min && r.predictedChampPct < max
    );
    const champs = inBucket.filter((r: ChampEquityPrediction) => r.actuallyWonChamp === 1).length;
    const midpoint = Math.round((min + Math.min(max, 10000)) / 200);
    return {
      bucket: label,
      predicted: midpoint,
      actualChampRate: inBucket.length > 0 ? Math.round((champs / inBucket.length) * 100) : 0,
      count: inBucket.length,
    };
  });

  const playoffBuckets = [
    { label: "<20%", min: 0, max: 2000 },
    { label: "20-40%", min: 2000, max: 4000 },
    { label: "40-60%", min: 4000, max: 6000 },
    { label: "60-80%", min: 6000, max: 8000 },
    { label: ">80%", min: 8000, max: 10001 },
  ];

  const playoffCalibration = playoffBuckets.map(({ label, min, max }) => {
    const inBucket = resolved.filter(
      (r: ChampEquityPrediction) => r.predictedPlayoffPct >= min && r.predictedPlayoffPct < max
    );
    const playoffs = inBucket.filter((r: ChampEquityPrediction) => r.actuallyMadePlayoffs === 1).length;
    const midpoint = Math.round((min + Math.min(max, 10000)) / 200);
    return {
      bucket: label,
      predicted: midpoint,
      actualPlayoffRate: inBucket.length > 0 ? Math.round((playoffs / inBucket.length) * 100) : 0,
      count: inBucket.length,
    };
  });

  return { total: rows.length, resolved: resolved.length, pending, rodPredictions, champCalibration, playoffCalibration };
}

// ─── Summary Stats ─────────────────────────────────────────────────────────────

export interface BacktestSummary {
  startSitHitRate: number;
  monteCarloAccuracy: number;
  monteCarloBrierScore: number;
  tradeAcceptedWinRate: number;
  totalDecisionsLogged: number;
  pendingResolution: number;
}

export async function getBacktestSummary(season?: number): Promise<BacktestSummary> {
  const [ss, mc, td] = await Promise.all([
    calcStartSitAccuracy(season),
    calcMonteCarloCalibration(season),
    calcTradeDecisionReport(season),
  ]);

  const tradeAcceptedWinRate =
    td.accepted > 0 ? Math.round((td.acceptedWins / td.accepted) * 100) : 0;

  return {
    startSitHitRate: ss.hitRate,
    monteCarloAccuracy: mc.overallAccuracy,
    monteCarloBrierScore: mc.brierScore,
    tradeAcceptedWinRate,
    totalDecisionsLogged: ss.total + mc.total + td.total,
    pendingResolution: ss.pending + mc.pending + td.pending,
  };
}
