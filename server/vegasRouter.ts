// FILE: server/vegasRouter.ts
/**
 * Vegas Odds tRPC Router
 *
 * Exposes NFL game lines, spreads, totals, and implied team totals
 * to the frontend for display in the Start/Sit and Monte Carlo UIs.
 *
 * Endpoints:
 *   vegas.nflOdds          — all current NFL game odds (cached)
 *   vegas.teamContext       — Vegas context for a specific NFL team
 *   vegas.refreshOdds       — force-refresh from The Odds API (owner only)
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import {
  getNFLOdds,
  fetchAndCacheNFLOdds,
  getVegasContextForTeam,
} from "./vegasOddsService";
import { ENV } from "./_core/env";

export const vegasRouter = router({
  /**
   * Returns all current NFL game odds from cache (or fetches if stale).
   * Used by the Vegas Context panel in Start/Sit and the Monte Carlo tab.
   */
  nflOdds: publicProcedure.query(async () => {
    if (!ENV.oddsApiKey) {
      return { games: [], hasApiKey: false, message: "Vegas odds API not configured." };
    }
    try {
      const games = await getNFLOdds();
      return { games, hasApiKey: true, message: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch odds";
      return { games: [], hasApiKey: true, message: msg };
    }
  }),

  /**
   * Returns Vegas context for a specific NFL team abbreviation.
   * Used to display implied total and game environment for a single player.
   */
  teamContext: publicProcedure
    .input(z.object({ teamAbbr: z.string() }))
    .query(async ({ input }) => {
      if (!ENV.oddsApiKey) return null;
      try {
        const odds = await getNFLOdds();
        return getVegasContextForTeam(input.teamAbbr, odds);
      } catch {
        return null;
      }
    }),

  /**
   * Force-refresh NFL odds from The Odds API.
   * Costs 3 quota credits. Restricted to authenticated users.
   */
  refreshOdds: protectedProcedure.mutation(async () => {
    if (!ENV.oddsApiKey) {
      return { success: false, message: "Vegas odds API not configured." };
    }
    try {
      const games = await fetchAndCacheNFLOdds();
      return {
        success: true,
        message: `Refreshed ${games.length} NFL games.`,
        gamesCount: games.length,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refresh failed";
      return { success: false, message: msg };
    }
  }),
});
