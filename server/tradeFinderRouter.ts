/**
 * Trade Finder tRPC — league-aware recommendations. Advisory only.
 * Does not submit trades to ESPN or Sleeper.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { protectedProcedure, router, resolvePremiumAccess } from "./_core/trpc";
import { getCachedView, getDb, getActiveLeagueForUser, resolveActiveLeagueId } from "./db";
import { assertUserLeagueAccess } from "./leagueAccess";
import { memCache } from "./memCache";
import { invokeLLM } from "./_core/llm";
import { aiUsage } from "./aiCost/aiFeatures";
import { calcKeeperEfficiency, calcVORP } from "./analytics";
import { findTrades } from "./tradeFinder/find";
import {
  assembleMarketValueInputs,
  buildPlayerRows,
  buildTradeFinderLeague,
  valueOwnedPicks,
  valuePlayers,
} from "./tradeFinder/loadLeague";
import { applyNarratives } from "./tradeFinder/narrative";
import { evidenceFromCompleted } from "./tradeFinder/behavior";
import type { ManagerBehaviorEvidence, TradeFinderResult } from "./tradeFinder/types";
import { DEFAULT_TRADE_FINDER_FILTERS } from "./tradeFinder/types";

const filtersSchema = z.object({
  targetPosition: z.enum(["ANY", "QB", "RB", "WR", "TE", "FLEX", "K", "DST"]).default("ANY"),
  partnerTeamId: z.number().int().positive().nullable().default(null),
  maxAssets: z.union([z.literal(1), z.literal(2)]).default(2),
  includeDraftPicks: z.boolean().default(false),
  risk: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  topN: z.number().int().min(1).max(10).default(5),
});

async function loadWeeklyById(
  playerIds: number[],
  season: number,
): Promise<Map<number, Map<number, Map<number, number>>>> {
  const weeklyById = new Map<number, Map<number, Map<number, number>>>();
  if (playerIds.length === 0) return weeklyById;
  try {
    const db = await getDb();
    if (!db) return weeklyById;
    const inList = playerIds.join(",");
    const minSeason = season - 3;
    const execRes = await db.execute(sql`
      SELECT r.espnPlayerId AS espnId, w.season AS season, w.week AS week, MAX(w.pointsScored) AS pts
      FROM gm_weekly_player_stats w
      JOIN gm_player_registry r ON r.id = w.playerId
      WHERE r.espnPlayerId IN (${sql.raw(inList)})
        AND w.season <= ${season} AND w.season >= ${minSeason}
      GROUP BY r.espnPlayerId, w.season, w.week
    `);
    const rows = (Array.isArray(execRes)
      ? (Array.isArray(execRes[0]) ? execRes[0] : execRes)
      : (execRes && Array.isArray((execRes as { rows?: unknown[] }).rows)
        ? (execRes as { rows: unknown[] }).rows
        : [])) as Array<{ espnId: string | number; season: number; week: number; pts: number }>;
    for (const row of rows ?? []) {
      const id = Number(row.espnId);
      const s = Number(row.season);
      const week = Number(row.week);
      const pts = Number(row.pts);
      if (!Number.isFinite(id) || !Number.isFinite(s) || !Number.isFinite(week)) continue;
      if (!weeklyById.has(id)) weeklyById.set(id, new Map());
      const bySeason = weeklyById.get(id)!;
      if (!bySeason.has(s)) bySeason.set(s, new Map());
      bySeason.get(s)!.set(week, pts);
    }
  } catch {
    /* degrade: market value still works from ADP/projection */
  }
  return weeklyById;
}

async function loadPicksByTeam(leagueId: string, teamCount: number) {
  try {
    const db = await getDb();
    if (!db || teamCount <= 0) return new Map();
    const draftYear = 2026;
    const [rows] = (await db.execute(sql`
      SELECT dp.teamId, dp.roundId, dp.roundPick
      FROM draft_picks dp
      WHERE dp.leagueId = ${leagueId} AND dp.season = ${draftYear}
    `)) as unknown as [Array<Record<string, unknown>>];
    const picks = (rows ?? [])
      .map((r) => ({
        teamId: Number(r.teamId),
        round: Number(r.roundId),
        pickInRound: Number(r.roundPick),
      }))
      .filter((p) => Number.isFinite(p.teamId) && p.round >= 1 && p.pickInRound >= 1);
    return valueOwnedPicks(picks, teamCount);
  } catch {
    return new Map();
  }
}

async function loadBehaviorByTeam(
  seasons: number[],
  loadSeason: (s: number) => Promise<Record<string, unknown> | null>,
  teamIds: number[],
  ownerByTeam: Map<number, string>,
): Promise<Record<number, ManagerBehaviorEvidence>> {
  const out: Record<number, ManagerBehaviorEvidence> = {};
  try {
    const { reconstructCompletedTrades, computeOwnerIntelligence } = await import("./tradeIntelligence");
    const { trades } = await reconstructCompletedTrades(seasons, loadSeason);
    for (const tid of teamIds) {
      const intel = computeOwnerIntelligence(trades, tid, ownerByTeam.get(tid) ?? `Team ${tid}`);
      out[tid] = evidenceFromCompleted({
        completedTrades: intel.completedTrades,
        mostAcquiredPos: intel.mostAcquiredPos,
        mostTradedAwayPos: intel.mostTradedAwayPos,
      });
    }
  } catch {
    /* behavior is optional */
  }
  return out;
}

function factPacket(result: TradeFinderResult): string {
  return result.trades
    .map((t, i) => {
      return [
        `#${i}`,
        `partner=${t.partnerName}`,
        `give=${t.youGive.map((a) => `${a.name} (${a.position}, val ${Math.round(a.tradeValue)})`).join("; ")}`,
        `receive=${t.youReceive.map((a) => `${a.name} (${a.position}, val ${Math.round(a.tradeValue)})`).join("; ")}`,
        `fit=${t.tradeFit}`,
        `fairness=${t.fairness}`,
        `userDelta=${t.userLineupDelta}`,
        `partnerDelta=${t.partnerLineupDelta}`,
        `userNeedFit=${t.userNeedFit}`,
        `partnerNeedFit=${t.partnerNeedFit}`,
        `behavior=${t.behaviorFit}${t.behaviorNote ? ` ${t.behaviorNote}` : ""}`,
        `why=${t.whyThisWorks}`,
        `risk=${t.riskWatchout}`,
      ].join(" | ");
    })
    .join("\n");
}

export const tradeFinderRouter = router({
  find: protectedProcedure
    .input(z.object({
      season: z.number().int().min(2009).max(2100),
      userTeamId: z.number().int().positive().optional(),
      filters: filtersSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const entitled = await resolvePremiumAccess(ctx.user);
      const { leagueId } = await resolveActiveLeagueId({ user: ctx.user }, undefined, input.season);
      if (!leagueId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect a league to use Trade Finder." });
      }
      await assertUserLeagueAccess(ctx.user.id, leagueId);

      const filters = { ...DEFAULT_TRADE_FINDER_FILTERS, ...input.filters };
      const cacheKey = `tradeFinder:${leagueId}:${input.season}:${input.userTeamId ?? "auto"}:${entitled}:${JSON.stringify(filters)}`;

      return memCache(cacheKey, 90_000, async () => {
        const cached = await getCachedView(input.season, "combined", leagueId, { userId: ctx.user.id });
        const payload = cached?.payload as Record<string, unknown> | undefined;
        if (!payload) {
          return {
            ok: false,
            gated: !entitled,
            entitled,
            emptyReason: "unsupported_season" as const,
            emptyExplanation: "No strong trade opportunities right now. This season is not synced.",
            userNeeds: [],
            userSurplus: [],
            tradePriority: [],
            trades: [],
            disclaimers: [],
            picksSupported: false,
            metrics: {
              teams: 0, assetsEvaluated: 0, partnersRanked: 0,
              candidatesGenerated: 0, candidatesScored: 0, candidatesReturned: 0, elapsedMs: 0,
              wantNeedPositions: [], streamerDeprioritized: true,
            },
            narrativeApplied: false,
          } satisfies TradeFinderResult;
        }

        const conn = await getActiveLeagueForUser(ctx.user.id);
        const provider = String(conn?.provider ?? "espn");
        const userTeamId = input.userTeamId ?? conn?.selectedTeamId ?? 0;

        const rosters = (await import("./espnService")).normalizeRosters(payload) as Array<Record<string, unknown>>;
        const players = buildPlayerRows(rosters);
        const vorp = calcVORP(players);
        const keepers = calcKeeperEfficiency(players, vorp);
        const keeperSavingsById = new Map<number, number>();
        for (const k of keepers) keeperSavingsById.set(k.playerId, k.roundSavings);

        let marketValues = new Map<number, import("./marketValue").MarketValueResult>();
        try {
          const weeklyById = await loadWeeklyById(players.map((p) => p.playerId).filter((n) => n > 0), input.season);
          marketValues = assembleMarketValueInputs({
            payload,
            players,
            season: input.season,
            weeklyById,
            keeperSavingsById,
          });
        } catch (err) {
          console.warn("[tradeFinder] market value degraded:", (err as Error).message);
        }
        const valuesByPlayerId = valuePlayers(players, marketValues);

        const { resolveLeagueContext } = await import("./leagueContext");
        const leagueCtx = await resolveLeagueContext(ctx.user.id, input.season);
        const disclaimers: string[] = [];
        if (leagueCtx.format === "dynasty") {
          disclaimers.push("Dynasty league: valuations are redraft-oriented and may undervalue youth and future picks.");
        }
        if (leagueCtx.format === "keeper") {
          disclaimers.push("Keeper league: valuations do not fully price keeper economics.");
        }
        if (leagueCtx.rosterSlots.DST > 0) {
          disclaimers.push("Team defense is included when it is a starting slot.");
        }

        const teams = (await import("./espnService")).normalizeTeams(payload) as Array<Record<string, unknown>>;
        const teamCount = teams.length;
        const picksByTeam = filters.includeDraftPicks ? await loadPicksByTeam(leagueId, teamCount) : new Map();

        const ownerByTeam = new Map<number, string>();
        for (const t of teams) {
          ownerByTeam.set(Number(t.teamId), String(t.owners ?? t.teamName ?? ""));
        }
        let behaviorByTeam: Record<number, ManagerBehaviorEvidence> = {};
        try {
          const { listSeasonsForLeagueHistorical } = await import("./historicalDataService");
          const seasons = await listSeasonsForLeagueHistorical(leagueId, ctx.user.id);
          behaviorByTeam = await loadBehaviorByTeam(
            seasons.slice(-6),
            async (s) => {
              const row = await getCachedView(s, "combined", leagueId, { userId: ctx.user.id });
              return row?.payload as Record<string, unknown> | null;
            },
            teams.map((t) => Number(t.teamId)).filter((n) => n > 0),
            ownerByTeam,
          );
        } catch {
          /* optional */
        }

        const league = buildTradeFinderLeague({
          leagueId,
          provider,
          season: input.season,
          userTeamId,
          payload,
          valuesByPlayerId,
          picksByTeam,
          behaviorByTeam,
          format: leagueCtx.format,
          disclaimers,
        });

        if (!entitled) {
          const preview = findTrades(league, filters, { entitled: false });
          return {
            ...preview,
            gated: true,
            entitled: false,
            trades: [],
            emptyReason: preview.emptyReason === "none" ? "none" : preview.emptyReason,
            emptyExplanation: preview.emptyExplanation
              ?? "Trade Finder recommendations are a Pro feature. Your positional needs are shown below.",
          } satisfies TradeFinderResult;
        }

        let result = findTrades(league, filters, { entitled: true });

        if (result.trades.length > 0) {
          try {
            const facts = factPacket(result);
            const response = await invokeLLM({
              callType: "json_structured",
              usageContext: aiUsage("TRADE_ANALYSIS", { userId: ctx.user.id, leagueId, intent: "trade_finder_narrative" }),
              messages: [
                {
                  role: "system",
                  content:
                    "You explain already-ranked fantasy trades. Use ONLY the fact packet. Do not change rankings, values, fairness, or invent acceptance odds, psychology, or players. Return JSON array of {index, why, risk} matching the fact packet order. Each field ≤ 280 characters.",
                },
                {
                  role: "user",
                  content: `Write why/risk for these ${result.trades.length} trades.\n${facts}`,
                },
              ],
            });
            const content = response.choices?.[0]?.message?.content;
            const raw = typeof content === "string" ? content : "";
            const applied = applyNarratives(result.trades, raw);
            result = { ...result, trades: applied.trades, narrativeApplied: applied.applied };
          } catch {
            result = { ...result, narrativeApplied: false };
          }
        }

        return result;
      });
    }),
});
