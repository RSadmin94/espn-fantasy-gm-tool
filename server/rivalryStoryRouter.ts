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
});
