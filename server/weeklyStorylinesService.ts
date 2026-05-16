/**
 * weeklyStorylinesService.ts
 * ──────────────────────────
 * Sprint 3: Weekly Storylines Feed
 *
 * Generates a journalist-voice, emotionally-tagged feed of league stories
 * for the current week. All 8 story-type triggers are deterministic; only
 * the headline and body copy are LLM-generated (cached per story per week).
 *
 * Story types:
 *   REVENGE_GAME          — Rod faces a manager he has lost to 3+ times H2H
 *   COLLAPSE              — Manager was top-3 last season, currently bottom-3
 *   SILENT_THREAT         — Manager is 6-1+ but rarely traded or made moves
 *   DESPERATION_WINDOW    — Manager has desperation score ≥ 60
 *   PLAYOFF_BUBBLE        — Manager is exactly 1 game out of playoffs (top-7)
 *   MOMENTUM_SHIFT        — Manager has won 3+ in a row after a losing streak
 *   FEAR_RISING           — Manager's PF is top-2 in last 4 weeks (approx)
 *   HEARTBREAK_PENDING    — Rod faces a manager who eliminated him from playoffs
 *
 * Exports:
 *   computeWeeklyStorylines()  — deterministic trigger evaluation, no DB
 *   refreshWeeklyStorylines()  — compute + LLM + persist to DB
 *   getWeeklyStorylinesFromDb() — read cached rows from DB
 */

import { getDb, getCachedView } from "./db";
import { weeklyStorylines, rivalryScores } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  normalizeTeams,
  normalizeMatchups,
  normalizeTransactions,
  normalizeSettings,
} from "./espnService";
import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoryType =
  | "REVENGE_GAME"
  | "COLLAPSE"
  | "SILENT_THREAT"
  | "DESPERATION_WINDOW"
  | "PLAYOFF_BUBBLE"
  | "MOMENTUM_SHIFT"
  | "FEAR_RISING"
  | "HEARTBREAK_PENDING";

export type EmotionalTag =
  | "REVENGE GAME"
  | "COLLAPSE IN PROGRESS"
  | "SILENT THREAT"
  | "TRADE WINDOW OPEN"
  | "PLAYOFF BUBBLE"
  | "MOMENTUM SHIFT"
  | "THREAT LEVEL RISING"
  | "UNFINISHED BUSINESS";

export interface StoryTrigger {
  storyType: StoryType;
  emotionalTag: EmotionalTag;
  teamId: number;
  ownerName: string;
  record: string;
  intensityScore: number;       // 0-100, used for ordering
  supportingStat: string;       // displayed in the card
  opponentName: string | null;  // for matchup-based stories
  // Context injected into LLM prompt
  llmContext: string;
}

export interface WeeklyStorylineRow {
  id: number;
  season: number;
  week: number;
  storyType: string;
  emotionalTag: string;
  teamId: number;
  ownerName: string;
  record: string;
  intensityScore: number;
  headline: string | null;
  bodyText: string | null;
  supportingStat: string | null;
  opponentName: string | null;
  generatedAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRodTeam(name: string, abbrev: string, owners: string): boolean {
  const n = name.toLowerCase();
  const o = owners.toLowerCase();
  return n.includes("str8") || n.includes("rodzilla") ||
    o.includes("rod") || o.includes("sellers") ||
    abbrev.toLowerCase().includes("rod");
}

/**
 * Compute a rough desperation score from win%, transaction activity, and
 * recent matchup results — mirrors the leaguePulse calculation so we don't
 * need a full weeklyAssessment run.
 */
function quickDesperationScore(
  wins: number,
  losses: number,
  lastWeekTxCount: number,
  lastWeekLost: boolean
): number {
  const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;
  const raw = Math.round(
    (1 - winPct) * 60 +
    lastWeekTxCount * 5 +
    (lastWeekLost ? 10 : 0)
  );
  return Math.min(100, raw);
}

/**
 * Compute win/loss streak from matchup history for a team.
 * Returns positive = win streak, negative = loss streak.
 */
function computeStreak(
  matchups: ReturnType<typeof normalizeMatchups>,
  teamId: number,
  currentWeek: number
): number {
  // Collect results in reverse chronological order
  const results: boolean[] = [];
  for (let w = currentWeek - 1; w >= 1; w--) {
    const m = (matchups as Array<Record<string, unknown>>).find(
      (mx) =>
        (mx.matchupPeriodId as number) === w &&
        ((mx.homeTeamId as number) === teamId || (mx.awayTeamId as number) === teamId)
    );
    if (!m) break;
    const homeId = m.homeTeamId as number;
    const homeScore = (m.homeTotalPoints as number) || 0;
    const awayScore = (m.awayTotalPoints as number) || 0;
    const won = homeId === teamId ? homeScore > awayScore : awayScore > homeScore;
    results.push(won);
  }
  if (!results.length) return 0;
  const first = results[0];
  let streak = 0;
  for (const r of results) {
    if (r === first) streak++;
    else break;
  }
  return first ? streak : -streak;
}

/**
 * Get the last N weeks' points for a team (for FEAR_RISING detection).
 */
function recentPoints(
  matchups: ReturnType<typeof normalizeMatchups>,
  teamId: number,
  currentWeek: number,
  n = 4
): number {
  let total = 0;
  for (let w = currentWeek - 1; w >= Math.max(1, currentWeek - n); w--) {
    const m = (matchups as Array<Record<string, unknown>>).find(
      (mx) =>
        (mx.matchupPeriodId as number) === w &&
        ((mx.homeTeamId as number) === teamId || (mx.awayTeamId as number) === teamId)
    );
    if (!m) continue;
    const homeId = m.homeTeamId as number;
    total += homeId === teamId
      ? (m.homeTotalPoints as number) || 0
      : (m.awayTotalPoints as number) || 0;
  }
  return total;
}

// ─── Core: deterministic trigger evaluation ───────────────────────────────────

export interface StorylinesInput {
  season: number;
  week: number;
  teams: ReturnType<typeof normalizeTeams>;
  matchups: ReturnType<typeof normalizeMatchups>;
  transactions: unknown[];
  settings: Record<string, unknown>;
  ownerMap: Record<number, string>;
  teamNameMap: Record<number, string>;
  memberIdsMap: Record<number, string[]>;
  rivalryPairs: Array<{
    rivalId: string;
    rivalName: string;
    h2hLosses: number;
    playoffEliminations: number;
  }>;
  rodTeamId: number | null;
  rodMemberIds: string[];
  prevSeasonRanks: Record<number, number>; // teamId → final rank last season
  // memberId → { playoffWins, playoffLosses } for narrative context
  ownerPlayoffRecords?: Record<string, { playoffWins: number; playoffLosses: number }>;
  // rivalId → rich H2H stats block string (pre-built by refreshWeeklyStorylines)
  rivalH2HBlocks?: Record<string, string>;
}

export function computeWeeklyStorylines(input: StorylinesInput): StoryTrigger[] {
  const {
    season, week, teams, matchups, transactions, ownerMap, teamNameMap,
    rivalryPairs, rodTeamId, rodMemberIds, prevSeasonRanks,
    ownerPlayoffRecords = {},
    rivalH2HBlocks = {},
  } = input;

  const stories: StoryTrigger[] = [];

  // Build current matchup map: teamId → opponentTeamId
  const currentMatchupMap: Record<number, number> = {};
  for (const m of matchups as Array<Record<string, unknown>>) {
    if ((m.matchupPeriodId as number) === week) {
      const home = m.homeTeamId as number;
      const away = m.awayTeamId as number;
      if (home && away) {
        currentMatchupMap[home] = away;
        currentMatchupMap[away] = home;
      }
    }
  }

  // Build last-week transaction counts
  const lastWeekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const lastWeekTxMap: Record<number, number> = {};
  const totalTxMap: Record<number, number> = {};
  for (const tx of transactions as Array<Record<string, unknown>>) {
    const tid = tx.teamId as number;
    if (!tid) continue;
    totalTxMap[tid] = (totalTxMap[tid] || 0) + 1;
    if ((tx.proposedDate as number) > lastWeekStart && tx.status === "EXECUTED") {
      lastWeekTxMap[tid] = (lastWeekTxMap[tid] || 0) + 1;
    }
  }

  // Sort teams by wins for standings
  const sortedTeams = [...teams].sort((a, b) => {
    const wA = (a.wins as number) || 0;
    const wB = (b.wins as number) || 0;
    return wB !== wA ? wB - wA : ((b.pointsFor as number) || 0) - ((a.pointsFor as number) || 0);
  });
  const standingMap: Record<number, number> = {};
  sortedTeams.forEach((t, idx) => { standingMap[t.teamId as number] = idx + 1; });

  // Compute recent points for all teams (for FEAR_RISING)
  const recentPtsMap: Record<number, number> = {};
  for (const t of teams) {
    const tid = t.teamId as number;
    recentPtsMap[tid] = recentPoints(matchups, tid, week);
  }
  const sortedByRecent = Object.entries(recentPtsMap).sort((a, b) => b[1] - a[1]);
  const top2RecentTeamIds = new Set(sortedByRecent.slice(0, 2).map(([id]) => Number(id)));

  // Build a set of rival IDs who eliminated Rod from playoffs
  const playoffEliminatorRivalIds = new Set(
    rivalryPairs
      .filter((r) => r.playoffEliminations > 0)
      .map((r) => r.rivalId)
  );

  // Build memberIds → teamId map for rivalry matching
  const memberToTeamId: Record<string, number> = {};
  for (const t of teams) {
    const tid = t.teamId as number;
    const mids = (t.memberIds as string[]) || [];
    for (const mid of mids) memberToTeamId[mid] = tid;
  }

  // Build set of rival teamIds (by memberId)
  const rivalTeamIdSet = new Set<number>();
  for (const rp of rivalryPairs) {
    const tid = memberToTeamId[rp.rivalId];
    if (tid) rivalTeamIdSet.add(tid);
  }

  // ── Per-team trigger evaluation ────────────────────────────────────────────
  for (const team of teams) {
    const tid = team.teamId as number;
    const wins = (team.wins as number) || 0;
    const losses = (team.losses as number) || 0;
    const pf = (team.pointsFor as number) || 0;
    const ownerName = ownerMap[tid] || "Unknown";
    const record = `${wins}-${losses}`;
    const rank = standingMap[tid] || 14;
    const isRod = tid === rodTeamId;
    const opponentTid = currentMatchupMap[tid] ?? null;
    const opponentName = opponentTid ? (ownerMap[opponentTid] || null) : null;

    // Last week result
    const lastWeekMatchup = (matchups as Array<Record<string, unknown>>).find(
      (m) =>
        (m.matchupPeriodId as number) === week - 1 &&
        ((m.homeTeamId as number) === tid || (m.awayTeamId as number) === tid)
    );
    let lastWeekLost = false;
    if (lastWeekMatchup) {
      const homeId = lastWeekMatchup.homeTeamId as number;
      const homeScore = (lastWeekMatchup.homeTotalPoints as number) || 0;
      const awayScore = (lastWeekMatchup.awayTotalPoints as number) || 0;
      const won = homeId === tid ? homeScore > awayScore : awayScore > homeScore;
      lastWeekLost = !won;
    }

    const despScore = quickDesperationScore(wins, losses, lastWeekTxMap[tid] || 0, lastWeekLost);
    const streak = computeStreak(matchups, tid, week);
    const prevRank = prevSeasonRanks[tid] ?? null;
    const totalTx = totalTxMap[tid] || 0;

    // ── 1. REVENGE_GAME (Rod only) ────────────────────────────────────────
    if (isRod && opponentTid) {
      const opponentMids = (teams.find(t => (t.teamId as number) === opponentTid)?.memberIds as string[]) || [];
      const matchingRivalry = rivalryPairs.find(
        (rp) => opponentMids.includes(rp.rivalId) && rp.h2hLosses >= 3
      );
      if (matchingRivalry) {
        const opponentMids2 = (teams.find(t => (t.teamId as number) === opponentTid)?.memberIds as string[]) || [];
        const rivalPoRec = opponentMids2.map(mid => ownerPlayoffRecords[mid]).find(Boolean);
        const rivalPoStr = rivalPoRec && (rivalPoRec.playoffWins + rivalPoRec.playoffLosses) > 0
          ? ` ${matchingRivalry.rivalName} is ${rivalPoRec.playoffWins}W-${rivalPoRec.playoffLosses}L all-time in the playoffs.`
          : '';
        stories.push({
          storyType: "REVENGE_GAME",
          emotionalTag: "REVENGE GAME",
          teamId: tid,
          ownerName,
          record,
          intensityScore: Math.min(100, 50 + matchingRivalry.h2hLosses * 5),
          supportingStat: `H2H record: ${matchingRivalry.h2hLosses} losses vs ${matchingRivalry.rivalName}`,
          opponentName,
          llmContext: `Rod Sellers (${record}) faces ${matchingRivalry.rivalName} this week. Rod has lost to them ${matchingRivalry.h2hLosses} times head-to-head.${rivalPoStr} This is a revenge opportunity.${rivalH2HBlocks[matchingRivalry.rivalId] ? `\n\nFull H2H history:\n${rivalH2HBlocks[matchingRivalry.rivalId]}` : ''}`,
        });
      }
    }

    // ── 2. HEARTBREAK_PENDING (Rod only) ─────────────────────────────────
    if (isRod && opponentTid) {
      const opponentMids = (teams.find(t => (t.teamId as number) === opponentTid)?.memberIds as string[]) || [];
      const isEliminator = opponentMids.some((mid) => playoffEliminatorRivalIds.has(mid));
      if (isEliminator) {
        const elimRival = rivalryPairs.find(
          (rp) => opponentMids.includes(rp.rivalId) && rp.playoffEliminations > 0
        );
        const elimMids = (teams.find(t => (t.teamId as number) === opponentTid)?.memberIds as string[]) || [];
        const elimPoRec = elimMids.map(mid => ownerPlayoffRecords[mid]).find(Boolean);
        const elimPoStr = elimPoRec && (elimPoRec.playoffWins + elimPoRec.playoffLosses) > 0
          ? ` ${opponentName} is ${elimPoRec.playoffWins}W-${elimPoRec.playoffLosses}L all-time in the playoffs.`
          : '';
        stories.push({
          storyType: "HEARTBREAK_PENDING",
          emotionalTag: "UNFINISHED BUSINESS",
          teamId: tid,
          ownerName,
          record,
          intensityScore: Math.min(100, 60 + (elimRival?.playoffEliminations ?? 1) * 15),
          supportingStat: `${elimRival?.rivalName ?? opponentName} eliminated Rod from playoffs ${elimRival?.playoffEliminations ?? 1}x`,
          opponentName,
          llmContext: `Rod Sellers (${record}) faces ${opponentName} this week — the same manager who has eliminated Rod from the playoffs ${elimRival?.playoffEliminations ?? 1} time(s).${elimPoStr} This is unfinished business.${elimRival && rivalH2HBlocks[elimRival.rivalId] ? `\n\nFull H2H history:\n${rivalH2HBlocks[elimRival.rivalId]}` : ''}`,
        });
      }
    }

     // ── 3. COLLAPSE ─────────────────────────────────────────────────────
    if (prevRank !== null && prevRank <= 3 && rank >= 10) {
      const teamMids3 = (team.memberIds as string[]) || [];
      const collapsePoRec = teamMids3.map(mid => ownerPlayoffRecords[mid]).find(Boolean);
      const collapsePoStr = collapsePoRec && (collapsePoRec.playoffWins + collapsePoRec.playoffLosses) > 0
        ? ` Their playoff record is ${collapsePoRec.playoffWins}W-${collapsePoRec.playoffLosses}L all-time.`
        : '';
      stories.push({
        storyType: "COLLAPSE",
        emotionalTag: "COLLAPSE IN PROGRESS",
        teamId: tid,
        ownerName,
        record,
        intensityScore: Math.min(100, 40 + (rank - prevRank) * 5),
        supportingStat: `Was #${prevRank} last season, now #${rank}`,
        opponentName,
        llmContext: `${ownerName} finished #${prevRank} in the league last season but is currently ranked #${rank} at ${record}.${collapsePoStr} A dramatic collapse is underway.`,
      });
    }

    // ── 4. SILENT_THREAT ─────────────────────────────────────────────────
    if (wins >= 6 && rank <= 3 && totalTx <= 3) {
      stories.push({
        storyType: "SILENT_THREAT",
        emotionalTag: "SILENT THREAT",
        teamId: tid,
        ownerName,
        record,
        intensityScore: Math.min(100, 50 + wins * 5),
        supportingStat: `${wins}-${losses} with only ${totalTx} total transactions`,
        opponentName,
        llmContext: `${ownerName} is ${record} and ranked #${rank} in the league while making only ${totalTx} total transactions. They are winning without making noise — the most dangerous kind of threat.`,
      });
    }

    // ── 5. DESPERATION_WINDOW ────────────────────────────────────────────
    if (despScore >= 60 && !isRod) {
      stories.push({
        storyType: "DESPERATION_WINDOW",
        emotionalTag: "TRADE WINDOW OPEN",
        teamId: tid,
        ownerName,
        record,
        intensityScore: despScore,
        supportingStat: `Desperation score: ${despScore}/100`,
        opponentName,
        llmContext: `${ownerName} is ${record} with a desperation score of ${despScore}/100. Their trade window is wide open — they need to make moves to save their season.`,
      });
    }
    // ── 6. PLAYOFF_BUBBLE ───────────────────────────────────────────────────
    // Top 7 make playoffs. A team is on the bubble if they are rank 7 or 8.
    if (rank === 7 || rank === 8) {
      const gamesLeft = 14 - (wins + losses);
      const teamMids6 = (team.memberIds as string[]) || [];
      const bubblePoRec = teamMids6.map(mid => ownerPlayoffRecords[mid]).find(Boolean);
      const bubblePoStr = bubblePoRec && (bubblePoRec.playoffWins + bubblePoRec.playoffLosses) > 0
        ? ` ${ownerName} is ${bubblePoRec.playoffWins}W-${bubblePoRec.playoffLosses}L all-time in the playoffs.`
        : '';
      stories.push({
        storyType: "PLAYOFF_BUBBLE",
        emotionalTag: "PLAYOFF BUBBLE",
        teamId: tid,
        ownerName,
        record,
        intensityScore: Math.min(100, 50 + (14 - gamesLeft) * 3),
        supportingStat: `Ranked #${rank} — ${rank === 7 ? "last playoff spot" : "first out"}`,
        opponentName,
        llmContext: `${ownerName} is ${record} and ranked #${rank} — ${rank === 7 ? "holding the last playoff spot" : "one game out of the playoffs"} with ${gamesLeft} weeks remaining.${bubblePoStr}`,
      });
    }

    // ── 7. MOMENTUM_SHIFT ──────────────────────────────────────────────────────/ Won 3+ in a row after a previous losing streak
    if (streak >= 3) {
      // Check that before this streak there was a losing period
      // (approximate: if they have more losses than wins overall, it's a comeback)
      const hadLosses = losses >= 2;
      if (hadLosses) {
        stories.push({
          storyType: "MOMENTUM_SHIFT",
          emotionalTag: "MOMENTUM SHIFT",
          teamId: tid,
          ownerName,
          record,
          intensityScore: Math.min(100, 40 + streak * 10),
          supportingStat: `${streak}-game win streak`,
          opponentName,
          llmContext: `${ownerName} is ${record} and has won ${streak} games in a row after a slow start. The momentum has shifted — they are dangerous right now.`,
        });
      }
    }

    // ── 8. FEAR_RISING ───────────────────────────────────────────────────
    if (top2RecentTeamIds.has(tid) && !isRod) {
      const pts = recentPtsMap[tid] || 0;
      stories.push({
        storyType: "FEAR_RISING",
        emotionalTag: "THREAT LEVEL RISING",
        teamId: tid,
        ownerName,
        record,
        intensityScore: Math.min(100, 55 + Math.round(pts / 10)),
        supportingStat: `Top-2 in scoring over last 4 weeks (${pts.toFixed(0)} pts)`,
        opponentName,
        llmContext: `${ownerName} is ${record} and has scored ${pts.toFixed(0)} points over the last 4 weeks — top-2 in the league. Their roster is peaking at the right time.`,
      });
    }
  }

  // Deduplicate: if Rod triggers both REVENGE_GAME and HEARTBREAK_PENDING for the
  // same opponent, keep only the higher-intensity one
  const seen = new Map<string, StoryTrigger>();
  for (const s of stories) {
    const key = `${s.teamId}-${s.opponentName ?? ""}`;
    const existing = seen.get(key);
    if (!existing || s.intensityScore > existing.intensityScore) {
      seen.set(key, s);
    } else if (existing.storyType !== s.storyType) {
      // Different story types for same team — keep both
      seen.set(`${s.teamId}-${s.storyType}`, s);
    }
  }

  // Sort by intensity descending
  return Array.from(seen.values()).sort((a, b) => b.intensityScore - a.intensityScore);
}

// ─── LLM generation ───────────────────────────────────────────────────────────

async function generateStoryContent(
  trigger: StoryTrigger
): Promise<{ headline: string; bodyText: string }> {
  const tagLabel = trigger.emotionalTag;
  const prompt = `You are a sharp, emotionally intelligent fantasy football journalist writing for a 14-team league that has played together for 18 seasons. Write a story card for this week's storylines feed.

Story type: ${trigger.storyType}
Emotional tag: ${tagLabel}
Context: ${trigger.llmContext}

Write:
1. A bold, punchy headline (max 8 words) in the voice of a sports journalist. No quotes. No punctuation at end. Examples: "Demetri Clark Is Cracking", "The Silent Assassin Strikes Again", "Rod's Revenge Tour Begins Now"
2. A 2-sentence narrative body that explains the story with specific facts and emotional weight. Use the manager's name. Reference the stat. Make it feel like something is at stake.

Respond ONLY with valid JSON: {"headline": "...", "bodyText": "..."}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fantasy football journalist. Output only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "story_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              headline: { type: "string" },
              bodyText: { type: "string" },
            },
            required: ["headline", "bodyText"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = response?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    return {
      headline: (parsed.headline as string) || `${trigger.ownerName}: ${trigger.emotionalTag}`,
      bodyText: (parsed.bodyText as string) || trigger.llmContext,
    };
  } catch {
    // Fallback: deterministic headline
    return {
      headline: `${trigger.ownerName}: ${trigger.emotionalTag}`,
      bodyText: trigger.llmContext,
    };
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export async function getWeeklyStorylinesFromDb(
  season: number,
  week: number
): Promise<WeeklyStorylineRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(weeklyStorylines)
    .where(and(eq(weeklyStorylines.season, season), eq(weeklyStorylines.week, week)))
    .orderBy(desc(weeklyStorylines.intensityScore));
  return rows as WeeklyStorylineRow[];
}

export async function getLatestWeeklyStorylinesFromDb(
  season: number
): Promise<WeeklyStorylineRow[]> {
  const db = await getDb();
  if (!db) return [];
  // Get the max week for this season
  const allRows = await db
    .select()
    .from(weeklyStorylines)
    .where(eq(weeklyStorylines.season, season))
    .orderBy(desc(weeklyStorylines.week), desc(weeklyStorylines.intensityScore));
  if (!allRows.length) return [];
  const maxWeek = allRows[0].week;
  return allRows.filter((r) => r.week === maxWeek) as WeeklyStorylineRow[];
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Full pipeline: compute triggers → generate LLM content → persist to DB.
 * Called from the weekly refresh handler and manual refresh procedures.
 * Uses existing cached ESPN data — no new ESPN API calls.
 */
export async function refreshWeeklyStorylines(season: number): Promise<WeeklyStorylineRow[]> {
  const db = await getDb();
  if (!db) return [];

  // Load cached season data
  const data = await getCachedView(season, "combined");
  if (!data) return [];
  const payload = data.payload as Record<string, unknown>;

  const teams = normalizeTeams(payload);
  const matchups = normalizeMatchups(payload);
  const transactions = normalizeTransactions(payload) as unknown[];
  const settings = normalizeSettings(payload);

  const currentWeek = Math.max(1, (settings.currentMatchupPeriod as number) || 1);
  const calendarYear = new Date().getFullYear();
  const isSeasonComplete = currentWeek >= 14 || season < calendarYear;

  // For completed seasons, use week 14 as the final week
  const week = isSeasonComplete ? 14 : currentWeek;

  const ownerMap: Record<number, string> = {};
  const teamNameMap: Record<number, string> = {};
  const memberIdsMap: Record<number, string[]> = {};
  for (const t of teams) {
    const tid = t.teamId as number;
    ownerMap[tid] = t.owners as string;
    teamNameMap[tid] = (t.teamName as string) || (t.owners as string) || "Unknown";
    memberIdsMap[tid] = (t.memberIds as string[]) || [];
  }

  // Detect Rod's team
  let rodTeamId: number | null = null;
  let rodMemberIds: string[] = [];
  for (const t of teams) {
    const tid = t.teamId as number;
    const name = (t.teamName as string) || "";
    const abbrev = (t.abbrev as string) || "";
    const owners = (t.owners as string) || "";
    if (isRodTeam(name, abbrev, owners)) {
      rodTeamId = tid;
      rodMemberIds = memberIdsMap[tid] ?? [];
      break;
    }
  }

  // Load Rod's rivalry pairs from DB for REVENGE_GAME / HEARTBREAK_PENDING
  let rivalryPairs: Array<{
    rivalId: string;
    rivalName: string;
    h2hLosses: number;
    playoffEliminations: number;
  }> = [];
  if (rodMemberIds.length > 0) {
    // Try each of Rod's memberIds
    for (const mid of rodMemberIds) {
      const rows = await db
        .select({
          rivalId: rivalryScores.rivalId,
          rivalName: rivalryScores.rivalName,
          h2hLosses: rivalryScores.h2hLosses,
          playoffEliminations: rivalryScores.playoffEliminations,
        })
        .from(rivalryScores)
        .where(eq(rivalryScores.memberId, mid));
      if (rows.length > 0) {
        rivalryPairs = rows;
        break;
      }
    }
  }

  // Load previous season ranks (for COLLAPSE detection)
  const prevSeasonRanks: Record<number, number> = {};
  const prevSeason = season - 1;
  const prevData = await getCachedView(prevSeason, "combined");
  if (prevData) {
    const prevPayload = prevData.payload as Record<string, unknown>;
    const prevTeams = normalizeTeams(prevPayload);
    const sortedPrev = [...prevTeams].sort((a, b) => {
      const rA = (a.rankFinal as number) || 99;
      const rB = (b.rankFinal as number) || 99;
      if (rA !== rB) return rA - rB;
      return ((b.pointsFor as number) || 0) - ((a.pointsFor as number) || 0);
    });
    sortedPrev.forEach((t, idx) => {
      prevSeasonRanks[t.teamId as number] = idx + 1;
    });
  }

  // Build owner playoff W/L records for narrative context (memberId → { playoffWins, playoffLosses })
  const ownerPlayoffRecords: Record<string, { playoffWins: number; playoffLosses: number }> = {};
  try {
    const { buildLiveOpponentProfiles } = await import('./liveOpponentProfile');
    const profiles = await buildLiveOpponentProfiles() as Map<string, { career: { playoffWins: number; playoffLosses: number } }>;
    for (const [memberId, profile] of Array.from(profiles.entries())) {
      ownerPlayoffRecords[memberId] = {
        playoffWins: profile.career.playoffWins ?? 0,
        playoffLosses: profile.career.playoffLosses ?? 0,
      };
    }
  } catch { /* non-fatal: narrative context only */ }

  // Build enriched H2H blocks for Rod's rivalry pairs
  const rivalH2HBlocks: Record<string, string> = {};
  if (rodMemberIds.length > 0) {
    try {
      const { resolveRodMemberId, computeRichH2H, buildH2HPromptBlock } = await import('./h2hContextBuilder');
      const rodId = await resolveRodMemberId();
      if (rodId) {
        // Resolve member names from current season data
        const membersArr = (payload.members as Record<string, unknown>[]) || [];
        const memberNameMap = new Map<string, string>();
        for (const m of membersArr) {
          const mid = m.id as string;
          const name = `${m.firstName || ''} ${m.lastName || ''}`.trim() || (m.displayName as string) || mid;
          memberNameMap.set(mid, name);
        }
        const rodName = memberNameMap.get(rodId) || 'Rod Sellers';
        for (const rp of rivalryPairs) {
          const rivalName = memberNameMap.get(rp.rivalId) || rp.rivalName;
          const h2h = await computeRichH2H(rodId, rp.rivalId, rodName, rivalName);
          if (h2h.rsTotalGames > 0) {
            rivalH2HBlocks[rp.rivalId] = buildH2HPromptBlock(h2h, `Rod vs ${rivalName}`);
          }
        }
      }
    } catch { /* non-fatal */ }
  }

  // Compute deterministic triggers
  const triggers = computeWeeklyStorylines({
    season,
    week,
    teams,
    matchups,
    transactions,
    settings: settings as Record<string, unknown>,
    ownerMap,
    teamNameMap,
    memberIdsMap,
    rivalryPairs,
    rodTeamId,
    rodMemberIds,
    prevSeasonRanks,
    ownerPlayoffRecords,
    rivalH2HBlocks,
  });

  // Generate LLM content for each trigger (skip if already cached for this week)
  const existingRows = await getWeeklyStorylinesFromDb(season, week);
  const existingKeys = new Set(existingRows.map((r) => `${r.storyType}-${r.teamId}`));

  const results: WeeklyStorylineRow[] = [...existingRows];

  for (const trigger of triggers) {
    const key = `${trigger.storyType}-${trigger.teamId}`;
    if (existingKeys.has(key)) continue; // already cached

    const { headline, bodyText } = await generateStoryContent(trigger);

    const row = {
      season,
      week,
      storyType: trigger.storyType,
      emotionalTag: trigger.emotionalTag,
      teamId: trigger.teamId,
      ownerName: trigger.ownerName,
      record: trigger.record,
      intensityScore: trigger.intensityScore,
      headline,
      bodyText,
      supportingStat: trigger.supportingStat,
      opponentName: trigger.opponentName,
    };

    try {
      await db.insert(weeklyStorylines).values(row);
      const inserted = await db
        .select()
        .from(weeklyStorylines)
        .where(
          and(
            eq(weeklyStorylines.season, season),
            eq(weeklyStorylines.week, week),
            eq(weeklyStorylines.storyType, trigger.storyType),
            eq(weeklyStorylines.teamId, trigger.teamId)
          )
        )
        .limit(1);
      if (inserted[0]) results.push(inserted[0] as WeeklyStorylineRow);
    } catch {
      // If insert fails (duplicate), just skip
    }
  }

  return results.sort((a, b) => b.intensityScore - a.intensityScore);
}
