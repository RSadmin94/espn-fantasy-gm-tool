import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb, resolveActiveLeagueId } from "./db";
import { computeDraftReality } from "./draftRealitySimulator";

/**
 * Draft Reality Simulator endpoint.
 * "What would standings look like if nobody made a roster move after draft day?"
 * Returns actual vs draft-only standings, owner impact grades, superlatives, insights.
 */
export const draftRealityRouter = router({
  simulate: publicProcedure
    .input(z.object({ season: z.number().int().min(2021).max(2025) }))
    .query(async ({ ctx, input }) => {
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

  // Which seasons are available to simulate (data coverage gate).
  availableSeasons: publicProcedure.query(async () => {
    return { seasons: [2025, 2024, 2023, 2022, 2021] };
  }),
});
