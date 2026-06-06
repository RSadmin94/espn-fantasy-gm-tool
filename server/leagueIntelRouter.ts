import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { computeWhyHaventIWon } from "./whyHaventIWon";
import { computeChampionshipPath } from "./championshipPath";
import { computeAcquisitionImpact } from "./acquisitionImpact";
import { computeCareerReport } from "./careerReportService";

const optionalOwnerSalt = z
  .object({
    ownerKey: z.string().max(64).optional(),
    activeLeagueKey: z.string().optional(),
  })
  .optional();

/**
 * LeagueDNA Intelligence — next-generation deterministic league analysis.
 * Each feature is profile-aware (uses ctx.user -> resolveActiveProfile) and
 * multi-league ready (keyed by the resolved leagueId). LLM is used only for
 * narrative on top of established deterministic facts.
 */
export const leagueIntelRouter = router({
  /** Feature 1 — Why Haven't I Won?™ */
  whyHaventIWon: publicProcedure
    .input(optionalOwnerSalt)
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      return computeWhyHaventIWon(ctx.user?.id, input?.ownerKey ?? null);
    }),

  /** Career Report - redesigned Why Haven't I Won (Section 0 + snapshot + modes; Phase 0) */
  careerReport: publicProcedure
    .input(optionalOwnerSalt)
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      return computeCareerReport(ctx.user?.id, input?.ownerKey ?? null);
    }),

  /** Feature 2 — Championship Path™ */
  championshipPath: publicProcedure
    .input(optionalOwnerSalt)
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      return computeChampionshipPath(ctx.user?.id, input?.ownerKey ?? null);
    }),

  /** Feature 3 — Acquisition Impact™ */
  acquisitionImpact: publicProcedure
    .input(optionalOwnerSalt)
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      return computeAcquisitionImpact(ctx.user?.id, input?.ownerKey ?? null);
    }),
});
