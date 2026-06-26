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
 *   0–39    → "Cold"
 *   40–79   → "Simmering"
 *   80–129  → "Heated"
 *   130–174 → "Burning"
 *   175+    → "Inferno"
 */

import { getAllCachedSeasons, getDb, resolveActiveLeagueId } from "./db";
import { resolveCurrentOwner } from "./currentOwnerService";
import { buildOwnerIdentityAuthority } from "./ownerIdentityAuthority";
import { buildH2HAuthority } from "./h2hAuthority";
import {
  loadCompletedTradeIntelligence,
  type CompletedTradeIntel,
} from "./completedTradeAuthority";
import { invokeLLM } from "./_core/llm";
import { rivalryScores } from "../drizzle/schema";
import { isMissingTableError } from "./optionalEnrichmentTable";
import { eq, and } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RivalryPair {
  memberId: string;         // the focal user's memberId
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
  // Focal owner's all-time playoff record (for narrative context)
  rivalPlayoffWins?: number;
  rivalPlayoffLosses?: number;
  // Rich regular-season H2H stats (computed, not persisted)
  ownerName?: string;           // focal owner's display name (for LLM prompts)
  avgOwnerPF?: number;          // focal owner's avg score in RS matchups vs this rival
  avgRivalPF?: number;          // rival's avg score in RS matchups vs focal owner
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
  if (score >= 175) return "Inferno";
  if (score >= 130) return "Burning";
  if (score >= 80) return "Heated";
  if (score >= 40) return "Simmering";
  return "Cold";
}

/**
 * Count completed-trade value losses for the focal owner per rival.
 * Uses completedTradeAuthority verdicts only — no player-count proxy.
 */
export function accumulateTradeVerdictLosses(args: {
  trades: CompletedTradeIntel[];
  focalOwnerKey: string;
}): Map<string, number> {
  const losses = new Map<string, number>();
  const focalKey = args.focalOwnerKey.trim();
  if (!focalKey) return losses;

  for (const trade of args.trades) {
    const focalOnA = trade.sideA.ownerKey === focalKey;
    const focalOnB = trade.sideB.ownerKey === focalKey;
    if (!focalOnA && !focalOnB) continue;

    const rivalKey = focalOnA ? trade.sideB.ownerKey : trade.sideA.ownerKey;
    if (!rivalKey) continue;

    // Even trades and focal wins do not count as trade-verdict losses.
    if (!trade.winnerOwnerKey || trade.winnerOwnerKey === focalKey) continue;
    if (trade.winnerOwnerKey !== rivalKey) continue;

    losses.set(rivalKey, (losses.get(rivalKey) ?? 0) + 1);
  }

  return losses;
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute rivalry scores for all opponents vs the primary user (Rod).
 * Head-to-head is sourced from the H2H Authority (complete gmMatchups history,
 * resolved through the Owner Identity Authority); trade-verdict losses come from
 * completedTradeAuthority (gmTransactions + value verdict). Only opponents who
 * fielded a team in the league last year receive a heat score.
 */
export async function computeRivalryScores(userId?: number, leagueId?: string): Promise<RivalryPair[]> {
  const cachedSeasons = await getAllCachedSeasons(leagueId, userId);
  if (cachedSeasons.length === 0) return [];

  // ── Identity + H2H authorities (single source of truth) ──────────────────
  const { leagueId: lid } = await resolveActiveLeagueId(
    { user: userId != null ? { id: userId } : null },
    leagueId ?? null,
  );
  if (!lid) return [];
  const identity = await buildOwnerIdentityAuthority(lid);
  const h2h = await buildH2HAuthority(lid);

  // Focal owner (Rod): resolve his ESPN SWID, then his canonical person id.
  let focalMemberId: string | null = null;
  if (userId != null) {
    const co = await resolveCurrentOwner({ id: userId });
    if (co.isSetupComplete) focalMemberId = co.ownerId;
  }
  if (!focalMemberId) return [];

  const allRows = identity.resolveAll();
  const normSwid = (s: string | null | undefined) => (s ?? "").replace(/[{}]/g, "").trim().toLowerCase();
  const focalRow = allRows.find(
    (r) =>
      r.resolution.status === "resolved" &&
      !!r.resolution.canonicalPersonId &&
      r.resolution.canonicalPersonId.startsWith("id:") &&
      normSwid((r as { ownerId?: string | null }).ownerId) === normSwid(focalMemberId),
  );
  const focalCanon =
    focalRow?.resolution.canonicalPersonId ??
    `id:${focalMemberId.startsWith("{") ? focalMemberId : `{${focalMemberId}}`}`;

  // "Recent" window and the in-league-last-year filter both key off the
  // league's newest season. Last year = newest − 1; recent = last 3 seasons.
  const RECENT_SEASONS = 3;
  const currentSeason = allRows.length ? Math.max(...allRows.map((r) => r.season)) : new Date().getFullYear();
  const lastYear = currentSeason - 1;
  const recentThreshold = currentSeason - (RECENT_SEASONS - 1);

  // Heat list only includes owners who fielded a team in the league last year.
  // This drops departed owners and (incidentally) every id-less pre-cache
  // person, keeping the migrated rivalry set purely id-keyed.
  const activeLastYear = new Set<string>();
  for (const r of allRows) {
    if (r.season === lastYear && r.resolution.status === "resolved" && r.resolution.canonicalPersonId) {
      activeLastYear.add(r.resolution.canonicalPersonId);
    }
  }

  // canonical person id → display name
  const nameOf = new Map(
    identity.listPersons().map((p) => [p.canonicalPersonId, p.canonicalName] as const),
  );

  // Seasons with completed trade rows in gmTransactions.
  const sortedSeasons = [...cachedSeasons].sort((a, b) => a - b);

  // Per-opponent accumulators (keyed by canonical person id)
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
    totalOwnerPF: number;
    totalRivalPF: number;
    biggestRodWinMargin: number | null;
    biggestRodWinSeason: number | null;
    biggestRodWinRodScore: number | null;
    biggestRodWinRivalScore: number | null;
    biggestRodLossMargin: number | null;
    biggestRodLossSeason: number | null;
    biggestRodLossRodScore: number | null;
    biggestRodLossRivalScore: number | null;
    currentWinStreak: number;
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
        totalOwnerPF: 0, totalRivalPF: 0,
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

  // ── Pass 1: Head-to-head from the H2H Authority (complete history) ────────
  // Meetings are A-oriented (A = focal/Rod): scoreA = Rod, scoreB = rival,
  // winner = canonical id or null (tie). Ties are skipped, matching prior behavior.
  for (const opp of h2h.opponentsOf(focalCanon)) {
    const result = h2h.getH2H(focalCanon, opp);
    const rivalA = getAcc(opp);
    for (const m of result.meetings) {
      if (m.winner === null) continue; // tie — never counted (prior behavior)
      const season = m.season;
      const rodWon = m.winner === focalCanon;
      const rodScore = m.scoreA;
      const rivalScore = m.scoreB;
      const margin = Math.abs(m.marginA);

      if (!m.isPlayoff) {
        rivalA.totalOwnerPF += rodScore;
        rivalA.totalRivalPF += rivalScore;

        let sb = rivalA.seasonBreakdown.find((s) => s.season === season);
        if (!sb) { sb = { season, rodWins: 0, rodLosses: 0 }; rivalA.seasonBreakdown.push(sb); }

        if (rodWon) {
          rivalA.h2hWins++;
          sb.rodWins++;
          if (rivalA.biggestRodWinMargin === null || margin > rivalA.biggestRodWinMargin) {
            rivalA.biggestRodWinMargin = Math.round(margin * 10) / 10;
            rivalA.biggestRodWinSeason = season;
            rivalA.biggestRodWinRodScore = Math.round(rodScore * 10) / 10;
            rivalA.biggestRodWinRivalScore = Math.round(rivalScore * 10) / 10;
          }
          if (rivalA.currentWinStreak >= 0) rivalA.currentWinStreak++;
          else rivalA.currentWinStreak = 1;
          if (rivalA.currentWinStreak > rivalA.longestWinStreak) rivalA.longestWinStreak = rivalA.currentWinStreak;
        } else {
          rivalA.h2hLosses++;
          sb.rodLosses++;
          if (margin < 5) rivalA.closeLossCount++;
          if (rivalA.painfulLossOpponentScore === null || rivalScore > rivalA.painfulLossOpponentScore) {
            rivalA.painfulLossSeason = season;
            rivalA.painfulLossMargin = Math.round(margin * 10) / 10;
            rivalA.painfulLossOpponentScore = Math.round(rivalScore * 10) / 10;
          }
          if (rivalA.biggestRodLossMargin === null || margin > rivalA.biggestRodLossMargin) {
            rivalA.biggestRodLossMargin = Math.round(margin * 10) / 10;
            rivalA.biggestRodLossSeason = season;
            rivalA.biggestRodLossRodScore = Math.round(rodScore * 10) / 10;
            rivalA.biggestRodLossRivalScore = Math.round(rivalScore * 10) / 10;
          }
          if (rivalA.currentWinStreak <= 0) rivalA.currentWinStreak--;
          else rivalA.currentWinStreak = -1;
          if (Math.abs(rivalA.currentWinStreak) > rivalA.longestLossStreak) rivalA.longestLossStreak = Math.abs(rivalA.currentWinStreak);
          if (season >= recentThreshold) rivalA.recentLossSeasons.add(season);
        }

        if (rivalA.lastMatchupSeason === null || season > rivalA.lastMatchupSeason) {
          rivalA.lastMatchupSeason = season;
          rivalA.revengeAchieved = rodWon;
        }
      } else {
        if (!rodWon) rivalA.playoffEliminations++;
        if (rivalA.lastMatchupSeason === null || season > rivalA.lastMatchupSeason) {
          rivalA.lastMatchupSeason = season;
          rivalA.revengeAchieved = rodWon;
        }
      }
    }
  }

  // ── Pass 2: Trade verdict losses (completed trade intelligence authority) ──
  const db = await getDb();
  if (db) {
    const completedTrades = await loadCompletedTradeIntelligence({
      db,
      leagueId: lid,
      seasons: sortedSeasons,
    });
    const tradeLosses = accumulateTradeVerdictLosses({
      trades: completedTrades,
      focalOwnerKey: focalCanon,
    });
    for (const [rivalCanon, count] of tradeLosses) {
      if (count > 0) getAcc(rivalCanon).tradeVerdictLosses += count;
    }
  }

  if (!focalMemberId) return [];

  // Fetch rival playoff W/L from live opponent profiles
  let liveProfiles: Map<string, { career: { playoffWins: number; playoffLosses: number } }> | null = null;
  try {
    const { buildLiveOpponentProfiles } = await import('./liveOpponentProfile');
    liveProfiles = await buildLiveOpponentProfiles(userId) as Map<string, { career: { playoffWins: number; playoffLosses: number } }>;
  } catch { /* non-fatal */ }

  // ── Build final rivalry pairs ─────────────────────────────────────────────
  const pairs: RivalryPair[] = [];
  for (const [canonId, a] of Array.from(acc)) {
    const totalLosses = a.h2hLosses;
    if (totalLosses === 0 && a.playoffEliminations === 0) continue; // no rivalry if never lost
    if (!activeLastYear.has(canonId)) continue; // only owners in the league last year get a heat score
    // Emit the rival's ESPN SWID (downstream keys off this). Survivors are all id-keyed.
    const rivalId = canonId.startsWith("id:") ? canonId.slice(3) : canonId;

    const score =
      a.h2hLosses * 8 +
      a.playoffEliminations * 30 +
      a.closeLossCount * 6 +
      a.tradeVerdictLosses * 10 +
      a.recentLossSeasons.size * 5;

    const rivalProfile = liveProfiles?.get(rivalId);
    const totalRSGames = a.h2hWins + a.h2hLosses + a.h2hTies;
    const avgOwnerPF = totalRSGames > 0 ? Math.round((a.totalOwnerPF / totalRSGames) * 10) / 10 : undefined;
    const avgRivalPF = totalRSGames > 0 ? Math.round((a.totalRivalPF / totalRSGames) * 10) / 10 : undefined;
    const currentStreakDirection: RivalryPair['currentStreakDirection'] =
      a.currentWinStreak > 0 ? 'winning' : a.currentWinStreak < 0 ? 'losing' : 'neutral';
    const currentStreakLength = Math.abs(a.currentWinStreak);
    const sortedBreakdown = [...a.seasonBreakdown].sort((x, y) => x.season - y.season);
    pairs.push({
      memberId: focalMemberId,
      rivalId,
      rivalName: nameOf.get(canonId) || rivalId,
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
      loreSentence: null,
      ownerName: nameOf.get(focalCanon) || undefined,
      rivalPlayoffWins: rivalProfile?.career.playoffWins,
      rivalPlayoffLosses: rivalProfile?.career.playoffLosses,
      avgOwnerPF,
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
  const ownerLabel = pair.ownerName ?? "The focal owner";
  const totalRSGames = pair.h2hWins + pair.h2hLosses + pair.h2hTies;

  // Season-by-season breakdown string (last 6 seasons max)
  const sbLines = (pair.seasonBreakdown ?? [])
    .slice(-6)
    .map(s => `${s.season}: ${ownerLabel} ${s.rodWins}-${s.rodLosses}`)
    .join(', ');

  // Scoring context
  const scoringCtx = (pair.avgOwnerPF && pair.avgRivalPF)
    ? `${ownerLabel} averages ${pair.avgOwnerPF} pts vs ${pair.avgRivalPF} pts allowed in these matchups.`
    : '';

  // Biggest win/loss lines
  const bigWinLine = (pair.biggestRodWinMargin && pair.biggestRodWinSeason)
    ? `${ownerLabel}'s biggest win: ${pair.biggestRodWinRodScore}–${pair.biggestRodWinRivalScore} in ${pair.biggestRodWinSeason} (+${pair.biggestRodWinMargin} pts).`
    : '';
  const bigLossLine = (pair.biggestRodLossMargin && pair.biggestRodLossSeason)
    ? `${ownerLabel}'s biggest loss: ${pair.biggestRodLossRodScore}–${pair.biggestRodLossRivalScore} in ${pair.biggestRodLossSeason} (-${pair.biggestRodLossMargin} pts).`
    : '';

  // Streak context
  const streakLine = (pair.currentStreakLength && pair.currentStreakLength >= 2)
    ? `${ownerLabel} is currently on a ${pair.currentStreakLength}-game ${pair.currentStreakDirection} streak vs ${pair.rivalName}.`
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
- ${ownerLabel} vs ${pair.rivalName}
- All-time regular-season H2H: ${ownerLabel} ${pair.h2hWins}W-${pair.h2hLosses}L-${pair.h2hTies}T (${totalRSGames} games)
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
${pair.revengeAchieved ? `- ${ownerLabel} got revenge in the most recent matchup` : `- ${ownerLabel} has not yet gotten revenge`}

Output: One sentence only. No quotes. No explanation.`;

  try {
    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
    });
    const text = (response?.choices?.[0]?.message?.content as string) || "";
    return text.trim().replace(/^["']|["']$/g, "");
  } catch {
    return `${pair.rivalName} has been a thorn for ${pair.h2hLosses} losses.`;
  }
}

// ── DB persistence ────────────────────────────────────────────────────────────

/**
 * Upsert rivalry scores into the DB.
 * Generates lore sentences for new/materially changed pairs.
 */
export async function persistRivalryScores(pairs: RivalryPair[], leagueId: string): Promise<void> {
  const db = await getDb();
  if (!db || pairs.length === 0) return;

  for (const pair of pairs) {
    // Check if existing score is materially different (>10 pts) to decide lore regen
    let existing: { rivalryScore: number | null; loreSentence: string | null } | undefined;
    try {
      [existing] = await db
        .select({ rivalryScore: rivalryScores.rivalryScore, loreSentence: rivalryScores.loreSentence })
        .from(rivalryScores)
        .where(and(eq(rivalryScores.memberId, pair.memberId), eq(rivalryScores.rivalId, pair.rivalId), eq(rivalryScores.leagueId, leagueId)))
        .limit(1);
    } catch (e) {
      if (isMissingTableError(e)) {
        console.warn("[enrichment] persistRivalryScores: rivalry_scores table absent, skipping rivalry-score persistence.");
        return;
      }
      throw e;
    }

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
        leagueId,
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
export async function getRivalryScoresFromDb(memberId: string, leagueId: string): Promise<RivalryPair[]> {
  const db = await getDb();
  if (!db) return [];

  let rows: Array<typeof rivalryScores.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(rivalryScores)
      .where(and(eq(rivalryScores.memberId, memberId), eq(rivalryScores.leagueId, leagueId)))
      .orderBy(rivalryScores.rivalryScore);
  } catch (e) {
    if (isMissingTableError(e)) {
      console.warn("[enrichment] getRivalryScoresFromDb: rivalry_scores table absent, returning empty enrichment.");
      return [];
    }
    throw e;
  }

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
export async function refreshRivalryScores(userId?: number, leagueIdInput?: string): Promise<RivalryPair[]> {
  const { leagueId } = await resolveActiveLeagueId({ user: userId != null ? { id: userId } : undefined }, leagueIdInput ?? null, undefined);
  const pairs = await computeRivalryScores(userId, leagueId);
  await persistRivalryScores(pairs, leagueId);
  return pairs;
}
