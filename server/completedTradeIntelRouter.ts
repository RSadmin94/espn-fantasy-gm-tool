/**
 * completedTradeIntelRouter.ts
 *
 * Read-only tRPC exposure for completedTradeAuthority.
 * No trade math, no persistence, no rivalry scoring changes.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure, resolvePremiumAccess } from "./_core/trpc";
import {
  buildNotoriousTradesReport,
  buildOwnerTradeHistory,
  buildRivalryTradeLedger,
  findOwnerKeyByName,
  loadCompletedTradeIntelligence,
  type CompletedTradeIntel,
  type OwnerTradeHistorySummary,
  type RivalryTradeLedger,
} from "./completedTradeAuthority";
import {
  gateNotoriousTradesReport,
  gateOwnerTradeHistory,
  gateRivalryTradeLedger,
} from "./leagueIntelGating";
import { getDb } from "./db";

const RECENT_TRADE_LIMIT = 10;

const leagueSeasonInput = z
  .object({
    leagueId: z.string().min(1).max(32),
    season: z.number().int().min(2000).max(2100).optional(),
    seasons: z.array(z.number().int().min(2000).max(2100)).min(1).max(32).optional(),
  })
  .refine((v) => v.season != null || (v.seasons != null && v.seasons.length > 0), {
    message: "season or seasons is required",
  });

const ownerIdentifierInput = z
  .object({
    ownerKey: z.string().min(1).max(128).optional(),
    ownerName: z.string().min(1).max(128).optional(),
    teamId: z.number().int().positive().optional(),
  })
  .refine((v) => Boolean(v.ownerKey?.trim() || v.ownerName?.trim() || v.teamId != null), {
    message: "ownerKey, ownerName, or teamId is required",
  });

export function resolveSeasons(input: { season?: number; seasons?: number[] }): number[] {
  if (input.seasons?.length) {
    return [...new Set(input.seasons.filter((s) => Number.isFinite(s) && s > 0))].sort((a, b) => a - b);
  }
  if (input.season != null && Number.isFinite(input.season) && input.season > 0) {
    return [input.season];
  }
  return [];
}

export function resolveOwnerIdentifier(
  trades: CompletedTradeIntel[],
  input: { ownerKey?: string; ownerName?: string; teamId?: number },
): { ownerKey: string; ownerName: string } | null {
  const key = input.ownerKey?.trim();
  if (key) {
    for (const t of trades) {
      if (t.sideA.ownerKey === key) return { ownerKey: key, ownerName: t.sideA.ownerName };
      if (t.sideB.ownerKey === key) return { ownerKey: key, ownerName: t.sideB.ownerName };
    }
    const name = input.ownerName?.trim();
    return { ownerKey: key, ownerName: name || "Owner" };
  }

  const name = input.ownerName?.trim();
  if (name) {
    const found = findOwnerKeyByName(trades, name);
    if (found) return found;
  }

  if (input.teamId != null) {
    for (const t of trades) {
      if (t.sideA.teamId === input.teamId && t.sideA.ownerKey) {
        return { ownerKey: t.sideA.ownerKey, ownerName: t.sideA.ownerName };
      }
      if (t.sideB.teamId === input.teamId && t.sideB.ownerKey) {
        return { ownerKey: t.sideB.ownerKey, ownerName: t.sideB.ownerName };
      }
    }
  }

  return null;
}

async function loadTradesForLeague(leagueId: string, seasons: number[]): Promise<CompletedTradeIntel[]> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  }
  return loadCompletedTradeIntelligence({ db, leagueId, seasons });
}

export type OwnerTradeHistoryResponse = OwnerTradeHistorySummary & {
  recentTrades: OwnerTradeHistorySummary["trades"];
};

export type RivalryTradeLedgerResponse = RivalryTradeLedger & {
  recentTrades: RivalryTradeLedger["trades"];
};

export const completedTradeIntelRouter = router({
  /** Completed trades + lifetime record for one owner. */
  ownerTradeHistory: publicProcedure
    .input(leagueSeasonInput.merge(ownerIdentifierInput))
    .query(async ({ ctx, input }): Promise<OwnerTradeHistoryResponse> => {
      const seasons = resolveSeasons(input);
      const trades = await loadTradesForLeague(input.leagueId, seasons);
      const owner = resolveOwnerIdentifier(trades, input);
      if (!owner) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Owner not found in completed trades for the requested league/season(s)",
        });
      }

      const entitled = await resolvePremiumAccess(ctx.user);
      const history = buildOwnerTradeHistory(trades, owner.ownerKey, owner.ownerName);
      const gated = gateOwnerTradeHistory(history, entitled);
      return {
        ...gated,
        recentTrades: entitled ? history.trades.slice(0, RECENT_TRADE_LIMIT) : [],
      };
    }),

  /** Head-to-head completed trade ledger between two owners. */
  rivalryTradeLedger: publicProcedure
    .input(
      leagueSeasonInput.merge(
        z
          .object({
            ownerAKey: z.string().min(1).max(128).optional(),
            ownerAName: z.string().min(1).max(128).optional(),
            ownerATeamId: z.number().int().positive().optional(),
            ownerBKey: z.string().min(1).max(128).optional(),
            ownerBName: z.string().min(1).max(128).optional(),
            ownerBTeamId: z.number().int().positive().optional(),
          })
          .refine(
            (v) =>
              Boolean(v.ownerAKey?.trim() || v.ownerAName?.trim() || v.ownerATeamId != null) &&
              Boolean(v.ownerBKey?.trim() || v.ownerBName?.trim() || v.ownerBTeamId != null),
            { message: "Both owners require ownerKey, ownerName, or teamId" },
          ),
      ),
    )
    .query(async ({ ctx, input }): Promise<RivalryTradeLedgerResponse> => {
      const seasons = resolveSeasons(input);
      const trades = await loadTradesForLeague(input.leagueId, seasons);

      const ownerA = resolveOwnerIdentifier(trades, {
        ownerKey: input.ownerAKey,
        ownerName: input.ownerAName,
        teamId: input.ownerATeamId,
      });
      const ownerB = resolveOwnerIdentifier(trades, {
        ownerKey: input.ownerBKey,
        ownerName: input.ownerBName,
        teamId: input.ownerBTeamId,
      });

      if (!ownerA || !ownerB) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or both owners not found in completed trades for the requested league/season(s)",
        });
      }
      if (ownerA.ownerKey === ownerB.ownerKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ownerA and ownerB must be different owners" });
      }

      const entitled = await resolvePremiumAccess(ctx.user);
      const ledger = buildRivalryTradeLedger(
        trades,
        ownerA.ownerKey,
        ownerB.ownerKey,
        ownerA.ownerName,
        ownerB.ownerName,
      );
      const gated = gateRivalryTradeLedger(ledger, entitled);
      return {
        ...gated,
        recentTrades: entitled ? ledger.trades.slice(0, RECENT_TRADE_LIMIT) : [],
      };
    }),

  /** League-level completed trade rankings (biggest fleeces, active pairs, etc.). */
  notoriousTradesReport: publicProcedure
    .input(leagueSeasonInput)
    .query(async ({ ctx, input }) => {
      const seasons = resolveSeasons(input);
      const trades = await loadTradesForLeague(input.leagueId, seasons);
      const report = buildNotoriousTradesReport(trades);
      return gateNotoriousTradesReport(report, await resolvePremiumAccess(ctx.user));
    }),
});
