import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
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
