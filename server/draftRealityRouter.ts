import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { computeDraftReality } from "./draftRealitySimulator";

/**
 * Draft Reality Simulator endpoint.
 * "What would standings look like if nobody made a roster move after draft day?"
 * Returns actual vs draft-only standings, owner impact grades, superlatives, insights.
 */
export const draftRealityRouter = router({
  simulate: publicProcedure
    .input(z.object({ season: z.number().int().min(2021).max(2025) }))
    .query(async ({ input }) => {
      return await computeDraftReality(input.season);
    }),

  // Which seasons are available to simulate (data coverage gate).
  availableSeasons: publicProcedure.query(async () => {
    return { seasons: [2025, 2024, 2023, 2022, 2021] };
  }),
});
