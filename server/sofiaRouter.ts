/**
 * Sofia Phase 1 — read-only tRPC exposure for template-first draft commentary.
 *
 * ACTIVE-LEAGUE-SCOPED: both endpoints load mock data via the user's active league.
 * Requesting commentary for a league that is not currently active returns BAD_REQUEST.
 * The UI track must not assume these endpoints can browse arbitrary inactive leagues.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, resolvePremiumAccess } from "./_core/trpc";
import { assertUserLeagueAccess } from "./leagueAccess";
import { buildDraftCommentary, buildMomentCommentary } from "./services/sofia/sofiaService";

const leagueSeasonInput = z.object({
  leagueId: z.string().min(1).max(32),
  season: z.number().int().min(2018).max(2030),
});

const momentInput = leagueSeasonInput.extend({
  momentId: z.string().min(1).max(256),
});

export const sofiaRouter = router({
  /** Template commentary for every moment in the active league's finished mock. */
  getDraftCommentary: protectedProcedure.input(leagueSeasonInput).query(async ({ ctx, input }) => {
    await assertUserLeagueAccess(ctx.user.id, input.leagueId);
    if (!(await resolvePremiumAccess(ctx.user))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Draft Intelligence requires Rivals. Upgrade to unlock Sofia commentary.",
      });
    }
    return buildDraftCommentary({
      user: ctx.user,
      leagueId: input.leagueId,
      season: input.season,
    });
  }),

  /** Template commentary for one moment in the active league's finished mock. */
  getMomentCommentary: protectedProcedure.input(momentInput).query(async ({ ctx, input }) => {
    await assertUserLeagueAccess(ctx.user.id, input.leagueId);
    if (!(await resolvePremiumAccess(ctx.user))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Draft Intelligence requires Rivals. Upgrade to unlock Sofia commentary.",
      });
    }
    return buildMomentCommentary({
      user: ctx.user,
      leagueId: input.leagueId,
      season: input.season,
      momentId: input.momentId,
    });
  }),
});
