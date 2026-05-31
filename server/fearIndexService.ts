/**
 * fearIndexService.ts
 * ───────────────────
 * Sprint 4: League Fear Index
 *
 * Computes a deterministic "fear score" (0–100) for every team in the league
 * each week. No LLM required — pure arithmetic from existing data.
 *
 * Formula (from emotional_systems_plan.md):
 *   fearScore = (avgPF_last4 * 0.30)
 *             + (winStreak * 8)
 *             + (rosterHealthScore * 0.20)
 *             + (tradeAggressionScore * 0.15)
 *             + (exploitabilityInverse * 0.15)
 *
 * Component definitions:
 *   avgPF_last4          — average fantasy points scored in last 4 matchup weeks,
 *                          normalised to 0-100 (league-relative: top scorer = 100)
 *   winStreak            — current consecutive wins (capped at 6 for scoring)
 *   rosterHealthScore    — 0-100 from weeklyAssessmentService (injury/depth)
 *   tradeAggressionScore — 0-100: total season transactions / league-max × 100
 *   exploitabilityInverse — 100 - exploitabilityScore (lower exploitability = more fearsome)
 *
 * Heat labels:
 *   UNTOUCHABLE   — fearScore ≥ 85
 *   RISING THREAT — fearScore ≥ 70
 *   DANGEROUS     — fearScore ≥ 55
 *   NEUTRAL       — fearScore ≥ 40
 *   DECLINING     — fearScore ≥ 25
 *   COLLAPSING    — fearScore < 25
 *
 * Exports:
 *   computeFearIndex()      — pure function, no DB (testable)
 *   refreshFearIndex()      — compute + persist to DB
 *   getFearIndexFromDb()    — read cached rows from DB
 */

import { getDb, getCachedView } from "./db";
import { fearIndex } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  normalizeTeams,
  normalizeMatchups,
  normalizeTransactions,
} from "./espnService";
import { calcLeagueDNA } from "./leagueDNA";
import type { ManagerRawData } from "./leagueDNA";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HeatLabel =
  | "UNTOUCHABLE"
  | "RISING THREAT"
  | "DANGEROUS"
  | "NEUTRAL"
  | "DECLINING"
  | "COLLAPSING";

export interface FearIndexEntry {
  teamId: number;
  memberId: string;
  ownerName: string;
  fearScore: number;        // 0-100
  heatLabel: HeatLabel;
  rank: number;             // 1 = most feared
  // Component scores (for transparency)
  avgPfLast4: number;       // 0-100 normalised
  winStreak: number;        // raw consecutive wins
  rosterHealthScore: number;
  tradeAggressionScore: number;
  exploitabilityInverse: number;
}

export interface FearIndexInput {
  season: number;
  week: number;
  teams: ReturnType<typeof normalizeTeams>;
  matchups: ReturnType<typeof normalizeMatchups>;
  transactions: ReturnType<typeof normalizeTransactions>;
  ownerMap: Record<number, string>;        // teamId → ownerName
  memberIdMap: Record<number, string>;     // teamId → primary memberId
  rosterHealthMap: Record<number, number>; // teamId → rosterHealthScore (0-100)
  exploitabilityMap: Record<string, number>; // memberId → exploitabilityScore (0-100)
}

// ─── Pure computation (no DB, fully testable) ─────────────────────────────────

/** Compute average fantasy points for a team across the last N matchup weeks. */
function recentAvgPF(
  matchups: ReturnType<typeof normalizeMatchups>,
  teamId: number,
  currentWeek: number,
  lookback = 4
): number {
  const pts: number[] = [];
  for (let w = Math.max(1, currentWeek - lookback); w < currentWeek; w++) {
    const m = (matchups as Array<Record<string, unknown>>).find(
      (mx) =>
        (mx.matchupPeriodId as number) === w &&
        ((mx.homeTeamId as number) === teamId || (mx.awayTeamId as number) === teamId)
    );
    if (!m) continue;
    const score =
      (m.homeTeamId as number) === teamId
        ? (m.homeTotalPoints as number) || 0
        : (m.awayTotalPoints as number) || 0;
    pts.push(score);
  }
  if (pts.length === 0) return 0;
  return pts.reduce((s, p) => s + p, 0) / pts.length;
}

/** Compute current consecutive win streak (positive) or loss streak (negative). */
function computeWinStreak(
  matchups: ReturnType<typeof normalizeMatchups>,
  teamId: number,
  currentWeek: number
): number {
  let streak = 0;
  for (let w = currentWeek - 1; w >= 1; w--) {
    const m = (matchups as Array<Record<string, unknown>>).find(
      (mx) =>
        (mx.matchupPeriodId as number) === w &&
        ((mx.homeTeamId as number) === teamId || (mx.awayTeamId as number) === teamId)
    );
    if (!m) break;
    const isHome = (m.homeTeamId as number) === teamId;
    const myPts = isHome ? (m.homeTotalPoints as number) || 0 : (m.awayTotalPoints as number) || 0;
    const oppPts = isHome ? (m.awayTotalPoints as number) || 0 : (m.homeTotalPoints as number) || 0;
    const won = myPts > oppPts;
    if (streak === 0) {
      streak = won ? 1 : -1;
    } else if (streak > 0 && won) {
      streak++;
    } else if (streak < 0 && !won) {
      streak--;
    } else {
      break;
    }
  }
  return streak;
}

/** Assign heat label from fear score. */
export function assignHeatLabel(fearScore: number): HeatLabel {
  if (fearScore >= 85) return "UNTOUCHABLE";
  if (fearScore >= 70) return "RISING THREAT";
  if (fearScore >= 55) return "DANGEROUS";
  if (fearScore >= 40) return "NEUTRAL";
  if (fearScore >= 25) return "DECLINING";
  return "COLLAPSING";
}

/**
 * Pure deterministic fear index computation.
 * Returns entries sorted by fearScore descending (rank 1 = most feared).
 */
export function computeFearIndex(input: FearIndexInput): FearIndexEntry[] {
  const {
    season: _season,
    week,
    teams,
    matchups,
    transactions,
    ownerMap,
    memberIdMap,
    rosterHealthMap,
    exploitabilityMap,
  } = input;

  // ── Transaction counts per team (current season) ───────────────────────────
  const txCountMap: Record<number, number> = {};
  for (const tx of transactions as Array<Record<string, unknown>>) {
    const tid = tx.teamId as number;
    if (!tid) continue;
    txCountMap[tid] = (txCountMap[tid] || 0) + 1;
  }
  const maxTx = Math.max(1, ...Object.values(txCountMap));

  // ── Raw avg PF last 4 weeks per team ──────────────────────────────────────
  const rawAvgPfMap: Record<number, number> = {};
  for (const t of teams) {
    rawAvgPfMap[t.teamId as number] = recentAvgPF(matchups, t.teamId as number, week);
  }
  const maxRawAvgPf = Math.max(1, ...Object.values(rawAvgPfMap));

  // ── Compute per-team scores ────────────────────────────────────────────────
  const entries: FearIndexEntry[] = teams.map((t) => {
    const tid = t.teamId as number;
    const memberId = memberIdMap[tid] || "";
    const ownerName = ownerMap[tid] || t.owners as string || `Team ${tid}`;

    // Component 1: avg PF last 4 weeks, normalised 0-100
    const avgPfLast4 = Math.round((rawAvgPfMap[tid] / maxRawAvgPf) * 100);

    // Component 2: win streak (positive = wins, capped at 6 for scoring)
    const streak = computeWinStreak(matchups, tid, week);
    const winStreak = Math.max(0, Math.min(streak, 6));

    // Component 3: roster health score (0-100)
    const rosterHealthScore = rosterHealthMap[tid] ?? 50;

    // Component 4: trade aggression score (0-100)
    const tradeAggressionScore = Math.round(((txCountMap[tid] || 0) / maxTx) * 100);

    // Component 5: exploitability inverse (lower exploitability = more fearsome)
    const exploitability = exploitabilityMap[memberId] ?? 50;
    const exploitabilityInverse = 100 - exploitability;

    // ── Fear score formula ─────────────────────────────────────────────────
    const fearScore = Math.min(
      100,
      Math.round(
        avgPfLast4 * 0.30 +
        winStreak * 8 +
        rosterHealthScore * 0.20 +
        tradeAggressionScore * 0.15 +
        exploitabilityInverse * 0.15
      )
    );

    return {
      teamId: tid,
      memberId,
      ownerName,
      fearScore,
      heatLabel: assignHeatLabel(fearScore),
      rank: 0, // filled after sort
      avgPfLast4,
      winStreak: streak, // store raw streak (can be negative)
      rosterHealthScore,
      tradeAggressionScore,
      exploitabilityInverse,
    };
  });

  // Sort by fearScore descending, assign ranks
  entries.sort((a, b) => b.fearScore - a.fearScore);
  entries.forEach((e, i) => { e.rank = i + 1; });

  return entries;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Upsert fear index rows for a given season + week. */
async function upsertFearIndex(
  season: number,
  week: number,
  entries: FearIndexEntry[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const e of entries) {
    await db
      .insert(fearIndex)
      .values({
        season,
        week,
        teamId: e.teamId,
        memberId: e.memberId,
        ownerName: e.ownerName,
        fearScore: e.fearScore,
        heatLabel: e.heatLabel,
        avgPfLast4: e.avgPfLast4,
        winStreak: e.winStreak,
        rosterHealthScore: e.rosterHealthScore,
        tradeAggressionScore: e.tradeAggressionScore,
        exploitabilityInverse: e.exploitabilityInverse,
      })
      .onDuplicateKeyUpdate({
        set: {
          fearScore: e.fearScore,
          heatLabel: e.heatLabel,
          avgPfLast4: e.avgPfLast4,
          winStreak: e.winStreak,
          rosterHealthScore: e.rosterHealthScore,
          tradeAggressionScore: e.tradeAggressionScore,
          exploitabilityInverse: e.exploitabilityInverse,
          computedAt: new Date(),
        },
      });
  }
}

/** Read fear index rows for a given season + week, sorted by fearScore desc. */
export async function getFearIndexFromDb(
  season: number,
  week: number
): Promise<FearIndexEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(fearIndex)
    .where(and(eq(fearIndex.season, season), eq(fearIndex.week, week)))
    .orderBy(desc(fearIndex.fearScore));

  return rows.map((r, i: number) => ({
    teamId: r.teamId,
    memberId: r.memberId,
    ownerName: r.ownerName,
    fearScore: r.fearScore,
    heatLabel: r.heatLabel as HeatLabel,
    rank: i + 1,
    avgPfLast4: r.avgPfLast4,
    winStreak: r.winStreak,
    rosterHealthScore: r.rosterHealthScore,
    tradeAggressionScore: r.tradeAggressionScore,
    exploitabilityInverse: r.exploitabilityInverse,
  }));
}

/** Get the most recent fear index (latest week with data) for a season. */
export async function getLatestFearIndexFromDb(season: number): Promise<FearIndexEntry[]> {
  const db = await getDb();
  if (!db) return [];
  // Find the latest week with data
  const latestRows = await db
    .select({ week: fearIndex.week })
    .from(fearIndex)
    .where(eq(fearIndex.season, season))
    .orderBy(desc(fearIndex.week))
    .limit(1);

  if (latestRows.length === 0) return [];
  const latestWeek = latestRows[0].week;
  return getFearIndexFromDb(season, latestWeek);
}

// ─── Refresh (compute + persist) ─────────────────────────────────────────────

/**
 * Compute and persist the fear index for the current week of a season.
 * Called from weeklyIntelHandler after each ESPN data refresh.
 *
 * Note: rosterHealthScore requires the weekly assessment data. We use a
 * simplified proxy here (wins/losses ratio) to avoid a circular dependency
 * with weeklyAssessmentService. The full rosterHealthScore is passed in
 * when called from the weekly intel handler with assessment data available.
 */
export async function refreshFearIndex(
  season: number,
  rosterHealthOverride?: Record<number, number>,
  userId?: number
): Promise<FearIndexEntry[]> {
  const payload = await getCachedView(season, "combined", undefined, { userId });
  if (!payload) {
    console.warn(`[fearIndex] No cached data for season ${season}`);
    return [];
  }

  const teams = normalizeTeams(payload as Record<string, unknown>);
  const matchups = normalizeMatchups(payload as Record<string, unknown>);
  const transactions = normalizeTransactions(payload as Record<string, unknown>);

  // Determine current week from matchup data
  const matchupWeeks = (matchups as Array<Record<string, unknown>>).map(
    (m) => m.matchupPeriodId as number
  );
  const currentWeek = matchupWeeks.length > 0 ? Math.max(...matchupWeeks) : 1;

  // Build ownerMap and memberIdMap
  const ownerMap: Record<number, string> = {};
  const memberIdMap: Record<number, string> = {};
  for (const t of teams) {
    const tid = t.teamId as number;
    ownerMap[tid] = t.owners as string || `Team ${tid}`;
    memberIdMap[tid] = (t.memberIds as string[])?.[0] || "";
  }

  // Build rosterHealthMap (use override if provided, else proxy from wins/losses)
  const rosterHealthMap: Record<number, number> = {};
  for (const t of teams) {
    const tid = t.teamId as number;
    if (rosterHealthOverride?.[tid] !== undefined) {
      rosterHealthMap[tid] = rosterHealthOverride[tid];
    } else {
      // Proxy: 50 base + win% adjustment
      const wins = (t.wins as number) || 0;
      const losses = (t.losses as number) || 0;
      const total = wins + losses;
      const winPct = total > 0 ? wins / total : 0.5;
      rosterHealthMap[tid] = Math.round(30 + winPct * 40); // range 30-70
    }
  }

  // Build exploitabilityMap from league DNA
  const exploitabilityMap: Record<string, number> = {};
  try {
    // Build minimal ManagerRawData for DNA calculation
    const allSeasonData = payload as Record<string, unknown>;
    const rawTeams = (allSeasonData.teams as Record<string, unknown>[]) || [];
    const rawMembers = (allSeasonData.members as Record<string, unknown>[]) || [];
    const memberMap: Record<string, Record<string, unknown>> = {};
    for (const m of rawMembers) memberMap[m.id as string] = m;

      const wins = (((rawTeams[0]?.record as Record<string, unknown>)?.overall as Record<string, unknown>)?.wins as number) || 0;
      const managerRawData: ManagerRawData[] = rawTeams.map((rt) => {
      const owners = (rt.owners as string[]) || [];
      const memberId = owners[0] || "";
      const record = ((rt.record as Record<string, unknown>)?.overall as Record<string, unknown>) || {};
      const rWins = (record.wins as number) || 0;
      const rLosses = (record.losses as number) || 0;
      const seasonRecords = [{
        season,
        wins: rWins,
        losses: rLosses,
        ties: (record.ties as number) || 0,
        pf: (record.pointsFor as number) || 0,
        pa: (record.pointsAgainst as number) || 0,
        madePlayoffs: false,
        isChampion: false,
        rank: (rt.rankCalculatedFinal as number) || 0,
      }];
      return {
        memberId,
        ownerName: ownerMap[rt.id as number] || `Team ${rt.id}`,
        seasonRecords,
        txnSeasons: [],
        draftPicks: [],
        tradeHistory: [],
        h2hVsRod: { wins: 0, losses: 0 },
        currentSeason: {
          season,
          currentWins: rWins,
          currentLosses: rLosses,
          currentWeek: wins,
          recentAcquisitions: 0,
          recentTrades: 0,
          lastWeekScore: 0,
          leagueAvgScore: 0,
        },
      };
    });

    const dnaProfiles = calcLeagueDNA(managerRawData);
    for (const dna of dnaProfiles) {
      exploitabilityMap[dna.memberId] = dna.exploitabilityScore;
    }
  } catch (_e) {
    // Non-fatal — fall back to 50 for all
  }

  const entries = computeFearIndex({
    season,
    week: currentWeek,
    teams,
    matchups,
    transactions,
    ownerMap,
    memberIdMap,
    rosterHealthMap,
    exploitabilityMap,
  });

  await upsertFearIndex(season, currentWeek, entries);
  console.log(`[fearIndex] Computed ${entries.length} entries for season=${season} week=${currentWeek}`);
  return entries;
}
