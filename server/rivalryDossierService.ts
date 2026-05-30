/**
 * Rivalry Dossier — completed rows from `gmMatchups` (regular season + playoffs),
 * keyed by canonical profile ownerKey (same remap as Owner Profiles).
 */
import { gmMatchups, gmTeams } from "../drizzle/schema";
import { and as andDrizzle, asc as ascDrizzle, eq as eqDrizzle } from "drizzle-orm";
import type { AppDb } from "./db";
import {
  buildTeamToCanonicalProfileKey,
  cleanOwnerDisplay,
  resolveOwnerTeamsForProfile,
  type GmTeamRow,
} from "./ownerProfileService";

export type RivalryMeeting = {
  season: number;
  week: number;
  matchupPeriodId: number;
  isPlayoff: boolean;
  ownerScore: number;
  opponentScore: number;
  result: "W" | "L" | "T";
  margin: number;
};

export type RivalryOpponentRow = {
  opponentOwnerKey: string;
  opponentDisplayName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  avgMargin: number;
  largestWin: number | null;
  worstLoss: number | null;
  heartbreakLosses: number;
  heartbreakWins: number;
  playoffEncounters: number;
  lastFiveMeetings: RivalryMeeting[];
  lastTenMeetings: RivalryMeeting[];
  tag: string;
};

export type RivalryWaiverSnipes = { available: false; label: string } | { available: true; count: number };

export type RivalryPairDetail = {
  opponentOwnerKey: string;
  opponentDisplayName: string;
  focalDisplayName: string;
  firstMeetingSeason: number | null;
  focalTag: string;
  opponentTag: string;
  recordFocalVs: { wins: number; losses: number; ties: number };
  heartbreakLossesFocal: number;
  lastMeeting: RivalryMeeting | null;
  playoffEncounters: number;
  headToHeadHistory: RivalryMeeting[];
  chartSeries: Array<{ idx: number; ownerScore: number; opponentScore: number; label: string }>;
  insights: string[];
  waiverSnipes: RivalryWaiverSnipes;
};

export type RivalryDossierPayload = {
  ownerKey: string;
  ownerDisplayName: string;
  opponents: RivalryOpponentRow[];
  /** gmMatchups rows used after dedupe (completed RS + playoffs). */
  matchupRowsUsed: number;
  includeHistoricalOwners: boolean;
  pairDetail: RivalryPairDetail | null;
};

/** Tag rules (focal owner's win % vs opponent). */
export function rivalryDossierTag(winPct: number, games: number): string {
  if (games >= 3 && winPct <= 25) return "Nemesis";
  if (games >= 3 && winPct >= 75) return "Punching Bag";
  if (games >= 5 && winPct >= 38 && winPct <= 62) return "Rival";
  if (winPct >= 56 && winPct <= 74) return "Favorable";
  if (winPct >= 26 && winPct <= 44) return "Difficult";
  return "Normal";
}

function buildOwnerDisplayByKey(allRows: GmTeamRow[], teamToKey: Map<string, string>): Map<string, string> {
  const best = new Map<string, { season: number; label: string }>();
  for (const t of allRows) {
    if (t.teamId <= 0) continue;
    const k = teamToKey.get(`${t.season}:${t.teamId}`);
    if (!k) continue;
    const label = cleanOwnerDisplay((t.ownerName || "").trim()) || cleanOwnerDisplay((t.name || "").trim()) || k;
    const prev = best.get(k);
    if (!prev || t.season >= prev.season) best.set(k, { season: t.season, label });
  }
  const out = new Map<string, string>();
  for (const [k, v] of best) out.set(k, v.label);
  return out;
}

type DbMatchupRow = {
  homeTeamId: number;
  awayTeamId: number;
  winnerTeamId: number | null;
  season: number;
  week: number;
  matchupPeriodId: number;
  homeScore: number;
  awayScore: number;
  isPlayoff: boolean;
};

type Agg = {
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  marginSum: number;
  largestWin: number | null;
  worstLoss: number | null;
  hbLoss: number;
  hbWin: number;
  playoffEncounters: number;
  meetings: RivalryMeeting[];
};

function meetingSortKey(m: RivalryMeeting): number {
  return m.season * 1_000_000 + m.matchupPeriodId * 1_000 + m.week;
}

function buildPairInsights(args: {
  focalDisplay: string;
  oppDisplay: string;
  gamesPlayed: number;
  focalWins: number;
  focalLosses: number;
  focalTies: number;
  meetings: RivalryMeeting[];
  playoffEncounters: number;
}): string[] {
  const insights: string[] = [];
  const { focalDisplay, oppDisplay, gamesPlayed, focalWins, focalLosses, focalTies, meetings, playoffEncounters } =
    args;
  if (gamesPlayed < 2) return insights;

  const focalPf = meetings.reduce((s, m) => s + m.ownerScore, 0);
  const oppPf = meetings.reduce((s, m) => s + m.opponentScore, 0);
  const focalPpg = focalPf / gamesPlayed;
  const oppPpg = oppPf / gamesPlayed;
  const delta = focalPpg - oppPpg;
  if (Number.isFinite(delta) && Math.abs(delta) >= 0.05) {
    const who = delta >= 0 ? focalDisplay : oppDisplay;
    const amt = Math.abs(delta).toFixed(1);
    insights.push(`${who} averages ${amt} more points per game in this head-to-head (${gamesPlayed} games).`);
  }

  const sortedDesc = [...meetings].sort((a, b) => meetingSortKey(b) - meetingSortKey(a));
  const n = Math.min(5, sortedDesc.length);
  if (n >= 3) {
    const lastN = sortedDesc.slice(0, n);
    const oppWinsLast = lastN.filter((m) => m.result === "L").length;
    insights.push(`${oppDisplay} has won ${oppWinsLast} of the last ${n} meetings.`);
  }

  const close = meetings.filter((m) => Math.abs(m.margin) <= 3 && m.result !== "T").length;
  if (close > 0) {
    insights.push(`${close} game${close === 1 ? "" : "s"} in this rivalry were decided by 3 points or fewer.`);
  }

  if (playoffEncounters > 0) {
    insights.push(`${playoffEncounters} playoff meeting${playoffEncounters === 1 ? "" : "s"} between ${focalDisplay} and ${oppDisplay}.`);
  }

  return insights.slice(0, 5);
}

function buildPairDetail(args: {
  opponentOwnerKey: string;
  focalDisplay: string;
  oppDisplay: string;
  agg: Agg;
}): RivalryPairDetail {
  const { opponentOwnerKey, focalDisplay, oppDisplay, agg } = args;
  const gamesPlayed = agg.wins + agg.losses + agg.ties;
  const winPct = gamesPlayed > 0 ? Number(((agg.wins / gamesPlayed) * 100).toFixed(1)) : 0;
  const oppWinPct =
    gamesPlayed > 0 ? Number((((agg.losses + 0.5 * agg.ties) / gamesPlayed) * 100).toFixed(1)) : 0;

  const meetingsChrono = [...agg.meetings].sort((a, b) => meetingSortKey(a) - meetingSortKey(b));
  const firstMeetingSeason =
    meetingsChrono.length > 0 ? meetingsChrono.reduce((min, x) => Math.min(min, x.season), meetingsChrono[0]!.season) : null;

  const headToHeadHistory = [...agg.meetings]
    .sort((a, b) => meetingSortKey(b) - meetingSortKey(a))
    .slice(0, 10);

  const lastMeeting = headToHeadHistory[0] ?? null;

  const chartSeries = meetingsChrono.map((m, idx) => ({
    idx: idx + 1,
    ownerScore: m.ownerScore,
    opponentScore: m.opponentScore,
    label: `${m.season} W${m.week}${m.isPlayoff ? " (P)" : ""}`,
  }));

  const insights = buildPairInsights({
    focalDisplay,
    oppDisplay,
    gamesPlayed,
    focalWins: agg.wins,
    focalLosses: agg.losses,
    focalTies: agg.ties,
    meetings: agg.meetings,
    playoffEncounters: agg.playoffEncounters,
  });

  const waiverSnipes: RivalryWaiverSnipes = {
    available: false,
    label: "Not Yet Available.",
  };

  return {
    opponentOwnerKey,
    opponentDisplayName: oppDisplay,
    focalDisplayName: focalDisplay,
    firstMeetingSeason,
    focalTag: rivalryDossierTag(winPct, gamesPlayed),
    opponentTag: rivalryDossierTag(oppWinPct, gamesPlayed),
    recordFocalVs: { wins: agg.wins, losses: agg.losses, ties: agg.ties },
    heartbreakLossesFocal: agg.hbLoss,
    lastMeeting,
    playoffEncounters: agg.playoffEncounters,
    headToHeadHistory,
    chartSeries,
    insights,
    waiverSnipes,
  };
}

export async function loadRivalryDossier(args: {
  db: AppDb;
  leagueId: string;
  ownerKey: string;
  includeHistoricalOwners?: boolean;
  /** When set and `includeHistoricalOwners` is false, opponents are restricted to this set. */
  activeOwnerKeysInSeason?: Set<string> | null;
  /** When set, response includes `pairDetail` scoped to this opponent (if any meetings exist). */
  opponentOwnerKeyForPair?: string | null;
}): Promise<RivalryDossierPayload | null> {
  const { db, leagueId: lid } = args;
  const ownerKeyIn = args.ownerKey.trim();
  const includeHistoricalOwners = args.includeHistoricalOwners === true;
  const activeFilter = args.activeOwnerKeysInSeason ?? null;
  const pairOpp = (args.opponentOwnerKeyForPair ?? "").trim() || null;

  if (!ownerKeyIn) return null;

  const allGmRows = (await db
    .select()
    .from(gmTeams)
    .where(eqDrizzle(gmTeams.leagueId, lid))
    .orderBy(ascDrizzle(gmTeams.season), ascDrizzle(gmTeams.teamId))) as GmTeamRow[];

  const resolved = resolveOwnerTeamsForProfile(allGmRows, ownerKeyIn);
  if (!resolved) return null;

  const { profileOwnerKey, ownerTeamRows } = resolved;
  const focalSet = new Set(ownerTeamRows.map((t) => `${t.season}:${t.teamId}`));
  const teamToOwnerKey = buildTeamToCanonicalProfileKey(allGmRows);
  const displayByKey = buildOwnerDisplayByKey(allGmRows, teamToOwnerKey);

  const dbRows = await db
    .select({
      homeTeamId: gmMatchups.homeTeamId,
      awayTeamId: gmMatchups.awayTeamId,
      winnerTeamId: gmMatchups.winnerTeamId,
      season: gmMatchups.season,
      week: gmMatchups.week,
      matchupPeriodId: gmMatchups.matchupPeriodId,
      homeScore: gmMatchups.homeScore,
      awayScore: gmMatchups.awayScore,
      isPlayoff: gmMatchups.isPlayoff,
    })
    .from(gmMatchups)
    .where(andDrizzle(eqDrizzle(gmMatchups.leagueId, lid), eqDrizzle(gmMatchups.isCompleted, 1)));

  const seen = new Set<string>();
  const matchups: DbMatchupRow[] = [];
  for (const r of dbRows) {
    const hid = Number(r.homeTeamId);
    const aid = Number(r.awayTeamId);
    if (!hid || !aid) continue;
    const isPo = Number(r.isPlayoff) === 1;
    const mk = `${r.season}|${r.matchupPeriodId}|${hid}|${aid}|${isPo ? "P" : "R"}`;
    if (seen.has(mk)) continue;
    seen.add(mk);
    matchups.push({
      season: r.season,
      matchupPeriodId: r.matchupPeriodId,
      week: Number(r.week) || 0,
      homeTeamId: hid,
      awayTeamId: aid,
      winnerTeamId: r.winnerTeamId != null ? Number(r.winnerTeamId) : null,
      homeScore: Number(r.homeScore),
      awayScore: Number(r.awayScore),
      isPlayoff: isPo,
    });
  }

  const byOpp = new Map<string, Agg>();

  const focalDisplay =
    displayByKey.get(profileOwnerKey) ||
    cleanOwnerDisplay(ownerTeamRows[ownerTeamRows.length - 1]?.ownerName?.trim() || "") ||
    profileOwnerKey;

  for (const m of matchups) {
    const homeKey = teamToOwnerKey.get(`${m.season}:${m.homeTeamId}`);
    const awayKey = teamToOwnerKey.get(`${m.season}:${m.awayTeamId}`);
    if (!homeKey || !awayKey || homeKey === awayKey) continue;

    const focalHome = focalSet.has(`${m.season}:${m.homeTeamId}`);
    const focalAway = focalSet.has(`${m.season}:${m.awayTeamId}`);
    if (!focalHome && !focalAway) continue;
    if (focalHome && focalAway) continue;

    const isHome = focalHome;
    const myTeamId = isHome ? m.homeTeamId : m.awayTeamId;
    const oppKey = isHome ? awayKey : homeKey;
    const myScore = isHome ? m.homeScore : m.awayScore;
    const oppScore = isHome ? m.awayScore : m.homeScore;
    const margin = Number((myScore - oppScore).toFixed(2));

    let result: "W" | "L" | "T";
    if (m.winnerTeamId == null) result = "T";
    else if (m.winnerTeamId === myTeamId) result = "W";
    else result = "L";

    if (!byOpp.has(oppKey)) {
      byOpp.set(oppKey, {
        wins: 0,
        losses: 0,
        ties: 0,
        pf: 0,
        pa: 0,
        marginSum: 0,
        largestWin: null,
        worstLoss: null,
        hbLoss: 0,
        hbWin: 0,
        playoffEncounters: 0,
        meetings: [],
      });
    }
    const agg = byOpp.get(oppKey)!;
    agg.pf += myScore;
    agg.pa += oppScore;
    agg.marginSum += margin;
    if (m.isPlayoff) agg.playoffEncounters++;

    if (result === "W") {
      agg.wins++;
      agg.largestWin = agg.largestWin == null ? margin : Math.max(agg.largestWin, margin);
      if (margin > 0 && margin <= 3) agg.hbWin++;
    } else if (result === "L") {
      agg.losses++;
      agg.worstLoss = agg.worstLoss == null ? margin : Math.min(agg.worstLoss, margin);
      if (margin < 0 && margin >= -3) agg.hbLoss++;
    } else {
      agg.ties++;
    }

    agg.meetings.push({
      season: m.season,
      week: m.week,
      matchupPeriodId: m.matchupPeriodId,
      isPlayoff: m.isPlayoff,
      ownerScore: myScore,
      opponentScore: oppScore,
      result,
      margin,
    });
  }

  let opponents: RivalryOpponentRow[] = [...byOpp.entries()]
    .map(([opponentOwnerKey, agg]) => {
      const gamesPlayed = agg.wins + agg.losses + agg.ties;
      const winPct = gamesPlayed > 0 ? Number(((agg.wins / gamesPlayed) * 100).toFixed(1)) : 0;
      const avgMargin = gamesPlayed > 0 ? Number((agg.marginSum / gamesPlayed).toFixed(2)) : 0;
      const sortMeetingsDesc = [...agg.meetings].sort((a, b) => meetingSortKey(b) - meetingSortKey(a));
      const lastFiveMeetings = sortMeetingsDesc.slice(0, 5);
      const lastTenMeetings = sortMeetingsDesc.slice(0, 10);
      return {
        opponentOwnerKey,
        opponentDisplayName: displayByKey.get(opponentOwnerKey) || opponentOwnerKey,
        gamesPlayed,
        wins: agg.wins,
        losses: agg.losses,
        ties: agg.ties,
        winPct,
        pointsFor: Number(agg.pf.toFixed(2)),
        pointsAgainst: Number(agg.pa.toFixed(2)),
        avgMargin,
        largestWin: agg.largestWin,
        worstLoss: agg.worstLoss,
        heartbreakLosses: agg.hbLoss,
        heartbreakWins: agg.hbWin,
        playoffEncounters: agg.playoffEncounters,
        lastFiveMeetings,
        lastTenMeetings,
        tag: rivalryDossierTag(winPct, gamesPlayed),
      };
    })
    .filter((r) => r.gamesPlayed > 0)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  if (!includeHistoricalOwners && activeFilter && activeFilter.size > 0) {
    opponents = opponents.filter((r) => activeFilter.has(r.opponentOwnerKey));
  }

  let pairDetail: RivalryPairDetail | null = null;
  if (pairOpp && pairOpp !== profileOwnerKey) {
    const agg = byOpp.get(pairOpp);
    if (agg && agg.meetings.length > 0) {
      const oppDisplay = displayByKey.get(pairOpp) || pairOpp;
      pairDetail = buildPairDetail({
        opponentOwnerKey: pairOpp,
        focalDisplay,
        oppDisplay,
        agg,
      });
    }
  }

  return {
    ownerKey: profileOwnerKey,
    ownerDisplayName: focalDisplay,
    opponents,
    matchupRowsUsed: matchups.length,
    includeHistoricalOwners,
    pairDetail,
  };
}
