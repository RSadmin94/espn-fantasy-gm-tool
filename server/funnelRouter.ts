/**
 * funnelRouter.ts — rivalry-wall conversion funnel (beta).
 *
 * Writes: funnel.record (free users only for wall events).
 * Reads: funnel.getRivalryWallStats (admin only).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, resolvePremiumAccess, router } from "./_core/trpc";
import { getRivalryWallFunnelStats, recordFunnelEvent } from "./funnelService";

const ALLOWED_METADATA_KEYS = new Set([
  "totalRivalries",
  "lockedRivalries",
  "leagueTeamCount",
  "lastFreeFeature",
  "source",
  "plan",
  "interval",
]);

function sanitizeMetadata(raw: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ALLOWED_METADATA_KEYS.has(k)) continue;
    if (k === "lastFreeFeature" || k === "source") {
      out[k] = typeof v === "string" ? v.slice(0, 64) : undefined;
    } else if (k === "plan") {
      out[k] = v === "rivals" || v === "league" ? v : undefined;
    } else if (k === "interval") {
      out[k] = v === "month" || v === "year" ? v : undefined;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = Math.round(v);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const recordInput = z.object({
  event: z.enum(["wall_viewed", "upgrade_clicked"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const funnelRouter = router({
  record: protectedProcedure.input(recordInput).mutation(async ({ ctx, input }) => {
    if (await resolvePremiumAccess(ctx.user)) {
      return { ok: true, skipped: true as const };
    }

    await recordFunnelEvent({
      userId: ctx.user.id,
      event: input.event,
      metadata: sanitizeMetadata(input.metadata),
    });

    return { ok: true, skipped: false as const };
  }),

  getRivalryWallStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return getRivalryWallFunnelStats();
  }),
});
