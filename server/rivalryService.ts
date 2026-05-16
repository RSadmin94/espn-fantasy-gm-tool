/**
 * rivalryService.ts
 *
 * Deterministic rivalry score engine for the GM War Room.
 *
 * Rivalry score formula (max ~350 pts per pair):
 *   H2H losses         × 8   (max ~120 for 15 losses)
 *   Playoff elims      × 30  (max ~90 for 3 elims)
 *   Close losses (<5)  × 6   (max ~60 for 10 close losses)
 *   Trade verdict loss × 10  (max ~50 for 5 losses)
 *   Recent losses      × 5   (last 3 seasons, max ~30 for 6 recent)
 *
 * Heat labels:
 *   0–29   → "Cold"
 *   30–59  → "Simmering"
 *   60–99  → "Heated"
 *   100–149→ "Burning"
 *   150+   → "Inferno"
 */

import { getAllCachedSeasons, getCachedView, getDb } from "./db";
import {
  normalizeTeams,
  normalizeMatchups,
  normalizeTransactions,
  normalizeRosters,
} from "./espnService";
import { invokeLLM } from "./_core/llm";
import { rivalryScores } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RivalryPair {
  memberId: string;         // the user's memberId (Rod)
  rivalId: string;
  rivalName: string;
  rivalryScore: number;
  h2hWins: number;
  h2hLosses: number;
  h2hTies: number;
  playoffEliminations: number;
  closeLossCount: number;
  tradeVerdictLosses: number;
  recentLosses: number;
  heatLabel: "Cold" | "Simmering" | "Heated" | "Burning" | "Inferno";
  painfulLossSeason: number | null;
  painfulLossMargin: number | null;       // pts (float)
  painfulLossOpponentScore: number | null;
  revengeAchieved: boolean;
  lastMatchupSeason: number | null;
  loreSentence: string | null;
  // Rival's all-time playoff record (for narrative context)
  rivalPlayoffWins?: number;
  rivalPlayoffLosses?: number;
  // Rich regular-season H2H stats (computed, not persisted)
  avgRodPF?: number;            // Rod's avg score in RS matchups vs this rival
  avgRivalPF?: number;          // Rival's avg score in RS matchups vs Rod
  biggestRodWinMargin?: number | null;
  biggestRodWinSeason?: number | null;
  biggestRodWinRodScore?: number | null;
  biggestRodWinRivalScore?: number | null;
  biggestRodLossMargin?: number | null;
  biggestRodLossSeason?: number | null;
  biggestRodLossRodScore?: number | null;
  biggestRodLossRivalScore?: number | null;
  longestWinStreak?: number;
  longestLossStreak?: number;
  currentStreakDirection?: 'winning' | 'losing' | 'neutral';
  currentStreakLength?: number;
  seasonBreakdown?: Array<{ season: number; rodWins: number; rodLosses: number }>;
}

interface MatchupRow {
  season: number;
  matchupPeriodId: number | unknown;
  winner: string | unknown;
  playoffTierType: string | unknown;
  homeTeamId: number | unknown;
  homeTotalPoints: number | unknown;
  awayTeamId: number | unknown;
  awayTotalPoints: number | unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function heatLabel(score: number): RivalryPair["heatLabel"] {
  if (score >= 150) return "Inferno";
  if (score >= 100) return "Burning";
  if (score >= 60) return "Heated";
  if (score >= 30) return "Simmering";
  return "Cold";
}

const ROD_NAMES = ["rod sellers", "rodzilla", "str8frmhell"];

function isRod(name: string): boolean {
  return ROD_NAMES.some((n) => name.toLowerCase().includes(n));
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute rivalry scores for all opponents vs the primary user (Rod).
 * Reads from the ESPN season cache — no live API calls.
 */
export async function computeRivalryScores(): Promise<RivalryPair[]> {
  const cachedSeasons = await getAllCachedSeasons();
  if (cachedSeasons.length === 0) return [];

  // memberId → display name
  const memberNames = new Map<string, string>();
  // memberId → teamId per season
  const seasonTeamToMember = new Map<number, Map<number, string>>();

  // Rod's memberId (resolved from first available season)
  let rodMemberId: string | null = null;

  // Per-opponent accumulators
  interface Acc {
    h2hWins: number;
    h2hLosses: number;
    h2hTies: number;
    playoffEliminations: number;
    closeLossCount: number;
    tradeVerdictLosses: number;
    recentLossSeasons: Set<number>;
    // Most painful loss
    painfulLossSeason: number | null;
    painfulLossMargin: number | null;
    painfulLossOpponentScore: number | null;
    lastMatchupSeason: number | null;
    revengeAchieved: boolean;
    // Rich regular-season H2H stats
    totalRodPF: number;           // sum of Rod's scores in RS matchups
    totalRivalPF: number;         // sum of rival's scores in RS matchups
    biggestRodWinMargin: number | null;
    biggestRodWinSeason: number | null;
    biggestRodWinRodScore: number | null;
    biggestRodWinRivalScore: number | null;
    biggestRodLossMargin: number | null;
    biggestRodLossSeason: number | null;
    biggestRodLossRodScore: number | null;
    biggestRodLossRivalScore: number | null;
    currentWinStreak: number;     // positive = Rod winning streak, negative = loss streak
    longestWinStreak: number;
    longestLossStreak: number;
    seasonBreakdown: Array<{ season: number; rodWins: number; rodLosses: number }>;
  }
  const acc = new Map<string, Acc>();

  function getAcc(rivalId: string): Acc {
    if (!acc.has(rivalId)) {
      acc.set(rivalId, {
        h2hWins: 0, h2hLosses: 0, h2hTies: 0,
        playoffEliminations: 0, closeLossCount: 0, tradeVerdictLosses: 0,
        recentLossSeasons: new Set(),
        painfulLossSeason: null, painfulLossMargin: null, painfulLossOpponentScore: null,
        lastMatchupSeason: null, revengeAchieved: false,
        totalRodPF: 0, totalRivalPF: 0,
        biggestRodWinMargin: null, biggestRodWinSeason: null,
        biggestRodWinRodScore: null, biggestRodWinRivalScore: null,
        biggestRodLossMargin: null, biggestRodLossSeason: null,
        biggestRodLossRodScore: null, biggestRodLossRivalScore: null,
        currentWinStreak: 0, longestWinStreak: 0, longestLossStreak: 0,
        seasonBreakdown: [],
      });
    }
    return acc.get(rivalId)!;
  }

  const RECENT_SEASONS = 3;
  const sortedSeasons = [...cachedSeasons].sort((a, b) => a - b);
  const recentThreshold = sortedSeasons[sortedSeasons.length - RECENT_SEASONS] ?? 0;

  // ── Pass 1: Matchup H2H ──────────────────────────────────────────────────
  for (const season of sortedSeasons) {
    const row = await getCachedView(season, "combined");
    if (!row) continue;
    const data = row.payload as Record<string, unknown>;

    // Build teamId → memberId map
    const teams = normalizeTeams(data);
    const teamToMember = new Map<number, string>();
    const members = (data.members as Record<string, unknown>[]) || [];

    for (const m of members) {
      const mid = m.id as string;
      const name = `${m.firstName || ""} ${m.lastName || ""}`.trim() || (m.displayName as string) || mid;
      memberNames.set(mid, name);
      if (!rodMemberId && isRod(name)) rodMemberId = mid;
    }

    for (const team of teams) {
      const primaryOwner = (team as any).primaryOwner || ((team as any).memberIds?.[0] ?? "");
      if (primaryOwner) teamToMember.set((team as any).teamId as number, primaryOwner);
    }
    seasonTeamToMember.set(season, teamToMember);

    // Determine playoff start period
    const settings = (data.settings as Record<string, unknown>) || {};
    const scheduleSettings = (settings.scheduleSettings as Record<string, unknown>) || {};
    const playoffMatchupPeriodStart: number =
      ((scheduleSettings.matchupPeriodCount as number) ?? 14) + 1;

    // Determine playoff elimination: who knocked out Rod in the playoffs?
    // We look for WINNERS_BRACKET matchups where Rod lost
    const matchups = normalizeMatchups(data) as MatchupRow[];

    for (const m of matchups) {
      const homeId = m.homeTeamId as number;
      const awayId = m.awayTeamId as number;
      if (!homeId || !awayId) continue;
      const homeMember = teamToMember.get(homeId);
      const awayMember = teamToMember.get(awayId);
      if (!homeMember || !awayMember) continue;

      const isPlayoff = (m.playoffTierType as string) === "WINNERS_BRACKET";
      const isRegular = !m.playoffTierType || (m.playoffTierType as string) === "NONE";
      const winner = m.winner as string;
      if (!winner || winner === "UNDECIDED") continue;

      const homeScore = (m.homeTotalPoints as number) ?? 0;
      const awayScore = (m.awayTotalPoints as number) ?? 0;

      // Determine Rod's role
      const rodIsHome = homeMember === rodMemberId;
      const rodIsAway = awayMember === rodMemberId;
      if (!rodIsHome && !rodIsAway) continue;

      const rivalMemberId = rodIsHome ? awayMember : homeMember;
      const rivalA = getAcc(rivalMemberId);

      const rodWon = (rodIsHome && winner === "HOME") || (rodIsAway && winner === "AWAY");
      const rodLost = !rodWon;

      const rodScore = rodIsHome ? homeScore : awayScore;
      const rivalScore = rodIsHome ? awayScore : homeScore;
      const margin = Math.abs(rodScore - rivalScore);

      if (isRegular) {
        // Accumulate scoring totals
        rivalA.totalRodPF += rodScore;
        rivalA.totalRivalPF += rivalScore;

        // Season breakdown
        let sb = rivalA.seasonBreakdown.find(s => s.season === season);
        if (!sb) { sb = { season, rodWins: 0, rodLosses: 0 }; rivalA.seasonBreakdown.push(sb); }

        if (rodWon) {
          rivalA.h2hWins++;
          sb.rodWins++;
          // Biggest Rod win
          if (rivalA.biggestRodWinMargin === null || margin > rivalA.biggestRodWinMargin) {
            rivalA.biggestRodWinMargin = Math.round(margin * 10) / 10;
            rivalA.biggestRodWinSeason = season;
            rivalA.biggestRodWinRodScore = Math.round(rodScore * 10) / 10;
            rivalA.biggestRodWinRivalScore = Math.round(rivalScore * 10) / 10;
          }
          // Streak tracking
          if (rivalA.currentWinStreak >= 0) rivalA.currentWinStreak++;
          else rivalA.currentWinStreak = 1;
          if (rivalA.currentWinStreak > rivalA.longestWinStreak) rivalA.longestWinStreak = rivalA.currentWinStreak;
        } else {
          rivalA.h2hLosses++;
          sb.rodLosses++;
          // Close loss: margin < 5 pts
          if (margin < 5) rivalA.closeLossCount++;
          // Most painful loss: highest opponent score when Rod lost
          if (rivalA.painfulLossOpponentScore === null || rivalScore > rivalA.painfulLossOpponentScore) {
            rivalA.painfulLossSeason = season;
            rivalA.painfulLossMargin = Math.round(margin * 10) / 10;
            rivalA.painfulLossOpponentScore = Math.round(rivalScore * 10) / 10;
          }
          // Biggest Rod loss
          if (rivalA.biggestRodLossMargin === null || margin > rivalA.biggestRodLossMargin) {
            rivalA.biggestRodLossMargin = Math.round(margin * 10) / 10;
            rivalA.biggestRodLossSeason = season;
            rivalA.biggestRodLossRodScore = Math.round(rodScore * 10) / 10;
            rivalA.biggestRodLossRivalScore = Math.round(rivalScore * 10) / 10;
          }
          // Streak tracking
          if (rivalA.currentWinStreak <= 0) rivalA.currentWinStreak--;
          else rivalA.currentWinStreak = -1;
          if (Math.abs(rivalA.currentWinStreak) > rivalA.longestLossStreak) rivalA.longestLossStreak = Math.abs(rivalA.currentWinStreak);
          // Recent losses
          if (season >= recentThreshold) rivalA.recentLossSeasons.add(season);
        }
        // Track last matchup season
        if (rivalA.lastMatchupSeason === null || season > rivalA.lastMatchupSeason) {
          rivalA.lastMatchupSeason = season;
          // Revenge: did Rod win the most recent matchup?
          rivalA.revengeAchieved = rodWon;
        }
      } else if (isPlayoff) {
        if (rodLost) {
          rivalA.playoffEliminations++;
        }
        // Track last matchup season for playoff matchups too
        if (rivalA.lastMatchupSeason === null || season > rivalA.lastMatchupSeason) {
          rivalA.lastMatchupSeason = season;
          rivalA.revengeAchieved = rodWon;
        }
      }
    }
  }

  // ── Pass 2: Trade verdict losses ─────────────────────────────────────────
  // We re-run the simplified trade verdict logic from tradeAging
  // (only need winner/loser per trade, not full value breakdown)
  for (const season of sortedSeasons) {
    const row = await getCachedView(season, "combined");
    if (!row) continue;
    const data = row.payload as Record<string, unknown>;
    const teamToMember = seasonTeamToMember.get(season);
    if (!teamToMember || !rodMemberId) continue;

    const transactions = normalizeTransactions(data) as Record<string, unknown>[];
    // Group TRADE_PROPOSAL rows by transactionId
    const tradeGroups = new Map<string, { teamAId: number; teamBId: number; playerRows: Record<string, unknown>[] }>();

    for (const txn of transactions) {
      const type = txn.type as string;
      if (type !== "TRADE" && type !== "TRADE_PROPOSAL") continue;
      const status = txn.status as string;
      if (status !== "EXECUTED" && status !== "PENDING") continue;
      const tid = txn.transactionId as string;
      if (!tid) continue;
      const fromTeamId = txn.fromTeamId as number;
      const toTeamId = txn.toTeamId as number;
      if (!fromTeamId || !toTeamId) continue;

      if (!tradeGroups.has(tid)) {
        tradeGroups.set(tid, { teamAId: fromTeamId, teamBId: toTeamId, playerRows: [] });
      }
      tradeGroups.get(tid)!.playerRows.push(txn);
    }

    for (const [, group] of Array.from(tradeGroups)) {
      const teamAMember = teamToMember.get(group.teamAId);
      const teamBMember = teamToMember.get(group.teamBId);
      if (!teamAMember || !teamBMember) continue;

      const rodIsA = teamAMember === rodMemberId;
      const rodIsB = teamBMember === rodMemberId;
      if (!rodIsA && !rodIsB) continue;

      const rivalMemberId = rodIsA ? teamBMember : teamAMember;

      // Simple value: count players received per side (proxy for value)
      // A proper value calc would require the full playerMap — here we use
      // a lightweight heuristic: side that received more players "won"
      let aReceived = 0;
      let bReceived = 0;
      for (const r of group.playerRows) {
        const toTeamId = r.toTeamId as number;
        if (toTeamId === group.teamAId) aReceived++;
        else if (toTeamId === group.teamBId) bReceived++;
      }
      // Rod lost the trade if his side received fewer players
      const rodLostTrade = (rodIsA && aReceived < bReceived) || (rodIsB && bReceived < aReceived);
      if (rodLostTrade) {
        getAcc(rivalMemberId).tradeVerdictLosses++;
      }
    }
  }

  if (!rodMemberId) return [];

  // Fetch rival playoff W/L from live opponent profiles
  let liveProfiles: Map<string, { career: { playoffWins: number; playoffLosses: number } }> | null = null;
  try {
    const { buildLiveOpponentProfiles } = await import('./liveOpponentProfile');
    liveProfiles = await buildLiveOpponentProfiles() as Map<string, { career: { playoffWins: number; playoffLosses: number } }>;
  } catch { /* non-fatal */ }

  // ── Build final rivalry pairs ─────────────────────────────────────────────
  const pairs: RivalryPair[] = [];
  for (const [rivalId, a] of Array.from(acc)) {
    const totalLosses = a.h2hLosses;
    if (totalLosses === 0 && a.playoffEliminations === 0) continue; // no rivalry if never lost

    const score =
      a.h2hLosses * 8 +
      a.playoffEliminations * 30 +
      a.closeLossCount * 6 +
      a.tradeVerdictLosses * 10 +
      a.recentLossSeasons.size * 5;

    const rivalProfile = liveProfiles?.get(rivalId);
    const totalRSGames = a.h2hWins + a.h2hLosses + a.h2hTies;
    const avgRodPF = totalRSGames > 0 ? Math.round((a.totalRodPF / totalRSGames) * 10) / 10 : undefined;
    const avgRivalPF = totalRSGames > 0 ? Math.round((a.totalRivalPF / totalRSGames) * 10) / 10 : undefined;
    const currentStreakDirection: RivalryPair['currentStreakDirection'] =
      a.currentWinStreak > 0 ? 'winning' : a.currentWinStreak < 0 ? 'losing' : 'neutral';
    const currentStreakLength = Math.abs(a.currentWinStreak);
    const sortedBreakdown = [...a.seasonBreakdown].sort((x, y) => x.season - y.season);
    pairs.push({
      memberId: rodMemberId,
      rivalId,
      rivalName: memberNames.get(rivalId) || rivalId,
      rivalryScore: score,
      h2hWins: a.h2hWins,
      h2hLosses: a.h2hLosses,
      h2hTies: a.h2hTies,
      playoffEliminations: a.playoffEliminations,
      closeLossCount: a.closeLossCount,
      tradeVerdictLosses: a.tradeVerdictLosses,
      recentLosses: a.recentLossSeasons.size,
      heatLabel: heatLabel(score),
      painfulLossSeason: a.painfulLossSeason,
      painfulLossMargin: a.painfulLossMargin,
      painfulLossOpponentScore: a.painfulLossOpponentScore,
      revengeAchieved: a.revengeAchieved,
      lastMatchupSeason: a.lastMatchupSeason,
      loreSentence: null, // populated separately
      rivalPlayoffWins: rivalProfile?.career.playoffWins,
      rivalPlayoffLosses: rivalProfile?.career.playoffLosses,
      avgRodPF,
      avgRivalPF,
      biggestRodWinMargin: a.biggestRodWinMargin,
      biggestRodWinSeason: a.biggestRodWinSeason,
      biggestRodWinRodScore: a.biggestRodWinRodScore,
      biggestRodWinRivalScore: a.biggestRodWinRivalScore,
      biggestRodLossMargin: a.biggestRodLossMargin,
      biggestRodLossSeason: a.biggestRodLossSeason,
      biggestRodLossRodScore: a.biggestRodLossRodScore,
      biggestRodLossRivalScore: a.biggestRodLossRivalScore,
      longestWinStreak: a.longestWinStreak,
      longestLossStreak: a.longestLossStreak,
      currentStreakDirection,
      currentStreakLength,
      seasonBreakdown: sortedBreakdown,
    });
  }

  return pairs.sort((a, b) => b.rivalryScore - a.rivalryScore);
}

// ── Lore sentence generation ──────────────────────────────────────────────────

/**
 * Generate a one-sentence rivalry lore for a pair using the LLM.
 * Called only when the rivalry score changes materially (>10 pts).
 * Result is cached in the DB.
 */
export async function generateLoreSentence(pair: RivalryPair): Promise<string> {
  const totalRSGames = pair.h2hWins + pair.h2hLosses + pair.h2hTies;

  // Season-by-season breakdown string (last 6 seasons max)
  const sbLines = (pair.seasonBreakdown ?? [])
    .slice(-6)
    .map(s => `${s.season}: Rod ${s.rodWins}-${s.rodLosses}`)
    .join(', ');

  // Scoring context
  const scoringCtx = (pair.avgRodPF && pair.avgRivalPF)
    ? `Rod averages ${pair.avgRodPF} pts vs ${pair.avgRivalPF} pts allowed in these matchups.`
    : '';

  // Biggest win/loss lines
  const bigWinLine = (pair.biggestRodWinMargin && pair.biggestRodWinSeason)
    ? `Rod's biggest win: ${pair.biggestRodWinRodScore}–${pair.biggestRodWinRivalScore} in ${pair.biggestRodWinSeason} (+${pair.biggestRodWinMargin} pts).`
    : '';
  const bigLossLine = (pair.biggestRodLossMargin && pair.biggestRodLossSeason)
    ? `Rod's biggest loss: ${pair.biggestRodLossRodScore}–${pair.biggestRodLossRivalScore} in ${pair.biggestRodLossSeason} (-${pair.biggestRodLossMargin} pts).`
    : '';

  // Streak context
  const streakLine = (pair.currentStreakLength && pair.currentStreakLength >= 2)
    ? `Rod is currently on a ${pair.currentStreakLength}-game ${pair.currentStreakDirection} streak vs ${pair.rivalName}.`
    : '';
  const longestStreakLine = [
    pair.longestWinStreak && pair.longestWinStreak >= 3 ? `Longest win streak: ${pair.longestWinStreak} in a row.` : '',
    pair.longestLossStreak && pair.longestLossStreak >= 3 ? `Longest loss streak: ${pair.longestLossStreak} in a row.` : '',
  ].filter(Boolean).join(' ');

  // Rival playoff record
  const rivalPoLine = (pair.rivalPlayoffWins !== undefined && pair.rivalPlayoffLosses !== undefined &&
    (pair.rivalPlayoffWins + pair.rivalPlayoffLosses) > 0)
    ? `${pair.rivalName} all-time playoff record: ${pair.rivalPlayoffWins}W-${pair.rivalPlayoffLosses}L.`
    : '';

  const prompt = `You are writing flavor text for a fantasy football rivalry tracker. Write exactly ONE sentence (max 30 words) that captures the emotional essence of this rivalry. Be dramatic, specific, and personal. Reference actual scores or seasons when they make the sentence more vivid. Do NOT use generic phrases like "fierce rivalry" or "heated battle."

Rivalry data:
- Rod Sellers vs ${pair.rivalName}
- All-time regular-season H2H: Rod ${pair.h2hWins}W-${pair.h2hLosses}L-${pair.h2hTies}T (${totalRSGames} games)
- Playoff eliminations by ${pair.rivalName}: ${pair.playoffEliminations}
${rivalPoLine}
- Close losses (< 5 pts): ${pair.closeLossCount}
- Heat level: ${pair.heatLabel}
${scoringCtx}
${bigWinLine}
${bigLossLine}
${streakLine}
${longestStreakLine}
${sbLines ? `- Season breakdown: ${sbLines}` : ''}
${pair.painfulLossSeason ? `- Most painful loss: ${pair.painfulLossSeason} season, lost by ${pair.painfulLossMargin} pts (rival scored ${pair.painfulLossOpponentScore})` : ''}
${pair.revengeAchieved ? '- Rod got revenge in the most recent matchup' : '- Rod has not yet gotten revenge'}

Output: One sentence only. No quotes. No explanation.`;

  try {
    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
    });
    const text = (response?.choices?.[0]?.message?.content as string) || "";
    return text.trim().replace(/^["']|["']$/g, "");
  } catch {
    return `${pair.rivalName} has been a thorn in Rod's side for ${pair.h2hLosses} losses.`;
  }
}

// ── DB persistence ────────────────────────────────────────────────────────────

/**
 * Upsert rivalry scores into the DB.
 * Generates lore sentences for new/materially changed pairs.
 */
export async function persistRivalryScores(pairs: RivalryPair[]): Promise<void> {
  const db = await getDb();
  if (!db || pairs.length === 0) return;

  for (const pair of pairs) {
    // Check if existing score is materially different (>10 pts) to decide lore regen
    const [existing] = await db
      .select({ rivalryScore: rivalryScores.rivalryScore, loreSentence: rivalryScores.loreSentence })
      .from(rivalryScores)
      .where(and(eq(rivalryScores.memberId, pair.memberId), eq(rivalryScores.rivalId, pair.rivalId)))
      .limit(1);

    let loreSentence = existing?.loreSentence ?? null;
    let loreGeneratedAt: Date | null = null;

    const scoreDelta = Math.abs((existing?.rivalryScore ?? 0) - pair.rivalryScore);
    const needsLore = !loreSentence || scoreDelta > 10;

    if (needsLore) {
      loreSentence = await generateLoreSentence(pair);
      loreGeneratedAt = new Date();
    }

    await db
      .insert(rivalryScores)
      .values({
        memberId: pair.memberId,
        rivalId: pair.rivalId,
        rivalName: pair.rivalName,
        rivalryScore: pair.rivalryScore,
        h2hWins: pair.h2hWins,
        h2hLosses: pair.h2hLosses,
        h2hTies: pair.h2hTies,
        playoffEliminations: pair.playoffEliminations,
        closeLossCount: pair.closeLossCount,
        tradeVerdictLosses: pair.tradeVerdictLosses,
        recentLosses: pair.recentLosses,
        heatLabel: pair.heatLabel,
        painfulLossSeason: pair.painfulLossSeason ?? undefined,
        painfulLossMargin: pair.painfulLossMargin !== null ? Math.round(pair.painfulLossMargin * 10) : undefined,
        painfulLossOpponentScore: pair.painfulLossOpponentScore !== null ? Math.round(pair.painfulLossOpponentScore * 10) : undefined,
        revengeAchieved: pair.revengeAchieved,
        lastMatchupSeason: pair.lastMatchupSeason ?? undefined,
        loreSentence,
        loreGeneratedAt: loreGeneratedAt ?? undefined,
        computedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          rivalName: pair.rivalName,
          rivalryScore: pair.rivalryScore,
          h2hWins: pair.h2hWins,
          h2hLosses: pair.h2hLosses,
          h2hTies: pair.h2hTies,
          playoffEliminations: pair.playoffEliminations,
          closeLossCount: pair.closeLossCount,
          tradeVerdictLosses: pair.tradeVerdictLosses,
          recentLosses: pair.recentLosses,
          heatLabel: pair.heatLabel,
          painfulLossSeason: pair.painfulLossSeason ?? undefined,
          painfulLossMargin: pair.painfulLossMargin !== null ? Math.round(pair.painfulLossMargin * 10) : undefined,
          painfulLossOpponentScore: pair.painfulLossOpponentScore !== null ? Math.round(pair.painfulLossOpponentScore * 10) : undefined,
          revengeAchieved: pair.revengeAchieved,
          lastMatchupSeason: pair.lastMatchupSeason ?? undefined,
          ...(needsLore && loreSentence ? { loreSentence, loreGeneratedAt: loreGeneratedAt ?? undefined } : {}),
          computedAt: new Date(),
        },
      });
  }
}

/**
 * Read cached rivalry scores from the DB for a given memberId.
 */
export async function getRivalryScoresFromDb(memberId: string): Promise<RivalryPair[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(rivalryScores)
    .where(eq(rivalryScores.memberId, memberId))
    .orderBy(rivalryScores.rivalryScore);

  return rows
    .map((r) => ({
      memberId: r.memberId,
      rivalId: r.rivalId,
      rivalName: r.rivalName,
      rivalryScore: r.rivalryScore,
      h2hWins: r.h2hWins,
      h2hLosses: r.h2hLosses,
      h2hTies: r.h2hTies,
      playoffEliminations: r.playoffEliminations,
      closeLossCount: r.closeLossCount,
      tradeVerdictLosses: r.tradeVerdictLosses,
      recentLosses: r.recentLosses,
      heatLabel: r.heatLabel as RivalryPair["heatLabel"],
      painfulLossSeason: r.painfulLossSeason ?? null,
      painfulLossMargin: r.painfulLossMargin !== null && r.painfulLossMargin !== undefined
        ? r.painfulLossMargin / 10
        : null,
      painfulLossOpponentScore: r.painfulLossOpponentScore !== null && r.painfulLossOpponentScore !== undefined
        ? r.painfulLossOpponentScore / 10
        : null,
      revengeAchieved: r.revengeAchieved,
      lastMatchupSeason: r.lastMatchupSeason ?? null,
      loreSentence: r.loreSentence ?? null,
    }))
    .sort((a, b) => b.rivalryScore - a.rivalryScore);
}

/**
 * Full pipeline: compute → persist → return.
 * Called from the scheduled refresh and manual refresh procedures.
 */
export async function refreshRivalryScores(): Promise<RivalryPair[]> {
  const pairs = await computeRivalryScores();
  await persistRivalryScores(pairs);
  return pairs;
}
