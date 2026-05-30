/**
 * Rivalry Dossier V1 — completed regular-season rows from `gmMatchups` only,
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
  lastFiveMeetings: RivalryMeeting[];
  tag: string;
};

export type RivalryDossierPayload = {
  ownerKey: string;
  ownerDisplayName: string;
  opponents: RivalryOpponentRow[];
  /** gmMatchups rows used after dedupe (RS completed). */
  matchupRowsUsed: number;
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
};

export async function loadRivalryDossier(args: {
  db: AppDb;
  leagueId: string;
  ownerKey: string;
}): Promise<RivalryDossierPayload | null> {
  const { db, leagueId: lid } = args;
  const ownerKeyIn = args.ownerKey.trim();
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
    })
    .from(gmMatchups)
    .where(
      andDrizzle(
        eqDrizzle(gmMatchups.leagueId, lid),
        eqDrizzle(gmMatchups.isPlayoff, 0),
        eqDrizzle(gmMatchups.isCompleted, 1),
      ),
    );

  const seen = new Set<string>();
  const matchups: DbMatchupRow[] = [];
  for (const r of dbRows) {
    const hid = Number(r.homeTeamId);
    const aid = Number(r.awayTeamId);
    if (!hid || !aid) continue;
    const mk = `${r.season}|${r.matchupPeriodId}|${hid}|${aid}`;
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
    });
  }

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
    meetings: RivalryMeeting[];
  };

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
        meetings: [],
      });
    }
    const agg = byOpp.get(oppKey)!;
    agg.pf += myScore;
    agg.pa += oppScore;
    agg.marginSum += margin;
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
      ownerScore: myScore,
      opponentScore: oppScore,
      result,
      margin,
    });
  }

  const opponents: RivalryOpponentRow[] = [...byOpp.entries()]
    .map(([opponentOwnerKey, agg]) => {
      const gamesPlayed = agg.wins + agg.losses + agg.ties;
      const winPct =
        gamesPlayed > 0 ? Number(((agg.wins / gamesPlayed) * 100).toFixed(1)) : 0;
      const avgMargin =
        gamesPlayed > 0 ? Number((agg.marginSum / gamesPlayed).toFixed(2)) : 0;
      const lastFiveMeetings = [...agg.meetings]
        .sort((a, b) => b.season - a.season || b.matchupPeriodId - a.matchupPeriodId || b.week - a.week)
        .slice(0, 5);
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
        lastFiveMeetings,
        tag: rivalryDossierTag(winPct, gamesPlayed),
      };
    })
    .filter((r) => r.gamesPlayed > 0)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  return {
    ownerKey: profileOwnerKey,
    ownerDisplayName: focalDisplay,
    opponents,
    matchupRowsUsed: matchups.length,
  };
}
