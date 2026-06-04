import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { resolveActiveProfile } from "./db";
import { computeActivityDna, getActivityDnaForOwner } from "./activityDnaService";

/**
 * Activity DNA™ tRPC surface.
 * Profile-aware (ctx.user -> resolveActiveProfile) and multi-league ready (keyed by resolved leagueId).
 * Deterministic only; the heavy lifting lives in activityDnaService.ts. No DB writes, no LLM.
 */
// Phase B2: DEFAULT_LEAGUE_ID constant removed — no implicit 457622 fallback.

async function resolveLeague(userId?: number): Promise<{ leagueId: string; ownerKey: string | null }> {
  const profile = await resolveActiveProfile(userId != null ? { id: userId } : null);
  return {
    leagueId: profile?.leagueId ?? "",
    ownerKey: profile?.isSetupComplete ? profile?.selectedOwnerKey ?? null : null,
  };
}

export const activityDnaRouter = router({
  /** Single owner's Activity DNA. Uses ?ownerKey, else the active profile's owner, else the most-tenured owner. */
  owner: publicProcedure
    .input(z.object({ ownerKey: z.string().max(64).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { leagueId, ownerKey } = await resolveLeague(ctx.user?.id);
      // Phase B2: no fallback to 457622 — return null if no active league.
      if (!leagueId || leagueId === "default") return null;
      const focal = input?.ownerKey ?? ownerKey;
      if (focal) {
        const r = await getActivityDnaForOwner(leagueId, focal);
        if (r) return r;
      }
      // Stable fallback: the franchise with the most seasons (mirrors whyHaventIWon).
      const all = await computeActivityDna(leagueId);
      return [...all].sort((a, b) => b.seasons - a.seasons)[0] ?? null;
    }),

  /** Whole-league Activity DNA (percentiles need the full field; used by leaderboards/integrations). */
  league: publicProcedure.query(async ({ ctx }) => {
    const { leagueId } = await resolveLeague(ctx.user?.id);
    // Phase B2: no fallback to 457622 — return empty array if no active league.
    if (!leagueId || leagueId === "default") return [];
    return computeActivityDna(leagueId);
  }),
});
