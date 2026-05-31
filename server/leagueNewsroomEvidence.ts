/**
 * leagueNewsroomEvidence.ts
 * Fetches and structures DB evidence for each article type.
 * Every field returned here is verifiable from the database.
 * NO estimates. NO fabricated values.
 */

import { sql as drizzleSql } from "drizzle-orm";

const LEAGUE_ID = "457622";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChampionshipEvidence {
  season: number;
  champion:    { name: string; owner: string };
  runnerUp:    { name: string; owner: string };
  thirdPlace:  { name: string; owner: string } | null;
  allTeams:    Array<{ teamId: number; name: string; owner: string }>;
  regularSeason: {
    records: Array<{ teamId: number; name: string; owner: string; wins: number; losses: number; pf: number }>;
    championRecord:  { wins: number; losses: number; pf: number } | null;
    biggestWin:      { winner: string; loser: string; winScore: number; loseScore: number; margin: number; week: number } | null;
    closestEscape:   { winner: string; loser: string; winScore: number; loseScore: number; margin: number; week: number } | null;
    weekHighScore:   { team: string; score: number; week: number } | null;
    weeksLed:        number;
  };
  playoffs: {
    games: Array<{ week: number; winner: string; loser: string; winScore: number; loseScore: number; margin: number; isPlayoff: boolean }>;
    championPath: Array<{ round: string; opponent: string; score: string; margin: number }>;
    championshipGame: { opponent: string; winScore: number; loseScore: number; margin: number } | null;
  };
  rivalries: Array<{ team1: string; team2: string; meetings: number; team1Wins: number; team2Wins: number }>;
  dataAvailability: { matchups: boolean; draftPicks: boolean; playerStats: boolean; standings: boolean };
}

export interface KeeperPreviewEvidence {
  season: number;
  draftYear: number;
  owners: Array<{
    ownerName: string;
    teamName: string;
    projectedKeepers: Array<{
      playerName: string; position: string; nflTeam: string;
      keeperRoundCost: number; kvs: number; isLastYear: boolean;
      confidence: "CONFIDENT" | "LIKELY" | "UNCERTAIN";
    }>;
    keeperCount: number;
    historicalKeeperRate: number;
  }>;
  leagueKeepCount: number;
  dataAvailability: { keeperPool: boolean; draftHistory: boolean };
}

export interface RosterConstructionEvidence {
  season: number;
  owners: Array<{
    teamName: string; ownerName: string;
    roster: Array<{ playerName: string; position: string; nflTeam: string; projectedPoints: number; slotId: number; injuryStatus: string }>;
    positionCounts: Record<string, number>;
    projectedStarters: Record<string, string[]>;
    gaps: string[];
    projectedTotalPoints: number;
  }>;
  leagueAvgProjected: number;
  dataAvailability: { rosters: boolean; projections: boolean };
}

// ── Season matchup data builder ────────────────────────────────────────────────

function calcRunningRecords(matchups: any[], teamIds: number[]): Map<number, { wins: number; losses: number; pf: number }> {
  const records = new Map<number, { wins: number; losses: number; pf: number }>();
  for (const id of teamIds) records.set(id, { wins: 0, losses: 0, pf: 0 });
  for (const m of matchups) {
    if (!m.winnerTeamId) continue;
    const loserId = m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
    const winnerRec = records.get(m.winnerTeamId);
    const loserRec  = records.get(loserId);
    if (winnerRec) { winnerRec.wins++; winnerRec.pf += parseFloat(m.winnerScore ?? m.homeScore ?? "0"); }
    if (loserRec)  { loserRec.losses++; }
  }
  return records;
}

// ── Championship March Evidence ────────────────────────────────────────────────

export async function buildChampionshipEvidence(db: any, season: number): Promise<ChampionshipEvidence | null> {
  // 1. Medal data
  const [medalRows] = await db.execute(drizzleSql`
    SELECT championOwner, runnerUpOwner, thirdPlaceOwner
    FROM league_medals WHERE leagueId = ${LEAGUE_ID} AND season = ${season}
  `) as unknown as [any[]];
  const medals = (medalRows as any[])[0] as any;
  if (!medals) return null;

  // 2. All teams for this season
  const [teamRows] = await db.execute(drizzleSql`
    SELECT teamId, name, ownerName FROM teams WHERE leagueId = ${LEAGUE_ID} AND season = ${season}
  `) as unknown as [any[]];
  const teams = teamRows as any[];
  const teamMap = new Map(teams.map((t: any) => [Number(t.teamId), t]));

  // Find champion team by owner name match
  const championTeam = teams.find((t: any) =>
    medals.championOwner.toLowerCase().includes(t.name.toLowerCase()) ||
    t.name.toLowerCase().includes(medals.championOwner.toLowerCase()) ||
    t.ownerName?.toLowerCase().includes(medals.championOwner.toLowerCase())
  );
  const runnerUpTeam = teams.find((t: any) =>
    medals.runnerUpOwner.toLowerCase().includes(t.name.toLowerCase()) ||
    t.name.toLowerCase().includes(medals.runnerUpOwner.toLowerCase()) ||
    t.ownerName?.toLowerCase().includes(medals.runnerUpOwner.toLowerCase())
  );
  const thirdTeam = medals.thirdPlaceOwner ? teams.find((t: any) =>
    t.name.toLowerCase().includes(medals.thirdPlaceOwner.toLowerCase()) ||
    medals.thirdPlaceOwner.toLowerCase().includes(t.name.toLowerCase())
  ) : null;

  // 3. All matchups with team names
  const [matchupRows] = await db.execute(drizzleSql`
    SELECT m.week, m.homeTeamId, m.awayTeamId, m.homeScore, m.awayScore, m.winnerTeamId, m.isPlayoff
    FROM matchups m
    WHERE m.leagueId = ${LEAGUE_ID} AND m.season = ${season} AND m.isCompleted = 1
    ORDER BY m.week, m.id
  `) as unknown as [any[]];
  const allMatchups = (matchupRows as any[]).map((m: any) => ({
    ...m,
    homeScore:   parseFloat(m.homeScore ?? "0"),
    awayScore:   parseFloat(m.awayScore ?? "0"),
    homeTeamId:  Number(m.homeTeamId),
    awayTeamId:  Number(m.awayTeamId),
    winnerTeamId: m.winnerTeamId ? Number(m.winnerTeamId) : null,
    isPlayoff:   !!m.isPlayoff,
  }));

  const regularSeason = allMatchups.filter(m => !m.isPlayoff);
  const playoffGames  = allMatchups.filter(m => m.isPlayoff);

  // 4. Build records from regular season
  const teamIds = teams.map((t: any) => Number(t.teamId));
  const records = calcRunningRecords(regularSeason, teamIds);

  const recordsList = teams.map((t: any) => {
    const rec = records.get(Number(t.teamId)) ?? { wins: 0, losses: 0, pf: 0 };
    return { teamId: Number(t.teamId), name: t.name, owner: t.ownerName?.replace(/[()]/g, "").trim() ?? t.name, ...rec };
  }).sort((a, b) => b.wins - a.wins);

  const championRec = championTeam ? records.get(Number(championTeam.teamId)) : null;

  // 5. Find biggest win, closest escape, week high
  let biggestWin: ChampionshipEvidence["regularSeason"]["biggestWin"] = null;
  let closestEscape: ChampionshipEvidence["regularSeason"]["closestEscape"] = null;
  let weekHigh: ChampionshipEvidence["regularSeason"]["weekHighScore"] = null;

  for (const m of regularSeason) {
    const winScore  = m.winnerTeamId === m.homeTeamId ? m.homeScore : m.awayScore;
    const loseScore = m.winnerTeamId === m.homeTeamId ? m.awayScore : m.homeScore;
    const margin = winScore - loseScore;
    const winnerT = teamMap.get(m.winnerTeamId ?? 0);
    const loserT  = teamMap.get(m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId);
    if (!winnerT || !loserT) continue;

    if (!biggestWin || margin > biggestWin.margin) {
      biggestWin = { winner: winnerT.name, loser: loserT.name, winScore, loseScore, margin, week: m.week };
    }
    if (!closestEscape || margin < closestEscape.margin) {
      closestEscape = { winner: winnerT.name, loser: loserT.name, winScore, loseScore, margin, week: m.week };
    }
    const highScore = Math.max(m.homeScore, m.awayScore);
    const highTeam  = teamMap.get(highScore === m.homeScore ? m.homeTeamId : m.awayTeamId);
    if (highTeam && (!weekHigh || highScore > weekHigh.score)) {
      weekHigh = { team: highTeam.name, score: highScore, week: m.week };
    }
  }

  // 6. Playoff path for champion
  const championPath: ChampionshipEvidence["playoffs"]["championPath"] = [];
  let championshipGame: ChampionshipEvidence["playoffs"]["championshipGame"] = null;
  const championId = championTeam ? Number(championTeam.teamId) : null;

  if (championId) {
    const champPlayoff = playoffGames.filter(m => m.homeTeamId === championId || m.awayTeamId === championId);
    for (const [i, m] of champPlayoff.entries()) {
      const opponentId = m.homeTeamId === championId ? m.awayTeamId : m.homeTeamId;
      const oppT = teamMap.get(opponentId);
      const champScore = m.homeTeamId === championId ? m.homeScore : m.awayScore;
      const oppScore   = m.homeTeamId === championId ? m.awayScore : m.homeScore;
      const margin = champScore - oppScore;
      const round = i === champPlayoff.length - 1 ? "Championship" : i === 0 ? "Quarterfinal" : "Semifinal";
      const entry = { round, opponent: oppT?.name ?? `Team ${opponentId}`, score: `${champScore}-${oppScore}`, margin };
      championPath.push(entry);
      if (round === "Championship") {
        championshipGame = { opponent: oppT?.name ?? `Team ${opponentId}`, winScore: champScore, loseScore: oppScore, margin };
      }
    }
  }

  // 7. Rivalries (teams with 2+ meetings in regular season)
  const h2hMap = new Map<string, { t1: string; t2: string; t1Wins: number; t2Wins: number }>();
  for (const m of regularSeason) {
    const k = [Math.min(m.homeTeamId, m.awayTeamId), Math.max(m.homeTeamId, m.awayTeamId)].join("-");
    const t1T = teamMap.get(Math.min(m.homeTeamId, m.awayTeamId));
    const t2T = teamMap.get(Math.max(m.homeTeamId, m.awayTeamId));
    if (!t1T || !t2T) continue;
    if (!h2hMap.has(k)) h2hMap.set(k, { t1: t1T.name, t2: t2T.name, t1Wins: 0, t2Wins: 0 });
    const entry = h2hMap.get(k)!;
    if (m.winnerTeamId === Math.min(m.homeTeamId, m.awayTeamId)) entry.t1Wins++;
    else entry.t2Wins++;
  }
  const rivalries = [...h2hMap.values()]
    .filter(r => r.t1Wins + r.t2Wins >= 2)
    .map(r => ({ team1: r.t1, team2: r.t2, meetings: r.t1Wins + r.t2Wins, team1Wins: r.t1Wins, team2Wins: r.t2Wins }))
    .sort((a, b) => b.meetings - a.meetings);

  // 8. Check playoff games count vs team count to know how many weeks
  const weeksLed = championId
    ? regularSeason.filter(m => m.winnerTeamId === championId).length
    : 0;

  // 9. Playoff games for the record
  const playoffGamesFormatted = playoffGames.map(m => {
    const winnerT = teamMap.get(m.winnerTeamId ?? 0);
    const loserT  = teamMap.get(m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId);
    const winScore  = m.winnerTeamId === m.homeTeamId ? m.homeScore : m.awayScore;
    const loseScore = m.winnerTeamId === m.homeTeamId ? m.awayScore : m.homeScore;
    return {
      week: m.week,
      winner: winnerT?.name ?? "Unknown",
      loser:  loserT?.name  ?? "Unknown",
      winScore, loseScore,
      margin: winScore - loseScore,
      isPlayoff: true,
    };
  });

  return {
    season,
    champion:   { name: medals.championOwner,   owner: championTeam?.ownerName?.replace(/[()]/g,"").trim() ?? medals.championOwner },
    runnerUp:   { name: medals.runnerUpOwner,    owner: runnerUpTeam?.ownerName?.replace(/[()]/g,"").trim() ?? medals.runnerUpOwner },
    thirdPlace: medals.thirdPlaceOwner ? { name: medals.thirdPlaceOwner, owner: thirdTeam?.ownerName?.replace(/[()]/g,"").trim() ?? medals.thirdPlaceOwner } : null,
    allTeams:   teams.map((t: any) => ({ teamId: Number(t.teamId), name: t.name, owner: t.ownerName?.replace(/[()]/g,"").trim() ?? t.name })),
    regularSeason: {
      records:     recordsList,
      championRecord: championRec ? { wins: championRec.wins, losses: championRec.losses, pf: championRec.pf } : null,
      biggestWin, closestEscape, weekHighScore: weekHigh, weeksLed,
    },
    playoffs: { games: playoffGamesFormatted, championPath, championshipGame },
    rivalries: rivalries.slice(0, 5),
    dataAvailability: {
      matchups:    allMatchups.length > 0,
      draftPicks:  false, // will be checked separately
      playerStats: false,
      standings:   allMatchups.length > 0,
    },
  };
}
