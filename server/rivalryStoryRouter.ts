/**
 * rivalryStoryRouter.ts
 *
 * Read-only tRPC exposure for rivalryStoryAuthority.
 * Freemium: free users get Cold Open teaser only; full documentary is paid.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure, resolvePremiumAccess } from "./_core/trpc";
import {
  buildRivalryStoryAuthority,
  buildRivalryStoryForPair,
  normalizeOwnerKey,
  type RivalryStoryResult,
} from "./rivalryStoryAuthority";
import {
  resolveReceiptsForStory,
  resolveRivalryStoryReceipts,
} from "./rivalryStoryReceipts";
import { buildH2HAuthority } from "./h2hAuthority";
import {
  buildRivalryColdOpenTeaser,
  buildRivalryNarrativeStatements,
} from "./rivalryNarrativeTemplates";
import {
  gateRivalryStoryForOwner,
  gateRivalryStoryPair,
  gateRivalryStoryReceipts,
  gateRivalryStoryStatements,
} from "./leagueIntelGating";
import { getDb } from "./db";

const leagueIdInput = z.object({
  leagueId: z.string().min(1).max(32),
});

const ownerKeyInput = z
  .string()
  .min(1)
  .max(128)
  .transform((k) => normalizeOwnerKey(k.trim()));

const pairInput = leagueIdInput.extend({
  focalOwnerKey: ownerKeyInput,
  rivalOwnerKey: ownerKeyInput,
});

const forOwnerInput = leagueIdInput.extend({
  focalOwnerKey: ownerKeyInput,
});

export type RivalryStoryPairResponse = RivalryStoryResult;

const receiptsInput = pairInput.extend({
  receiptIds: z.array(z.string().min(1).max(128)).optional(),
});

export function storiesMapToArray(map: Map<string, RivalryStoryResult>): RivalryStoryResult[] {
  return [...map.values()].sort((a, b) => a.rivalOwnerKey.localeCompare(b.rivalOwnerKey));
}

async function assertDatabase(): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  }
}

export const rivalryStoryRouter = router({
  /** Documentary metadata for one rivalry pair. */
  pair: publicProcedure.input(pairInput).query(async ({ ctx, input }) => {
    if (input.focalOwnerKey === input.rivalOwnerKey) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "focalOwnerKey and rivalOwnerKey must be different owners",
      });
    }

    await assertDatabase();

    const story = await buildRivalryStoryForPair({
      leagueId: input.leagueId,
      focalOwnerKey: input.focalOwnerKey,
      rivalOwnerKey: input.rivalOwnerKey,
    });

    if (!story) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No rivalry story for the requested owner pair in this league",
      });
    }

    return gateRivalryStoryPair(story, await resolvePremiumAccess(ctx.user));
  }),

  /** Documentary metadata for all rivals of a focal owner. */
  forOwner: publicProcedure
    .input(forOwnerInput)
    .query(async ({ ctx, input }) => {
      await assertDatabase();

      const storiesByRival = await buildRivalryStoryAuthority({
        leagueId: input.leagueId,
        focalOwnerKey: input.focalOwnerKey,
      });

      return gateRivalryStoryForOwner(
        input.focalOwnerKey,
        storiesMapToArray(storiesByRival),
        await resolvePremiumAccess(ctx.user),
      );
    }),

  /** Structured evidence objects for story receipt IDs. */
  receipts: publicProcedure
    .input(receiptsInput)
    .query(async ({ ctx, input }) => {
      if (input.focalOwnerKey === input.rivalOwnerKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "focalOwnerKey and rivalOwnerKey must be different owners",
        });
      }

      await assertDatabase();
      const entitled = await resolvePremiumAccess(ctx.user);

      if (!entitled) {
        return gateRivalryStoryReceipts(input.focalOwnerKey, input.rivalOwnerKey, [], false);
      }

      if (input.receiptIds !== undefined) {
        const receipts = await resolveRivalryStoryReceipts({
          leagueId: input.leagueId,
          focalOwnerKey: input.focalOwnerKey,
          rivalOwnerKey: input.rivalOwnerKey,
          receiptIds: input.receiptIds,
        });
        return gateRivalryStoryReceipts(input.focalOwnerKey, input.rivalOwnerKey, receipts, true);
      }

      const story = await buildRivalryStoryForPair({
        leagueId: input.leagueId,
        focalOwnerKey: input.focalOwnerKey,
        rivalOwnerKey: input.rivalOwnerKey,
      });

      if (!story) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No rivalry story for the requested owner pair in this league",
        });
      }

      const receipts = await resolveReceiptsForStory({
        leagueId: input.leagueId,
        story,
      });

      return gateRivalryStoryReceipts(input.focalOwnerKey, input.rivalOwnerKey, receipts, true);
    }),

  /** Controlled narrative statements for one rivalry pair. */
  statements: publicProcedure
    .input(pairInput)
    .query(async ({ ctx, input }) => {
      if (input.focalOwnerKey === input.rivalOwnerKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "focalOwnerKey and rivalOwnerKey must be different owners",
        });
      }

      await assertDatabase();

      const story = await buildRivalryStoryForPair({
        leagueId: input.leagueId,
        focalOwnerKey: input.focalOwnerKey,
        rivalOwnerKey: input.rivalOwnerKey,
      });

      if (!story) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No rivalry story for the requested owner pair in this league",
        });
      }

      const entitled = await resolvePremiumAccess(ctx.user);
      const h2hAuth = await buildH2HAuthority(input.leagueId);
      const h2h = h2hAuth.getH2H(input.focalOwnerKey, input.rivalOwnerKey);
      const names = { focalName: h2h.displayA, rivalName: h2h.displayB };

      const statements = entitled
        ? buildRivalryNarrativeStatements({
            story,
            receipts: await resolveReceiptsForStory({
              leagueId: input.leagueId,
              story,
            }),
            h2h,
            ...names,
          })
        : (() => {
            const tape = buildRivalryNarrativeStatements({
              story,
              receipts: [],
              h2h,
              ...names,
            });
            const coldOpen = buildRivalryColdOpenTeaser({ story, h2h, ...names });
            if (!coldOpen) return tape;
            return [coldOpen, ...tape.filter((s) => s.block !== "coldOpen")];
          })();

      return gateRivalryStoryStatements(
        input.focalOwnerKey,
        input.rivalOwnerKey,
        statements,
        entitled,
      );
    }),
});
