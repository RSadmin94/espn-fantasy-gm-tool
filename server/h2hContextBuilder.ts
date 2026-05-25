/**
 * h2hContextBuilder.ts
 *
 * Shared helper that computes rich head-to-head stats between two owners
 * (identified by ESPN member IDs) from the cached season data.
 *
 * Used by:
 *   - advisorContextBuilder.ts  (GM Advisor system prompt)
 *   - weeklyStorylinesService.ts (story context blocks)
 *   - routers.ts opponentScoutingReport (scouting prompt)
 *   - liveOpponentProfile.ts (career object)
 *
 * Design: pure computation, no DB writes, no LLM calls.
 * Cached in memCache for 10 min to avoid redundant season scans.
 */

import { getCachedView } from "./db";
import { memCache } from "./memCache";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface H2HMatchup {
  season: number;
  period: number;
  isPlayoff: boolean;
  memberAScore: number;
  memberBScore: number;
  memberAWon: boolean;
}

export interface RichH2HStats {
  /** member A is always the "primary" owner (e.g. Rod) */
  memberAId: string;
  memberBId: string;
  memberAName: string;
  memberBName: string;

  // Regular-season totals
  rsWins: number;
  rsLosses: number;
  rsTies: number;
  rsTotalGames: number;

  // Scoring averages (regular season only)
  avgMemberAPF: number | null;   // avg pts scored by A vs B
  avgMemberBPF: number | null;   // avg pts scored by B vs A

  // Biggest wins/losses (regular season)
  biggestAWin: { margin: number; season: number; aScore: number; bScore: number } | null;
  biggestALoss: { margin: number; season: number; aScore: number; bScore: number } | null;

  // Streaks (regular season, chronological order)
  currentStreakDirection: "winning" | "losing" | "neutral";
  currentStreakLength: number;
  longestWinStreak: number;
  longestLossStreak: number;

  // Per-season breakdown (regular season)
  seasonBreakdown: Array<{ season: number; aWins: number; aLosses: number; aPF: number; bPF: number }>;

  // Playoff H2H
  playoffWins: number;
  playoffLosses: number;
  playoffEliminations: number; // times B eliminated A in playoffs

  // All matchups (for detailed analysis)
  matchups: H2HMatchup[];
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute rich H2H stats between memberA and memberB from all cached seasons.
 * Results are cached for 10 minutes.
 */
export async function computeRichH2H(
  memberAId: string,
  memberBId: string,
  memberAName = "Owner A",
  memberBName = "Owner B",
  userId?: number
): Promise<RichH2HStats> {
  const cacheKey = `richH2H:${memberAId}:${memberBId}:${userId ?? "anon"}`;
  return memCache(cacheKey, 10 * 60_000, async () => {
    return _computeRichH2H(memberAId, memberBId, memberAName, memberBName, userId);
  });
}

async function _computeRichH2H(
  memberAId: string,
  memberBId: string,
  memberAName: string,
  memberBName: string,
  userId?: number
): Promise<RichH2HStats> {
  const sortedSeasons = await listSeasonsForLeagueHistorical(undefined, userId);

  const matchups: H2HMatchup[] = [];

  for (const season of sortedSeasons) {
    const matchRes = await getSeasonMatchups(season, undefined, userId);
    if (matchRes.count === 0) continue;

    const teamRes = await getSeasonTeams(season, undefined, userId);
    const teamToMember = new Map<number, string>();
    for (const team of teamRes.rows) {
      const tr = team as Record<string, unknown>;
      const primaryOwner = String(tr.primaryOwner || (Array.isArray(tr.memberIds) ? tr.memberIds[0] : "") || "").trim();
      const tid = Number(tr.teamId);
      if (primaryOwner && tid) teamToMember.set(tid, primaryOwner);
    }

    const row = await getCachedView(season, "combined", undefined, { userId });
    const data = (row?.payload as Record<string, unknown>) || {};

    // Resolve member names from members array when combined cache has it
    const members = (data.members as Record<string, unknown>[]) || [];
    for (const m of members) {
      const mid = m.id as string;
      const name = `${m.firstName || ""} ${m.lastName || ""}`.trim() || (m.displayName as string) || mid;
      if (mid === memberAId && memberAName === "Owner A") memberAName = name;
      if (mid === memberBId && memberBName === "Owner B") memberBName = name;
    }

    const normalizedMatchups = matchRes.rows as Record<string, unknown>[];

    for (const m of normalizedMatchups) {
      const homeId = m.homeTeamId as number;
      const awayId = m.awayTeamId as number;
      if (!homeId || !awayId) continue;

      const homeMember = teamToMember.get(homeId);
      const awayMember = teamToMember.get(awayId);
      if (!homeMember || !awayMember) continue;

      // Only matchups between A and B
      const aIsHome = homeMember === memberAId && awayMember === memberBId;
      const aIsAway = awayMember === memberAId && homeMember === memberBId;
      if (!aIsHome && !aIsAway) continue;

      const winner = m.winner as string;
      if (!winner || winner === "UNDECIDED") continue;

      const homeScore = (m.homeTotalPoints as number) ?? 0;
      const awayScore = (m.awayTotalPoints as number) ?? 0;
      const aScore = aIsHome ? homeScore : awayScore;
      const bScore = aIsHome ? awayScore : homeScore;
      const aWon = (aIsHome && winner === "HOME") || (aIsAway && winner === "AWAY");
      const period = m.matchupPeriodId as number;
      const isPlayoff = !(!m.playoffTierType || (m.playoffTierType as string) === "NONE");

      const seasonYear = (m.season as number) ?? season;
      matchups.push({
        season: seasonYear,
        period,
        isPlayoff,
        memberAScore: aScore,
        memberBScore: bScore,
        memberAWon: aWon,
      });
    }
  }

  // ── Aggregate stats ───────────────────────────────────────────────────────

  // Regular-season matchups only
  const rsMatchups = matchups.filter(m => !m.isPlayoff);
  const poMatchups = matchups.filter(m => m.isPlayoff);

  // RS totals
  let rsWins = 0, rsLosses = 0, rsTies = 0;
  let totalAPF = 0, totalBPF = 0;
  let biggestAWin: RichH2HStats["biggestAWin"] = null;
  let biggestALoss: RichH2HStats["biggestALoss"] = null;
  let currentStreak = 0, longestWin = 0, longestLoss = 0;
  const seasonMap = new Map<number, { aWins: number; aLosses: number; aPF: number; bPF: number }>();

  for (const m of rsMatchups) {
    totalAPF += m.memberAScore;
    totalBPF += m.memberBScore;
    const margin = Math.abs(m.memberAScore - m.memberBScore);

    // Season breakdown
    if (!seasonMap.has(m.season)) seasonMap.set(m.season, { aWins: 0, aLosses: 0, aPF: 0, bPF: 0 });
    const sb = seasonMap.get(m.season)!;
    sb.aPF += m.memberAScore;
    sb.bPF += m.memberBScore;

    if (m.memberAWon) {
      rsWins++;
      sb.aWins++;
      if (!biggestAWin || margin > biggestAWin.margin) {
        biggestAWin = { margin: Math.round(margin * 10) / 10, season: m.season, aScore: Math.round(m.memberAScore * 10) / 10, bScore: Math.round(m.memberBScore * 10) / 10 };
      }
      if (currentStreak >= 0) currentStreak++;
      else currentStreak = 1;
      if (currentStreak > longestWin) longestWin = currentStreak;
    } else if (!m.memberAWon && m.memberAScore === m.memberBScore) {
      rsTies++;
      currentStreak = 0;
    } else {
      rsLosses++;
      sb.aLosses++;
      if (!biggestALoss || margin > biggestALoss.margin) {
        biggestALoss = { margin: Math.round(margin * 10) / 10, season: m.season, aScore: Math.round(m.memberAScore * 10) / 10, bScore: Math.round(m.memberBScore * 10) / 10 };
      }
      if (currentStreak <= 0) currentStreak--;
      else currentStreak = -1;
      if (Math.abs(currentStreak) > longestLoss) longestLoss = Math.abs(currentStreak);
    }
  }

  const rsTotalGames = rsWins + rsLosses + rsTies;
  const avgMemberAPF = rsTotalGames > 0 ? Math.round((totalAPF / rsTotalGames) * 10) / 10 : null;
  const avgMemberBPF = rsTotalGames > 0 ? Math.round((totalBPF / rsTotalGames) * 10) / 10 : null;

  const currentStreakDirection: RichH2HStats["currentStreakDirection"] =
    currentStreak > 0 ? "winning" : currentStreak < 0 ? "losing" : "neutral";
  const currentStreakLength = Math.abs(currentStreak);

  const seasonBreakdown = Array.from(seasonMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, v]) => ({
      season,
      aWins: v.aWins,
      aLosses: v.aLosses,
      aPF: Math.round(v.aPF * 10) / 10,
      bPF: Math.round(v.bPF * 10) / 10,
    }));

  // Playoff stats
  let playoffWins = 0, playoffLosses = 0, playoffEliminations = 0;
  for (const m of poMatchups) {
    if (m.memberAWon) playoffWins++;
    else {
      playoffLosses++;
      // Count as elimination if it's a WINNERS_BRACKET matchup (A was knocked out)
      playoffEliminations++;
    }
  }

  return {
    memberAId,
    memberBId,
    memberAName,
    memberBName,
    rsWins,
    rsLosses,
    rsTies,
    rsTotalGames,
    avgMemberAPF,
    avgMemberBPF,
    biggestAWin,
    biggestALoss,
    currentStreakDirection,
    currentStreakLength,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    seasonBreakdown,
    playoffWins,
    playoffLosses,
    playoffEliminations,
    matchups,
  };
}

// ── Prompt string builder ─────────────────────────────────────────────────────

/**
 * Build a compact, information-dense H2H context string for AI prompts.
 * memberAName is always "Rod" (or the primary user).
 */
export function buildH2HPromptBlock(stats: RichH2HStats, label = "H2H vs Rod Sellers"): string {
  const lines: string[] = [];

  lines.push(`${label}: ${stats.rsWins}W-${stats.rsLosses}L${stats.rsTies > 0 ? `-${stats.rsTies}T` : ""} (${stats.rsTotalGames} regular-season games)`);

  if (stats.avgMemberAPF !== null && stats.avgMemberBPF !== null) {
    lines.push(`  Avg scoring: Rod ${stats.avgMemberAPF} pts vs ${stats.memberBName} ${stats.avgMemberBPF} pts`);
  }

  if (stats.biggestAWin) {
    lines.push(`  Biggest Rod win: ${stats.biggestAWin.aScore}–${stats.biggestAWin.bScore} in ${stats.biggestAWin.season} (+${stats.biggestAWin.margin} pts)`);
  }
  if (stats.biggestALoss) {
    lines.push(`  Biggest Rod loss: ${stats.biggestALoss.aScore}–${stats.biggestALoss.bScore} in ${stats.biggestALoss.season} (-${stats.biggestALoss.margin} pts)`);
  }

  if (stats.currentStreakLength >= 2) {
    lines.push(`  Current streak: Rod ${stats.currentStreakLength}-game ${stats.currentStreakDirection} streak`);
  }
  const streakParts: string[] = [];
  if (stats.longestWinStreak >= 3) streakParts.push(`longest win streak: ${stats.longestWinStreak}`);
  if (stats.longestLossStreak >= 3) streakParts.push(`longest loss streak: ${stats.longestLossStreak}`);
  if (streakParts.length > 0) lines.push(`  Streak records: ${streakParts.join(", ")}`);

  const recentBreakdown = stats.seasonBreakdown.slice(-5);
  if (recentBreakdown.length > 0) {
    const bdStr = recentBreakdown.map(s => `${s.season}: Rod ${s.aWins}-${s.aLosses}`).join(", ");
    lines.push(`  Recent seasons: ${bdStr}`);
  }

  if (stats.playoffWins + stats.playoffLosses > 0) {
    lines.push(`  Playoff H2H: Rod ${stats.playoffWins}W-${stats.playoffLosses}L (${stats.playoffEliminations} eliminations by ${stats.memberBName})`);
  }

  return lines.join("\n");
}

// ── Resolve Rod's member ID ───────────────────────────────────────────────────

const ROD_NAMES = ["rod sellers", "rodzilla", "str8frmhell"];

export async function resolveRodMemberId(userId?: number): Promise<string | null> {
  return memCache(`rodMemberId:${userId ?? "anon"}`, 60 * 60_000, async () => {
    const seasons = await listSeasonsForLeagueHistorical(undefined, userId);
    for (const season of seasons.sort((a, b) => b - a)) {
      const row = await getCachedView(season, "combined", undefined, { userId });
      if (!row) continue;
      const data = row.payload as Record<string, unknown>;
      const members = (data.members as Record<string, unknown>[]) || [];
      for (const m of members) {
        const name = `${m.firstName || ""} ${m.lastName || ""}`.trim() || (m.displayName as string) || "";
        if (ROD_NAMES.some(n => name.toLowerCase().includes(n))) return m.id as string;
      }
    }
    return null;
  });
}
