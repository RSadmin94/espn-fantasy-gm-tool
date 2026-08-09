/**
 * Head-to-Head Authority
 * ----------------------
 * The single canonical computation of head-to-head records between two canonical
 * persons. Sits on two foundations:
 *   - Owner Identity Authority  -> resolves every (season, teamId) to a person.
 *   - gmMatchups                 -> the complete 2010+ matchup history (scores,
 *                                   winner, playoff flag, completion flag).
 *
 * Consumers (Rivalry Center, Legacy records, Owner Profiles, Championship
 * Diagnosis) must read head-to-head from here and never recompute it.
 *
 * Principle: one fact, one authority. Regular season is the default record;
 * playoff meetings are a separate context layer (never blended into the career
 * number).
 *
 * SCOPE: computation only. No consumer migration.
 */

import { getDb } from "./db";
import { gmMatchups } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { buildOwnerIdentityAuthority } from "./ownerIdentityAuthority";
import {
  classifyEspnPlayoffTier,
  meetingKey,
  parsePlayoffTierFromRawMatchup,
  placementWinnersBracketKeys,
  type EspnPlayoffTierKind,
} from "./matchupPlayoffTier";

/** A single meeting, oriented to a requested "personA" perspective. */
export interface H2HMeeting {
  season: number;
  week: number;
  matchupPeriodId: number;
  isPlayoff: boolean;
  /** canonical person id of the winner, or null for a tie. */
  winner: string | null;
  scoreA: number;
  scoreB: number;
  /** scoreA - scoreB (positive => A won by this margin). */
  marginA: number;
}

/** A win/loss/tie record from personA's perspective. */
export interface H2HRecord {
  wins: number;
  losses: number;
  ties: number;
  games: number;
}

/** Current streak from personA's perspective. */
export interface H2HStreak {
  type: "W" | "L" | "T" | "none";
  count: number;
}

/** Full head-to-head result between two canonical persons, from A's perspective. */
export interface H2HResult {
  personA: string;
  personB: string;
  displayA: string;
  displayB: string;
  /** Regular-season career record (the default rivalry number; playoffs excluded). */
  career: H2HRecord;
  /** Playoff meetings only — a separate context layer. */
  playoffs: H2HRecord;
  /** Last 5 / last 10 regular-season meetings. */
  recent5: H2HRecord;
  recent10: H2HRecord;
  /** Current regular-season streak from A's perspective. */
  streak: H2HStreak;
  /** Most recent meeting of any kind (regular or playoff). */
  lastMeeting: H2HMeeting | null;
  /** A's largest regular-season win / loss by margin. */
  largestVictory: H2HMeeting | null;
  largestLoss: H2HMeeting | null;
  /** Average (scoreA - scoreB) across regular-season meetings. */
  averageMarginA: number;
  /** Per-season regular-season record, oldest season first. */
  seasonHistory: Array<{ season: number } & H2HRecord>;
  /** Every meeting (regular + playoff), oldest first, A-oriented. */
  meetings: H2HMeeting[];
}

export interface H2HAuthority {
  /** Head-to-head between two canonical person ids, from personA's perspective. */
  getH2H(personA: string, personB: string): H2HResult;
  /** Canonical person ids that have at least one completed meeting. */
  listPersons(): string[];
  /** Canonical opponent ids that personA has faced (>=1 completed meeting). */
  opponentsOf(personA: string): string[];
  /**
   * League-wide championship-bracket eliminations when ESPN playoffTierType
   * can prove WINNERS_BRACKET (consolation excluded; 3rd-place excluded when
   * semi-final winners identify the title game). Same gmMatchups + Owner Identity
   * corpus Rivalry uses — not a second engine.
   *
   * If tier coverage is too thin, scope is `recorded_playoff_wins` (isPlayoff
   * wins, honestly labeled — not called eliminations).
   */
  eliminationsInflicted(): {
    scope: "championship_bracket_eliminations" | "recorded_playoff_wins";
    note: string;
    playoffMeetings: number;
    winnersBracketMeetings: number;
    consolationMeetings: number;
    unknownTierMeetings: number;
    placementGamesExcluded: number;
    leaderboard: Array<{
      personId: string;
      displayName: string;
      inflicted: number;
      topVictimId: string | null;
      topVictimName: string | null;
      topVictimCount: number;
    }>;
  };
}

interface RawMeeting {
  season: number;
  week: number;
  mpId: number;
  isPlayoff: boolean;
  playoffTierType: string | null;
  playoffKind: EspnPlayoffTierKind;
  homePerson: string;
  awayPerson: string;
  homeScore: number;
  awayScore: number;
  /** canonical winner person id, or null for a tie. */
  winnerPerson: string | null;
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}||${b}` : `${b}||${a}`);

export async function buildH2HAuthority(leagueId: string): Promise<H2HAuthority> {
  const db = await getDb();
  if (!db) throw new Error("h2hAuthority: no database connection");

  const identity = await buildOwnerIdentityAuthority(leagueId);
  const nameById = new Map<string, string>();
  for (const p of identity.listPersons()) nameById.set(p.canonicalPersonId, p.canonicalName);

  const rows = await db.select().from(gmMatchups).where(eq(gmMatchups.leagueId, leagueId));

  const pairs = new Map<string, RawMeeting[]>();
  for (const r of rows as Array<typeof gmMatchups.$inferSelect>) {
    if (!r.isCompleted) continue; // only finished games count
    const home = identity.resolve(r.season, r.homeTeamId);
    const away = identity.resolve(r.season, r.awayTeamId);
    if (home.status !== "resolved" || away.status !== "resolved") continue;
    const homePerson = home.canonicalPersonId!;
    const awayPerson = away.canonicalPersonId!;
    if (homePerson === awayPerson) continue; // safety: never self vs self

    const homeScore = Number(r.homeScore) || 0;
    const awayScore = Number(r.awayScore) || 0;

    // Prefer the recorded winner; fall back to score comparison.
    let winnerPerson: string | null = null;
    if (r.winnerTeamId != null) {
      const w = identity.resolve(r.season, r.winnerTeamId).canonicalPersonId;
      if (w === homePerson || w === awayPerson) winnerPerson = w;
    }
    if (winnerPerson === null) {
      if (homeScore > awayScore) winnerPerson = homePerson;
      else if (awayScore > homeScore) winnerPerson = awayPerson;
      else winnerPerson = null; // genuine tie
    }

    const playoffTierType = parsePlayoffTierFromRawMatchup(
      r.rawMatchup != null ? String(r.rawMatchup) : null,
    );
    const isPlayoff = !!r.isPlayoff;
    const playoffKind = classifyEspnPlayoffTier(playoffTierType, isPlayoff);

    const key = pairKey(homePerson, awayPerson);
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key)!.push({
      season: r.season,
      week: r.week,
      mpId: r.matchupPeriodId,
      isPlayoff,
      playoffTierType,
      playoffKind,
      homePerson,
      awayPerson,
      homeScore,
      awayScore,
      winnerPerson,
    });
  }

  const orient = (m: RawMeeting, A: string): H2HMeeting => {
    const aIsHome = m.homePerson === A;
    const scoreA = aIsHome ? m.homeScore : m.awayScore;
    const scoreB = aIsHome ? m.awayScore : m.homeScore;
    return {
      season: m.season, week: m.week, matchupPeriodId: m.mpId, isPlayoff: m.isPlayoff,
      winner: m.winnerPerson, scoreA, scoreB, marginA: scoreA - scoreB,
    };
  };

  const emptyRec = (): H2HRecord => ({ wins: 0, losses: 0, ties: 0, games: 0 });

  const tally = (ms: H2HMeeting[], A: string, B: string): H2HRecord => {
    const rec = emptyRec();
    for (const m of ms) {
      rec.games++;
      if (m.winner === A) rec.wins++;
      else if (m.winner === B) rec.losses++;
      else rec.ties++;
    }
    return rec;
  };

  function getH2H(personA: string, personB: string): H2HResult {
    const raw = pairs.get(pairKey(personA, personB)) ?? [];
    const all = raw
      .map((m) => orient(m, personA))
      .sort((a, b) => a.season - b.season || a.matchupPeriodId - b.matchupPeriodId);

    const regular = all.filter((m) => !m.isPlayoff);
    const playoff = all.filter((m) => m.isPlayoff);

    // Streak: walk regular meetings newest-first; stop at first change.
    let streak: H2HStreak = { type: "none", count: 0 };
    for (let i = regular.length - 1; i >= 0; i--) {
      const m = regular[i];
      const t: "W" | "L" | "T" = m.winner === personA ? "W" : m.winner === personB ? "L" : "T";
      if (streak.type === "none") streak = { type: t, count: 1 };
      else if (streak.type === t) streak.count++;
      else break;
    }

    let largestVictory: H2HMeeting | null = null;
    let largestLoss: H2HMeeting | null = null;
    let marginSum = 0;
    const seasonMap = new Map<number, H2HRecord>();
    for (const m of regular) {
      marginSum += m.marginA;
      if (m.winner === personA && (!largestVictory || m.marginA > largestVictory.marginA)) largestVictory = m;
      if (m.winner === personB && (!largestLoss || m.marginA < largestLoss.marginA)) largestLoss = m;
      if (!seasonMap.has(m.season)) seasonMap.set(m.season, emptyRec());
      const rec = seasonMap.get(m.season)!;
      rec.games++;
      if (m.winner === personA) rec.wins++;
      else if (m.winner === personB) rec.losses++;
      else rec.ties++;
    }

    return {
      personA, personB,
      displayA: nameById.get(personA) ?? personA,
      displayB: nameById.get(personB) ?? personB,
      career: tally(regular, personA, personB),
      playoffs: tally(playoff, personA, personB),
      recent5: tally(regular.slice(-5), personA, personB),
      recent10: tally(regular.slice(-10), personA, personB),
      streak,
      lastMeeting: all.length ? all[all.length - 1] : null,
      largestVictory,
      largestLoss,
      averageMarginA: regular.length ? marginSum / regular.length : 0,
      seasonHistory: [...seasonMap.entries()].sort((a, b) => a[0] - b[0]).map(([season, rec]) => ({ season, ...rec })),
      meetings: all,
    };
  }

  function listPersons(): string[] {
    const set = new Set<string>();
    for (const list of pairs.values()) for (const m of list) { set.add(m.homePerson); set.add(m.awayPerson); }
    return [...set];
  }

  function opponentsOf(personA: string): string[] {
    const set = new Set<string>();
    for (const list of pairs.values())
      for (const m of list) {
        if (m.homePerson === personA) set.add(m.awayPerson);
        else if (m.awayPerson === personA) set.add(m.homePerson);
      }
    return [...set];
  }

  function eliminationsInflicted(): {
    scope: "championship_bracket_eliminations" | "recorded_playoff_wins";
    note: string;
    playoffMeetings: number;
    winnersBracketMeetings: number;
    consolationMeetings: number;
    unknownTierMeetings: number;
    placementGamesExcluded: number;
    leaderboard: Array<{
      personId: string;
      displayName: string;
      inflicted: number;
      topVictimId: string | null;
      topVictimName: string | null;
      topVictimCount: number;
    }>;
  } {
    const all = [...pairs.values()].flat();
    const playoff = all.filter((m) => m.isPlayoff);
    const winners = playoff.filter((m) => m.playoffKind === "winners");
    const consolation = playoff.filter((m) => m.playoffKind === "consolation");
    const unknown = playoff.filter((m) => m.playoffKind === "unknown");
    const placement = placementWinnersBracketKeys(
      winners.map((m) => ({
        season: m.season,
        matchupPeriodId: m.mpId,
        homePerson: m.homePerson,
        awayPerson: m.awayPerson,
        winnerPerson: m.winnerPerson,
        kind: m.playoffKind,
      })),
    );
    const unknownRatio = playoff.length ? unknown.length / playoff.length : 1;
    const canProveElim = playoff.length > 0 && winners.length > 0 && unknownRatio <= 0.1;
    const scope = canProveElim ? "championship_bracket_eliminations" : "recorded_playoff_wins";
    const countable = canProveElim
      ? winners.filter((m) => !placement.has(meetingKey({
          season: m.season,
          matchupPeriodId: m.mpId,
          homePerson: m.homePerson,
          awayPerson: m.awayPerson,
        })))
      : playoff;
    const placementExcluded = canProveElim ? placement.size : 0;

    const counts = new Map<string, number>();
    const victims = new Map<string, Map<string, number>>();
    for (const m of countable) {
      if (!m.winnerPerson) continue;
      counts.set(m.winnerPerson, (counts.get(m.winnerPerson) ?? 0) + 1);
      const loser =
        m.winnerPerson === m.homePerson
          ? m.awayPerson
          : m.winnerPerson === m.awayPerson
            ? m.homePerson
            : null;
      if (!loser) continue;
      if (!victims.has(m.winnerPerson)) victims.set(m.winnerPerson, new Map());
      const byLoser = victims.get(m.winnerPerson)!;
      byLoser.set(loser, (byLoser.get(loser) ?? 0) + 1);
    }

    const leaderboard = [...counts.entries()]
      .map(([personId, inflicted]) => {
        let topVictimId: string | null = null;
        let topVictimCount = 0;
        for (const [victimId, n] of victims.get(personId) ?? []) {
          if (
            n > topVictimCount ||
            (n === topVictimCount &&
              (nameById.get(victimId) ?? victimId).localeCompare(
                nameById.get(topVictimId ?? "") ?? topVictimId ?? "",
              ) < 0)
          ) {
            topVictimId = victimId;
            topVictimCount = n;
          }
        }
        return {
          personId,
          displayName: nameById.get(personId) ?? personId,
          inflicted,
          topVictimId,
          topVictimName: topVictimId ? (nameById.get(topVictimId) ?? topVictimId) : null,
          topVictimCount,
        };
      })
      .sort((a, b) => b.inflicted - a.inflicted || a.displayName.localeCompare(b.displayName));

    const note = canProveElim
      ? `Championship bracket only (ESPN WINNERS_BRACKET). Consolation/losers-bracket excluded. ${placementExcluded} placement game(s) excluded when semi-final winners identified the title game.`
      : `Recorded playoff wins (isPlayoff meetings, including consolation if flagged). ESPN playoffTierType coverage is insufficient to prove championship-contention eliminations (${unknown.length}/${playoff.length} unknown tier).`;

    return {
      scope,
      note,
      playoffMeetings: playoff.length,
      winnersBracketMeetings: winners.length,
      consolationMeetings: consolation.length,
      unknownTierMeetings: unknown.length,
      placementGamesExcluded: placementExcluded,
      leaderboard,
    };
  }

  return { getH2H, listPersons, opponentsOf, eliminationsInflicted };
}
