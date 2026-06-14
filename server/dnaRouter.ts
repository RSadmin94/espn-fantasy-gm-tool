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
import { router, publicProcedure, isUserEntitled } from "./_core/trpc";
import { getCachedView, getAllCachedSeasons, resolveActiveLeagueId } from "./db";
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
import { buildLeagueDnaProfile } from "./leagueDnaProfile";
import { gateLeagueDna } from "./leagueIntelGating";
import { computeAllTrophyHistory } from "./championshipHistoryBuilder";
import { careerSimGrades } from "./draftGradeForDna";
import { signReceipt, verifyReceipt } from "./receiptToken";

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
        season, teamName: (team.name as string) ?? "", wins, losses, ties, pf, pa,
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
   * Focal owner's "Your League DNA" profile: a screenshotable card (archetype,
   * primary trait, blind spot, League Twin, A-F scorecard) plus the full dossier.
   * Free users get the card only; the dossier is gated server-side. Returns null
   * until the owner profile is set up.
   */
  myProfile: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) return null;
    const co = await resolveCurrentOwner({ id: ctx.user.id });
    if (!co.isSetupComplete || !co.ownerId) return null;
    const focalLabel = await focalH2hLabelForUser(ctx.user.id);
    const managers = await buildManagerRawData(ctx.user.id);
    const allDna = calcLeagueDNA(managers, focalLabel);
    const focalName = allDna.find((d) => d.memberId === co.ownerId)?.ownerName ?? "";

    // Draft-only ("no moves after draft day") grade from the existing Draft Reality
    // engine, aggregated across seasons that have weekly coverage. Null where the
    // league has no covered seasons (e.g. deep pre-2018 history) - then Drafting
    // falls back to the style-based grade inside buildLeagueDnaProfile.
    let sim = null;
    let trophyByMember = new Map<string, { championships: number; championshipYears: number[]; runnerUps: number; thirdPlaceFinishes: number }>();
    try {
      const { leagueId } = await resolveActiveLeagueId({ user: { id: ctx.user.id } }, null);
      if (leagueId && leagueId !== "default") {
        sim = await careerSimGrades(leagueId, co.ownerId, focalName);
      }
      const trophy = await computeAllTrophyHistory(undefined, ctx.user.id);
      trophyByMember = new Map(Array.from(trophy, ([k, v]) => [k, { championships: v.championships, championshipYears: v.championshipYears, runnerUps: v.runnerUps, thirdPlaceFinishes: v.thirdPlaceFinishes }]));
    } catch {
      // leave sim/trophy empty - style-based fallback
    }

    const profile = buildLeagueDnaProfile({ allDna, focalMemberId: co.ownerId, managers, sim, trophyByMember });
    if (!profile) return null;
    return gateLeagueDna(profile, isUserEntitled(ctx.user));
  }),

  /**
   * The Cast - the whole current league's identity layer (archetype, receipt,
   * identity rank, badges) for the shareable "movie poster" surface. Free/identity
   * only: no paid dossier fields are returned. Reuses the myProfile pipeline.
   */
  leagueCast: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) return null;
    const focalLabel = await focalH2hLabelForUser(ctx.user.id);
    const managers = await buildManagerRawData(ctx.user.id);
    if (managers.length === 0) return null;
    const allDna = calcLeagueDNA(managers, focalLabel);
    const latestSeason = Math.max(0, ...managers.flatMap((m) => m.seasonRecords.map((r) => r.season)));

    let trophyByMember = new Map<string, { championships: number; championshipYears: number[]; runnerUps: number; thirdPlaceFinishes: number }>();
    let trophyRaw = new Map<string, { name: string; championships: number; championshipYears: number[] }>();
    let leagueName = "Your League";
    try {
      const trophy = await computeAllTrophyHistory(undefined, ctx.user.id);
      trophyByMember = new Map(Array.from(trophy, ([k, v]) => [k, { championships: v.championships, championshipYears: v.championshipYears, runnerUps: v.runnerUps, thirdPlaceFinishes: v.thirdPlaceFinishes }]));
      trophyRaw = new Map(Array.from(trophy, ([k, v]) => [k, { name: v.name, championships: v.championships, championshipYears: v.championshipYears }]));
      const row = latestSeason ? await getCachedView(latestSeason, "combined", undefined, { userId: ctx.user.id }) : null;
      const nm = (row?.payload as Record<string, unknown> | undefined)?.settings as Record<string, unknown> | undefined;
      if (nm?.name) leagueName = String(nm.name);
    } catch { /* best-effort name + trophies */ }

    const co = await resolveCurrentOwner({ id: ctx.user.id });
    const focalId = co.isSetupComplete ? co.ownerId : null;
    const currentIds = new Set(
      managers.filter((m) => m.seasonRecords.some((r) => r.season === latestSeason)).map((m) => m.memberId),
    );

    const cast = allDna
      .filter((d) => currentIds.has(d.memberId))
      .map((d) => {
        const prof = buildLeagueDnaProfile({ allDna, focalMemberId: d.memberId, managers, trophyByMember });
        if (!prof) return null;
        return {
          memberId: d.memberId,
          ownerName: prof.ownerName,
          archetype: prof.archetype,
          archetypeReceipt: prof.archetypeReceipt,
          identityRank: prof.identityRank,
          badges: prof.badges,
          isYou: d.memberId === focalId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Champions who are no longer in the current league - so The Cast never erases a
    // title-holder. Sourced from the same authority (person-merged), keyed off currentIds.
    const pastChampions = [...trophyRaw.entries()]
      .filter(([memberId, t]) => t.championships >= 1 && !currentIds.has(memberId))
      .map(([memberId, t]) => ({ memberId, ownerName: t.name, championships: t.championships, championshipYears: [...t.championshipYears].sort((a, b) => a - b) }))
      .sort((a, b) => b.championships - a.championships || a.ownerName.localeCompare(b.ownerName));

    return { leagueName, season: latestSeason, cast, pastChampions };
  }),

  /**
   * Create a shareable, frozen DNA Receipt token for a current-league member
   * (defaults to the signed-in user's own card). Stateless + HMAC-signed - no DB.
   */
  createReceipt: publicProcedure
    .input(z.object({ memberId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new Error("Sign in to create a Receipt.");
      const managers = await buildManagerRawData(ctx.user.id);
      if (managers.length === 0) throw new Error("No league data to build a Receipt yet.");
      const allDna = calcLeagueDNA(managers);
      const latestSeason = Math.max(0, ...managers.flatMap((m) => m.seasonRecords.map((r) => r.season)));
      const co = await resolveCurrentOwner({ id: ctx.user.id });
      const targetId = input?.memberId || (co.isSetupComplete ? co.ownerId : null);
      if (!targetId) throw new Error("Finish setup to create your Receipt.");

      let trophyByMember = new Map<string, { championships: number; championshipYears: number[]; runnerUps: number; thirdPlaceFinishes: number }>();
      let trophyRaw = new Map<string, { name: string; championships: number; championshipYears: number[] }>();
      let leagueName = "Your League";
      try {
        const trophy = await computeAllTrophyHistory(undefined, ctx.user.id);
        trophyByMember = new Map(Array.from(trophy, ([k, v]) => [k, { championships: v.championships, championshipYears: v.championshipYears, runnerUps: v.runnerUps, thirdPlaceFinishes: v.thirdPlaceFinishes }]));
        trophyRaw = new Map(Array.from(trophy, ([k, v]) => [k, { name: v.name, championships: v.championships, championshipYears: v.championshipYears }]));
        const row = latestSeason ? await getCachedView(latestSeason, "combined", undefined, { userId: ctx.user.id }) : null;
        const nm = (row?.payload as Record<string, unknown> | undefined)?.settings as Record<string, unknown> | undefined;
        if (nm?.name) leagueName = String(nm.name);
      } catch { /* best-effort league name + trophies */ }

      const prof = buildLeagueDnaProfile({ allDna, focalMemberId: targetId, managers, trophyByMember });
      if (!prof) throw new Error("Couldn't build a Receipt for that manager.");
      const tr = trophyRaw.get(targetId);
      const token = signReceipt({
        v: 1,
        mid: targetId,
        nm: prof.ownerName,
        lg: leagueName,
        ar: prof.archetype,
        rc: prof.archetypeReceipt,
        rk: prof.identityRank ? [prof.identityRank.rank, prof.identityRank.of] : null,
        bd: prof.badges.map((b) => ({ l: b.label, t: b.tier })),
        ch: tr?.championships ?? 0,
        cy: (tr?.championshipYears ?? []).slice().sort((a, b) => a - b),
        ts: Math.floor(Date.now() / 1000),
      });
      return { token };
    }),

  /**
   * Public (no-auth) read of a frozen DNA Receipt token. Powers /p/:token.
   */
  getReceipt: publicProcedure
    .input(z.object({ token: z.string().max(4096) }))
    .query(({ input }) => {
      const p = verifyReceipt(input.token);
      if (!p) return { valid: false as const };
      return {
        valid: true as const,
        receipt: {
          memberId: p.mid,
          ownerName: p.nm,
          leagueName: p.lg,
          archetype: p.ar,
          archetypeReceipt: p.rc,
          identityRank: p.rk ? { rank: p.rk[0], of: p.rk[1] } : null,
          badges: p.bd.map((b) => ({ label: b.l, tier: b.t })),
          championships: p.ch,
          championshipYears: p.cy,
          dateISO: new Date(p.ts * 1000).toISOString(),
        },
      };
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
