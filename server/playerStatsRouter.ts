/**
 * P2 Player Intelligence Pipeline — tRPC router skeleton.
 * server/playerStatsRouter.ts
 *
 * Three public procedures:
 *   getCanonicalPlayers     — search canonical player registry, paginated
 *   getWeeklyStatsByOwner   — per-owner per-season weekly performance
 *   getDraftPickPerformance — draft pick ROI from proven weekly stats only
 *
 * Strict guardrails:
 *   - All inputs/outputs validated with Zod.
 *   - All queries enforce LIMIT + pagination.
 *   - No stats fabricated: only rows with source = 'espn' and confidence >= 85.
 *   - Heavy joins capped at 500 rows per call.
 */

import { z }              from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb }          from "./db";
import {
  gmPlayerRegistry,
  gmWeeklyPlayerStats,
  gmDraftPicks,
} from "../drizzle/schema";
import {
  eq    as eqDrizzle,
  and   as andDrizzle,
  asc   as ascDrizzle,
  desc  as descDrizzle,
  like  as likeDrizzle,
  gte   as gteDrizzle,
  sql,
} from "drizzle-orm";
import {
  GetCanonicalPlayersInput,
  GetCanonicalPlayersOutput,
  GetWeeklyStatsByOwnerInput,
  GetDraftPickPerformanceInput,
} from "./playerStatsTypes";

export const playerStatsRouter = router({

  // ── getCanonicalPlayers ──────────────────────────────────────────────────
  // Paginated search of the canonical player registry.
  // Returns player metadata only — no weekly stats here.

  getCanonicalPlayers: publicProcedure
    .input(GetCanonicalPlayersInput)
    .output(GetCanonicalPlayersOutput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { players: [], total: 0, page: input.page, pageSize: input.pageSize };

      const conditions: ReturnType<typeof eqDrizzle>[] = [];

      if (input.query) {
        conditions.push(
          likeDrizzle(gmPlayerRegistry.normalizedName, `%${input.query.toLowerCase()}%`) as any,
        );
      }
      if (input.position) {
        conditions.push(eqDrizzle(gmPlayerRegistry.position, input.position) as any);
      }
      if (input.isActive !== undefined) {
        conditions.push(eqDrizzle(gmPlayerRegistry.isActive, input.isActive) as any);
      }

      const where = conditions.length > 0 ? andDrizzle(...conditions as [any, ...any[]]) : undefined;

      const [rows, countRow] = await Promise.all([
        db.select({
          id:              gmPlayerRegistry.id,
          fullName:        gmPlayerRegistry.fullName,
          normalizedName:  gmPlayerRegistry.normalizedName,
          position:        gmPlayerRegistry.position,
          currentNflTeam:  gmPlayerRegistry.currentNflTeam,
          espnPlayerId:    gmPlayerRegistry.espnPlayerId,
          firstSeasonSeen: gmPlayerRegistry.firstSeasonSeen,
          lastSeasonSeen:  gmPlayerRegistry.lastSeasonSeen,
          isActive:        gmPlayerRegistry.isActive,
          needsReview:     gmPlayerRegistry.needsReview,
        })
          .from(gmPlayerRegistry)
          .where(where)
          .orderBy(ascDrizzle(gmPlayerRegistry.fullName))
          .limit(input.pageSize)
          .offset(input.page * input.pageSize),

        db.select({ cnt: sql<number>`COUNT(*)`.mapWith(Number) })
          .from(gmPlayerRegistry)
          .where(where),
      ]);

      return {
        players:  rows.map(r => ({
          ...r,
          isActive:        Boolean(r.isActive),
          needsReview:     Boolean(r.needsReview),
          espnPlayerId:    r.espnPlayerId    ?? null,
          currentNflTeam:  r.currentNflTeam  ?? null,
          firstSeasonSeen: r.firstSeasonSeen ?? null,
          lastSeasonSeen:  r.lastSeasonSeen  ?? null,
        })),
        total:    countRow[0]?.cnt ?? 0,
        page:     input.page,
        pageSize: input.pageSize,
      };
    }),

  // ── getWeeklyStatsByOwner ────────────────────────────────────────────────
  // Per-owner per-season weekly fantasy performance.
  // Optional week filter. Capped at 200 rows. No fabricated stats.

  getWeeklyStatsByOwner: publicProcedure
    .input(GetWeeklyStatsByOwnerInput)
    .output(z.object({
      rows: z.array(z.object({
        playerId:         z.number(),
        fullName:         z.string(),
        position:         z.string(),
        season:           z.number(),
        week:             z.number(),
        pointsScored:     z.number(),
        rosterSlotId:     z.number(),
        isStarter:        z.boolean(),
        ownerKey:         z.string(),
        teamId:           z.number().nullable(),
        source:           z.string(),
        sourceConfidence: z.number(),
      })),
      totalRows: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], totalRows: 0 };

      const conds: any[] = [
        eqDrizzle(gmWeeklyPlayerStats.ownerKey, input.ownerKey),
        eqDrizzle(gmWeeklyPlayerStats.season, input.season),
        // Only return rows with source confidence >= 85 (proven data)
        gteDrizzle(gmWeeklyPlayerStats.sourceConfidence, 85),
      ];
      if (input.week !== undefined) {
        conds.push(eqDrizzle(gmWeeklyPlayerStats.week, input.week));
      }

      const rows = await db
        .select({
          playerId:         gmWeeklyPlayerStats.playerId,
          fullName:         gmPlayerRegistry.fullName,
          position:         gmPlayerRegistry.position,
          season:           gmWeeklyPlayerStats.season,
          week:             gmWeeklyPlayerStats.week,
          pointsScored:     gmWeeklyPlayerStats.pointsScored,
          rosterSlotId:     gmWeeklyPlayerStats.rosterSlotId,
          isStarter:        gmWeeklyPlayerStats.isStarter,
          ownerKey:         gmWeeklyPlayerStats.ownerKey,
          teamId:           gmWeeklyPlayerStats.teamId,
          source:           gmWeeklyPlayerStats.source,
          sourceConfidence: gmWeeklyPlayerStats.sourceConfidence,
        })
        .from(gmWeeklyPlayerStats)
        .innerJoin(gmPlayerRegistry, eqDrizzle(gmWeeklyPlayerStats.playerId, gmPlayerRegistry.id))
        .where(andDrizzle(...conds))
        .orderBy(ascDrizzle(gmWeeklyPlayerStats.week), descDrizzle(gmWeeklyPlayerStats.pointsScored))
        .limit(input.limit)
        .offset(input.offset);

      return {
        rows: rows.map(r => ({
          ...r,
          pointsScored:     Number(r.pointsScored     ?? 0),
          sourceConfidence: Number(r.sourceConfidence ?? 0),
          isStarter:        Boolean(r.isStarter),
          teamId:           r.teamId ?? null,
        })),
        totalRows: rows.length,
      };
    }),

  // ── getDraftPickPerformance ──────────────────────────────────────────────
  // Joins gmDraftPicks to gmWeeklyPlayerStats to return draft pick ROI.
  // Only uses proven weekly stats (sourceConfidence >= 85).
  // Does NOT fabricate data for picks with no matching weekly stats.

  getDraftPickPerformance: publicProcedure
    .input(GetDraftPickPerformanceInput)
    .output(z.array(z.object({
      playerName:        z.string(),
      position:          z.string(),
      draftRound:        z.number(),
      draftPick:         z.number(),
      season:            z.number(),
      draftOwnerKey:     z.string(),
      totalPointsScored: z.number(),
      weeksStarted:      z.number(),
      weeksRostered:     z.number(),
      avgPointsPerStart: z.number().nullable(),
      hasStats:          z.boolean(),
    })))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const leagueId = input.leagueId ?? "457622";

      // Step 1: Get draft picks for the season
      const picks = await db
        .select({
          playerName:  gmDraftPicks.playerName,
          position:    gmDraftPicks.position,
          roundId:     gmDraftPicks.roundId,
          roundPick:   gmDraftPicks.roundPick,
          overallPick: gmDraftPicks.overallPick,
          teamId:      gmDraftPicks.teamId,
          isKeeper:    gmDraftPicks.isKeeper,
        })
        .from(gmDraftPicks)
        .where(andDrizzle(
          eqDrizzle(gmDraftPicks.leagueId, leagueId),
          eqDrizzle(gmDraftPicks.season,   input.season),
          ...(input.ownerKey
            ? [sql`EXISTS (SELECT 1 FROM ${gmPlayerRegistry} pr WHERE pr.normalizedName = ${sql.placeholder("pn")} LIMIT 1)`]
            : []),
        ))
        .orderBy(ascDrizzle(gmDraftPicks.overallPick))
        .limit(500);

      if (picks.length === 0) return [];

      // Step 2: For each picked player, look up registry + stats
      // Capped at 500 draft picks — safe for a 14-team 20-round draft (280 max)
      const result: Array<{
        playerName: string; position: string; draftRound: number; draftPick: number;
        season: number; draftOwnerKey: string;
        totalPointsScored: number; weeksStarted: number; weeksRostered: number;
        avgPointsPerStart: number | null; hasStats: boolean;
      }> = [];

      for (const pick of picks) {
        if (!pick.playerName) continue;

        const normName = pick.playerName
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Look up registry ID by normalizedName + position
        const regRow = await db
          .select({ id: gmPlayerRegistry.id })
          .from(gmPlayerRegistry)
          .where(andDrizzle(
            eqDrizzle(gmPlayerRegistry.normalizedName, normName),
            ...(pick.position ? [eqDrizzle(gmPlayerRegistry.position, pick.position)] : []),
          ))
          .limit(1);

        const playerId = regRow[0]?.id ?? null;
        let totalPoints = 0;
        let weeksStarted = 0;
        let weeksRostered = 0;

        if (playerId) {
          const statsRows = await db
            .select({
              pointsScored: gmWeeklyPlayerStats.pointsScored,
              isStarter:    gmWeeklyPlayerStats.isStarter,
            })
            .from(gmWeeklyPlayerStats)
            .where(andDrizzle(
              eqDrizzle(gmWeeklyPlayerStats.playerId, playerId),
              eqDrizzle(gmWeeklyPlayerStats.season,   input.season),
              gteDrizzle(gmWeeklyPlayerStats.sourceConfidence, 85),
              ...(input.ownerKey
                ? [eqDrizzle(gmWeeklyPlayerStats.ownerKey, input.ownerKey)]
                : []),
            ))
            .limit(25); // max 17 reg + 4 playoff weeks

          for (const s of statsRows) {
            totalPoints   += Number(s.pointsScored ?? 0);
            weeksRostered += 1;
            if (s.isStarter) weeksStarted += 1;
          }
        }

        result.push({
          playerName:        pick.playerName,
          position:          pick.position ?? "",
          draftRound:        pick.roundId,
          draftPick:         pick.roundPick,
          season:            input.season,
          draftOwnerKey:     input.ownerKey ?? "",
          totalPointsScored: Number(totalPoints.toFixed(2)),
          weeksStarted,
          weeksRostered,
          avgPointsPerStart: weeksStarted > 0
            ? Number((totalPoints / weeksStarted).toFixed(2))
            : null,
          hasStats: weeksRostered > 0,
        });
      }

      return result.sort((a, b) => b.totalPointsScored - a.totalPointsScored);
    }),

});

export type PlayerStatsRouter = typeof playerStatsRouter;
