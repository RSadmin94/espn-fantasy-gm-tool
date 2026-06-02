import { router, publicProcedure } from "./_core/trpc";
import { resolveActiveProfile, resolveActiveLeagueId, getDb } from "./db";
import { computeBiggestThreat } from "./biggestThreatService";

const rowsOf = (r: any) => (r?.[0] ?? r) ?? [];
const countOf = (r: any) => Number(rowsOf(r)[0]?.c ?? 0);

/**
 * `me` router — data scoped to the authenticated user / their active league.
 *
 * Uses publicProcedure so anonymous callers get safe defaults (a "not set up"
 * profile, and the fallback league summary) instead of an error.
 */
export const meRouter = router({
  /** The user's selected league/team identity (see resolveActiveProfile). */
  activeProfile: publicProcedure.query(async ({ ctx }) => {
    return resolveActiveProfile(ctx.user ?? null);
  }),

  /**
   * League-wide headline counts for the user's active league (read-only).
   * Powers the LeagueDNA Advisor hero ("analyzed N seasons / M matchups / ...").
   */
  leagueSummary: publicProcedure.query(async ({ ctx }) => {
    const { leagueId } = await resolveActiveLeagueId(
      { user: ctx.user?.id ? { id: ctx.user.id } : undefined },
      null,
      undefined,
    );
    const lid = String(leagueId || "457622").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    const db = await getDb();
    if (!db) return { leagueId: lid, seasons: 0, matchups: 0, draftPicks: 0 };
    const matchups = countOf(await db.execute("SELECT COUNT(*) AS c FROM matchups WHERE leagueId = '" + lid + "'"));
    const draftPicks = countOf(await db.execute("SELECT COUNT(*) AS c FROM draft_picks WHERE leagueId = '" + lid + "'"));
    const seasons = countOf(await db.execute("SELECT COUNT(DISTINCT season) AS c FROM matchups WHERE leagueId = '" + lid + "'"));
    return { leagueId: lid, seasons, matchups, draftPicks };
  }),

  /**
   * LeagueDNA Advisor — Increment 2: the single biggest threat to the active
   * profile user, scored deterministically from rivalry/H2H, league DNA, and
   * championship history. No LLM.
   */
  biggestThreat: publicProcedure.query(async ({ ctx }) => {
    return computeBiggestThreat(ctx.user?.id);
  }),
});