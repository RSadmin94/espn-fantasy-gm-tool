import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { computeWhyHaventIWon } from "./whyHaventIWon";

/**
 * LeagueDNA Intelligence — next-generation deterministic league analysis.
 * Each feature is profile-aware (uses ctx.user -> resolveActiveProfile) and
 * multi-league ready (keyed by the resolved leagueId). LLM is used only for
 * narrative on top of established deterministic facts.
 */
export const leagueIntelRouter = router({
  /** Feature 1 — Why Haven't I Won?™ */
  whyHaventIWon: publicProcedure
    .input(z.object({ ownerKey: z.string().max(64).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return computeWhyHaventIWon(ctx.user?.id, input?.ownerKey ?? null);
    }),
});
