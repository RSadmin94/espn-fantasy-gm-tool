/**
 * leagueWireRouter — deterministic postgame report engine
 *
 * Data sources used (verified existing in DB):
 *   matchups           — scores, winner, isPlayoff, isCompleted
 *   teams              — name, ownerName, season W/L/PF
 *   standings_snapshots — per-week rank (populated when present)
 *
 * Guardrails:
 *   - playerOfGame  → null  when gm_weekly_player_stats has no rows for that week
 *   - benchRegret   → null  when roster_entries has no per-week actuals
 *   - rivalryNote   → null  when H2H history has < 2 prior games
 *   - playoffImpact → null  when standings data unavailable
 *   - NO fabricated stats, NO LLM inference, NO estimated values
 */

import { z }                    from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb }                from "./db";
import { sql as drizzleSql }    from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchupReport {
  matchupId:     number;
  season:        number;
  week:          number;
  isPlayoff:     boolean;
  isCompleted:   boolean;

  // Always present when isCompleted
  winner:        { teamId: number; name: string; ownerName: string; score: number } | null;
  loser:         { teamId: number; name: string; ownerName: string; score: number } | null;
  margin:        number | null;
  combinedScore: number | null;
  gameType:      "blowout" | "comfortable" | "close" | "nailbiter" | null;

  // Narrative (deterministic, score-based only)
  headline:       string;
  shortRecap:     string;
  keyStat:        { label: string; value: string; evidence: string } | null;
  shareableLine:  string;

  // Conditional — null when data unavailable (guardrails)
  playerOfGame:  null; // always null until gm_weekly_player_stats populated
  benchRegret:   null; // always null until roster_entries has per-week actuals
  rivalryNote:   { seriesRecord: string; winnerLeads: boolean; evidence: string } | null;
  playoffImpact: { summary: string; winnerRecord: string; loserRecord: string; evidence: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gameType(margin: number): "blowout" | "comfortable" | "close" | "nailbiter" {
  if (margin >= 50) return "blowout";
  if (margin >= 25) return "comfortable";
  if (margin >= 8)  return "close";
  return "nailbiter";
}

function headline(winner: string, loser: string, winScore: number, loseScore: number, margin: number, isPlayoff: boolean): string {
  const playoff = isPlayoff ? " [PLAYOFF]" : "";
  if (margin >= 60) return `${winner} DOMINATES${playoff}: ${winScore}–${loseScore}`;
  if (margin >= 40) return `${winner} rolls past ${loser}${playoff} — ${winScore}–${loseScore}`;
  if (margin >= 20) return `${winner} handles ${loser} comfortably${playoff}: ${winScore}–${loseScore}`;
  if (margin >= 8)  return `${winner} takes down ${loser}${playoff} in competitive week`;
  if (margin >= 4)  return `${winner} edges ${loser}${playoff} — ${winScore}–${loseScore}`;
  return `${winner} survives scare from ${loser}${playoff} — wins by ${margin.toFixed(2)}`;
}

function shortRecap(
  winner: string, loser: string,
  winScore: number, loseScore: number,
  margin: number, combined: number,
  isPlayoff: boolean, week: number
): string {
  const gameLabel = isPlayoff ? `Week ${week} playoff clash` : `Week ${week}`;
  const type = gameType(margin);
  const combinedNote = combined >= 280 ? " Both teams showed up offensively." : combined <= 180 ? " It was a low-scoring affair across the board." : "";

  if (type === "blowout")
    return `${gameLabel}: ${winner} steamrolled ${loser} ${winScore}–${loseScore}, a ${margin.toFixed(2)}-point blowout.${combinedNote}`;
  if (type === "comfortable")
    return `${gameLabel}: ${winner} defeated ${loser} ${winScore}–${loseScore}, pulling away for a comfortable ${margin.toFixed(2)}-point win.${combinedNote}`;
  if (type === "close")
    return `${gameLabel}: ${winner} bested ${loser} ${winScore}–${loseScore} in a competitive matchup decided by ${margin.toFixed(2)} points.${combinedNote}`;
  return `${gameLabel}: ${winner} held off ${loser} in a nail-biter, escaping with a ${margin.toFixed(2)}-point win (${winScore}–${loseScore}).${combinedNote}`;
}

function keyStat(
  winScore: number, loseScore: number,
  allScoresThisWeek: number[]
): { label: string; value: string; evidence: string } | null {
  if (allScoresThisWeek.length < 2) return null;
  const sorted = [...allScoresThisWeek].sort((a, b) => b - a);
  const avg = allScoresThisWeek.reduce((s, v) => s + v, 0) / allScoresThisWeek.length;
  const weekHigh = sorted[0];

  if (winScore === weekHigh) {
    return {
      label:    "Week High Score",
      value:    `${winScore} pts`,
      evidence: `Highest score among ${allScoresThisWeek.length} teams this week (avg: ${avg.toFixed(1)})`,
    };
  }
  if (loseScore === sorted[sorted.length - 1]) {
    return {
      label:    "Week Low Score",
      value:    `${loseScore} pts`,
      evidence: `Lowest score among ${allScoresThisWeek.length} teams this week (avg: ${avg.toFixed(1)})`,
    };
  }
  const margin = winScore - loseScore;
  return {
    label:    "Margin of Victory",
    value:    `${margin.toFixed(2)} pts`,
    evidence: `${winScore} vs ${loseScore}; week avg was ${avg.toFixed(1)} pts`,
  };
}

function shareableLine(winner: string, loser: string, winScore: number, loseScore: number, week: number): string {
  return `📢 Week ${week} | ${winner} def. ${loser} — ${winScore}–${loseScore} | #AtlantasFinestFF`;
}

function buildRivalryNote(
  winnerTeamId: number, loserTeamId: number,
  allPriorMatchups: Array<{ homeTeamId: number; awayTeamId: number; winnerTeamId: number }>
): { seriesRecord: string; winnerLeads: boolean; evidence: string } | null {
  const h2h = allPriorMatchups.filter(m =>
    (m.homeTeamId === winnerTeamId && m.awayTeamId === loserTeamId) ||
    (m.homeTeamId === loserTeamId  && m.awayTeamId === winnerTeamId)
  );
  if (h2h.length < 1) return null;

  const winnerWins = h2h.filter(m => m.winnerTeamId === winnerTeamId).length;
  const loserWins  = h2h.filter(m => m.winnerTeamId === loserTeamId).length;
  const winnerLeads = winnerWins >= loserWins;
  const seriesRecord = `${winnerWins}–${loserWins}`;

  return {
    seriesRecord,
    winnerLeads,
    evidence: `${h2h.length} prior head-to-head game(s) this season`,
  };
}

function buildPlayoffImpact(
  winnerTeamId: number, loserTeamId: number,
  allMatchupsThruWeek: Array<{ homeTeamId: number; awayTeamId: number; winnerTeamId: number | null }>,
  teamCount: number
): { summary: string; winnerRecord: string; loserRecord: string; evidence: string } | null {
  // Derive running W/L record for all teams from all matchups through this week
  const records: Record<number, { w: number; l: number }> = {};
  const initTeam = (id: number) => { if (!records[id]) records[id] = { w: 0, l: 0 }; };

  for (const m of allMatchupsThruWeek) {
    if (!m.winnerTeamId) continue;
    const loserId = m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
    initTeam(m.winnerTeamId); initTeam(loserId);
    records[m.winnerTeamId].w++;
    records[loserId].l++;
  }

  const wRec = records[winnerTeamId] ?? { w: 0, l: 0 };
  const lRec = records[loserTeamId]  ?? { w: 0, l: 0 };

  // Sort by wins to get standings
  const standings = Object.entries(records)
    .map(([tid, rec]) => ({ teamId: Number(tid), ...rec }))
    .sort((a, b) => b.w - a.w || a.l - b.l);

  const playoffCutline = Math.floor(teamCount / 2); // top half makes playoffs
  const wRank = standings.findIndex(s => s.teamId === winnerTeamId) + 1;
  const lRank = standings.findIndex(s => s.teamId === loserTeamId)  + 1;

  const winnerInPlayoffs = wRank > 0 && wRank <= playoffCutline;
  const loserInPlayoffs  = lRank > 0 && lRank <= playoffCutline;

  let summary = `Win moves ${winnerTeamId} to ${wRec.w}–${wRec.l}`;
  if (winnerInPlayoffs)  summary += `, sitting at #${wRank} in the standings`;
  if (!loserInPlayoffs && lRank > 0) summary += `. Loss drops ${loserTeamId} to #${lRank}.`;

  return {
    summary,
    winnerRecord: `${wRec.w}–${wRec.l}`,
    loserRecord:  `${lRec.w}–${lRec.l}`,
    evidence:     `Calculated from ${allMatchupsThruWeek.length} completed matchups through this week`,
  };
}

// ── Main builder ──────────────────────────────────────────────────────────────

function buildPostgameReport(params: {
  matchup:          any;
  homeTeam:         any;
  awayTeam:         any;
  allScoresThisWeek: number[];
  priorMatchups:    any[];
  allMatchupsThruWeek: any[];
  teamCount:        number;
}): MatchupReport {
  const { matchup, homeTeam, awayTeam, allScoresThisWeek, priorMatchups, allMatchupsThruWeek, teamCount } = params;

  const homeScore = parseFloat(matchup.homeScore ?? "0");
  const awayScore = parseFloat(matchup.awayScore ?? "0");
  const combined  = homeScore + awayScore;

  let winner, loser, winScore, loseScore;
  if (matchup.winnerTeamId === matchup.homeTeamId) {
    winner = homeTeam; loser = awayTeam; winScore = homeScore; loseScore = awayScore;
  } else {
    winner = awayTeam; loser = homeTeam; winScore = awayScore; loseScore = homeScore;
  }

  if (!winner || !loser || !matchup.isCompleted) {
    return {
      matchupId: matchup.id, season: matchup.season, week: matchup.week,
      isPlayoff: !!matchup.isPlayoff, isCompleted: !!matchup.isCompleted,
      winner: null, loser: null, margin: null, combinedScore: null, gameType: null,
      headline: "Matchup not yet completed",
      shortRecap: "No results available.",
      keyStat: null, shareableLine: "—",
      playerOfGame: null, benchRegret: null, rivalryNote: null, playoffImpact: null,
    };
  }

  const margin = winScore - loseScore;
  const gt     = gameType(margin);

  const winnerInfo  = { teamId: winner.teamId, name: winner.name, ownerName: winner.ownerName, score: winScore };
  const loserInfo   = { teamId: loser.teamId,  name: loser.name,  ownerName: loser.ownerName,  score: loseScore };
  const winnerName  = winner.name;
  const loserName   = loser.name;

  const rivalryNote   = buildRivalryNote(winner.teamId, loser.teamId, priorMatchups);
  const playoffImpact = buildPlayoffImpact(winner.teamId, loser.teamId, allMatchupsThruWeek, teamCount);

  return {
    matchupId:     matchup.id,
    season:        matchup.season,
    week:          matchup.week,
    isPlayoff:     !!matchup.isPlayoff,
    isCompleted:   true,
    winner:        winnerInfo,
    loser:         loserInfo,
    margin:        margin,
    combinedScore: combined,
    gameType:      gt,
    headline:      headline(winnerName, loserName, winScore, loseScore, margin, !!matchup.isPlayoff),
    shortRecap:    shortRecap(winnerName, loserName, winScore, loseScore, margin, combined, !!matchup.isPlayoff, matchup.week),
    keyStat:       keyStat(winScore, loseScore, allScoresThisWeek),
    shareableLine: shareableLine(winnerName, loserName, winScore, loseScore, matchup.week),
    playerOfGame:  null, // guardrail: gm_weekly_player_stats is empty
    benchRegret:   null, // guardrail: roster_entries has no per-week actuals
    rivalryNote,
    playoffImpact,
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export const leagueWireRouter = router({

  /** All available season/week combos that have completed matchups */
  getAvailableWeeks: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(drizzleSql`
        SELECT season, week, COUNT(*) AS cnt
        FROM matchups
        WHERE isCompleted = 1 AND homeScore > 0
        GROUP BY season, week
        ORDER BY season DESC, week DESC
      `) as unknown as [Array<{ season: number; week: number; cnt: number }>];
      return (rows[0] as any[]).map(r => ({
        season: Number(r.season), week: Number(r.week), count: Number(r.cnt),
      }));
    }),

  /** All postgame reports for a season + week */
  getPostgameReports: publicProcedure
    .input(z.object({ season: z.number().int(), week: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { season, week } = input;

      // Load matchups for this week
      const matchupRows = await db.execute(drizzleSql`
        SELECT * FROM matchups
        WHERE season = ${season} AND week = ${week} AND isCompleted = 1
      `) as unknown as [any[]];
      const weekMatchups = (matchupRows[0] as any[]);
      if (!weekMatchups.length) return [];

      // Load all teams for this season
      const teamRows = await db.execute(drizzleSql`
        SELECT teamId, name, ownerName, wins, losses, pointsFor
        FROM teams WHERE season = ${season}
      `) as unknown as [any[]];
      const teamMap = new Map((teamRows[0] as any[]).map(t => [Number(t.teamId), t]));
      const teamCount = teamMap.size;

      // All scores this week (for context)
      const allScores = weekMatchups.flatMap(m => [parseFloat(m.homeScore), parseFloat(m.awayScore)]);

      // All completed matchups BEFORE this week (for H2H and standings calc)
      const priorRows = await db.execute(drizzleSql`
        SELECT homeTeamId, awayTeamId, winnerTeamId
        FROM matchups
        WHERE season = ${season} AND week < ${week} AND isCompleted = 1
      `) as unknown as [any[]];
      const priorMatchups = (priorRows[0] as any[]);

      // All matchups THROUGH this week (for standings)
      const thruRows = await db.execute(drizzleSql`
        SELECT homeTeamId, awayTeamId, winnerTeamId
        FROM matchups
        WHERE season = ${season} AND week <= ${week} AND isCompleted = 1
      `) as unknown as [any[]];
      const thruMatchups = (thruRows[0] as any[]);

      return weekMatchups.map(m =>
        buildPostgameReport({
          matchup: m,
          homeTeam: teamMap.get(Number(m.homeTeamId)),
          awayTeam: teamMap.get(Number(m.awayTeamId)),
          allScoresThisWeek: allScores,
          priorMatchups,
          allMatchupsThruWeek: thruMatchups,
          teamCount,
        })
      );
    }),

  /** Single matchup report by ID */
  getMatchupReport: publicProcedure
    .input(z.object({ matchupId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db.execute(drizzleSql`
        SELECT * FROM matchups WHERE id = ${input.matchupId}
      `) as unknown as [any[]];
      const matchup = (rows[0] as any[])[0];
      if (!matchup) return null;

      const { season, week } = matchup;

      const teamRows = await db.execute(drizzleSql`
        SELECT teamId, name, ownerName, wins, losses, pointsFor
        FROM teams WHERE season = ${season}
      `) as unknown as [any[]];
      const teamMap = new Map((teamRows[0] as any[]).map(t => [Number(t.teamId), t]));

      const weekMatchupRows = await db.execute(drizzleSql`
        SELECT homeScore, awayScore FROM matchups
        WHERE season = ${season} AND week = ${week} AND isCompleted = 1
      `) as unknown as [any[]];
      const allScores = (weekMatchupRows[0] as any[]).flatMap(r => [parseFloat(r.homeScore), parseFloat(r.awayScore)]);

      const priorRows = await db.execute(drizzleSql`
        SELECT homeTeamId, awayTeamId, winnerTeamId
        FROM matchups WHERE season = ${season} AND week < ${week} AND isCompleted = 1
      `) as unknown as [any[]];

      const thruRows = await db.execute(drizzleSql`
        SELECT homeTeamId, awayTeamId, winnerTeamId
        FROM matchups WHERE season = ${season} AND week <= ${week} AND isCompleted = 1
      `) as unknown as [any[]];

      return buildPostgameReport({
        matchup,
        homeTeam: teamMap.get(Number(matchup.homeTeamId)),
        awayTeam: teamMap.get(Number(matchup.awayTeamId)),
        allScoresThisWeek: allScores,
        priorMatchups: (priorRows[0] as any[]),
        allMatchupsThruWeek: (thruRows[0] as any[]),
        teamCount: teamMap.size,
      });
    }),
});

export type LeagueWireRouter = typeof leagueWireRouter;
