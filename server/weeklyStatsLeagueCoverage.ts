/**
 * League-scoped coverage for gm_weekly_player_stats (table has no leagueId;
 * join `teams` on teamId + season).
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

function rowsOf(res: unknown): unknown[] {
  const r = res as { rows?: unknown[] } | unknown[];
  if (Array.isArray(r)) return Array.isArray((r as unknown[])[0]) ? ((r as unknown[])[0] as unknown[]) : (r as unknown[]);
  if (r && typeof r === "object" && Array.isArray((r as { rows: unknown[] }).rows)) return (r as { rows: unknown[] }).rows;
  return [];
}

function distinctSeasons(rows: unknown[], key = "season"): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const o = row as Record<string, unknown>;
    const n = Number(o[key] ?? o[key.toUpperCase()] ?? 0);
    if (Number.isFinite(n) && n >= 1990 && n <= 2100) out.push(Math.floor(n));
  }
  return Array.from(new Set(out)).sort((a, b) => b - a);
}

export async function getWeeklyStatsSeasonsForLeague(leagueId: string): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const res = await db.execute(sql`
    SELECT DISTINCT w.season AS season
    FROM gm_weekly_player_stats w
    INNER JOIN teams t
      ON w.teamId IS NOT NULL
      AND w.teamId = t.teamId
      AND w.season = t.season
      AND t.leagueId = ${leagueId}
    ORDER BY season DESC
  `);
  return distinctSeasons(rowsOf(res));
}

/** DB signals for Sync / discovery (read-only). */
export async function getLeagueHistoricalCoverageSignals(leagueId: string): Promise<{
  teamsSeasons: number[];
  weeklyStatsSeasons: number[];
  medalSeasons: number[];
}> {
  const empty = { teamsSeasons: [] as number[], weeklyStatsSeasons: [] as number[], medalSeasons: [] as number[] };
  const db = await getDb();
  if (!db) return empty;
  try {
    const [teamRows, medalRows] = await Promise.all([
      db.execute(sql`SELECT DISTINCT season FROM teams WHERE leagueId = ${leagueId} ORDER BY season DESC`),
      db.execute(sql`SELECT DISTINCT season FROM league_medals WHERE leagueId = ${leagueId} ORDER BY season DESC`),
    ]);
    const weeklyStatsSeasons = await getWeeklyStatsSeasonsForLeague(leagueId);
    return {
      teamsSeasons: distinctSeasons(rowsOf(teamRows)),
      weeklyStatsSeasons,
      medalSeasons: distinctSeasons(rowsOf(medalRows)),
    };
  } catch {
    return empty;
  }
}
