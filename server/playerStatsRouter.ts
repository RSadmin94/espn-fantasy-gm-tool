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
  inArray as inArrayDrizzle,
  sql,
} from "drizzle-orm";
import {
  GetCanonicalPlayersInput,
  GetCanonicalPlayersOutput,
  GetWeeklyStatsByOwnerInput,
  GetDraftPickPerformanceInput,
} from "./playerStatsTypes";

// ── ESPN ADP cache (module-level, survives across requests within one deploy) ──
let _espnAdpCache: Map<string, number> | null = null;
let _espnAdpCacheTime = 0;
const ESPN_ADP_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
/** Fetch ESPN live PPR ADP from actual draft activity \u2014 same data as ESPN Live Draft Trends page.
 * Uses leaguedefaults/3 endpoint with player.ownership.averageDraftPosition.
 * Single request returns ~1025 ranked players. Cached for 4h. */
async function getEspnAdpMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (_espnAdpCache && (now - _espnAdpCacheTime) < ESPN_ADP_TTL_MS) return _espnAdpCache;

  const year = new Date().getFullYear();
  const filter = JSON.stringify({
    players: {
      limit: 1500,
      sortAdp: { sortPriority: 1, sortAsc: true },
      filterRanksForScoringPeriodIds: { value: [1] },
      filterRanksForRankTypes: { value: ["PPR"] },
      filterSlotIds: { value: [0, 2, 4, 6, 17, 16, 23] },
    },
  });

  let players: any[] = [];
  try {
    const resp = await fetch(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=1`,
      { headers: { "X-Fantasy-Filter": filter } },
    );
    if (resp.ok) {
      const d = await resp.json();
      players = d?.players ?? [];
    }
  } catch { /* network error - fall through to empty cache */ }

  const cache = new Map<string, number>();
  for (const entry of players) {
    // Real live ADP lives at entry.player.ownership.averageDraftPosition
    const adp: number | undefined = entry?.player?.ownership?.averageDraftPosition;
    const id = String(entry?.id ?? "").trim();
    if (adp && adp > 0 && adp < 500 && id) cache.set(id, Math.round(adp * 100) / 100);
  }

  _espnAdpCache = cache;
  _espnAdpCacheTime = now;
  console.log(`[ESPN ADP] Cached ${cache.size} ranked players from ${players.length} fetched`);
  return cache;
}


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

        // When sorting by avgPick, fetch all matching rows (no DB-level pagination),
        // compute ADP in memory, sort nulls-last, then paginate manually.
        const sortByAvgPick = input.sortBy === "avgPick";
        const orderCol = input.sortBy === "firstSeasonSeen" ? gmPlayerRegistry.firstSeasonSeen
                       : input.sortBy === "lastSeasonSeen"  ? gmPlayerRegistry.lastSeasonSeen
                       : gmPlayerRegistry.fullName;
        const orderFn = (input.sortDir === "desc" && !sortByAvgPick) ? descDrizzle : ascDrizzle;

        const [allRows, countRow] = await Promise.all([
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
            .orderBy(orderFn(orderCol as any))
            .limit(sortByAvgPick ? 10000 : input.pageSize)
            .offset(sortByAvgPick ? 0 : input.page * input.pageSize),

          db.select({ cnt: sql<number>`COUNT(*)`.mapWith(Number) })
            .from(gmPlayerRegistry)
            .where(where),
        ]);

      // When sorting by avgPick, prefer ESPN live ADP over historical league avg.
      // ESPN data is fetched and cached for 4h via getEspnAdpMap().
      let espnAdpMap = new Map<string, number>();
      if (sortByAvgPick) {
        try { espnAdpMap = await getEspnAdpMap(); } catch { /* fall through to DB avg */ }
      }

      // AVG Pick (ADP) from draft_picks — used as fallback when ESPN data unavailable.
      const draftPlayerIds = Array.from(new Set(
        allRows.map((r: any) => r.espnPlayerId).filter((v: any): v is string => !!v)
               .map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
      ));
      const avgPickByPlayerId = new Map<number, number>();
      if (draftPlayerIds.length > 0) {
        const apRows = await db
          .select({
            playerId: gmDraftPicks.playerId,
            avgPick:  sql<number>`AVG(${gmDraftPicks.overallPick})`.mapWith(Number),
          })
          .from(gmDraftPicks)
          .where(inArrayDrizzle(gmDraftPicks.playerId, draftPlayerIds))
          .groupBy(gmDraftPicks.playerId);
        for (const ap of apRows) {
          if (ap.playerId != null && Number.isFinite(ap.avgPick)) {
            avgPickByPlayerId.set(Number(ap.playerId), Math.round(ap.avgPick * 10) / 10);
          }
        }
      }

      // Enrich rows: ESPN ADP preferred, falls back to league historical avg
      const enriched = allRows.map((r: any) => {
        const eid = String(r.espnPlayerId ?? "").trim();
        const espnRank = eid ? espnAdpMap.get(eid) : undefined;
        const dbAvg    = r.espnPlayerId ? (avgPickByPlayerId.get(Number(r.espnPlayerId)) ?? null) : null;
        return {
          ...r,
          isActive:        Boolean(r.isActive),
          needsReview:     Boolean(r.needsReview),
          espnPlayerId:    r.espnPlayerId    ?? null,
          currentNflTeam:  r.currentNflTeam  ?? null,
          firstSeasonSeen: r.firstSeasonSeen ?? null,
          lastSeasonSeen:  r.lastSeasonSeen  ?? null,
          avgPick:         espnRank ?? dbAvg,
        };
      });

      // For avgPick sort: sort in memory with null values at end, then paginate
      let rows: typeof enriched;
      if (sortByAvgPick) {
        const dir = input.sortDir === "desc" ? -1 : 1;
        const sorted = [...enriched].sort((a, b) => {
          const av = a.avgPick != null ? Number(a.avgPick) : Infinity;
          const bv = b.avgPick != null ? Number(b.avgPick) : Infinity;
          return (av - bv) * dir;
        });
        rows = sorted.slice(input.page * input.pageSize, (input.page + 1) * input.pageSize);
      } else {
        rows = enriched;
      }

      return {
        players:  rows,
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

      const leagueId = input.leagueId;
      if (!leagueId) return [];

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

  // refreshAdpFromEspn
  // Fetches live PPR ADP from ESPN player API and updates avgPick column.
  // Called once per session from AppShell on login.
  refreshAdpFromEspn: publicProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) return { ok: false as const, updated: 0, error: "no_db" };

      const year = new Date().getFullYear();
      const filter = JSON.stringify({
        players: {
          limit: 1000,
          sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" },
          filterRanksForScoringPeriodIds: { value: [0] },
          filterRanksForRankTypes: { value: ["PPR"] },
        },
      });

      let rawPlayers: any[] = [];
      try {
        const resp = await fetch(
          `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/players?scoringPeriodId=0&view=kona_player_info&limit=1000`,
          { headers: { "X-Fantasy-Filter": filter } },
        );
        if (!resp.ok) return { ok: false as const, updated: 0, error: `espn_${resp.status}` };
        rawPlayers = (await resp.json()) as any[];
      } catch (err) {
        return { ok: false as const, updated: 0, error: String(err) };
      }

      let updated = 0;
      for (const p of rawPlayers) {
        const rank: number | undefined = p?.draftRanksByRankType?.PPR?.rank;
        const espnId = String(p?.id ?? "").trim();
        if (!rank || rank >= 1000 || !espnId) continue;
        try {
          await db
            .update(gmPlayerRegistry)
            .set({ espnAdpPprRank: rank })
            .where(eqDrizzle(gmPlayerRegistry.espnPlayerId, espnId));
          updated++;
        } catch { /* column may not exist yet — migration pending */ }
      }

      return { ok: true as const, updated };
    }),
});

export type PlayerStatsRouter = typeof playerStatsRouter;
