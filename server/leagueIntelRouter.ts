import { z } from "zod";
import { router, publicProcedure, hasPremiumAccess } from "./_core/trpc";
import { gateCareerReport, gateChampionshipPath, gateAcquisitionImpact } from "./leagueIntelGating";
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

  /** Career Report - redesigned Why Haven't I Won. Freemium-gated: free users get an
   *  identity teaser (one reason + snapshot); paid users get the full transformation
   *  report. Redaction is server-side - see docs/FREEMIUM_GATING_SPEC.md s.11.3. */
  careerReport: publicProcedure
    .input(optionalOwnerSalt)
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      const report = await computeCareerReport(ctx.user?.id, input?.ownerKey ?? null);
      return gateCareerReport(report, hasPremiumAccess(ctx.user));
    }),

  /** Feature 2 — Championship Path™ */
  championshipPath: publicProcedure
    .input(optionalOwnerSalt)
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      const result = await computeChampionshipPath(ctx.user?.id, input?.ownerKey ?? null);
      return gateChampionshipPath(result, hasPremiumAccess(ctx.user));
    }),

  /** Feature 3 — Acquisition Impact™ */
  acquisitionImpact: publicProcedure
    .input(optionalOwnerSalt)
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      const result = await computeAcquisitionImpact(ctx.user?.id, input?.ownerKey ?? null);
      return gateAcquisitionImpact(result, hasPremiumAccess(ctx.user));
    }),
});
