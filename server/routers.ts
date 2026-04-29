import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import {
  fetchEspnViews,
  normalizeSettings,
  normalizeTeams,
  normalizeRosters,
  normalizeDraftPicks,
  normalizeDraftOrder,
  normalizeMatchups,
  normalizeTransactions,
  resolveUnknownPlayerIds,
} from "./espnService";
import {
  getCachedView,
  upsertCachedView,
  getAllCachedSeasons,
  getRefreshManifests,
  upsertRefreshManifest,
  getChatHistory,
  addChatMessage,
  clearChatHistory,
} from "./db";

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || "457622";
const ALL_SEASONS = [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];

async function getSeasonData(season: number) {
  const cached = await getCachedView(season, "combined");
  if (cached) return cached.payload as Record<string, unknown>;
  return null;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  espn: router({
    refresh: protectedProcedure
      .input(z.object({ season: z.number().optional(), seasons: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const seasonsToRefresh = input.seasons ?? (input.season ? [input.season] : [ALL_SEASONS[ALL_SEASONS.length - 1]]);
        const results: Record<number, { status: string; error?: string }> = {};
        for (const season of seasonsToRefresh) {
          try {
            const views = ["mSettings","mTeam","mRoster","mMatchup","mMatchupScore","mScoreboard","mSchedule","mStandings","mStatus","mDraftDetail","mTransactions2"];
            const data = await fetchEspnViews(season, views);
            await upsertCachedView(season, "combined", data);
            const teams = normalizeTeams(data);
            const rosters = normalizeRosters(data);
            const matchups = normalizeMatchups(data);
            const picks = normalizeDraftPicks(data);
            const txs = normalizeTransactions(data);
            await upsertRefreshManifest(season, {
              teamCount: teams.length, rosterCount: rosters.length,
              matchupCount: matchups.length, draftPickCount: picks.length,
              transactionCount: txs.length, status: "success", viewsRefreshed: views,
            });
            results[season] = { status: "success" };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await upsertRefreshManifest(season, { status: "failed", errorMessage: msg });
            results[season] = { status: "failed", error: msg };
          }
        }
        return results;
      }),

    manifests: publicProcedure.query(async () => getRefreshManifests()),
    cachedSeasons: publicProcedure.query(async () => getAllCachedSeasons()),
    allSeasons: publicProcedure.query(() => ALL_SEASONS),

    settings: publicProcedure
      .input(z.object({ season: z.number() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return null;
        return normalizeSettings(data);
      }),

    teams: publicProcedure
      .input(z.object({ season: z.number() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return [];
        return normalizeTeams(data);
      }),

    standings: publicProcedure
      .input(z.object({ season: z.number() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return [];
        const teams = normalizeTeams(data);
        return teams.sort((a, b) => ((a.rankFinal as number) || 99) - ((b.rankFinal as number) || 99));
      }),

    rosters: publicProcedure
      .input(z.object({ season: z.number(), teamId: z.number().optional() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return [];
        const rosters = normalizeRosters(data);
        if (input.teamId !== undefined) return rosters.filter((r: unknown) => (r as Record<string, unknown>).teamId === input.teamId);
        return rosters;
      }),

    draftPicks: publicProcedure
      .input(z.object({ season: z.number(), teamId: z.number().optional() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return [];
        const rawPicks = normalizeDraftPicks(data) as unknown[];
        // Resolve any player IDs that weren't in the roster map
        const unknownIds = rawPicks
          .filter((p: unknown) => !(p as Record<string, unknown>).playerName)
          .map((p: unknown) => (p as Record<string, unknown>).playerId as number)
          .filter(Boolean);
        let picks: unknown[] = rawPicks;
        if (unknownIds.length > 0) {
          const resolved = await resolveUnknownPlayerIds(unknownIds);
          picks = rawPicks.map((p: unknown) => {
            const pick = p as Record<string, unknown>;
            if (!pick.playerName && resolved.has(pick.playerId as number)) {
              const info = resolved.get(pick.playerId as number)!;
              return { ...pick, playerName: info.name, position: pick.position === "?" ? info.position : pick.position };
            }
            return pick;
          });
        }
        if (input.teamId !== undefined) return picks.filter((p: unknown) => (p as Record<string, unknown>).teamId === input.teamId);
        return picks;
      }),

    matchups: publicProcedure
      .input(z.object({ season: z.number(), matchupPeriodId: z.number().optional() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return [];
        const matchups = normalizeMatchups(data);
        if (input.matchupPeriodId !== undefined) return matchups.filter((m: unknown) => (m as Record<string, unknown>).matchupPeriodId === input.matchupPeriodId);
        return matchups;
      }),

    transactions: publicProcedure
      .input(z.object({ season: z.number(), teamId: z.number().optional() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return [];
        const txs = normalizeTransactions(data);
        if (input.teamId !== undefined) return txs.filter((t: unknown) => (t as Record<string, unknown>).teamId === input.teamId);
        return txs;
      }),

    allStandings: publicProcedure.query(async () => {
      const cachedSeasons = await getAllCachedSeasons();
      const result: Record<number, unknown[]> = {};
      for (const season of cachedSeasons) {
        const data = await getSeasonData(season);
        if (data) {
          const teams = normalizeTeams(data);
          result[season] = teams.sort((a, b) => ((a.rankFinal as number) || 99) - ((b.rankFinal as number) || 99));
        }
      }
      return result;
    }),

    freeAgents: publicProcedure
      .input(z.object({ season: z.number() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return [];
        const players = (data.players as Record<string, unknown>[]) || [];
        const POS_MAP: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
        return players
          .filter((fa) => !fa.onTeamId || fa.onTeamId === 0)
          .map((fa) => {
            const entry = (fa.playerPoolEntry as Record<string, unknown>) || fa;
            const player = (entry.player as Record<string, unknown>) || {};
            return {
              playerId: player.id || fa.id,
              playerName: player.fullName || player.name || String(fa.id),
              position: player.defaultPositionId || 0,
              positionLabel: POS_MAP[player.defaultPositionId as number] || "?",
              proTeamId: player.proTeamId,
              percentOwned: Number((entry.percentOwned as number) || 0),
              projectedTotal: null,
            };
          })
          .filter((p) => p.playerName && p.playerName !== String(p.playerId))
          .slice(0, 100);
      }),

    keeperHistory: publicProcedure.query(async () => {
      const cachedSeasons = await getAllCachedSeasons();
      const keepers: unknown[] = [];
      for (const season of cachedSeasons) {
        const data = await getSeasonData(season);
        if (!data) continue;
        const picks = normalizeDraftPicks(data);
        for (const pick of picks) {
          const p = pick as Record<string, unknown>;
          if (p.keeper) keepers.push(p);
        }
      }
      return keepers;
    }),

    draftOrder: publicProcedure
      .input(z.object({ season: z.number() }))
      .query(async ({ input }) => {
        const data = await getSeasonData(input.season);
        if (!data) return null;
        return normalizeDraftOrder(data);
      }),

    keeperAnalysis: publicProcedure.query(async () => {
      // Build keeper eligibility per team with 2-consecutive-year rule
      const cachedSeasons = (await getAllCachedSeasons()).sort((a, b) => a - b);
      // Map: teamId -> list of { season, playerId, playerName, position, roundId }
      const keepersByTeam: Record<number, Array<{ season: number; playerId: number; playerName: string; position: string; roundId: number; teamName: string }>> = {};

      for (const season of cachedSeasons) {
        const data = await getSeasonData(season);
        if (!data) continue;
        const picks = normalizeDraftPicks(data);
        for (const pick of picks) {
          const p = pick as Record<string, unknown>;
          if (!p.keeper) continue;
          const tid = p.teamId as number;
          if (!keepersByTeam[tid]) keepersByTeam[tid] = [];
          keepersByTeam[tid].push({
            season: p.season as number,
            playerId: p.playerId as number,
            playerName: (p.playerName as string) || `Player #${p.playerId}`,
            position: p.position as string,
            roundId: p.roundId as number,
            teamName: p.teamName as string,
          });
        }
      }

      // For each team, determine which players were kept in consecutive years
      // A player kept in year N AND year N-1 has been kept 2 years in a row → NOT eligible in year N+1
      const latestSeason = cachedSeasons[cachedSeasons.length - 1] ?? 2025;
      const nextSeason = latestSeason + 1;

      const result: Array<{
        teamId: number;
        teamName: string;
        keeperHistory: Array<{ season: number; playerName: string; position: string; roundId: number; consecutiveYears: number }>;
        ineligibleForNext: string[];
        eligibleForNext: Array<{ playerName: string; position: string; roundId: number; consecutiveYears: number; mustReturn: boolean }>;
      }> = [];

      // Get current season rosters for eligible player list
      const currentData = await getSeasonData(latestSeason);
      const currentRosters = currentData ? normalizeRosters(currentData) : [];
      const currentTeams = currentData ? normalizeTeams(currentData) : [];

      for (const team of currentTeams) {
        const tid = team.teamId as number;
        const tname = team.teamName as string;
        const teamKeepers = (keepersByTeam[tid] || []).sort((a, b) => a.season - b.season);

        // Build consecutive year counts for each player
        const playerConsecutive: Record<number, number> = {};
        for (const k of teamKeepers) {
          const pid = k.playerId;
          // Check if this player was also kept the previous year
          const prevYearKeeper = teamKeepers.find(prev => prev.season === k.season - 1 && prev.playerId === pid);
          if (prevYearKeeper) {
            playerConsecutive[pid] = (playerConsecutive[pid] || 1) + 1;
          } else {
            playerConsecutive[pid] = 1;
          }
        }

        // Players kept in the latest season
        const latestKeepers = teamKeepers.filter(k => k.season === latestSeason);
        const ineligible: string[] = [];
        const eligible: Array<{ playerName: string; position: string; roundId: number; consecutiveYears: number; mustReturn: boolean }> = [];

        for (const k of latestKeepers) {
          const consec = playerConsecutive[k.playerId] || 1;
          if (consec >= 2) {
            ineligible.push(k.playerName);
          } else {
            eligible.push({
              playerName: k.playerName,
              position: k.position,
              roundId: k.roundId,
              consecutiveYears: consec,
              mustReturn: false,
            });
          }
        }

        result.push({
          teamId: tid,
          teamName: tname,
          keeperHistory: teamKeepers.map(k => ({
            season: k.season,
            playerName: k.playerName,
            position: k.position,
            roundId: k.roundId,
            consecutiveYears: playerConsecutive[k.playerId] || 1,
          })),
          ineligibleForNext: ineligible,
          eligibleForNext: eligible,
        });
      }

      return { latestSeason, nextSeason, teams: result };
    }),
    keeperEligibility2026: publicProcedure.query(async () => {
      // Full 2026 keeper eligibility calculator with 2-consecutive-year rule enforcement
      // Rule: a player kept in BOTH 2024 AND 2025 must return to the draft pool in 2026
      // Round cost: if kept in round R in 2025, cost to keep in 2026 = R - 1
      const cachedSeasons = (await getAllCachedSeasons()).sort((a, b) => a - b);

      // Build per-team, per-player keeper history across all seasons
      const keepersByPlayerByTeam: Record<number, Record<number, Array<{ season: number; roundId: number; playerName: string; position: string }>>> = {};
      const teamNames: Record<number, string> = {};

      for (const season of cachedSeasons) {
        const data = await getSeasonData(season);
        if (!data) continue;
        const picks = normalizeDraftPicks(data);
        for (const pick of picks) {
          const p = pick as Record<string, unknown>;
          if (!p.keeper) continue;
          const tid = p.teamId as number;
          const pid = p.playerId as number;
          if (!keepersByPlayerByTeam[tid]) keepersByPlayerByTeam[tid] = {};
          if (!keepersByPlayerByTeam[tid][pid]) keepersByPlayerByTeam[tid][pid] = [];
          keepersByPlayerByTeam[tid][pid].push({
            season: p.season as number,
            roundId: p.roundId as number,
            playerName: (p.playerName as string) || `Player#${pid}`,
            position: (p.position as string) || "?",
          });
          teamNames[tid] = (p.teamName as string) || `Team ${tid}`;
        }
      }

      // Get 2025 keepers as the baseline for 2026 eligibility
      const latestSeason = 2025;
      const data2025 = await getSeasonData(latestSeason);
      const data2024 = await getSeasonData(2024);
      const teams2025 = data2025 ? normalizeTeams(data2025) : [];

      // Build 2024 keeper set: playerId -> roundId (for consecutive check)
      const keepers2024: Record<number, Record<number, number>> = {}; // teamId -> playerId -> roundId
      if (data2024) {
        const picks2024 = normalizeDraftPicks(data2024);
        for (const pick of picks2024) {
          const p = pick as Record<string, unknown>;
          if (!p.keeper) continue;
          const tid = p.teamId as number;
          const pid = p.playerId as number;
          if (!keepers2024[tid]) keepers2024[tid] = {};
          keepers2024[tid][pid] = p.roundId as number;
        }
      }

      // Build 2025 keeper set
      const keepers2025: Record<number, Array<{ playerId: number; playerName: string; position: string; roundId: number }>> = {};
      if (data2025) {
        const picks2025 = normalizeDraftPicks(data2025);
        for (const pick of picks2025) {
          const p = pick as Record<string, unknown>;
          if (!p.keeper) continue;
          const tid = p.teamId as number;
          if (!keepers2025[tid]) keepers2025[tid] = [];
          keepers2025[tid].push({
            playerId: p.playerId as number,
            playerName: (p.playerName as string) || `Player#${p.playerId}`,
            position: (p.position as string) || "?",
            roundId: p.roundId as number,
          });
        }
      }

      // Value tier: compare keeper round cost vs estimated draft value
      function valueTier(position: string, roundCost: number): { tier: string; label: string } {
        // Rough 2026 ADP tiers by position
        const adpRound: Record<string, number> = {
          QB: 6, RB: 3, WR: 3, TE: 5, K: 14, DEF: 13,
        };
        const pos = position?.toUpperCase() || "";
        const adp = adpRound[pos] ?? 7;
        const savings = adp - roundCost;
        if (savings >= 4) return { tier: "elite", label: "Elite Value" };
        if (savings >= 2) return { tier: "good", label: "Good Value" };
        if (savings >= 0) return { tier: "fair", label: "Fair Value" };
        return { tier: "poor", label: "Poor Value" };
      }

      const teamResults = teams2025.map(team => {
        const tid = team.teamId as number;
        const tname = (team.teamName as string) || teamNames[tid] || `Team ${tid}`;
        const my2025Keepers = keepers2025[tid] || [];
        const my2024Keepers = keepers2024[tid] || {};

        const players = my2025Keepers.map(k => {
          const keptIn2024 = my2024Keepers[k.playerId] !== undefined;
          const isIneligible = keptIn2024; // kept in both 2024 and 2025 = 2 consecutive years
          const roundCost2026 = k.roundId - 1; // cost to keep = kept round - 1
          const consecutiveYears = keptIn2024 ? 2 : 1;
          const value = isIneligible ? { tier: "ineligible", label: "Must Return" } : valueTier(k.position, roundCost2026);
          return {
            playerId: k.playerId,
            playerName: k.playerName,
            position: k.position,
            round2025: k.roundId,
            round2024: keptIn2024 ? my2024Keepers[k.playerId] : null,
            roundCost2026: isIneligible ? null : roundCost2026,
            consecutiveYears,
            isIneligible,
            valueTier: value.tier,
            valueLabel: value.label,
          };
        });

        return {
          teamId: tid,
          teamName: tname,
          players,
          ineligibleCount: players.filter(p => p.isIneligible).length,
          eligibleCount: players.filter(p => !p.isIneligible).length,
        };
      });

      // League-wide summary
      const allIneligible = teamResults.flatMap(t =>
        t.players.filter(p => p.isIneligible).map(p => ({ ...p, teamName: t.teamName }))
      );
      const allEligible = teamResults.flatMap(t =>
        t.players.filter(p => !p.isIneligible).map(p => ({ ...p, teamName: t.teamName }))
      );

      return {
        season: 2026,
        deadline: "August 18, 2026",
        rule: "Players kept in 2024 AND 2025 (2 consecutive years) must return to the draft pool for 2026.",
        teams: teamResults,
        leagueSummary: {
          totalIneligible: allIneligible.length,
          totalEligible: allEligible.length,
          ineligiblePlayers: allIneligible,
          topValueKeepers: allEligible
            .filter(p => p.valueTier === "elite" || p.valueTier === "good")
            .sort((a, b) => (a.roundCost2026 ?? 99) - (b.roundCost2026 ?? 99)),
        },
      };
    }),
  }),

  playerProfiles: publicProcedure.query(async () => {
    // Aggregate per-player draft + keeper + transaction history across all cached seasons
    const cachedSeasons = (await getAllCachedSeasons()).sort((a, b) => a - b);

    const POS_MAP: Record<number, string> = {
      1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST", 17: "D/ST",
    };

    // Global player info map: playerId -> { name, position, proTeam }
    const playerInfoMap = new Map<number, { name: string; position: string; proTeam: string }>();
    // Per-season team name map: season -> teamId -> { name, ownerName }
    const teamNamesBySeason: Record<number, Record<number, { name: string; ownerName: string }>> = {};

    // Collect all unique picks (deduplicated by season+overallPickNumber)
    const seenPickKeys = new Set<string>();
    const allUniquePicks: Array<{
      season: number; round: number; pick: number; overallPick: number;
      playerId: number; teamId: number; isKeeper: boolean;
    }> = [];

    // Collect all transactions
    const allTxns: Array<{
      season: number; type: string; playerId: number;
      fromTeamId: number | null; toTeamId: number | null;
    }> = [];

    for (const season of cachedSeasons) {
      const data = await getSeasonData(season);
      if (!data) continue;

      // Build team name map for this season
      teamNamesBySeason[season] = {};
      const members: Record<string, Record<string, unknown>> = {};
      for (const m of (data.members as Record<string, unknown>[]) || []) {
        members[m.id as string] = m;
      }
      for (const t of (data.teams as Record<string, unknown>[]) || []) {
        const tid = t.id as number;
        const name = `${t.location || ""} ${t.nickname || ""}`.trim() || `Team ${tid}`;
        const owners = (t.owners as string[]) || [];
        const ownerName = owners
          .map((oid) => {
            const m = members[oid] || {};
            return `${m.firstName || ""} ${m.lastName || ""}`.trim();
          })
          .filter(Boolean)
          .join(", ");
        teamNamesBySeason[season][tid] = { name, ownerName };

        // Build player info from roster entries
        const entries = ((t.roster as Record<string, unknown>)?.entries as Record<string, unknown>[]) || [];
        for (const entry of entries) {
          const poolEntry = (entry.playerPoolEntry as Record<string, unknown>) || {};
          const player = (poolEntry.player as Record<string, unknown>) || {};
          const pid = player.id as number;
          if (pid && !playerInfoMap.has(pid)) {
            playerInfoMap.set(pid, {
              name: (player.fullName as string) || `Player ${pid}`,
              position: POS_MAP[player.defaultPositionId as number] || "?",
              proTeam: String(player.proTeamId || ""),
            });
          }
        }
      }

      // Extract unique draft picks
      const draft = (data.draftDetail as Record<string, unknown>) || {};
      const picks = (draft.picks as Record<string, unknown>[]) || [];
      for (const pick of picks) {
        const key = `${season}:${pick.overallPickNumber}`;
        if (seenPickKeys.has(key)) continue;
        seenPickKeys.add(key);
        allUniquePicks.push({
          season,
          round: pick.roundId as number,
          pick: pick.roundPickNumber as number,
          overallPick: pick.overallPickNumber as number,
          playerId: pick.playerId as number,
          teamId: pick.teamId as number,
          isKeeper: pick.keeper === true || pick.reservedForKeeper === true,
        });
      }

      // Extract transactions
      const txns = (data.transactions as Record<string, unknown>[]) || [];
      for (const tx of txns) {
        const items = (tx.items as Record<string, unknown>[]) || [];
        for (const item of items) {
          const pid = (item.playerId || (item.player as Record<string, unknown>)?.id) as number;
          if (!pid) continue;
          allTxns.push({
            season,
            type: tx.type as string,
            playerId: pid,
            fromTeamId: (item.fromTeamId as number) || null,
            toTeamId: (item.toTeamId as number) || null,
          });
        }
      }
    }

    // Build per-player profiles
    const playerMap = new Map<number, {
      playerId: number;
      playerName: string;
      position: string;
      draftHistory: Array<{ season: number; round: number; pick: number; overallPick: number; teamId: number; teamName: string; ownerName: string; isKeeper: boolean }>;
      keeperSeasons: number[];
      teamsBySeason: Record<number, { teamId: number; teamName: string; ownerName: string }>;
      firstSeen: number;
      lastSeen: number;
      totalDrafts: number;
      totalKeeperYears: number;
    }>();

    for (const pick of allUniquePicks) {
      const pid = pick.playerId;
      const info = playerInfoMap.get(pid);
      const teamInfo = teamNamesBySeason[pick.season]?.[pick.teamId] || { name: `Team ${pick.teamId}`, ownerName: "" };

      if (!playerMap.has(pid)) {
        playerMap.set(pid, {
          playerId: pid,
          playerName: info?.name || `Player ${pid}`,
          position: info?.position || "?",
          draftHistory: [],
          keeperSeasons: [],
          teamsBySeason: {},
          firstSeen: pick.season,
          lastSeen: pick.season,
          totalDrafts: 0,
          totalKeeperYears: 0,
        });
      }

      const p = playerMap.get(pid)!;
      if (info?.name) { p.playerName = info.name; p.position = info.position; }

      p.draftHistory.push({
        season: pick.season,
        round: pick.round,
        pick: pick.pick,
        overallPick: pick.overallPick,
        teamId: pick.teamId,
        teamName: teamInfo.name,
        ownerName: teamInfo.ownerName,
        isKeeper: pick.isKeeper,
      });

      if (pick.isKeeper) p.keeperSeasons.push(pick.season);
      p.teamsBySeason[pick.season] = { teamId: pick.teamId, teamName: teamInfo.name, ownerName: teamInfo.ownerName };
      p.firstSeen = Math.min(p.firstSeen, pick.season);
      p.lastSeen = Math.max(p.lastSeen, pick.season);
      p.totalDrafts++;
      if (pick.isKeeper) p.totalKeeperYears++;
    }

    // Build final profiles array with computed fields
    const profiles = Array.from(playerMap.values()).map((p) => {
      const rounds = p.draftHistory.map((d) => d.round);
      const avgRound = rounds.length > 0 ? Math.round((rounds.reduce((s, r) => s + r, 0) / rounds.length) * 10) / 10 : null;
      const roundTrend = p.draftHistory.length >= 2
        ? p.draftHistory[p.draftHistory.length - 1].round - p.draftHistory[0].round
        : 0;
      const uniqueTeams = Array.from(new Set(Object.values(p.teamsBySeason).map((t) => t.teamName)));
      const uniqueOwners = Array.from(new Set(Object.values(p.teamsBySeason).map((t) => t.ownerName).filter(Boolean)));
      const transactionCount = allTxns.filter((tx) => tx.playerId === p.playerId).length;

      return {
        ...p,
        draftHistory: p.draftHistory.sort((a, b) => a.season - b.season),
        avgDraftRound: avgRound,
        minRound: rounds.length > 0 ? Math.min(...rounds) : null,
        maxRound: rounds.length > 0 ? Math.max(...rounds) : null,
        roundTrend, // negative = rising value, positive = falling
        uniqueTeams,
        uniqueOwners,
        seasonsActive: p.lastSeen - p.firstSeen + 1,
        transactionCount,
        // League-wide prominence score: keeper years * 3 + total drafts + seasons active
        prominenceScore: p.totalKeeperYears * 3 + p.totalDrafts + (p.lastSeen - p.firstSeen),
      };
    });

    // Sort by prominence (most notable players first)
    profiles.sort((a, b) => b.prominenceScore - a.prominenceScore);

    return {
      profiles,
      totalPlayers: profiles.length,
      totalKeptPlayers: profiles.filter((p) => p.totalKeeperYears > 0).length,
      leagueStaples: profiles.filter((p) => p.totalDrafts >= 3).length,
      seasons: cachedSeasons,
    };
  }),

  ownerCareerStats: publicProcedure.query(async () => {
    const cachedSeasons = await getAllCachedSeasons();

    // ── Per-owner aggregated stats ──────────────────────────────────────────
    // memberId → owner profile
    const ownerMap = new Map<string, {
      memberId: string;
      firstName: string;
      lastName: string;
      displayName: string;
      // career totals
      totalWins: number;
      totalLosses: number;
      totalTies: number;
      totalPF: number;
      totalPA: number;
      playoffAppearances: number;
      championships: number;
      runnerUps: number;
      // season-by-season
      seasonRecords: Array<{
        season: number;
        teamName: string;
        wins: number;
        losses: number;
        ties: number;
        pf: number;
        pa: number;
        rank: number;
        playoffSeed: number;
        madePlayoffs: boolean;
        isChampion: boolean;
        isRunnerUp: boolean;
      }>;
      // head-to-head: opponentMemberId → { wins, losses, ties }
      h2h: Map<string, { wins: number; losses: number; ties: number }>;
      // transaction counters per season
      txnSeasons: Array<{
        season: number;
        acquisitions: number;
        drops: number;
        trades: number;
        moveToActive: number;
        moveToIR: number;
      }>;
    }>();

    // Helper: resolve member ID → owner entry, creating if needed
    function getOrCreateOwner(memberId: string, members: any[]) {
      if (!ownerMap.has(memberId)) {
        const m = members.find((x: any) => x.id === memberId) || {};
        ownerMap.set(memberId, {
          memberId,
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          displayName: m.displayName || memberId,
          totalWins: 0, totalLosses: 0, totalTies: 0,
          totalPF: 0, totalPA: 0,
          playoffAppearances: 0, championships: 0, runnerUps: 0,
          seasonRecords: [],
          h2h: new Map(),
          txnSeasons: [],
        });
      }
      return ownerMap.get(memberId)!;
    }

    for (const season of cachedSeasons) {
      const row = await getCachedView(season, 'combined');
      if (!row) continue;
      const data = row.payload as any;

      const members: any[] = data.members || [];
      const teams: any[] = data.teams || [];
      const schedule: any[] = data.schedule || [];
      const settings: any = data.settings || {};
      const playoffMatchupPeriodStart: number =
        (settings.scheduleSettings?.matchupPeriodCount ?? 14) + 1;

      // Build teamId → memberId map for this season
      const teamToMember = new Map<number, string>();
      for (const team of teams) {
        const primaryOwner: string = team.primaryOwner || (team.owners?.[0] ?? '');
        if (primaryOwner) teamToMember.set(team.id, primaryOwner);
      }

      // Determine champion: team with rankFinal === 1, or winner of the championship matchup
      // ESPN sets rankFinal after season ends; fall back to highest playoff seed winner
      let championTeamId: number | null = null;
      let runnerUpTeamId: number | null = null;

      // Look for championship matchup (WINNERS_BRACKET in the last matchup period)
      const completedPlayoffs = schedule.filter(
        (m: any) => m.playoffTierType === 'WINNERS_BRACKET' && m.winner && m.winner !== 'UNDECIDED'
      );
      if (completedPlayoffs.length > 0) {
        // The championship is the last completed winners bracket matchup
        const champMatchup = completedPlayoffs.reduce((a: any, b: any) =>
          a.matchupPeriodId >= b.matchupPeriodId ? a : b
        );
        if (champMatchup.winner === 'HOME') {
          championTeamId = champMatchup.home?.teamId ?? null;
          runnerUpTeamId = champMatchup.away?.teamId ?? null;
        } else if (champMatchup.winner === 'AWAY') {
          championTeamId = champMatchup.away?.teamId ?? null;
          runnerUpTeamId = champMatchup.home?.teamId ?? null;
        }
      }
      // Fallback: rankFinal === 1
      if (!championTeamId) {
        const champ = teams.find((t: any) => t.rankFinal === 1);
        if (champ) championTeamId = champ.id;
        const ru = teams.find((t: any) => t.rankFinal === 2);
        if (ru) runnerUpTeamId = ru.id;
      }

      // Process each team's season record
      for (const team of teams) {
        const memberId = teamToMember.get(team.id);
        if (!memberId) continue;
        const owner = getOrCreateOwner(memberId, members);

        const overall = team.record?.overall || {};
        const wins = overall.wins ?? 0;
        const losses = overall.losses ?? 0;
        const ties = overall.ties ?? 0;
        const pf = team.points ?? 0;
        // PA from record.overall.pointsAgainst if available, else 0
        const pa = overall.pointsAgainst ?? 0;
        const playoffSeed = team.playoffSeed ?? 0;
        const madePlayoffs = playoffSeed > 0 && playoffSeed <= 7;
        const isChampion = team.id === championTeamId;
        const isRunnerUp = team.id === runnerUpTeamId;

        owner.totalWins += wins;
        owner.totalLosses += losses;
        owner.totalTies += ties;
        owner.totalPF += pf;
        owner.totalPA += pa;
        if (madePlayoffs) owner.playoffAppearances++;
        if (isChampion) owner.championships++;
        if (isRunnerUp) owner.runnerUps++;

        const tc = team.transactionCounter || {};
        owner.seasonRecords.push({
          season,
          teamName: team.name || team.abbrev || `Team ${team.id}`,
          wins, losses, ties, pf, pa,
          rank: team.rankCalculatedFinal ?? team.rankFinal ?? 0,
          playoffSeed,
          madePlayoffs,
          isChampion,
          isRunnerUp,
        });
        owner.txnSeasons.push({
          season,
          acquisitions: tc.acquisitions ?? 0,
          drops: tc.drops ?? 0,
          trades: tc.trades ?? 0,
          moveToActive: tc.moveToActive ?? 0,
          moveToIR: tc.moveToIR ?? 0,
        });
      }

      // Process head-to-head from regular-season matchups
      const regularSeason = schedule.filter(
        (m: any) => (!m.playoffTierType || m.playoffTierType === 'NONE') &&
          m.winner && m.winner !== 'UNDECIDED'
      );

      for (const matchup of regularSeason) {
        const homeTeamId: number = matchup.home?.teamId;
        const awayTeamId: number = matchup.away?.teamId;
        if (!homeTeamId || !awayTeamId) continue;

        const homeMember = teamToMember.get(homeTeamId);
        const awayMember = teamToMember.get(awayTeamId);
        if (!homeMember || !awayMember) continue;

        const homeOwner = getOrCreateOwner(homeMember, members);
        const awayOwner = getOrCreateOwner(awayMember, members);

        if (!homeOwner.h2h.has(awayMember)) homeOwner.h2h.set(awayMember, { wins: 0, losses: 0, ties: 0 });
        if (!awayOwner.h2h.has(homeMember)) awayOwner.h2h.set(homeMember, { wins: 0, losses: 0, ties: 0 });

        const homeH2H = homeOwner.h2h.get(awayMember)!;
        const awayH2H = awayOwner.h2h.get(homeMember)!;

        if (matchup.winner === 'HOME') {
          homeH2H.wins++; awayH2H.losses++;
        } else if (matchup.winner === 'AWAY') {
          awayH2H.wins++; homeH2H.losses++;
        } else {
          homeH2H.ties++; awayH2H.ties++;
        }
      }
    }

    // ── Serialize to plain objects ──────────────────────────────────────────
    const owners = Array.from(ownerMap.values()).map((o) => {
      const totalGames = o.totalWins + o.totalLosses + o.totalTies;
      const winPct = totalGames > 0 ? Math.round((o.totalWins / totalGames) * 1000) / 10 : 0;
      const avgPF = o.seasonRecords.length > 0
        ? Math.round((o.totalPF / o.seasonRecords.length) * 10) / 10
        : 0;
      const avgPA = o.seasonRecords.length > 0
        ? Math.round((o.totalPA / o.seasonRecords.length) * 10) / 10
        : 0;
      const h2hArray = Array.from(o.h2h.entries()).map(([oppId, rec]) => ({
        opponentMemberId: oppId,
        wins: rec.wins,
        losses: rec.losses,
        ties: rec.ties,
      }));
      // ── Transaction / GM Style metrics ──
      const totalAcquisitions = o.txnSeasons.reduce((s, t) => s + t.acquisitions, 0);
      const totalDrops = o.txnSeasons.reduce((s, t) => s + t.drops, 0);
      const totalTrades = o.txnSeasons.reduce((s, t) => s + t.trades, 0);
      const totalRosterMoves = o.txnSeasons.reduce((s, t) => s + t.moveToActive + t.moveToIR, 0);
      const txnSeasonCount = o.txnSeasons.length || 1;
      const avgAcquisitions = Math.round((totalAcquisitions / txnSeasonCount) * 10) / 10;
      const avgTrades = Math.round((totalTrades / txnSeasonCount) * 10) / 10;

      // Waiver aggression: 0–100 scale based on avg acquisitions
      // League context: ~10 = very low, ~70 = very high
      const waiverAggression = Math.min(100, Math.round((avgAcquisitions / 70) * 100));

      // Trade frequency: 0–100 scale based on avg trades per season
      // League context: ~2 = low, ~15 = very high
      const tradeFrequency = Math.min(100, Math.round((avgTrades / 15) * 100));

      // Roster stability: inverse of churn (acquisitions + drops relative to roster size ~14)
      // High stability = low churn
      const avgChurn = (totalAcquisitions + totalDrops) / txnSeasonCount;
      const rosterStability = Math.max(0, Math.round(100 - (avgChurn / 100) * 100));

      // GM Archetype based on dominant traits
      let gmArchetype: string;
      let gmArchetypeDesc: string;
      if (waiverAggression >= 70 && tradeFrequency >= 60) {
        gmArchetype = 'Dealmaker';
        gmArchetypeDesc = 'Extremely active on both the waiver wire and in trades. Never sits still — always looking for an edge.';
      } else if (waiverAggression >= 70) {
        gmArchetype = 'Waiver Grinder';
        gmArchetypeDesc = 'Dominates the waiver wire with high-volume pickups. Relies on finding hidden gems over big trades.';
      } else if (tradeFrequency >= 60) {
        gmArchetype = 'Trade Shark';
        gmArchetypeDesc = 'Prefers to build the roster through trades rather than free agency. Looks to exploit market inefficiencies.';
      } else if (rosterStability >= 70) {
        gmArchetype = 'Patient Builder';
        gmArchetypeDesc = 'Trusts the draft and rarely makes moves. Builds through the draft and keeper strategy.';
      } else if (waiverAggression >= 45) {
        gmArchetype = 'Opportunist';
        gmArchetypeDesc = 'Moderately active — makes targeted moves when the right opportunity arises.';
      } else {
        gmArchetype = 'Set & Forget';
        gmArchetypeDesc = 'Minimal roster activity. Relies heavily on draft-day decisions to carry the season.';
      }

      // Best and worst seasons by win %
      const sortedSeasons = [...o.seasonRecords].sort((a, b) => {
        const aGames = a.wins + a.losses + a.ties;
        const bGames = b.wins + b.losses + b.ties;
        const aPct = aGames > 0 ? a.wins / aGames : 0;
        const bPct = bGames > 0 ? b.wins / bGames : 0;
        return bPct - aPct;
      });
      return {
        memberId: o.memberId,
        firstName: o.firstName,
        lastName: o.lastName,
        displayName: o.displayName,
        fullName: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.displayName,
        totalWins: o.totalWins,
        totalLosses: o.totalLosses,
        totalTies: o.totalTies,
        totalGames,
        winPct,
        totalPF: Math.round(o.totalPF * 10) / 10,
        totalPA: Math.round(o.totalPA * 10) / 10,
        avgPF,
        avgPA,
        pointDiff: Math.round((o.totalPF - o.totalPA) * 10) / 10,
        playoffAppearances: o.playoffAppearances,
        championships: o.championships,
        runnerUps: o.runnerUps,
        seasonsActive: o.seasonRecords.length,
        playoffRate: o.seasonRecords.length > 0
          ? Math.round((o.playoffAppearances / o.seasonRecords.length) * 1000) / 10
          : 0,
        seasonRecords: o.seasonRecords.sort((a, b) => a.season - b.season),
        h2h: h2hArray,
        bestSeason: sortedSeasons[0] ?? null,
        worstSeason: sortedSeasons[sortedSeasons.length - 1] ?? null,
        // Transaction stats
        txnSeasons: o.txnSeasons.sort((a, b) => a.season - b.season),
        totalAcquisitions,
        totalDrops,
        totalTrades,
        totalRosterMoves,
        avgAcquisitions,
        avgTrades,
        waiverAggression,
        tradeFrequency,
        rosterStability,
        gmArchetype,
        gmArchetypeDesc,
      };
    });

    // Sort by all-time win % descending
    owners.sort((a, b) => b.winPct - a.winPct);

    return {
      owners,
      seasons: cachedSeasons,
      totalSeasons: cachedSeasons.length,
    };
  }),

  ownerPredictions: publicProcedure
    .input(z.object({ memberId: z.string() }))
    .query(async ({ input }) => {
      // Fetch the full owner stats to build context
      const cachedSeasons = await getAllCachedSeasons();

      // Collect all owner data for this member across seasons
      let ownerName = '';
      let teamNames: string[] = [];
      const seasonSummaries: string[] = [];
      let totalAcquisitions = 0;
      let totalTrades = 0;
      let totalDrops = 0;
      let totalWins = 0;
      let totalLosses = 0;
      let championships = 0;
      let playoffAppearances = 0;
      let seasonsActive = 0;

      for (const season of cachedSeasons) {
        const row = await getCachedView(season, 'combined');
        if (!row) continue;
        const data = row.payload as any;

        const members: any[] = data.members || [];
        const teams: any[] = data.teams || [];
        const schedule: any[] = data.schedule || [];

        // Find this owner's team in this season
        const team = teams.find((t: any) =>
          t.primaryOwner === input.memberId || t.owners?.includes(input.memberId)
        );
        if (!team) continue;

        // Resolve name from members
        if (!ownerName) {
          const m = members.find((x: any) => x.id === input.memberId);
          if (m) ownerName = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.displayName;
        }

        const teamName = team.name || team.abbrev || `Team ${team.id}`;
        if (!teamNames.includes(teamName)) teamNames.push(teamName);

        const tc = team.transactionCounter || {};
        const acq = tc.acquisitions ?? 0;
        const drops = tc.drops ?? 0;
        const trades = tc.trades ?? 0;
        totalAcquisitions += acq;
        totalTrades += trades;
        totalDrops += drops;

        const overall = team.record?.overall || {};
        const wins = overall.wins ?? 0;
        const losses = overall.losses ?? 0;
        totalWins += wins;
        totalLosses += losses;
        seasonsActive++;

        // Determine if champion this season
        const completedPlayoffs = schedule.filter(
          (m: any) => m.playoffTierType === 'WINNERS_BRACKET' && m.winner && m.winner !== 'UNDECIDED'
        );
        let isChamp = false;
        if (completedPlayoffs.length > 0) {
          const champMatchup = completedPlayoffs.reduce((a: any, b: any) =>
            a.matchupPeriodId >= b.matchupPeriodId ? a : b
          );
          const champTeamId = champMatchup.winner === 'HOME'
            ? champMatchup.home?.teamId
            : champMatchup.away?.teamId;
          isChamp = champTeamId === team.id;
        }
        if (isChamp) championships++;

        const playoffSeed = team.playoffSeed ?? 0;
        const madePlayoffs = playoffSeed > 0 && playoffSeed <= 7;
        if (madePlayoffs) playoffAppearances++;

        const pf = team.points ?? 0;
        seasonSummaries.push(
          `${season}: ${teamName} | ${wins}-${losses} | PF: ${pf.toFixed(1)} | ` +
          `Seed: ${playoffSeed || 'Missed'} | ${isChamp ? 'CHAMPION' : madePlayoffs ? 'Playoff' : 'Missed Playoffs'} | ` +
          `Adds: ${acq}, Drops: ${drops}, Trades: ${trades}`
        );
      }

      // Guard: if no seasons found for this memberId, return NOT_FOUND
      if (seasonsActive === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No season data found for memberId: ${input.memberId}`,
        });
      }

      if (!ownerName) ownerName = input.memberId;

      const totalGames = totalWins + totalLosses;
      const winPct = totalGames > 0 ? Math.round((totalWins / totalGames) * 1000) / 10 : 0;
      const avgAcq = seasonsActive > 0 ? Math.round(totalAcquisitions / seasonsActive) : 0;
      const avgTrades = seasonsActive > 0 ? Math.round(totalTrades / seasonsActive) : 0;

      // Classify GM style
      const waiverAggression = Math.min(100, Math.round((avgAcq / 70) * 100));
      const tradeFrequency = Math.min(100, Math.round((avgTrades / 15) * 100));
      const avgChurn = (totalAcquisitions + totalDrops) / (seasonsActive || 1);
      const rosterStability = Math.max(0, Math.round(100 - (avgChurn / 100) * 100));

      let gmArchetype = 'Opportunist';
      if (waiverAggression >= 70 && tradeFrequency >= 60) gmArchetype = 'Dealmaker';
      else if (waiverAggression >= 70) gmArchetype = 'Waiver Grinder';
      else if (tradeFrequency >= 60) gmArchetype = 'Trade Shark';
      else if (rosterStability >= 70) gmArchetype = 'Patient Builder';
      else if (waiverAggression < 30 && tradeFrequency < 30) gmArchetype = 'Set & Forget';

      const prompt = `You are an expert Fantasy Football analyst for the 18-season keeper league "ATLANTAS FINEST FF" (14 teams, PPR, 1 keeper, 7-team playoffs, snake draft).

Analyze the following owner's career history and generate a detailed 2026 behavioral prediction report.

OWNER: ${ownerName}
Team names used: ${teamNames.join(', ')}
Career record: ${totalWins}-${totalLosses} (${winPct}% win rate) across ${seasonsActive} seasons
Championships: ${championships} | Playoff appearances: ${playoffAppearances}/${seasonsActive}
GM Archetype: ${gmArchetype}
Avg acquisitions/season: ${avgAcq} | Avg trades/season: ${avgTrades}
Waiver aggression score: ${waiverAggression}/100 | Trade frequency score: ${tradeFrequency}/100 | Roster stability: ${rosterStability}/100

SEASON-BY-SEASON HISTORY:
${seasonSummaries.join('\n')}

Generate a JSON prediction report with these exact fields:
{
  "ownerSummary": "2-3 sentence narrative describing this owner's career arc and management style",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "predictedBehavior2026": {
    "draftStrategy": "Predicted draft approach for 2026 (2-3 sentences)",
    "waiverApproach": "Predicted waiver wire behavior (1-2 sentences)",
    "tradeApproach": "Predicted trade behavior (1-2 sentences)",
    "keeperPrediction": "Analysis of their likely keeper strategy (1-2 sentences)",
    "overallOutlook": "Overall 2026 season prediction with confidence level (2-3 sentences)"
  },
  "dangerRating": "LOW | MEDIUM | HIGH | ELITE",
  "dangerRationale": "1-2 sentences explaining the danger rating",
  "rivalryAlert": "Identify 1-2 specific owners they tend to clash with or who exploit their weaknesses, based on the data"
}`;

      const response = await invokeLLM({
        messages: [
          { role: 'system', content: 'You are a fantasy football analytics expert. Always respond with valid JSON only, no markdown fences.' },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'owner_prediction',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                ownerSummary: { type: 'string' },
                strengths: { type: 'array', items: { type: 'string' } },
                weaknesses: { type: 'array', items: { type: 'string' } },
                predictedBehavior2026: {
                  type: 'object',
                  properties: {
                    draftStrategy: { type: 'string' },
                    waiverApproach: { type: 'string' },
                    tradeApproach: { type: 'string' },
                    keeperPrediction: { type: 'string' },
                    overallOutlook: { type: 'string' },
                  },
                  required: ['draftStrategy', 'waiverApproach', 'tradeApproach', 'keeperPrediction', 'overallOutlook'],
                  additionalProperties: false,
                },
                dangerRating: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'ELITE'] },
                dangerRationale: { type: 'string' },
                rivalryAlert: { type: 'string' },
              },
              required: ['ownerSummary', 'strengths', 'weaknesses', 'predictedBehavior2026', 'dangerRating', 'dangerRationale', 'rivalryAlert'],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = response.choices?.[0]?.message?.content;
      let parsed: unknown;
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to parse LLM prediction response',
        });
      }
      if (!parsed || typeof parsed !== 'object') {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'LLM returned an invalid prediction format',
        });
      }

      return {
        memberId: input.memberId,
        ownerName,
        gmArchetype,
        waiverAggression,
        tradeFrequency,
        rosterStability,
        prediction: parsed,
      };
    }),

  advisor: router({
    chat: protectedProcedure
      .input(z.object({ message: z.string().min(1).max(2000), season: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user.id;
        const season = input.season ?? 2025;
        let leagueContext = `You are an expert Fantasy Football GM advisor for the league "ATLANTAS FINEST FF" (League ID: ${LEAGUE_ID}).
This is an 18-season keeper league running from 2009 to 2026 with 14 teams.
Format: Head-to-Head Points, PPR (Point Per Reception), Snake Draft, 1 keeper per team.
Scoring positions: QB, RB, WR, TE, K, D/ST. Playoffs: 7 teams.
Be concise, data-driven, and specific. Reference actual team names and player names when possible.`;

        const data = await getSeasonData(season);
        if (data) {
          const teams = normalizeTeams(data);
          const settings = normalizeSettings(data);
          leagueContext += `\n\nCurrent Season: ${season}`;
          leagueContext += `\nStatus: ${settings.isActive ? "Active" : "Offseason"}, Week ${settings.currentMatchupPeriod || "N/A"}`;
          leagueContext += `\n\nStandings:\n`;
          const sorted = teams.sort((a, b) => ((a.rankFinal as number) || 99) - ((b.rankFinal as number) || 99));
          for (const t of sorted) {
            leagueContext += `  ${t.rankFinal}. ${t.teamName} (${t.owners}) W:${t.wins} L:${t.losses} PF:${Number(t.pointsFor || 0).toFixed(1)}\n`;
          }
        }

        const history = await getChatHistory(userId, season);
        const messages: Message[] = [
          { role: "system", content: leagueContext },
          ...history.slice(-20).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
          { role: "user", content: input.message },
        ];

        await addChatMessage(userId, "user", input.message, season);
        const response = await invokeLLM({ messages });
        const rawContent = response.choices?.[0]?.message?.content;
        const assistantMessage = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "I couldn't generate a response. Please try again.");
        await addChatMessage(userId, "assistant", assistantMessage, season);
        return { message: assistantMessage };
      }),

    history: protectedProcedure
      .input(z.object({ season: z.number().optional() }))
      .query(async ({ ctx, input }) => getChatHistory(ctx.user.id, input.season)),

    clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
      await clearChatHistory(ctx.user.id);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
