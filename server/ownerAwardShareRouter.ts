/**
 * ownerAwardShareRouter — mint + public get for Owner Award catalog cards.
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { assertUserLeagueAccess } from "./leagueAccess";
import { getDb } from "./db";
import { leagueConnections } from "../drizzle/schema";
import { resolveLeagueDisplayName } from "./leagueDisplayName";
import { getOwnerAwardMetaById } from "../shared/ownerAwardMeta";
import {
  signOwnerAwardShare,
  verifyOwnerAwardShare,
  payloadToPublicAward,
  type OwnerAwardSharePayload,
} from "./ownerAwardShareToken";

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

export const ownerAwardShareRouter = router({
  mint: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1),
        awardId: z.string().min(1),
        currentHolderName: z.string().max(80).nullable().optional(),
        statLabel: z.string().max(120).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertUserLeagueAccess(ctx.user.id, input.leagueId);
      const meta = getOwnerAwardMetaById(input.awardId);
      if (!meta) {
        throw new Error("Unknown award");
      }
      const leagueName = await leagueNameFor(ctx.user.id, input.leagueId);
      const holder =
        input.currentHolderName != null && String(input.currentHolderName).trim()
          ? String(input.currentHolderName).trim().slice(0, 48)
          : null;
      const payload: OwnerAwardSharePayload = {
        v: 1,
        id: meta.id,
        dn: meta.displayName.slice(0, 64),
        lg: leagueName.slice(0, 80),
        sd: meta.shortDescription.slice(0, 200),
        ry: meta.rarity,
        cat: meta.category,
        hn: holder,
        st: input.statLabel != null ? String(input.statLabel).slice(0, 120) : null,
      };
      const shareCode = signOwnerAwardShare(payload);
      return {
        shareCode,
        urlPath: `/owner-award/${encodeURIComponent(shareCode)}`,
        text: `${meta.displayName} — ${meta.shortDescription}`,
      };
    }),

  get: publicProcedure
    .input(z.object({ shareCode: z.string().min(8).max(8192) }))
    .query(({ input }) => {
      const p = verifyOwnerAwardShare(input.shareCode);
      if (!p) return { valid: false as const, award: null };
      return { valid: true as const, award: payloadToPublicAward(p) };
    }),
});
