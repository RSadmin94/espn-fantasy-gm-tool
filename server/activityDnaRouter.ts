import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { resolveActiveLeagueId } from "./db";
import { resolveCurrentOwner } from "./currentOwnerService";
import { computeActivityDna, getActivityDnaForOwner } from "./activityDnaService";

/**
 * Activity DNA™ tRPC surface.
 * Profile-aware (ctx.user → resolveCurrentOwner) and multi-league ready (keyed by resolved leagueId).
 * Deterministic only; the heavy lifting lives in activityDnaService.ts. No DB writes, no LLM.
 *
 * League resolution: active profile connection first, then the same `resolveActiveLeagueId` chain as
 * the rest of the app (sync_runs / env / dev fallback). Keeps anonymous Owner Profile views working
 * after B2 removed implicit league from profile-only resolution — we still never invent a league id
 * without DB/env.
 */
async function resolveLeague(userId?: number): Promise<{ leagueId: string; ownerKey: string | null }> {
  const co = await resolveCurrentOwner(userId != null ? { id: userId } : null);
  let leagueId = (co.leagueId ?? "").trim();
  if (!leagueId || leagueId === "default") {
    const { leagueId: alt } = await resolveActiveLeagueId(
      { user: userId ? { id: userId } : undefined },
      null,
      undefined,
    );
    const a = (alt ?? "").trim();
    if (a && a !== "default") leagueId = a;
  }
  return {
    leagueId,
    ownerKey: co.isSetupComplete ? co.ownerKey : null,
  };
}

export const activityDnaRouter = router({
  /** Single owner's Activity DNA. Uses ?ownerKey, else the active profile's owner, else the most-tenured owner. */
  owner: publicProcedure
    .input(
      z
        .object({
          ownerKey: z.string().max(64).optional(),
          activeLeagueKey: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      if (!ctx.user?.id) return null;
      const { leagueId, ownerKey } = await resolveLeague(ctx.user.id);
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
  league: publicProcedure
    .input(z.object({ activeLeagueKey: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      if (!ctx.user?.id) return [];
    const { leagueId } = await resolveLeague(ctx.user.id);
    if (!leagueId || leagueId === "default") return [];
    return computeActivityDna(leagueId);
  }),
});
