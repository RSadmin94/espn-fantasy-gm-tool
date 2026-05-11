/**
 * Beat Reporter tRPC Router
 *
 * Exposes:
 *   beatReporter.getSignalsForPlayer   — cached signals for a single player
 *   beatReporter.getTopSignals         — all active signals, sorted by impact
 *   beatReporter.refreshSignals        — trigger a full news refresh (owner only)
 *   beatReporter.getNewsStatus         — cache freshness and signal counts
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import {
  getCachedSignals,
  getAllActiveSignals,
  refreshBeatReporterSignals,
} from "./beatReporterService";
import { getDb } from "./db";
import { playerNewsSignals } from "../drizzle/schema";
import { desc, gte, count } from "drizzle-orm";

export const beatReporterRouter = router({
  /**
   * Get cached beat reporter signals for a specific player.
   * Returns empty array if no signals are cached or all have expired.
   */
  getSignalsForPlayer: publicProcedure
    .input(z.object({ playerName: z.string().min(1) }))
    .query(async ({ input }) => {
      const signals = await getCachedSignals(input.playerName);
      return signals.map((s) => ({
        id: s.id,
        playerName: s.playerName,
        nflTeam: s.nflTeam,
        position: s.position,
        signalType: s.signalType,
        magnitude: s.magnitude,
        projectionImpactPct: s.projectionImpactPct,
        summary: s.summary,
        confidence: s.confidence,
        headline: s.headline,
        sourceType: s.sourceType,
        publishedAt: s.publishedAt,
        cachedAt: s.cachedAt,
        expiresAt: s.expiresAt,
      }));
    }),

  /**
   * Get all active signals across all players.
   * Sorted by absolute projection impact descending.
   * Useful for the Beat Reporter feed panel.
   */
  getTopSignals: publicProcedure
    .input(
      z.object({
        signalType: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const signals = await getAllActiveSignals({
        signalType: input.signalType,
        limit: input.limit,
      });
      // Sort by absolute impact descending
      return signals
        .sort(
          (a, b) =>
            Math.abs(b.projectionImpactPct) - Math.abs(a.projectionImpactPct)
        )
        .map((s) => ({
          id: s.id,
          playerName: s.playerName,
          nflTeam: s.nflTeam,
          position: s.position,
          signalType: s.signalType,
          magnitude: s.magnitude,
          projectionImpactPct: s.projectionImpactPct,
          summary: s.summary,
          confidence: s.confidence,
          headline: s.headline,
          sourceType: s.sourceType,
          publishedAt: s.publishedAt,
          cachedAt: s.cachedAt,
        }));
    }),

  /**
   * Trigger a full beat reporter news refresh.
   * Fetches ESPN news, ESPN injury reports, Sleeper trending, and RotoBaller RSS.
   * Extracts structured signals via LLM and caches them.
   * Owner-only operation.
   */
  refreshSignals: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.openId !== ENV.ownerOpenId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the league owner can trigger a signal refresh.",
      });
    }
    const result = await refreshBeatReporterSignals();
    return result;
  }),

  /**
   * Get cache status: how many signals are active, when was the last refresh.
   */
  getNewsStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { activeSignals: 0, lastRefreshed: null, isStale: true };

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6 hours

    const rows = await db
      .select({
        total: count(),
      })
      .from(playerNewsSignals)
      .where(gte(playerNewsSignals.expiresAt, now));

    const latest = await db
      .select({ cachedAt: playerNewsSignals.cachedAt })
      .from(playerNewsSignals)
      .orderBy(desc(playerNewsSignals.cachedAt))
      .limit(1);

    const lastRefreshed = latest[0]?.cachedAt ?? null;
    const isStale = !lastRefreshed || lastRefreshed < staleThreshold;

    return {
      activeSignals: rows[0]?.total ?? 0,
      lastRefreshed,
      isStale,
    };
  }),
});
