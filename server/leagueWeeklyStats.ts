/**
 * League-scoped weekly stats — the single owner-pinned accessor.
 * ------------------------------------------------------------------
 * gm_weekly_player_stats has NO leagueId, and multiple leagues reuse the same
 * teamId numbers, so joining only on (teamId, season) leaks other leagues'
 * same-numbered teams into a league's totals (observed: 3 leagues' "team 11"
 * merged under league 457622). This accessor pins every row to the actual owner
 * of THIS league's (season, teamId) via `w.ownerKey = t.ownerId` — the one
 * correct way to league-scope this table until it carries its own leagueId.
 *
 * One fact, one authority: every consumer (championshipPath, whyHaventIWon,
 * playoffPositionSplit, ...) MUST read weekly stats through here, never with a
 * bare teamId+season join.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { getWeeklyStatsSeasonsForLeague } from "./weeklyStatsLeagueCoverage";

export type LeagueWeeklyStatRow = {
  season: number;
  teamId: number;
  week: number;
  ownerKey: string;   // pinned to teams.ownerId for this league/season/teamId
  espnId: number;
  position: string;
  isStarter: boolean;
  pts: number;
};

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}

export type WeeklyStatsOptions = {
  startersOnly?: boolean;
  positions?: readonly string[];
  seasons?: number[];          // explicit season list; defaults to league-scoped coverage
};

/**
 * Return league-scoped weekly player rows with the owner-pinned join.
 * `seasons` are returned alongside so callers can reuse the resolved list.
 */
export async function getLeagueWeeklyStats(
  leagueId: string,
  opts: WeeklyStatsOptions = {},
): Promise<{ rows: LeagueWeeklyStatRow[]; seasons: number[] }> {
  const db = await getDb();
  if (!db) return { rows: [], seasons: [] };
  const seasons = opts.seasons ?? (await getWeeklyStatsSeasonsForLeague(leagueId));
  if (seasons.length === 0) return { rows: [], seasons: [] };

  const conds = [sql`w.season IN (${sql.join(seasons.map((s) => sql`${s}`), sql`, `)})`];
  if (opts.startersOnly) conds.push(sql`w.isStarter = 1`);
  if (opts.positions && opts.positions.length) {
    conds.push(sql`r.position IN (${sql.join(opts.positions.map((p) => sql`${p}`), sql`, `)})`);
  }
  const whereSql = sql.join(conds, sql` AND `);

  const rows = rowsOf(await db.execute(sql`
    SELECT w.season AS season, w.teamId AS teamId, w.week AS week, w.ownerKey AS ownerKey,
           r.espnPlayerId AS espnId, r.position AS position, w.isStarter AS isStarter, w.pointsScored AS pts
    FROM gm_weekly_player_stats w
    JOIN gm_player_registry r ON r.id = w.playerId
    INNER JOIN teams t ON w.teamId IS NOT NULL AND w.teamId = t.teamId AND w.season = t.season
      AND t.leagueId = ${leagueId} AND w.ownerKey = t.ownerId
    WHERE ${whereSql}`)).map((r: any) => ({
      season: Number(r.season), teamId: Number(r.teamId), week: Number(r.week),
      ownerKey: String(r.ownerKey), espnId: Number(r.espnId), position: String(r.position ?? ""),
      isStarter: Number(r.isStarter) === 1, pts: Number(r.pts ?? 0),
    }));
  return { rows, seasons };
}
