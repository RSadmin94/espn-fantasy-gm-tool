/**
 * rivalryStoryRouter.ts
 *
 * Read-only tRPC exposure for rivalryStoryAuthority.
 * No classifier duplication, no prose, no UI mapping.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import {
  buildRivalryStoryAuthority,
  buildRivalryStoryForPair,
  normalizeOwnerKey,
  type RivalryStoryResult,
} from "./rivalryStoryAuthority";
import {
  resolveReceiptsForStory,
  resolveRivalryStoryReceipts,
  type RivalryStoryReceipt,
} from "./rivalryStoryReceipts";
import { buildH2HAuthority } from "./h2hAuthority";
import {
  buildRivalryNarrativeStatements,
  type RivalryNarrativeStatement,
} from "./rivalryNarrativeTemplates";
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

export type RivalryStoryForOwnerResponse = {
  focalOwnerKey: string;
  /** One story per rival with at least one meeting (authority filter). */
  stories: RivalryStoryResult[];
};

export type RivalryStoryReceiptsResponse = {
  focalOwnerKey: string;
  rivalOwnerKey: string;
  receipts: RivalryStoryReceipt[];
};

export type RivalryStoryStatementsResponse = {
  focalOwnerKey: string;
  rivalOwnerKey: string;
  statements: RivalryNarrativeStatement[];
};

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
  pair: publicProcedure.input(pairInput).query(async ({ input }): Promise<RivalryStoryPairResponse> => {
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

    return story;
  }),

  /** Documentary metadata for all rivals of a focal owner. */
  forOwner: publicProcedure
    .input(forOwnerInput)
    .query(async ({ input }): Promise<RivalryStoryForOwnerResponse> => {
      await assertDatabase();

      const storiesByRival = await buildRivalryStoryAuthority({
        leagueId: input.leagueId,
        focalOwnerKey: input.focalOwnerKey,
      });

      return {
        focalOwnerKey: input.focalOwnerKey,
        stories: storiesMapToArray(storiesByRival),
      };
    }),

  /** Structured evidence objects for story receipt IDs. */
  receipts: publicProcedure
    .input(receiptsInput)
    .query(async ({ input }): Promise<RivalryStoryReceiptsResponse> => {
      if (input.focalOwnerKey === input.rivalOwnerKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "focalOwnerKey and rivalOwnerKey must be different owners",
        });
      }

      await assertDatabase();

      if (input.receiptIds !== undefined) {
        const receipts = await resolveRivalryStoryReceipts({
          leagueId: input.leagueId,
          focalOwnerKey: input.focalOwnerKey,
          rivalOwnerKey: input.rivalOwnerKey,
          receiptIds: input.receiptIds,
        });
        return {
          focalOwnerKey: input.focalOwnerKey,
          rivalOwnerKey: input.rivalOwnerKey,
          receipts,
        };
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

      return {
        focalOwnerKey: input.focalOwnerKey,
        rivalOwnerKey: input.rivalOwnerKey,
        receipts,
      };
    }),

  /** Controlled narrative statements for one rivalry pair. */
  statements: publicProcedure
    .input(pairInput)
    .query(async ({ input }): Promise<RivalryStoryStatementsResponse> => {
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

      const [receipts, h2hAuth] = await Promise.all([
        resolveReceiptsForStory({
          leagueId: input.leagueId,
          story,
        }),
        buildH2HAuthority(input.leagueId),
      ]);

      const h2h = h2hAuth.getH2H(input.focalOwnerKey, input.rivalOwnerKey);
      const statements = buildRivalryNarrativeStatements({
        story,
        receipts,
        h2h,
        focalName: h2h.displayA,
        rivalName: h2h.displayB,
      });

      return {
        focalOwnerKey: input.focalOwnerKey,
        rivalOwnerKey: input.rivalOwnerKey,
        statements,
      };
    }),
});
