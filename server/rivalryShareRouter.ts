/**
 * rivalryShareRouter.ts
 * ─────────────────────
 * Public-shareable rivalry snapshots.
 *
 * mint()  — authenticated + league-access-checked. Freezes a signed, self-contained
 *           token built from the SAME authorities the app already uses (h2hAuthority
 *           for the record/meetings/names, rivalryStoryAuthority for tier + one-line
 *           teaser). No new records, no DB table, no migration. The share code IS the
 *           token. Canonical owner A = the lexicographically-smaller key, so the same
 *           rivalry always mints the same code.
 * get()   — public / no-auth. Powers /rivalry/:shareCode (read-only, no ESPN creds).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { assertUserLeagueAccess } from "./leagueAccess";
import { getDb } from "./db";
import { leagueConnections } from "../drizzle/schema";
import { resolveLeagueDisplayName } from "./leagueDisplayName";
import { buildH2HAuthority } from "./h2hAuthority";
import { buildRivalryStoryForPair, normalizeOwnerKey } from "./rivalryStoryAuthority";
import { buildRivalryColdOpenTeaser } from "./rivalryNarrativeTemplates";
import {
  signRivalry,
  verifyRivalry,
  type RivalrySharePayload,
  type RivalryTier,
} from "./rivalryShareToken";

// Display-only heat labels the card is allowed to show. The falsifiable numbers are
// always recomputed server-side; only this word may be carried from the calling surface.
const HEAT_ALLOW = new Set([
  "Inferno", "Burning", "Heated", "Simmering", "Cold", "Legendary", "Active", "Quiet",
]);

function tierHeat(tier: RivalryTier): string {
  return tier === "legendary" ? "Legendary" : tier === "real" ? "Active" : "Quiet";
}

/** Public read-shape — kept in one place so the page and the OG image can't drift. */
function payloadToRivalry(p: RivalrySharePayload) {
  return {
    leagueName: p.lg,
    ownerA: p.an,
    ownerB: p.bn,
    record: { wins: p.aw, losses: p.al, ties: p.at },
    playoffRecord: p.pw || p.pl ? { wins: p.pw, losses: p.pl } : null,
    totalMeetings: p.tm,
    heatLabel: p.ht,
    tier: p.tr,
    summary: p.sm ?? null,
  };
}

/** One-line share text built server-side from the frozen snapshot (Copy summary / Web Share). */
function composeShareText(p: RivalrySharePayload): string {
  const rec = p.at > 0 ? `${p.aw}\u2013${p.al}\u2013${p.at}` : `${p.aw}\u2013${p.al}`;
  const meetings = `${p.tm} meeting${p.tm === 1 ? "" : "s"}`;
  return `${p.an} vs ${p.bn} \u2014 ${rec} head-to-head across ${meetings} in ${p.lg}.${p.sm ? ` ${p.sm}` : ""}`;
}

/** Best-effort league display name for the signed-in user's connection to this league. */
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

const ownerKeyInput = z
  .string()
  .min(1)
  .max(128)
  .transform((k) => normalizeOwnerKey(k.trim()));

export const rivalryShareRouter = router({
  /** Freeze a shareable snapshot for one rivalry pair and return its share code (= token). */
  mint: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1).max(32),
        focalOwnerKey: ownerKeyInput,
        rivalOwnerKey: ownerKeyInput,
        /** Display-only heat word from the calling surface; validated against HEAT_ALLOW. */
        heatLabel: z.string().max(24).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertUserLeagueAccess(ctx.user.id, input.leagueId);
      if (input.focalOwnerKey === input.rivalOwnerKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick two different owners." });
      }

      // Canonical A = smaller key → the same rivalry always mints the same code.
      const aKey =
        input.focalOwnerKey < input.rivalOwnerKey ? input.focalOwnerKey : input.rivalOwnerKey;
      const bKey =
        input.focalOwnerKey < input.rivalOwnerKey ? input.rivalOwnerKey : input.focalOwnerKey;

      const h2hAuth = await buildH2HAuthority(input.leagueId);
      const h2h = h2hAuth.getH2H(aKey, bKey);
      const totalMeetings = h2h.career.games + h2h.playoffs.games;
      if (totalMeetings === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No head-to-head history to share yet." });
      }

      const story = await buildRivalryStoryForPair({
        leagueId: input.leagueId,
        focalOwnerKey: aKey,
        rivalOwnerKey: bKey,
      });
      const tier: RivalryTier = story?.tier ?? "quiet";
      const teaser = story
        ? buildRivalryColdOpenTeaser({
            story,
            h2h,
            focalName: h2h.displayA,
            rivalName: h2h.displayB,
          })
        : null;

      const heat =
        input.heatLabel && HEAT_ALLOW.has(input.heatLabel) ? input.heatLabel : tierHeat(tier);
      const leagueName = await leagueNameFor(ctx.user.id, input.leagueId);

      const payload: RivalrySharePayload = {
        v: 1,
        lg: leagueName,
        an: h2h.displayA,
        bn: h2h.displayB,
        aw: h2h.career.wins,
        al: h2h.career.losses,
        at: h2h.career.ties,
        pw: h2h.playoffs.wins,
        pl: h2h.playoffs.losses,
        tm: totalMeetings,
        ht: heat,
        tr: tier,
        sm: teaser?.text ?? null,
      };
      const token = signRivalry(payload);

      return {
        shareCode: token,
        rivalry: payloadToRivalry(payload),
        text: composeShareText(payload),
      };
    }),

  /** Public (no-auth) read of a frozen rivalry snapshot. Powers /rivalry/:shareCode. */
  get: publicProcedure
    .input(z.object({ shareCode: z.string().min(1).max(4096) }))
    .query(({ input }) => {
      const p = verifyRivalry(input.shareCode);
      if (!p) return { valid: false as const };
      return { valid: true as const, rivalry: payloadToRivalry(p) };
    }),
});
