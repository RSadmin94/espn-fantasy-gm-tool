import type { AppDb } from "../../db";
import { gmDraftPicks, gmPlayers } from "../../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import type { PriorSeasonPointsRow, TerrainDraftPickRow } from "./types";

export async function loadSeasonTerrainInputs(args: { db: AppDb; leagueId: string; season: number }) {
  const { db, leagueId, season } = args;

  const picks = await db
    .select({
      playerName: gmDraftPicks.playerName,
      position: gmDraftPicks.position,
      overallPick: gmDraftPicks.overallPick,
      playerId: gmDraftPicks.playerId,
      season: gmDraftPicks.season,
      teamId: gmDraftPicks.teamId,
    })
    .from(gmDraftPicks)
    .where(and(eq(gmDraftPicks.leagueId, leagueId), eq(gmDraftPicks.season, season)));

  const draftPicks: TerrainDraftPickRow[] = picks.map((p) => ({
    playerName: p.playerName ?? "",
    position: p.position ?? "",
    overallPick: p.overallPick,
    playerId: p.playerId ?? null,
    season: p.season,
  }));

  const teamCount = new Set(picks.map((p) => p.teamId)).size;

  const priorSeason = season - 1;
  let priorSeasonPoints: PriorSeasonPointsRow[] = [];
  try {
    const priorRows = (await db.execute(
      sql.raw(`SELECT CAST(r.espnPlayerId AS UNSIGNED) AS playerId, SUM(w.pointsScored) AS totalPoints
       FROM gm_weekly_player_stats w
       INNER JOIN gm_player_registry r ON r.id = w.playerId
       WHERE w.season = ${priorSeason}
       GROUP BY r.espnPlayerId
       HAVING playerId IS NOT NULL AND playerId > 0`),
    )) as unknown as [{ playerId: number; totalPoints: string | number }[], unknown];
    const rows = Array.isArray(priorRows[0]) ? priorRows[0] : [];
    priorSeasonPoints = rows.map((r) => ({
      playerId: Number(r.playerId),
      totalPoints: Number(r.totalPoints) || 0,
    }));
  } catch {
    priorSeasonPoints = [];
  }

  const playerIds = [...new Set(draftPicks.map((p) => p.playerId).filter((id): id is number => id != null && id > 0))];
  let playerCache: Array<{
    playerId: number;
    injuryStatus?: string;
    rawPlayer?: string;
    projectedTotalPoints?: number | null;
  }> = [];

  if (playerIds.length > 0) {
    const cacheRows = await db
      .select({
        playerId: gmPlayers.playerId,
        injuryStatus: gmPlayers.injuryStatus,
        rawPlayer: gmPlayers.rawPlayer,
        projectedTotalPoints: gmPlayers.projectedTotalPoints,
      })
      .from(gmPlayers)
      .where(eq(gmPlayers.season, season));

    playerCache = cacheRows
      .filter((r) => playerIds.includes(r.playerId))
      .map((r) => ({
        playerId: r.playerId,
        injuryStatus: r.injuryStatus ?? "",
        rawPlayer: r.rawPlayer,
        projectedTotalPoints: r.projectedTotalPoints,
      }));
  }

  return { draftPicks, priorSeasonPoints, playerCache, teamCount };
}
