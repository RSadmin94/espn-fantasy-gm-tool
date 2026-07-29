/**
 * historicalReceiptShareRouter — mint + public get for Historical Receipts.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { assertUserLeagueAccess } from "./leagueAccess";
import { getDb } from "./db";
import { leagueConnections } from "../drizzle/schema";
import { resolveLeagueDisplayName } from "./leagueDisplayName";
import { computeRivalryScores } from "./rivalryService";
import {
  buildHistoricalReceiptsFromPairs,
  formatSeasonWeekLabel,
  type HistoricalReceiptKind,
  type HistoricalReceiptView,
} from "../shared/historicalReceipts";
import {
  signHistoricalReceipt,
  verifyHistoricalReceipt,
  payloadToPublicReceipt,
  type HistoricalReceiptSharePayload,
} from "./historicalReceiptShareToken";
import { normalizeOwnerKey } from "./rivalryStoryAuthority";

async function leagueNameFor(userId: number, leagueId: string): Promise<string> {
  const db = await getDb();
  if (!db) return `League ${leagueId}`;
  const rows = await db
    .select({
      id: leagueConnections.id,
      leagueId: leagueConnections.leagueId,
      leagueName: leagueConnections.leagueName,
      season: leagueConnections.season,
    })
    .from(leagueConnections)
    .where(and(eq(leagueConnections.leagueId, leagueId), eq(leagueConnections.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return `League ${leagueId}`;
  try {
    return await resolveLeagueDisplayName(row, userId);
  } catch {
    return row.leagueName || `League ${leagueId}`;
  }
}

function viewToPayload(view: HistoricalReceiptView, leagueName: string): HistoricalReceiptSharePayload {
  return {
    v: 1,
    k: view.kind,
    lg: leagueName.slice(0, 80),
    fn: view.focalName.slice(0, 48),
    rn: view.rivalName.slice(0, 48),
    se: view.season,
    wk: view.week,
    hl: view.headline.slice(0, 120),
    ev: view.evidence.slice(0, 400),
    wm: view.whyMatters.slice(0, 280),
    cr: view.centralResult.slice(0, 160),
    tn: view.tone,
    fs: view.focalScore,
    rs: view.rivalScore,
    mg: view.margin,
    mt: view.matchupType,
    sr: view.seriesRecord,
    ec: view.elimCount,
    tl: view.typeLabel.slice(0, 48),
  };
}

function composeShareText(p: HistoricalReceiptSharePayload): string {
  const when = formatSeasonWeekLabel(p.se, p.wk);
  return `${p.hl} — ${p.cr} (${when}) in ${p.lg}. ${p.wm}`;
}

const kindSchema = z.enum(["playoff_elimination", "painful_loss", "revenge"]);

export const historicalReceiptShareRouter = router({
  mint: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1).max(32),
        rivalId: z.string().min(1).max(128),
        kind: kindSchema,
        focalDisplayName: z.string().min(1).max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertUserLeagueAccess(ctx.user.id, input.leagueId);
      const pairs = await computeRivalryScores(ctx.user.id, input.leagueId);
      const rivalNorm = normalizeOwnerKey(input.rivalId.trim());
      const pair = pairs.find((p) => {
        const id = normalizeOwnerKey(p.rivalId);
        return id === rivalNorm || p.rivalId === input.rivalId.trim();
      });
      if (!pair) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rivalry receipt not found for that rival." });
      }
      const focalName =
        input.focalDisplayName?.trim() ||
        pair.ownerName?.trim() ||
        "You";
      const views = buildHistoricalReceiptsFromPairs({
        pairs: [pair],
        focalName,
        limit: 20,
      });
      const view = views.find((v) => v.kind === (input.kind as HistoricalReceiptKind));
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That receipt kind is not available for this rivalry." });
      }
      const leagueName = await leagueNameFor(ctx.user.id, input.leagueId);
      const payload = viewToPayload(view, leagueName);
      const shareCode = signHistoricalReceipt(payload);
      return {
        shareCode,
        urlPath: `/historical-receipt/${encodeURIComponent(shareCode)}`,
        text: composeShareText(payload),
        receipt: payloadToPublicReceipt(payload),
      };
    }),

  get: publicProcedure
    .input(z.object({ shareCode: z.string().min(8).max(8192) }))
    .query(({ input }) => {
      const p = verifyHistoricalReceipt(input.shareCode);
      if (!p) return { valid: false as const, receipt: null };
      return { valid: true as const, receipt: payloadToPublicReceipt(p) };
    }),
});
