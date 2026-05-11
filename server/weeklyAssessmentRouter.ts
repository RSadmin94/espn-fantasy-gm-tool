// FILE: server/weeklyAssessmentRouter.ts
/**
 * Weekly Assessment tRPC Router
 *
 * Mount in routers.ts:
 *   import { weeklyAssessmentRouter } from "./weeklyAssessmentRouter";
 *   // inside appRouter:
 *   weeklyAssessment: weeklyAssessmentRouter,
 *
 * Endpoints:
 *   weeklyAssessment.fullReport      — all 14 teams, full weekly brief
 *   weeklyAssessment.teamBrief       — single team deep assessment
 *   weeklyAssessment.rodOpportunities— Rod's ranked opportunity board only
 *   weeklyAssessment.leaguePulse     — fast standings + desperation snapshot
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  buildWeeklyAssessment,
  buildTeamAssessment,
  buildRodOpportunityBoard,
} from "./weeklyAssessmentService";
import {
  normalizeTeams, normalizeRosters, normalizeMatchups,
  normalizeTransactions, normalizeSettings,
} from "./espnService";
import { getCachedView } from "./db";
import { calcManagerDNA, type DraftPickRecord, type ManagerRawData } from "./leagueDNA";

// ─── Cache for expensive full reports ────────────────────────────────────────
// In-memory cache keyed by season+week — avoids re-running 14 LLM calls on
// every page load during the same week.

const reportCache = new Map<string, { report: Awaited<ReturnType<typeof buildWeeklyAssessment>>; cachedAt: number }>();
const REPORT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(season: number, week?: number) {
  return `${season}-${week ?? "current"}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const weeklyAssessmentRouter = router({

  /**
   * Full 14-team weekly assessment report.
   *
   * Expensive — runs 14+ LLM calls sequentially. Cached for 30 minutes.
   * Use this to populate the Weekly Intelligence hub and Command Center.
   */
  fullReport: publicProcedure
    .input(z.object({
      season: z.number().default(2025),
      forceRefresh: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const cacheKey = getCacheKey(input.season);
      const cached = reportCache.get(cacheKey);

      if (cached && !input.forceRefresh && Date.now() - cached.cachedAt < REPORT_CACHE_TTL) {
        return { ...cached.report, fromCache: true };
      }

      const report = await buildWeeklyAssessment(input.season);
      reportCache.set(cacheKey, { report, cachedAt: Date.now() });
      return { ...report, fromCache: false };
    }),

  /**
   * Single team deep assessment.
   * Faster than fullReport — only runs one LLM call.
   * Use when user clicks into a specific opponent's profile.
   */
  teamBrief: publicProcedure
    .input(z.object({
      teamId: z.number(),
      season: z.number().default(2025),
    }))
    .query(async ({ input }) => {
      const cached = await getCachedView(input.season, "combined");
      if (!cached) throw new TRPCError({ code: "NOT_FOUND", message: "No data for this season." });

      const data = cached.payload as Record<string, unknown>;
      const teams = normalizeTeams(data);
      const ownerMap: Record<number, string> = {};
      const teamNameMap: Record<number, string> = {};
      for (const t of teams) {
        ownerMap[t.teamId as number] = t.owners as string;
        teamNameMap[t.teamId as number] = (t.teamName as string) || "Unknown";
      }

      const managerRawData: ManagerRawData = {
        memberId: String(input.teamId),
        ownerName: ownerMap[input.teamId] || "Unknown",
        seasonRecords: [], txnSeasons: [], draftPicks: [],
        h2hVsRod: { wins: 0, losses: 0 }, currentSeason: null,
      };
      const dna = calcManagerDNA(managerRawData, []);
      const dnaMap = new Map([[input.teamId, dna]]);

      const rodTeamId = teams.find(t => {
        const name = ((t.teamName as string) || "").toLowerCase();
        return name.includes("str8") || name.includes("rodzilla");
      })?.teamId as number ?? null;

      const allTeamsData = {
        teams,
        rosters: normalizeRosters(data) as unknown[],
        matchups: normalizeMatchups(data),
        transactions: normalizeTransactions(data) as unknown[],
        settings: normalizeSettings(data),
        ownerMap,
        teamNameMap,
      };

      return buildTeamAssessment(input.teamId, input.season, allTeamsData, dnaMap, [], rodTeamId);
    }),

  /**
   * Rod's opportunity board — faster than fullReport.
   * Returns ranked cross-team opportunities without full LLM narratives.
   * Use in the Command Center war room quick-launch panel.
   */
  rodOpportunities: publicProcedure
    .input(z.object({ season: z.number().default(2025) }))
    .query(async ({ input }) => {
      return buildRodOpportunityBoard(input.season);
    }),

  /**
   * League pulse — fast snapshot, no LLM calls.
   * Returns standings + desperation scores + last week results for all 14 teams.
   * Use for the Command Center threat assessment board.
   */
  leaguePulse: publicProcedure
    .input(z.object({ season: z.number().default(2025) }))
    .query(async ({ input }) => {
      const cached = await getCachedView(input.season, "combined");
      if (!cached) throw new TRPCError({ code: "NOT_FOUND", message: "No data." });

      const data = cached.payload as Record<string, unknown>;
      const teams = normalizeTeams(data);
      const matchups = normalizeMatchups(data);
      const transactions = normalizeTransactions(data) as unknown[];
      const settings = normalizeSettings(data);
      const currentWeek = (settings.currentMatchupPeriod as number) || 1;

      const ownerMap: Record<number, string> = {};
      const memberIdsMap: Record<number, string[]> = {};
      for (const t of teams) {
        ownerMap[t.teamId as number] = t.owners as string;
        memberIdsMap[t.teamId as number] = (t.memberIds as string[]) || [];
      }

      const lastWeekTxMap: Record<number, number> = {};
      const lastWeekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const tx of transactions as Array<Record<string, unknown>>) {
        if ((tx.proposedDate as number) > lastWeekStart && tx.status === "EXECUTED") {
          const tid = tx.teamId as number;
          lastWeekTxMap[tid] = (lastWeekTxMap[tid] || 0) + 1;
        }
      }

      const sortedTeams = [...teams].sort((a, b) => {
        const wA = (a.wins as number) || 0;
        const wB = (b.wins as number) || 0;
        return wB !== wA ? wB - wA : ((b.pointsFor as number) || 0) - ((a.pointsFor as number) || 0);
      });

      // Build current week matchup map: teamId -> opponentTeamId
      const currentMatchupMap: Record<number, number> = {};
      for (const m of matchups) {
        if ((m.matchupPeriodId as number) === currentWeek) {
          const home = m.homeTeamId as number;
          const away = m.awayTeamId as number;
          if (home && away) {
            currentMatchupMap[home] = away;
            currentMatchupMap[away] = home;
          }
        }
      }

      return {
        week: currentWeek,
        season: input.season,
        teams: sortedTeams.map((t, idx) => {
          const tid = t.teamId as number;
          const wins = (t.wins as number) || 0;
          const losses = (t.losses as number) || 0;

          // Simple desperation signal without full DNA
          const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;
          const rawDesperation = Math.round((1 - winPct) * 60 + (lastWeekTxMap[tid] || 0) * 5);
          const desperationScore = Math.min(100, rawDesperation);

          return {
            teamId: tid,
            ownerName: ownerMap[tid],
            standingRank: idx + 1,
            wins,
            losses,
            pointsFor: Math.round(((t.pointsFor as number) || 0) * 10) / 10,
            pointsAgainst: Math.round(((t.pointsAgainst as number) || 0) * 10) / 10,
            lastWeekTransactionCount: lastWeekTxMap[tid] || 0,
            desperationScore,
            desperationLabel: desperationScore >= 70 ? "WIDE OPEN" :
              desperationScore >= 45 ? "RECEPTIVE" :
              desperationScore >= 25 ? "NEUTRAL" : "NOT INTERESTED",
            playoffProbability: Math.min(98, Math.max(2, Math.round(50 + (winPct - 0.5) * 200))),
            memberIds: memberIdsMap[tid] ?? [],
            currentOpponentTeamId: currentMatchupMap[tid] ?? null,
            currentOpponentOwner: currentMatchupMap[tid] ? (ownerMap[currentMatchupMap[tid]] ?? null) : null,
            currentOpponentMemberIds: currentMatchupMap[tid] ? (memberIdsMap[currentMatchupMap[tid]] ?? []) : [],
          };
        }),
        currentMatchups: currentMatchupMap,
      };
    }),
});
