import { z } from "zod";
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
  activeProfile: publicProcedure
    .input(z.object({ activeLeagueKey: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      return resolveActiveProfile(ctx.user ?? null);
    }),

  /**
   * League-wide headline counts for the user's active league (read-only).
   * Powers the LeagueDNA Advisor hero ("analyzed N seasons / M matchups / ...").
   */
  leagueSummary: publicProcedure
    .input(z.object({ activeLeagueKey: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      const empty = {
        leagueId: "",
        seasons: 0,
        matchups: 0,
        /** Every persisted draft row (board slots: open picks + keeper/retained slots). */
        draftBoardSlots: 0,
        /** Rows where `draftedForAnalytics` is true in normalized `rawPick`, else legacy `isKeeper = 0`. */
        openDraftPicks: 0,
      };
      if (!ctx.user?.id) return empty;
      const { leagueId } = await resolveActiveLeagueId(
        { user: { id: ctx.user.id } },
        null,
        undefined,
      );
      if (!leagueId) return empty;
      const lid = String(leagueId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
      const db = await getDb();
      if (!db) return { ...empty, leagueId: lid };
      const matchups = countOf(await db.execute("SELECT COUNT(*) AS c FROM matchups WHERE leagueId = '" + lid + "'"));
      const seasons = countOf(await db.execute("SELECT COUNT(DISTINCT season) AS c FROM matchups WHERE leagueId = '" + lid + "'"));
      const slotRow = rowsOf(
        await db.execute(
          "SELECT COUNT(*) AS boardSlots, " +
            "COALESCE(SUM(CASE " +
            "WHEN JSON_UNQUOTE(JSON_EXTRACT(rawPick, '$.draftedForAnalytics')) = 'true' THEN 1 " +
            "WHEN JSON_EXTRACT(rawPick, '$.draftedForAnalytics') IS NULL AND isKeeper = 0 THEN 1 " +
            "ELSE 0 END), 0) AS openDraft " +
            "FROM draft_picks WHERE leagueId = '" +
            lid +
            "'",
        ),
      )[0] as { boardSlots?: unknown; openDraft?: unknown } | undefined;
      const draftBoardSlots = Number(slotRow?.boardSlots ?? 0);
      const openDraftPicks = Number(slotRow?.openDraft ?? 0);
      return { leagueId: lid, seasons, matchups, draftBoardSlots, openDraftPicks };
    }),

  /**
   * LeagueDNA Advisor — Increment 2: the single biggest threat to the active
   * profile user, scored deterministically from rivalry/H2H, league DNA, and
   * championship history. No LLM.
   */
  biggestThreat: publicProcedure
    .input(z.object({ activeLeagueKey: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      return computeBiggestThreat(ctx.user?.id);
    }),
});