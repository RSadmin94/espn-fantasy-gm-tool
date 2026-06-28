/**
 * Dynasty Power Rankings + Dynasty Identity badge — tRPC surface.
 * Thin wrapper over `computeDynastyPowerRankings`; no logic lives here.
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { assertUserLeagueAccess } from "./leagueAccess";
import { computeDynastyPowerRankings, DYNASTY_BADGE_HI, DYNASTY_BADGE_LO } from "./dynastyPowerRankings";

export const dynastyRouter = router({
  /** Full league board: per-team Now/Later scores, percentiles, and identity badge. */
  powerRankings: protectedProcedure
    .input(z.object({
      season: z.number().int().default(2026),
      leagueId: z.string().optional(),
      // cache-participation salt from the client (withLeagueSalt); not authorization
      activeLeagueKey: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      void input.activeLeagueKey;
      const explicitLeagueId = input.leagueId?.trim();
      if (explicitLeagueId) {
        await assertUserLeagueAccess(ctx.user.id, explicitLeagueId);
      }
      const result = await computeDynastyPowerRankings({
        season: input.season,
        leagueId: input.leagueId,
        userId: ctx.user?.id,
      });
      return result ?? {
        season: input.season,
        leagueId: input.leagueId ?? "",
        teamCount: 0,
        thresholds: { high: DYNASTY_BADGE_HI, low: DYNASTY_BADGE_LO },
        teams: [],
      };
    }),
});
