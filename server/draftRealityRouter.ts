import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb, resolveActiveLeagueId } from "./db";
import { computeDraftReality } from "./draftRealitySimulator";
import { sql } from "drizzle-orm";

/**
 * Draft Reality Simulator endpoint.
 * "What would standings look like if nobody made a roster move after draft day?"
 * Returns actual vs draft-only standings, owner impact grades, superlatives, insights.
 */
export const draftRealityRouter = router({
  simulate: publicProcedure
    .input(
      z.object({
        season: z.number().int().min(2018).max(2030),
        activeLeagueKey: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      void input.activeLeagueKey;
      const userId = ctx.user?.id ?? 0;
      const { leagueId } = await resolveActiveLeagueId(
        { user: userId ? { id: userId } : undefined },
        null,
        input.season,
      );
      if (!leagueId || leagueId === "default") {
        return null;
      }
      return await computeDraftReality(input.season, leagueId);
    }),

  // Which seasons are available to simulate for the active league.
  // Queries espn_raw_cache for seasons that actually have combined data.
  availableSeasons: publicProcedure
    .input(z.object({ activeLeagueKey: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      const fallback = { seasons: [2025, 2024, 2023, 2022, 2021] };
      try {
        const userId = ctx.user?.id ?? 0;
        const { leagueId } = await resolveActiveLeagueId(
          { user: userId ? { id: userId } : undefined },
          null,
        );
        if (!leagueId || leagueId === "default") return fallback;

        const db = await getDb();
        if (!db) return fallback;

        const rows = await db.execute(
          sql`SELECT DISTINCT season FROM espn_raw_cache WHERE leagueId = ${leagueId} AND viewName = 'combined' ORDER BY season DESC`
        );

        const data: any[] = Array.isArray(rows) ? rows : ((rows as any).rows ?? []);
        const seasons = data
          .map((r: any) => Number(r.season ?? r.SEASON ?? 0))
          .filter((s: number) => s >= 2018 && s <= 2030);

        return { seasons: seasons.length > 0 ? seasons : fallback.seasons };
      } catch {
        return fallback;
      }
    }),
});
