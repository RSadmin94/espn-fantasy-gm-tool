import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Weekly-stats resolver — turns the local gm_weekly_player_stats.playerId into a
 * global ESPN player id + position, scoped to a single league.
 *
 * Why this exists: gm_weekly_player_stats stores a local surrogate playerId and has
 * NO leagueId column (the table is multi-league). The crosswalk to global ids is a
 * JOIN, not a backfill — see docs/playerid-crosswalk-decision.md.
 *
 *   weekly.playerId      = gm_player_registry.id           (registry PK)
 *   registry.espnPlayerId = global ESPN id                 (e.g. 3918298)
 *   registry.position    = position (QB/RB/WR/TE/K/DEF/...)
 *
 * League scoping is by the (ownerGUID, season, teamId) tuple matched against the
 * league's `teams` roster — never teamId alone (teamIds collide across leagues).
 *
 * Reusable by Activity DNA, Why Haven't I Won, Championship Path, Historical Receipts.
 */

// Strip braces + hyphens, uppercase — mirrors normGuid for GUID inputs so the
// weekly.ownerKey ↔ teams.ownerId match is exact.
const NG = (col: string) =>
  `UPPER(REPLACE(REPLACE(REPLACE(${col}, '{', ''), '}', ''), '-', ''))`;

const rowsOf = (res: any): any[] =>
  Array.isArray(res) ? (Array.isArray(res[0]) ? res[0] : res) : res?.rows ?? [];

export interface ResolvedWeeklyStat {
  season: number;
  week: number;
  teamId: number;
  ownerId: string; // raw canonical owner id from teams (caller normalizes if keying by owner)
  espnPlayerId: number; // global ESPN id
  position: string;
  playerName: string;
  points: number;
  isStarter: boolean;
}

export interface ResolvedDraftPick {
  ownerId: string;
  season: number;
  espnPlayerId: number;
}

/**
 * League-scoped weekly player stats with global espnPlayerId + position attached.
 * One row per (player, week) the league's owners started/rostered.
 */
export async function resolveWeeklyPlayerStats(
  leagueId: string,
  opts: { season?: number; startersOnly?: boolean } = {},
): Promise<ResolvedWeeklyStat[]> {
  const db = await getDb();
  if (!db) return [];
  const seasonClause = opts.season != null ? sql`AND w.season = ${opts.season}` : sql``;
  const starterClause = opts.startersOnly ? sql`AND w.isStarter = 1` : sql``;
  const rows = rowsOf(
    await db.execute(sql`
      SELECT w.season, w.week, w.teamId, t.ownerId AS ownerId,
             CAST(r.espnPlayerId AS UNSIGNED) AS espnPlayerId,
             r.position AS position, r.fullName AS playerName,
             w.pointsScored AS points, w.isStarter AS isStarter
      FROM gm_weekly_player_stats w
      JOIN teams t
        ON t.leagueId = ${leagueId}
       AND t.season = w.season
       AND t.teamId = w.teamId
       AND ${sql.raw(NG("t.ownerId"))} = ${sql.raw(NG("w.ownerKey"))}
      JOIN gm_player_registry r ON w.playerId = r.id
      WHERE r.espnPlayerId REGEXP '^[0-9]+$'
      ${seasonClause}
      ${starterClause}`),
  );
  return rows.map((x) => ({
    season: Number(x.season),
    week: Number(x.week),
    teamId: Number(x.teamId),
    ownerId: String(x.ownerId ?? ""),
    espnPlayerId: Number(x.espnPlayerId),
    position: String(x.position ?? ""),
    playerName: String(x.playerName ?? ""),
    points: Number(x.points ?? 0),
    isStarter: Number(x.isStarter) === 1,
  }));
}

/**
 * League draft origin: which global players each owner drafted, per season.
 * Used to classify weekly starter points as drafted vs acquired (Draft Reliant,
 * Waiver Impact, Homegrown Strength).
 */
export async function resolveLeagueDraftSet(leagueId: string): Promise<ResolvedDraftPick[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = rowsOf(
    await db.execute(sql`
      SELECT t.ownerId AS ownerId, d.season AS season, d.playerId AS espnPlayerId
      FROM draft_picks d
      JOIN teams t
        ON t.leagueId = ${leagueId}
       AND t.season = d.season
       AND t.teamId = d.teamId
      WHERE d.leagueId = ${leagueId}
        AND d.playerId IS NOT NULL`),
  );
  return rows.map((x) => ({
    ownerId: String(x.ownerId ?? ""),
    season: Number(x.season),
    espnPlayerId: Number(x.espnPlayerId),
  }));
}
