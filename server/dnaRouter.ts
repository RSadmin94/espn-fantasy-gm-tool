// FILE: server/dnaRouter.ts
/**
 * Phase 3 — League DNA tRPC Router
 *
 * Mount in routers.ts:
 *   import { dnaRouter } from "./dnaRouter";
 *   // inside appRouter:
 *   dna: dnaRouter,
 *
 * Endpoints:
 *   dna.leagueProfiles     — full DNA for all 13 opponents (cached)
 *   dna.managerProfile     — single manager DNA by memberId
 *   dna.desperationScores  — live trade desperation scores (current season)
 *   dna.tradeWindow        — is now a good time to trade with a specific manager?
 *   dna.exploitBoard       — ranked exploit opportunity board (all 13 opponents)
 */

import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getCachedView, getAllCachedSeasons } from "./db";
import { resolveCurrentOwner } from "./currentOwnerService";
import {
  calcLeagueDNA,
  calcManagerDNA,
  calcTradeDesperationScore,
  buildDNAPromptBlock,
  type ManagerRawData,
  type DraftPickRecord,
} from "./leagueDNA";
import { classifyDraftPickRawPick } from "./draftTruth";

// ─── ESPN data extraction helpers ────────────────────────────────────────────

const POS_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST", 17: "D/ST",
};

/** Display label for H2H stats in DNA summaries (focal manager vs opponents). */
async function focalH2hLabelForUser(userId?: number): Promise<string> {
  if (userId == null) return "the focal manager";
  const co = await resolveCurrentOwner({ id: userId });
  const n = co.displayName?.trim();
  return n || "the focal manager";
}

export async function buildManagerRawData(userId?: number): Promise<ManagerRawData[]> {
  const cachedSeasons = (await getAllCachedSeasons(undefined, userId)).sort((a, b) => a - b);
  // Use ALL cached seasons for career-level DNA analysis.
  // Older seasons (2009-2017) have less granular transaction data but still
  // contribute valid W/L records, draft picks, and H2H matchup history.
  // The DNA scoring functions weight recent seasons more heavily via recency
  // multipliers, so early seasons don't distort current behavioral profiles.
  const ANALYSIS_SEASONS = cachedSeasons; // full 2009-2026 history

  // memberId → accumulated data
  const managerMap = new Map<string, ManagerRawData>();

  function getOrCreate(memberId: string, displayName: string): ManagerRawData {
    if (!managerMap.has(memberId)) {
      managerMap.set(memberId, {
        memberId,
        ownerName: displayName,
        seasonRecords: [],
        txnSeasons: [],
        draftPicks: [],
        h2hVsRod: { wins: 0, losses: 0 },
        currentSeason: null,
      });
    }
    return managerMap.get(memberId)!;
  }

  // Focal manager memberId (H2H tracking vs each opponent). Profile selection only — no name heuristics.
  let focalMemberId: string | null = null;
  if (userId != null) {
    const co = await resolveCurrentOwner({ id: userId });
    if (co.isSetupComplete) focalMemberId = co.ownerId;
  }

  for (const season of ANALYSIS_SEASONS) {
    const row = await getCachedView(season, "combined", undefined, { userId });
    if (!row) continue;
    const data = row.payload as Record<string, unknown>;

    const members = (data.members as Record<string, unknown>[]) ?? [];
    const teams = (data.teams as Record<string, unknown>[]) ?? [];
    const schedule = (data.schedule as Record<string, unknown>[]) ?? [];

    // teamId → memberId
    const teamToMember = new Map<number, string>();
    for (const team of teams) {
      const primaryOwner = (team.primaryOwner as string) || ((team.owners as string[])?.[0] ?? "");
      if (primaryOwner) teamToMember.set(team.id as number, primaryOwner);
    }

    // Season records + txn
    for (const team of teams) {
      const memberId = teamToMember.get(team.id as number);
      if (!memberId) continue;

      const memberInfo = members.find((m) => m.id === memberId) as Record<string, unknown> | undefined;
      const displayName = [memberInfo?.firstName, memberInfo?.lastName].filter(Boolean).join(" ") ||
        (memberInfo?.displayName as string) || memberId;

      const mgr = getOrCreate(memberId, displayName);

      const overall = (team.record as Record<string, unknown>)?.overall as Record<string, unknown> | undefined;
      const wins = (overall?.wins as number) ?? 0;
      const losses = (overall?.losses as number) ?? 0;
      const ties = (overall?.ties as number) ?? 0;
      const pf = (team.points as number) ?? 0;
      const pa = (overall?.pointsAgainst as number) ?? 0;
      const playoffSeed = (team.playoffSeed as number) ?? 0;
      const madePlayoffs = playoffSeed > 0 && playoffSeed <= 7;

      const tc = (team.transactionCounter as Record<string, unknown>) ?? {};

      mgr.seasonRecords.push({
        season, wins, losses, ties, pf, pa,
        rank: (team.rankCalculatedFinal as number) ?? (team.rankFinal as number) ?? 0,
        madePlayoffs,
        isChampion: false, // simplified — set below if needed
      });
      mgr.txnSeasons.push({
        season,
        acquisitions: (tc.acquisitions as number) ?? 0,
        drops: (tc.drops as number) ?? 0,
        trades: (tc.trades as number) ?? 0,
      });
    }

    // Draft picks
    const draftDetail = data.draftDetail as Record<string, unknown> | undefined;
      const picks = (draftDetail?.picks as Record<string, unknown>[]) ?? [];
      for (const pick of picks) {
        const teamId = (pick.teamId as number);
        const memberId = teamToMember.get(teamId);
        if (!memberId) continue;
        const mgr = managerMap.get(memberId);
        if (!mgr) continue;

        const posId = (pick.playerInfo as Record<string, unknown>)?.defaultPositionId as number;
        const position = POS_MAP[posId] ?? "?";
        const round = (pick.roundId as number) ?? 0;
        const truth = classifyDraftPickRawPick(pick);
        if (round > 0 && position !== "?") {
          mgr.draftPicks.push({
            season,
            roundId: round,
            position,
            keeper: truth.espnKeeper,
            draftedForAnalytics: truth.draftedForAnalytics,
            keeperSlot: truth.keeperSlot,
            retained: truth.retained,
            reservedForKeeper: truth.espnReservedForKeeper,
          });
        }
      }

    // H2H vs focal manager from regular-season schedule
    if (focalMemberId) {
      const regularSeason = schedule.filter(
        (m) => (!m.playoffTierType || m.playoffTierType === "NONE") && m.winner && m.winner !== "UNDECIDED"
      ) as Record<string, unknown>[];

      for (const matchup of regularSeason) {
        const homeTeamId = (matchup.home as Record<string, unknown>)?.teamId as number;
        const awayTeamId = (matchup.away as Record<string, unknown>)?.teamId as number;
        if (!homeTeamId || !awayTeamId) continue;

        const homeMember = teamToMember.get(homeTeamId);
        const awayMember = teamToMember.get(awayTeamId);
        if (!homeMember || !awayMember) continue;

        const focalIsHome = homeMember === focalMemberId;
        const focalIsAway = awayMember === focalMemberId;
        if (!focalIsHome && !focalIsAway) continue;

        const opponentMemberId = focalIsHome ? awayMember : homeMember;
        const opponent = managerMap.get(opponentMemberId);
        if (!opponent) continue;

        const focalWon =
          (focalIsHome && matchup.winner === "HOME") ||
          (focalIsAway && matchup.winner === "AWAY");

        if (focalWon) {
          opponent.h2hVsRod.losses++;
        } else {
          opponent.h2hVsRod.wins++;
        }
      }
    }
  }

  return Array.from(managerMap.values());
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const dnaRouter = router({

  /**
   * Full League DNA — all managers profiled from 18 seasons of data.
   * Sorted by exploitability score descending (most exploitable first).
   * Results are compute-intensive on first call; subsequent calls are fast
   * because ESPN data is already cached in DB.
   */
  leagueProfiles: publicProcedure.query(async ({ ctx }) => {
    const focalLabel = await focalH2hLabelForUser(ctx.user?.id);
    const managers = await buildManagerRawData(ctx.user?.id);
    const dnaProfiles = calcLeagueDNA(managers, focalLabel);
    return dnaProfiles;
  }),

  /**
   * Single manager DNA profile by memberId.
   */
  managerProfile: publicProcedure
    .input(z.object({ memberId: z.string() }))
    .query(async ({ ctx, input }) => {
      const focalLabel = await focalH2hLabelForUser(ctx.user?.id);
      const managers = await buildManagerRawData(ctx.user?.id);
      const allPicks: DraftPickRecord[] = managers.flatMap(m => m.draftPicks);
      const manager = managers.find(m => m.memberId === input.memberId);
      if (!manager) return null;
      return calcManagerDNA(manager, allPicks, focalLabel);
    }),

  /**
   * Live trade desperation scores for all managers.
   * Pass current-season state for accurate scoring.
   *
   * The client should pass currentSeason data from the live ESPN rosters endpoint.
   * If not provided, returns history-based exploitability scores only.
   */
  desperationScores: publicProcedure
    .input(z.object({
      currentWeek: z.number().default(1),
      leagueAvgScore: z.number().default(130),
      // Array of current-season state per manager
      managerStates: z.array(z.object({
        memberId: z.string(),
        currentWins: z.number(),
        currentLosses: z.number(),
        recentAcquisitions: z.number().default(0),
        recentTrades: z.number().default(0),
        lastWeekScore: z.number().default(130),
      })).optional().default([]),
    }))
    .query(async ({ ctx, input }) => {
      const focalLabel = await focalH2hLabelForUser(ctx.user?.id);
      const managers = await buildManagerRawData(ctx.user?.id);
      const allPicks: DraftPickRecord[] = managers.flatMap(m => m.draftPicks);

      const results = managers.map(mgr => {
        const dna = calcManagerDNA(mgr, allPicks, focalLabel);
        const state = input.managerStates.find(s => s.memberId === mgr.memberId);

        const currentSeason = state ? {
          season: 2025,
          currentWins: state.currentWins,
          currentLosses: state.currentLosses,
          currentWeek: input.currentWeek,
          recentAcquisitions: state.recentAcquisitions,
          recentTrades: state.recentTrades,
          lastWeekScore: state.lastWeekScore,
          leagueAvgScore: input.leagueAvgScore,
        } : null;

        const desperation = calcTradeDesperationScore(dna, currentSeason);
        return { dna, desperation };
      });

      return results.sort((a, b) => b.desperation.desperationScore - a.desperation.desperationScore);
    }),

  /**
   * Is now a good time to trade with a specific manager?
   * Returns a single actionable verdict for the Trade Offer Generator.
   */
  tradeWindow: publicProcedure
    .input(z.object({
      memberId: z.string(),
      currentWins: z.number(),
      currentLosses: z.number(),
      currentWeek: z.number(),
      recentAcquisitions: z.number().default(0),
      recentTrades: z.number().default(0),
      lastWeekScore: z.number().default(130),
      leagueAvgScore: z.number().default(130),
    }))
    .query(async ({ ctx, input }) => {
      const focalLabel = await focalH2hLabelForUser(ctx.user?.id);
      const managers = await buildManagerRawData(ctx.user?.id);
      const allPicks: DraftPickRecord[] = managers.flatMap(m => m.draftPicks);
      const manager = managers.find(m => m.memberId === input.memberId);
      if (!manager) return null;

      const dna = calcManagerDNA(manager, allPicks, focalLabel);
      const desperation = calcTradeDesperationScore(dna, {
        season: 2025,
        currentWins: input.currentWins,
        currentLosses: input.currentLosses,
        currentWeek: input.currentWeek,
        recentAcquisitions: input.recentAcquisitions,
        recentTrades: input.recentTrades,
        lastWeekScore: input.lastWeekScore,
        leagueAvgScore: input.leagueAvgScore,
      });

      return { dna, desperation };
    }),

  /**
   * Exploit opportunity board — ranked list of opponents by combined DNA + desperation edge.
   * Combines historical exploitability with live desperation.
   *
   * Use in the Command Center War Room as the "Trade Targets" panel.
   */
  exploitBoard: publicProcedure
    .input(z.object({
      currentWeek: z.number().default(1),
      leagueAvgScore: z.number().default(130),
      managerStates: z.array(z.object({
        memberId: z.string(),
        currentWins: z.number(),
        currentLosses: z.number(),
        lastWeekScore: z.number().default(130),
        recentAcquisitions: z.number().default(0),
        recentTrades: z.number().default(0),
      })).optional().default([]),
    }))
    .query(async ({ ctx, input }) => {
      const focalLabel = await focalH2hLabelForUser(ctx.user?.id);
      const managers = await buildManagerRawData(ctx.user?.id);
      const allPicks: DraftPickRecord[] = managers.flatMap(m => m.draftPicks);

      const board = managers.map(mgr => {
        const dna = calcManagerDNA(mgr, allPicks, focalLabel);
        const state = input.managerStates.find(s => s.memberId === mgr.memberId);

        const currentSeason = state ? {
          season: 2025,
          currentWins: state.currentWins,
          currentLosses: state.currentLosses,
          currentWeek: input.currentWeek,
          recentAcquisitions: state.recentAcquisitions,
          recentTrades: state.recentTrades,
          lastWeekScore: state.lastWeekScore,
          leagueAvgScore: input.leagueAvgScore,
        } : null;

        const desperation = calcTradeDesperationScore(dna, currentSeason);

        // Combined edge score: DNA exploitability + live desperation
        const edgeScore = Math.round(
          (dna.exploitabilityScore * 0.5) + (desperation.desperationScore * 0.5)
        );

        return {
          memberId: mgr.memberId,
          ownerName: mgr.ownerName,
          gmArchetype: dna.gmArchetype,
          exploitabilityScore: dna.exploitabilityScore,
          exploitabilityLabel: dna.exploitabilityLabel,
          desperationScore: desperation.desperationScore,
          desperationLabel: desperation.desperationLabel,
          windowOpen: desperation.windowOpen,
          edgeScore,
          topExploit: dna.exploitWindows[0] ?? "No strong exploit detected.",
          actionableNote: desperation.actionableNote,
          draftBias: dna.draft.biasVsLeague,
          tiltLabel: dna.tilt.tiltLabel,
          h2hVsRod: dna.trade.h2hVsRod,
        };
      });

      return board.sort((a, b) => b.edgeScore - a.edgeScore);
    }),

  /**
   * DNA prompt block — returns a pre-formatted string for direct injection
   * into any AI system prompt. Used by Trade Offer Generator and GM Advisor.
   */
  promptBlock: publicProcedure
    .input(z.object({
      memberIds: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const focalLabel = await focalH2hLabelForUser(ctx.user?.id);
      const managers = await buildManagerRawData(ctx.user?.id);
      const dnaProfiles = calcLeagueDNA(managers, focalLabel);
      return buildDNAPromptBlock(dnaProfiles, input.memberIds);
    }),
});
