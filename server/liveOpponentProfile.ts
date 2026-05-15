/**
 * liveOpponentProfile.ts
 *
 * Generates opponent GM profiles dynamically from ESPN cache data.
 * Replaces the static opponentData.ts hardcoded file.
 *
 * Data sources:
 *   - espnSeasonCache (teams, schedule, transactions, draftPicks) per season
 *   - calcManagerBehavior() from analytics.ts for GM archetypes
 *
 * The returned shape is compatible with the OpponentData interface from
 * opponentData.ts so existing callers require minimal changes.
 */

import { getAllCachedSeasons, getCachedView } from "./db";
import { ENV } from "./_core/env";
import {
  normalizeTeams,
  normalizeMatchups,
  normalizeTransactions,
  normalizeDraftPicks,
} from "./espnService";
import {
  calcManagerBehavior,
  type TeamRow,
  type TransactionRow,
  type DraftPickRow,
} from "./analytics";

// ── Types (mirrors opponentData.ts interface) ─────────────────────────────────

export interface LiveOpponentSeason {
  season: number;
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  seed: number;
  rank: number;
  acquisitions: number;
  drops: number;
  trades: number;
}

export interface LiveStrengthWeakness {
  type: "strength" | "weakness" | "blindspot";
  text: string;
}

export interface LiveOpponentData {
  memberId: string;
  ownerName: string;
  teamIds: number[];
  career: { wins: number; losses: number; pf: number; pa: number; playoffSeasons: number };
  seasons: LiveOpponentSeason[];
  h2hVsRod: { wins: number; losses: number };
  gmArchetype: string;
  gmArchetypeDesc: string;
  avgAcquisitions: number;
  avgTrades: number;
  strengthsWeaknesses: LiveStrengthWeakness[];
  draftStyleBadge: string;
  draftStyleDesc: string;
  // Extended analytics fields
  earlyQbTendency: boolean;
  earlyTeTendency: boolean;
  keeperEfficiencyAvg: number;
  waiverAggressionScore: number;
  tradeFrequencyScore: number;
  rosterStabilityScore: number;
}

// ── Rod Sellers member ID (stable across seasons) ─────────────────────────────
const ROD_MEMBER_IDS = [
  "{4B7B3B8C-B5B5-4B3B-8B3B-B5B5B5B5B5B5}", // placeholder — resolved dynamically
];

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildLiveOpponentProfiles(): Promise<Map<string, LiveOpponentData>> {
  const cachedSeasons = await getAllCachedSeasons(null);
  if (cachedSeasons.length === 0) return new Map();

  // memberId → accumulated data
  const profileMap = new Map<string, {
    memberId: string;
    displayName: string;
    teamIds: Set<number>;
    seasons: LiveOpponentSeason[];
    h2hVsRod: { wins: number; losses: number };
    allTeamRows: TeamRow[];
    allTransactions: TransactionRow[];
    allDraftPicks: DraftPickRow[];
  }>();

  // Identify Rod's member ID from the first available season
  let rodMemberId: string | null = null;
  const _ownerNameLower = ENV.ownerName.toLowerCase();
  const _ownerFirstLower = ENV.ownerName.split(" ")[0].toLowerCase();
  const _ownerLastLower = (ENV.ownerName.split(" ")[1] ?? "").toLowerCase();
  const ROD_NAMES = [_ownerNameLower, "rodzilla", "str8frmhell", _ownerFirstLower, _ownerLastLower].filter(Boolean);

  for (const season of cachedSeasons.sort((a, b) => b - a)) {
    const row = await getCachedView(season, "combined", null);
    if (!row) continue;
    const data = row.payload as Record<string, unknown>;
    const members = (data.members as Record<string, unknown>[]) || [];
    const teams = (data.teams as Record<string, unknown>[]) || [];

    // Build teamId → memberId map
    const teamToMember = new Map<number, string>();
    const memberIdToName = new Map<string, string>();
    for (const team of teams) {
      const primaryOwner = (team.primaryOwner as string) || ((team.owners as string[])?.[0] ?? "");
      if (primaryOwner) teamToMember.set(team.id as number, primaryOwner);
    }
    for (const m of members) {
      const mid = m.id as string;
      const name = `${m.firstName || ""} ${m.lastName || ""}`.trim() || (m.displayName as string) || mid;
      memberIdToName.set(mid, name);
      if (!rodMemberId && ROD_NAMES.some(n => n && name.toLowerCase().includes(n))) {
        rodMemberId = mid;
      }
    }

    // Normalize data for this season
    const normalizedTeams = normalizeTeams(data);
    const normalizedMatchups = normalizeMatchups(data);
    const normalizedTransactions = normalizeTransactions(data);
    const normalizedPicks = normalizeDraftPicks(data);

    // Settings for playoff detection
    const settings = data.settings as Record<string, unknown> || {};
    const scheduleSettings = settings.scheduleSettings as Record<string, unknown> || {};
    const playoffStart = ((scheduleSettings.matchupPeriodCount as number) || 14) + 1;

    // Determine champion/runner-up
    const schedule = (data.schedule as Record<string, unknown>[]) || [];
    let championTeamId: number | null = null;
    const completedPlayoffs = schedule.filter(
      (m) => m.playoffTierType === "WINNERS_BRACKET" && m.winner && m.winner !== "UNDECIDED"
    );
    if (completedPlayoffs.length > 0) {
      const champMatchup = completedPlayoffs.reduce((a, b) =>
        (a.matchupPeriodId as number) >= (b.matchupPeriodId as number) ? a : b
      );
      if (champMatchup.winner === "HOME") {
        championTeamId = (champMatchup.home as Record<string, unknown>)?.teamId as number ?? null;
      } else if (champMatchup.winner === "AWAY") {
        championTeamId = (champMatchup.away as Record<string, unknown>)?.teamId as number ?? null;
      }
    }

    // Per-team season stats
    for (const team of normalizedTeams) {
      const tid = team.teamId as number;
      const memberId = teamToMember.get(tid);
      if (!memberId) continue;

      const displayName = memberIdToName.get(memberId) || `Member ${memberId}`;
      const seed = (team.playoffSeed as number) || 0;
      const rank = (team.rankFinal as number) || 0;
      const madePlayoffs = seed > 0 && seed <= 7;

      // Transaction counts for this team/season
      const teamTxns = (normalizedTransactions as Record<string, unknown>[]).filter(
        (t) => t.teamId === tid
      );
      const acquisitions = teamTxns.filter(t => t.itemType === "ADD").length;
      const drops = teamTxns.filter(t => t.itemType === "DROP").length;
      const trades = teamTxns.filter(t => t.type === "TRADE").length;

      // H2H vs Rod
      const rodTeamId = rodMemberId
        ? normalizedTeams.find(t => teamToMember.get(t.teamId as number) === rodMemberId)?.teamId as number | undefined
        : undefined;

      let h2hWins = 0;
      let h2hLosses = 0;
      if (rodTeamId && rodTeamId !== tid) {
        for (const matchup of normalizedMatchups) {
          const m = matchup as Record<string, unknown>;
          const homeId = (m.homeTeamId as number);
          const awayId = (m.awayTeamId as number);
          const period = (m.matchupPeriodId as number);
          if (period >= playoffStart) continue; // regular season only
          if ((homeId === tid && awayId === rodTeamId) || (awayId === tid && homeId === rodTeamId)) {
            const winner = m.winner as string;
            if ((winner === "HOME" && homeId === tid) || (winner === "AWAY" && awayId === tid)) {
              h2hWins++;
            } else if (winner !== "UNDECIDED" && winner !== "TIE") {
              h2hLosses++;
            }
          }
        }
      }

      if (!profileMap.has(memberId)) {
        profileMap.set(memberId, {
          memberId,
          displayName,
          teamIds: new Set(),
          seasons: [],
          h2hVsRod: { wins: 0, losses: 0 },
          allTeamRows: [],
          allTransactions: [],
          allDraftPicks: [],
        });
      }

      const profile = profileMap.get(memberId)!;
      profile.teamIds.add(tid);
      profile.h2hVsRod.wins += h2hWins;
      profile.h2hVsRod.losses += h2hLosses;

      profile.seasons.push({
        season,
        wins: team.wins as number,
        losses: team.losses as number,
        pf: Math.round((team.pointsFor as number) || 0),
        pa: Math.round((team.pointsAgainst as number) || 0),
        seed,
        rank,
        acquisitions,
        drops,
        trades,
      });

      // Accumulate for analytics
      profile.allTeamRows.push({
        teamId: tid,
        ownerName: displayName,
        wins: team.wins as number,
        losses: team.losses as number,
        pointsFor: team.pointsFor as number,
        pointsAgainst: team.pointsAgainst as number,
      });

      for (const tx of teamTxns) {
        const txr = tx as Record<string, unknown>;
        profile.allTransactions.push({
          season,
          teamId: tid,
          type: txr.type as string,
          itemType: txr.itemType as string,
          proposedDate: txr.proposedDate as number,
        });
      }

      const teamPicks = normalizedPicks.filter(p => (p.teamId as number) === tid);
      for (const pick of teamPicks) {
        profile.allDraftPicks.push({
          season,
          teamId: tid,
          roundId: pick.roundId as number,
          roundPickNumber: pick.roundPickNumber as number,
          overallPickNumber: pick.overallPickNumber as number,
          position: pick.position as string,
          keeper: pick.keeper as boolean,
        });
      }
    }
  }

  // ── Build final profiles with analytics ────────────────────────────────────
  const result = new Map<string, LiveOpponentData>();

  for (const [memberId, profile] of Array.from(profileMap.entries())) {
    const seasons = profile.seasons.sort((a: LiveOpponentSeason, b: LiveOpponentSeason) => a.season - b.season);
    const totalWins = seasons.reduce((s: number, r: LiveOpponentSeason) => s + r.wins, 0);
    const totalLosses = seasons.reduce((s: number, r: LiveOpponentSeason) => s + r.losses, 0);
    const totalPF = seasons.reduce((s: number, r: LiveOpponentSeason) => s + r.pf, 0);
    const totalPA = seasons.reduce((s: number, r: LiveOpponentSeason) => s + r.pa, 0);
    const playoffSeasons = seasons.filter((s: LiveOpponentSeason) => s.seed > 0 && s.seed <= 7).length;
    const avgAcquisitions = seasons.length > 0
      ? Math.round(seasons.reduce((s: number, r: LiveOpponentSeason) => s + r.acquisitions, 0) / seasons.length)
      : 0;
    const avgTrades = seasons.length > 0
      ? Math.round((seasons.reduce((s: number, r: LiveOpponentSeason) => s + r.trades, 0) / seasons.length) * 10) / 10
      : 0;

    // Run analytics for this manager
    const ownerNameMap: Record<number, string> = {};
    for (const tid of Array.from(profile.teamIds)) ownerNameMap[tid] = profile.displayName;

    const behaviorStats = calcManagerBehavior(
      profile.allTeamRows,
      profile.allTransactions,
      profile.allDraftPicks,
      ownerNameMap
    );
    const behavior = behaviorStats[0];

    // Derive strengths/weaknesses from calculated data
    const strengthsWeaknesses: LiveStrengthWeakness[] = [];
    if (totalWins > totalLosses) {
      strengthsWeaknesses.push({
        type: "strength",
        text: `Winning career record: ${totalWins}W-${totalLosses}L (${Math.round(totalWins / (totalWins + totalLosses) * 100)}% win rate)`,
      });
    } else {
      strengthsWeaknesses.push({
        type: "weakness",
        text: `Below .500 career: ${totalWins}W-${totalLosses}L`,
      });
    }
    if (playoffSeasons >= 4) {
      strengthsWeaknesses.push({ type: "strength", text: `Consistent playoff presence: ${playoffSeasons} of ${seasons.length} seasons` });
    }
    if (behavior?.avgWaiverAddsPerSeason > 40) {
      strengthsWeaknesses.push({ type: "strength", text: `High waiver activity (${behavior.avgWaiverAddsPerSeason.toFixed(0)} adds/season) — patches roster holes quickly` });
    } else if (behavior?.avgWaiverAddsPerSeason < 20) {
      strengthsWeaknesses.push({ type: "weakness", text: `Low waiver activity (${behavior?.avgWaiverAddsPerSeason?.toFixed(0) ?? "?"} adds/season) — may miss breakout pickups` });
    }
    if (behavior?.earlyQbTendency) {
      strengthsWeaknesses.push({ type: "blindspot", text: "Drafts QB early (rounds 1-3) — may sacrifice positional value" });
    }
    if (behavior?.keeperEfficiencyAvg < 0) {
      strengthsWeaknesses.push({ type: "weakness", text: "Keeper decisions tend to cost draft capital — overpays for keepers" });
    } else if (behavior?.keeperEfficiencyAvg > 2) {
      strengthsWeaknesses.push({ type: "strength", text: `Excellent keeper efficiency (+${behavior.keeperEfficiencyAvg.toFixed(1)} rounds avg savings)` });
    }

    // Draft style badge
    let draftStyleBadge = "Balanced";
    let draftStyleDesc = "No strong positional bias detected";
    if (behavior?.earlyQbTendency && behavior?.earlyTeTendency) {
      draftStyleBadge = "Skill-Position Heavy";
      draftStyleDesc = "Drafts QB and TE early, sacrificing early RB/WR value";
    } else if (behavior?.earlyQbTendency) {
      draftStyleBadge = "QB-First";
      draftStyleDesc = "Consistently drafts QB in rounds 1-3";
    } else if (behavior?.earlyTeTendency) {
      draftStyleBadge = "TE Premium";
      draftStyleDesc = "Targets elite TE early in draft";
    } else if (behavior?.avgTradesPerSeason > 5) {
      draftStyleBadge = "Trade-Oriented";
      draftStyleDesc = "Drafts for trade value, not just roster fit";
    }

    result.set(memberId, {
      memberId,
      ownerName: profile.displayName,
      teamIds: Array.from(profile.teamIds),
      career: { wins: totalWins, losses: totalLosses, pf: totalPF, pa: totalPA, playoffSeasons },
      seasons,
      h2hVsRod: profile.h2hVsRod,
      gmArchetype: behavior?.gmArchetype ?? "Balanced",
      gmArchetypeDesc: behavior?.gmArchetypeDesc ?? "Balanced manager with no strong tendencies",
      avgAcquisitions,
      avgTrades,
      strengthsWeaknesses,
      draftStyleBadge,
      draftStyleDesc,
      earlyQbTendency: behavior?.earlyQbTendency ?? false,
      earlyTeTendency: behavior?.earlyTeTendency ?? false,
      keeperEfficiencyAvg: behavior?.keeperEfficiencyAvg ?? 0,
      waiverAggressionScore: behavior?.waiverAggressionScore ?? 0,
      tradeFrequencyScore: behavior?.tradeFrequencyScore ?? 0,
      rosterStabilityScore: behavior?.rosterStabilityScore ?? 0,
    });
  }

  return result;
}

/**
 * Find a single opponent profile by memberId.
 * Falls back to fuzzy name match if exact ID not found.
 */
export async function findLiveOpponentProfile(memberId: string): Promise<LiveOpponentData | null> {
  const profiles = await buildLiveOpponentProfiles();
  if (profiles.has(memberId)) return profiles.get(memberId)!;

  // Fuzzy match by partial memberId (ESPN IDs are GUIDs, sometimes truncated)
  for (const [key, val] of Array.from(profiles.entries())) {
    if (key.toLowerCase().includes(memberId.toLowerCase()) ||
        memberId.toLowerCase().includes(key.toLowerCase())) {
      return val;
    }
  }
  return null;
}

/**
 * Get GM style context for the trade offer generator.
 * Returns a minimal object compatible with the existing trade generator prompt.
 */
export async function getGmStyleForTradeGenerator(memberId: string): Promise<{
  archetype: string;
  avgTrades: number;
  h2hVsRod: { wins: number; losses: number };
  strengthsWeaknesses: LiveStrengthWeakness[];
  draftStyleBadge: string;
} | null> {
  const profile = await findLiveOpponentProfile(memberId);
  if (!profile) return null;
  return {
    archetype: profile.gmArchetype,
    avgTrades: profile.avgTrades,
    h2hVsRod: profile.h2hVsRod,
    strengthsWeaknesses: profile.strengthsWeaknesses,
    draftStyleBadge: profile.draftStyleBadge,
  };
}
