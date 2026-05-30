/**
 * Hall of Fame / league records — championships from league_medals,
 * matchup stats and single-game records from completed regular-season gmMatchups only
 * (no ESPN cache fallback; no gmTeams W/L/T).
 */
import { gmMatchups, gmTeams, leagueMedals } from "../drizzle/schema";
import { and as andDrizzle, asc as ascDrizzle, eq as eqDrizzle } from "drizzle-orm";
import type { AppDb } from "./db";
import {
  aggregateMatchupWLByOwnerSeason,
  buildNameToOwnerId,
  buildRawKeyToCanonicalProfileKey,
  buildTeamToCanonicalProfileKey,
  cleanOwnerDisplay,
  resolveMedalTeamToOwnerKey,
  type FlatRegularSeasonMatchup,
  type GmTeamRow,
} from "./ownerProfileService";

export type Unavailable = { available: false; reason: string };
export type Available<T> = { available: true; value: T };
export type MaybeAvailable<T> = Available<T> | Unavailable;

function unv(reason: string): Unavailable {
  return { available: false, reason };
}
function ok<T>(value: T): Available<T> {
  return { available: true, value };
}

function canonicalMedalOwnerKey(
  allRows: GmTeamRow[],
  nameToOwnerId: ReadonlyMap<string, string>,
  season: number,
  teamLabel: string | null,
): string | null {
  const raw = resolveMedalTeamToOwnerKey(season, teamLabel, allRows, nameToOwnerId);
  if (!raw) return null;
  const remap = buildRawKeyToCanonicalProfileKey(allRows);
  return remap.get(raw) ?? raw;
}

type DedupedMatchup = {
  season: number;
  matchupPeriodId: number;
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  winnerTeamId: number | null;
  homeScore: number;
  awayScore: number;
};

type PairAgg = {
  a: string;
  b: string;
  games: number;
  margins: number[];
  heartbreaks: number;
  /** chronological games from A's perspective: 1 win, -1 loss, 0 tie */
  aPerspective: Array<{ season: number; period: number; week: number; outcome: -1 | 0 | 1 }>;
};

export type HallOfFamePayload = {
  coverage: {
    completedRsGmMatchupGames: number;
    dedupedMatchupRows: number;
    seasonsTouched: number[];
    note: string;
  };
  championships: {
    leaderboard: Array<{
      ownerKey: string;
      displayName: string;
      titles: number;
      titleSeasons: number[];
    }>;
    history: Array<{
      season: number;
      championTeam: string | null;
      runnerUpTeam: string | null;
      thirdTeam: string | null;
      resolvedChampionOwnerKey: string | null;
      resolvedChampionDisplay: string | null;
      resolvedRunnerUpDisplay: string | null;
      resolvedThirdDisplay: string | null;
    }>;
    medalDiagnostics: {
      totalMedals: number;
      unmatchedChampionTeams: { season: number; teamName: string }[];
      unmatchedRunnerUpTeams: { season: number; teamName: string }[];
      unmatchedThirdTeams: { season: number; teamName: string }[];
    };
  };
  ownerRecords: Array<{
    ownerKey: string;
    displayName: string;
    titles: number;
    titleSeasons: number[];
    wins: number;
    losses: number;
    ties: number;
    gamesPlayed: number;
    winPct: number;
    seasonsActive: number;
  }>;
  singleGameRecords: {
    highestTeamScore: MaybeAvailable<{
      score: number;
      season: number;
      period: number;
      week: number;
      teamId: number;
      label: string;
    }>;
    lowestTeamScore: MaybeAvailable<{
      score: number;
      season: number;
      period: number;
      week: number;
      teamId: number;
      label: string;
    }>;
    biggestBlowout: MaybeAvailable<{
      margin: number;
      season: number;
      period: number;
      week: number;
      winnerScore: number;
      loserScore: number;
      winnerLabel: string;
      loserLabel: string;
    }>;
    closestGame: MaybeAvailable<{
      margin: number;
      season: number;
      period: number;
      week: number;
      homeScore: number;
      awayScore: number;
      homeLabel: string;
      awayLabel: string;
    }>;
    highestCombinedScore: MaybeAvailable<{
      combined: number;
      season: number;
      period: number;
      week: number;
      homeScore: number;
      awayScore: number;
      homeLabel: string;
      awayLabel: string;
    }>;
    lowestCombinedScore: MaybeAvailable<{
      combined: number;
      season: number;
      period: number;
      week: number;
      homeScore: number;
      awayScore: number;
      homeLabel: string;
      awayLabel: string;
    }>;
  };
  rivalryRecords: {
    mostGamesPlayed: MaybeAvailable<{
      ownerKeyA: string;
      displayA: string;
      ownerKeyB: string;
      displayB: string;
      games: number;
    }>;
    mostLopsidedRivalry: MaybeAvailable<{
      ownerKeyA: string;
      displayA: string;
      ownerKeyB: string;
      displayB: string;
      avgAbsMargin: number;
      games: number;
    }>;
    mostHeartbreakGames: MaybeAvailable<{
      ownerKeyA: string;
      displayA: string;
      ownerKeyB: string;
      displayB: string;
      heartbreakGames: number;
      games: number;
    }>;
    longestDominance: MaybeAvailable<{
      dominantOwnerKey: string;
      dominantDisplay: string;
      opponentOwnerKey: string;
      opponentDisplay: string;
      consecutiveWins: number;
    }>;
  };
  seasonRecords: {
    bestRegularSeasonRecord: MaybeAvailable<{
      season: number;
      ownerKey: string;
      displayName: string;
      wins: number;
      losses: number;
      ties: number;
      winPct: number;
      games: number;
    }>;
    worstRegularSeasonRecord: MaybeAvailable<{
      season: number;
      ownerKey: string;
      displayName: string;
      wins: number;
      losses: number;
      ties: number;
      winPct: number;
      games: number;
    }>;
    mostPointsInSeason: MaybeAvailable<{
      season: number;
      ownerKey: string;
      displayName: string;
      pointsFor: number;
      games: number;
    }>;
    fewestPointsInSeason: MaybeAvailable<{
      season: number;
      ownerKey: string;
      displayName: string;
      pointsFor: number;
      games: number;
    }>;
  };
};

const MIN_SEASON_GAMES = 6;

export async function buildHallOfFamePayload(args: {
  db: AppDb;
  leagueId: string;
  /** Reserved for future cache-tier parity; gmMatchups path ignores userId. */
  userId: number;
}): Promise<HallOfFamePayload> {
  void args.userId;
  const { db, leagueId: lid } = args;

  const allGmRows = (await db
    .select()
    .from(gmTeams)
    .where(eqDrizzle(gmTeams.leagueId, lid))
    .orderBy(ascDrizzle(gmTeams.season), ascDrizzle(gmTeams.teamId))) as GmTeamRow[];

  const nameToOwnerId = buildNameToOwnerId(allGmRows);
  const teamToOwnerKey = buildTeamToCanonicalProfileKey(allGmRows);
  /** Latest-season display label per canonical ownerKey */
  const ownerDisplayLatest = new Map<string, { season: number; label: string }>();
  for (const t of allGmRows) {
    if (t.teamId <= 0) continue;
    const k = teamToOwnerKey.get(`${t.season}:${t.teamId}`);
    if (!k) continue;
    const label = cleanOwnerDisplay((t.ownerName || "").trim()) || cleanOwnerDisplay((t.name || "").trim()) || k;
    const prev = ownerDisplayLatest.get(k);
    if (!prev || t.season >= prev.season) ownerDisplayLatest.set(k, { season: t.season, label });
  }
  const ownerLabel = (key: string) => ownerDisplayLatest.get(key)?.label || key;

  function teamRowLabel(season: number, teamId: number): string {
    const t = allGmRows.find((r) => r.season === season && r.teamId === teamId);
    if (!t) return `team ${teamId}`;
    const ok = teamToOwnerKey.get(`${season}:${teamId}`) || "";
    const owner = ownerLabel(ok);
    const tn = (t.name || "").trim();
    return tn ? `${owner} — ${tn}` : owner;
  }

  const medalRows = await db
    .select({
      season: leagueMedals.season,
      championOwner: leagueMedals.championOwner,
      runnerUpOwner: leagueMedals.runnerUpOwner,
      thirdPlaceOwner: leagueMedals.thirdPlaceOwner,
    })
    .from(leagueMedals)
    .where(eqDrizzle(leagueMedals.leagueId, lid))
    .orderBy(ascDrizzle(leagueMedals.season));

  const unmatchedChampionTeams: { season: number; teamName: string }[] = [];
  const unmatchedRunnerUpTeams: { season: number; teamName: string }[] = [];
  const unmatchedThirdTeams: { season: number; teamName: string }[] = [];

  const titleByOwner = new Map<string, { seasons: number[] }>();
  const history: HallOfFamePayload["championships"]["history"] = [];

  for (const m of medalRows) {
    const ck = canonicalMedalOwnerKey(allGmRows, nameToOwnerId, m.season, m.championOwner);
    const rk = canonicalMedalOwnerKey(allGmRows, nameToOwnerId, m.season, m.runnerUpOwner);
    const tk = canonicalMedalOwnerKey(allGmRows, nameToOwnerId, m.season, m.thirdPlaceOwner);

    if (m.championOwner?.trim() && !ck) unmatchedChampionTeams.push({ season: m.season, teamName: m.championOwner });
    if (m.runnerUpOwner?.trim() && !rk) unmatchedRunnerUpTeams.push({ season: m.season, teamName: m.runnerUpOwner });
    if (m.thirdPlaceOwner?.trim() && !tk) unmatchedThirdTeams.push({ season: m.season, teamName: m.thirdPlaceOwner });

    if (ck) {
      if (!titleByOwner.has(ck)) titleByOwner.set(ck, { seasons: [] });
      titleByOwner.get(ck)!.seasons.push(m.season);
    }

    history.push({
      season: m.season,
      championTeam: m.championOwner || null,
      runnerUpTeam: m.runnerUpOwner || null,
      thirdTeam: m.thirdPlaceOwner || null,
      resolvedChampionOwnerKey: ck,
      resolvedChampionDisplay: ck ? ownerLabel(ck) : null,
      resolvedRunnerUpDisplay: rk ? ownerLabel(rk) : null,
      resolvedThirdDisplay: tk ? ownerLabel(tk) : null,
    });
  }

  const leaderboard = [...titleByOwner.entries()]
    .map(([ownerKey, v]) => ({
      ownerKey,
      displayName: ownerLabel(ownerKey),
      titles: new Set(v.seasons).size,
      titleSeasons: [...new Set(v.seasons)].sort((a, b) => b - a),
    }))
    .sort((a, b) => b.titles - a.titles || a.displayName.localeCompare(b.displayName));

  const dbMatchRows = await db
    .select({
      season: gmMatchups.season,
      matchupPeriodId: gmMatchups.matchupPeriodId,
      week: gmMatchups.week,
      homeTeamId: gmMatchups.homeTeamId,
      awayTeamId: gmMatchups.awayTeamId,
      winnerTeamId: gmMatchups.winnerTeamId,
      homeScore: gmMatchups.homeScore,
      awayScore: gmMatchups.awayScore,
      isPlayoff: gmMatchups.isPlayoff,
      isCompleted: gmMatchups.isCompleted,
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
  const deduped: DedupedMatchup[] = [];
  for (const r of dbMatchRows) {
    const hid = Number(r.homeTeamId);
    const aid = Number(r.awayTeamId);
    if (!hid || !aid) continue;
    const mk = `${r.season}|${r.matchupPeriodId}|${hid}|${aid}`;
    if (seen.has(mk)) continue;
    seen.add(mk);
    deduped.push({
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

  const flat: FlatRegularSeasonMatchup[] = deduped.map((m) => ({
    season: m.season,
    matchupPeriodId: m.matchupPeriodId,
    week: m.week,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    winnerTeamId: m.winnerTeamId,
    isCompleted: 1,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  }));

  const wlBySeasonOwner = aggregateMatchupWLByOwnerSeason(flat, teamToOwnerKey);
  const career = new Map<string, { w: number; l: number; t: number }>();
  for (const [k, rec] of wlBySeasonOwner) {
    const ix = k.indexOf("##");
    if (ix < 0) continue;
    const ownerKey = k.slice(ix + 2);
    if (!career.has(ownerKey)) career.set(ownerKey, { w: 0, l: 0, t: 0 });
    const c = career.get(ownerKey)!;
    c.w += rec.wins;
    c.l += rec.losses;
    c.t += rec.ties;
  }

  const seasonsActiveByOwner = new Map<string, Set<number>>();
  for (const t of allGmRows) {
    if (t.teamId <= 0) continue;
    const k = teamToOwnerKey.get(`${t.season}:${t.teamId}`);
    if (!k) continue;
    if (!seasonsActiveByOwner.has(k)) seasonsActiveByOwner.set(k, new Set());
    seasonsActiveByOwner.get(k)!.add(t.season);
  }

  const ownerKeySet = new Set<string>([...career.keys(), ...titleByOwner.keys(), ...seasonsActiveByOwner.keys()]);
  const ownerRecords = [...ownerKeySet]
    .map((ownerKey) => {
      const c = career.get(ownerKey) ?? { w: 0, l: 0, t: 0 };
      const gp = c.w + c.l + c.t;
      const winPct = gp > 0 ? Number((((c.w + 0.5 * c.t) / gp) * 100).toFixed(2)) : 0;
      const titleSeasons = [...new Set(titleByOwner.get(ownerKey)?.seasons ?? [])].sort((a, b) => b - a);
      const titles = titleSeasons.length;
      return {
        ownerKey,
        displayName: ownerLabel(ownerKey),
        titles,
        titleSeasons,
        wins: c.w,
        losses: c.l,
        ties: c.t,
        gamesPlayed: gp,
        winPct,
        seasonsActive: seasonsActiveByOwner.get(ownerKey)?.size ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.titles - a.titles ||
        b.winPct - a.winPct ||
        b.wins - a.wins ||
        a.displayName.localeCompare(b.displayName),
    );

  const seasonsTouched = [...new Set(deduped.map((m) => m.season))].sort((a, b) => a - b);
  const coverage = {
    completedRsGmMatchupGames: deduped.length,
    dedupedMatchupRows: deduped.length,
    seasonsTouched,
    note:
      deduped.length === 0
        ? "No completed regular-season gmMatchups rows — scoring records unavailable. Owner W/L/T from matchups is empty; titles still use league_medals."
        : "Single-game and season scoring stats use completed regular-season gmMatchups only (no cache fallback). Owner W/L/T uses the same gmMatchups slice.",
  };

  /** ── Single-game records ───────────────────────────────────────────── */
  let highestTeamScore: HallOfFamePayload["singleGameRecords"]["highestTeamScore"] = unv(
    "No completed gmMatchups rows.",
  );
  let lowestTeamScore: HallOfFamePayload["singleGameRecords"]["lowestTeamScore"] = unv(
    "No completed gmMatchups rows.",
  );
  let biggestBlowout: HallOfFamePayload["singleGameRecords"]["biggestBlowout"] = unv(
    "No completed gmMatchups rows.",
  );
  let closestGame: HallOfFamePayload["singleGameRecords"]["closestGame"] = unv("No completed gmMatchups rows.");
  let highestCombinedScore: HallOfFamePayload["singleGameRecords"]["highestCombinedScore"] = unv(
    "No completed gmMatchups rows.",
  );
  let lowestCombinedScore: HallOfFamePayload["singleGameRecords"]["lowestCombinedScore"] = unv(
    "No completed gmMatchups rows.",
  );

  if (deduped.length > 0) {
    let bestHigh: { score: number; m: DedupedMatchup; side: "home" | "away" } = {
      score: -Infinity,
      m: deduped[0]!,
      side: "home",
    };
    let bestLow: { score: number; m: DedupedMatchup; side: "home" | "away" } = {
      score: Infinity,
      m: deduped[0]!,
      side: "home",
    };
    let bestBlow = { margin: -1, m: deduped[0]! };
    let bestClose = { margin: Infinity, m: deduped[0]! };
    let bestComb = { v: -Infinity, m: deduped[0]! };
    let worstComb = { v: Infinity, m: deduped[0]! };

    for (const m of deduped) {
      for (const side of ["home", "away"] as const) {
        const sc = side === "home" ? m.homeScore : m.awayScore;
        const tid = side === "home" ? m.homeTeamId : m.awayTeamId;
        if (sc > bestHigh.score) bestHigh = { score: sc, m, side };
        if (sc < bestLow.score) bestLow = { score: sc, m, side };
      }
      const mar = Math.abs(m.homeScore - m.awayScore);
      if (mar > bestBlow.margin) bestBlow = { margin: mar, m };
      if (mar < bestClose.margin) bestClose = { margin: mar, m };
      const comb = m.homeScore + m.awayScore;
      if (comb > bestComb.v) bestComb = { v: comb, m };
      if (comb < worstComb.v) worstComb = { v: comb, m };
    }

    const hiTid = bestHigh.side === "home" ? bestHigh.m.homeTeamId : bestHigh.m.awayTeamId;
    highestTeamScore = ok({
      score: bestHigh.score,
      season: bestHigh.m.season,
      period: bestHigh.m.matchupPeriodId,
      week: bestHigh.m.week,
      teamId: hiTid,
      label: teamRowLabel(bestHigh.m.season, hiTid),
    });

    const loTid = bestLow.side === "home" ? bestLow.m.homeTeamId : bestLow.m.awayTeamId;
    lowestTeamScore = ok({
      score: bestLow.score,
      season: bestLow.m.season,
      period: bestLow.m.matchupPeriodId,
      week: bestLow.m.week,
      teamId: loTid,
      label: teamRowLabel(bestLow.m.season, loTid),
    });

    const blowM = bestBlow.m;
    const winnerTid = blowM.homeScore >= blowM.awayScore ? blowM.homeTeamId : blowM.awayTeamId;
    const loserTid = blowM.homeScore >= blowM.awayScore ? blowM.awayTeamId : blowM.homeTeamId;
    const winnerScore = Math.max(blowM.homeScore, blowM.awayScore);
    const loserScore = Math.min(blowM.homeScore, blowM.awayScore);
    biggestBlowout = ok({
      margin: Math.abs(blowM.homeScore - blowM.awayScore),
      season: blowM.season,
      period: blowM.matchupPeriodId,
      week: blowM.week,
      winnerScore,
      loserScore,
      winnerLabel: teamRowLabel(blowM.season, winnerTid),
      loserLabel: teamRowLabel(blowM.season, loserTid),
    });

    const cM = bestClose.m;
    closestGame = ok({
      margin: Math.abs(cM.homeScore - cM.awayScore),
      season: cM.season,
      period: cM.matchupPeriodId,
      week: cM.week,
      homeScore: cM.homeScore,
      awayScore: cM.awayScore,
      homeLabel: teamRowLabel(cM.season, cM.homeTeamId),
      awayLabel: teamRowLabel(cM.season, cM.awayTeamId),
    });

    const hcM = bestComb.m;
    highestCombinedScore = ok({
      combined: hcM.homeScore + hcM.awayScore,
      season: hcM.season,
      period: hcM.matchupPeriodId,
      week: hcM.week,
      homeScore: hcM.homeScore,
      awayScore: hcM.awayScore,
      homeLabel: teamRowLabel(hcM.season, hcM.homeTeamId),
      awayLabel: teamRowLabel(hcM.season, hcM.awayTeamId),
    });

    const lcM = worstComb.m;
    lowestCombinedScore = ok({
      combined: lcM.homeScore + lcM.awayScore,
      season: lcM.season,
      period: lcM.matchupPeriodId,
      week: lcM.week,
      homeScore: lcM.homeScore,
      awayScore: lcM.awayScore,
      homeLabel: teamRowLabel(lcM.season, lcM.homeTeamId),
      awayLabel: teamRowLabel(lcM.season, lcM.awayTeamId),
    });
  }

  /** ── Pair aggregates (canonical owner keys) ───────────────────────── */
  const pairMap = new Map<string, PairAgg>();

  function pairKey(x: string, y: string) {
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  }

  for (const m of deduped) {
    const hk = teamToOwnerKey.get(`${m.season}:${m.homeTeamId}`);
    const ak = teamToOwnerKey.get(`${m.season}:${m.awayTeamId}`);
    if (!hk || !ak || hk === ak) continue;
    const pk = pairKey(hk, ak);
    const a = hk < ak ? hk : ak;
    const b = hk < ak ? ak : hk;
    if (!pairMap.has(pk)) {
      pairMap.set(pk, {
        a,
        b,
        games: 0,
        margins: [],
        heartbreaks: 0,
        aPerspective: [],
      });
    }
    const agg = pairMap.get(pk)!;
    agg.games++;
    const marginHome = m.homeScore - m.awayScore;
    agg.margins.push(Math.abs(marginHome));
    const close = Math.abs(marginHome) <= 3 && m.homeScore !== m.awayScore;
    if (close) agg.heartbreaks++;

    const wtid = m.winnerTeamId;
    let oa: -1 | 0 | 1 = 0;
    if (wtid == null) oa = 0;
    else if (wtid === m.homeTeamId) oa = hk === a ? 1 : -1;
    else oa = ak === a ? 1 : -1;
    agg.aPerspective.push({ season: m.season, period: m.matchupPeriodId, week: m.week, outcome: oa });
  }

  function longestWinStreak(outcomes: Array<{ season: number; period: number; week: number; outcome: -1 | 0 | 1 }>) {
    const sorted = [...outcomes].sort(
      (x, y) => x.season - y.season || x.period - y.period || x.week - y.week,
    );
    let run = 0;
    let best = 0;
    for (const o of sorted) {
      if (o.outcome === 1) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    return best;
  }

  let mostGamesPlayed: HallOfFamePayload["rivalryRecords"]["mostGamesPlayed"] = unv(
    "No multi-owner matchup pairs in gmMatchups.",
  );
  let mostLopsidedRivalry: HallOfFamePayload["rivalryRecords"]["mostLopsidedRivalry"] = unv(
    "Fewer than three head-to-head games for every pair — lopsided index unavailable.",
  );
  let mostHeartbreakGames: HallOfFamePayload["rivalryRecords"]["mostHeartbreakGames"] = unv(
    "No head-to-head pairs found.",
  );
  let longestDominance: HallOfFamePayload["rivalryRecords"]["longestDominance"] = unv(
    "No decisive head-to-head games to measure streaks.",
  );

  let maxGames = 0;
  let maxGamesPair: PairAgg | null = null;
  let maxHb = -1;
  let maxHbPair: PairAgg | null = null;
  let maxLopsided = -1;
  let maxLopsidedPair: PairAgg | null = null;
  let maxStreak = 0;
  let maxStreakMeta: { a: string; b: string; streak: number } | null = null;

  for (const agg of pairMap.values()) {
    if (agg.games > maxGames) {
      maxGames = agg.games;
      maxGamesPair = agg;
    }
    if (agg.heartbreaks > maxHb) {
      maxHb = agg.heartbreaks;
      maxHbPair = agg;
    }
    if (agg.games >= 3) {
      const avgM = agg.margins.reduce((s, x) => s + x, 0) / agg.margins.length;
      if (maxLopsidedPair == null || avgM > maxLopsided) {
        maxLopsided = avgM;
        maxLopsidedPair = agg;
      }
    }
    const streakA = longestWinStreak(agg.aPerspective);
    const rev = agg.aPerspective.map((o) => ({ ...o, outcome: (o.outcome === 1 ? -1 : o.outcome === -1 ? 1 : 0) as -1 | 0 | 1 }));
    const streakB = longestWinStreak(rev);
    const localBest = Math.max(streakA, streakB);
    if (localBest > maxStreak) {
      maxStreak = localBest;
      maxStreakMeta =
        streakA >= streakB
          ? { a: agg.a, b: agg.b, streak: streakA }
          : { a: agg.b, b: agg.a, streak: streakB };
    }
  }

  if (maxHbPair == null && maxGamesPair) {
    maxHbPair = maxGamesPair;
    maxHb = 0;
  }

  if (maxGamesPair && maxGames > 0) {
    mostGamesPlayed = ok({
      ownerKeyA: maxGamesPair.a,
      displayA: ownerLabel(maxGamesPair.a),
      ownerKeyB: maxGamesPair.b,
      displayB: ownerLabel(maxGamesPair.b),
      games: maxGames,
    });
  }
  if (maxLopsidedPair && maxLopsided >= 0) {
    mostLopsidedRivalry = ok({
      ownerKeyA: maxLopsidedPair.a,
      displayA: ownerLabel(maxLopsidedPair.a),
      ownerKeyB: maxLopsidedPair.b,
      displayB: ownerLabel(maxLopsidedPair.b),
      avgAbsMargin: Number(maxLopsided.toFixed(2)),
      games: maxLopsidedPair.games,
    });
  }
  if (maxHbPair) {
    mostHeartbreakGames = ok({
      ownerKeyA: maxHbPair.a,
      displayA: ownerLabel(maxHbPair.a),
      ownerKeyB: maxHbPair.b,
      displayB: ownerLabel(maxHbPair.b),
      heartbreakGames: maxHb,
      games: maxHbPair.games,
    });
  }
  if (maxStreakMeta && maxStreak >= 2) {
    longestDominance = ok({
      dominantOwnerKey: maxStreakMeta.a,
      dominantDisplay: ownerLabel(maxStreakMeta.a),
      opponentOwnerKey: maxStreakMeta.b,
      opponentDisplay: ownerLabel(maxStreakMeta.b),
      consecutiveWins: maxStreakMeta.streak,
    });
  } else if (deduped.length > 0) {
    longestDominance = unv("No owner posted a win streak of 2+ consecutive games vs the same opponent in the data.");
  }

  /** ── Season aggregates per ownerKey (canonical) ─────────────────────── */
  type SeasonOwner = { wins: number; losses: number; ties: number; pf: number; games: number };
  const seasonOwner = new Map<string, SeasonOwner>();
  for (const m of deduped) {
    const hk = teamToOwnerKey.get(`${m.season}:${m.homeTeamId}`);
    const ak = teamToOwnerKey.get(`${m.season}:${m.awayTeamId}`);
    if (!hk || !ak || hk === ak) continue;
    const wtid = m.winnerTeamId;
    for (const [ok, tid, score, oppScore] of [
      [hk, m.homeTeamId, m.homeScore, m.awayScore] as const,
      [ak, m.awayTeamId, m.awayScore, m.homeScore] as const,
    ]) {
      const key = `${m.season}##${ok}`;
      if (!seasonOwner.has(key)) seasonOwner.set(key, { wins: 0, losses: 0, ties: 0, pf: 0, games: 0 });
      const so = seasonOwner.get(key)!;
      so.pf += score;
      so.games++;
      if (wtid == null) so.ties++;
      else if (wtid === tid) so.wins++;
      else so.losses++;
    }
  }

  let bestRegularSeasonRecord: HallOfFamePayload["seasonRecords"]["bestRegularSeasonRecord"] = unv(
    "No owner-season with enough games (≥6) in gmMatchups.",
  );
  let worstRegularSeasonRecord: HallOfFamePayload["seasonRecords"]["worstRegularSeasonRecord"] = unv(
    "No owner-season with enough games (≥6) in gmMatchups.",
  );
  let mostPointsInSeason: HallOfFamePayload["seasonRecords"]["mostPointsInSeason"] = unv(
    "No owner-season with enough games (≥6) in gmMatchups.",
  );
  let fewestPointsInSeason: HallOfFamePayload["seasonRecords"]["fewestPointsInSeason"] = unv(
    "No owner-season with enough games (≥6) in gmMatchups.",
  );

  type SO = {
    season: number;
    ownerKey: string;
    wins: number;
    losses: number;
    ties: number;
    games: number;
    pf: number;
  };
  const rows: SO[] = [];
  for (const [k, so] of seasonOwner) {
    const ix = k.indexOf("##");
    if (ix < 0) continue;
    const season = Number(k.slice(0, ix));
    const ownerKey = k.slice(ix + 2);
    rows.push({ season, ownerKey, ...so });
  }

  const qualified = rows.filter((r) => r.games >= MIN_SEASON_GAMES);
  if (qualified.length > 0) {
    const byWinPct = [...qualified].sort((a, b) => {
      const pa = a.games ? (a.wins + 0.5 * a.ties) / a.games : 0;
      const pb = b.games ? (b.wins + 0.5 * b.ties) / b.games : 0;
      return pb - pa;
    });
    const best = byWinPct[0]!;
    const winPct = best.games ? Number((((best.wins + 0.5 * best.ties) / best.games) * 100).toFixed(2)) : 0;
    bestRegularSeasonRecord = ok({
      season: best.season,
      ownerKey: best.ownerKey,
      displayName: ownerLabel(best.ownerKey),
      wins: best.wins,
      losses: best.losses,
      ties: best.ties,
      winPct,
      games: best.games,
    });

    const worst = byWinPct[byWinPct.length - 1]!;
    const winPctW = worst.games ? Number((((worst.wins + 0.5 * worst.ties) / worst.games) * 100).toFixed(2)) : 0;
    worstRegularSeasonRecord = ok({
      season: worst.season,
      ownerKey: worst.ownerKey,
      displayName: ownerLabel(worst.ownerKey),
      wins: worst.wins,
      losses: worst.losses,
      ties: worst.ties,
      winPct: winPctW,
      games: worst.games,
    });

    const byPfHi = [...qualified].sort((a, b) => b.pf - a.pf);
    const hi = byPfHi[0]!;
    mostPointsInSeason = ok({
      season: hi.season,
      ownerKey: hi.ownerKey,
      displayName: ownerLabel(hi.ownerKey),
      pointsFor: Number(hi.pf.toFixed(2)),
      games: hi.games,
    });

    const byPfLo = [...qualified].sort((a, b) => a.pf - b.pf);
    const lo = byPfLo[0]!;
    fewestPointsInSeason = ok({
      season: lo.season,
      ownerKey: lo.ownerKey,
      displayName: ownerLabel(lo.ownerKey),
      pointsFor: Number(lo.pf.toFixed(2)),
      games: lo.games,
    });
  }

  return {
    coverage,
    championships: {
      leaderboard,
      history,
      medalDiagnostics: {
        totalMedals: medalRows.length,
        unmatchedChampionTeams,
        unmatchedRunnerUpTeams,
        unmatchedThirdTeams,
      },
    },
    ownerRecords,
    singleGameRecords: {
      highestTeamScore,
      lowestTeamScore,
      biggestBlowout,
      closestGame,
      highestCombinedScore,
      lowestCombinedScore,
    },
    rivalryRecords: {
      mostGamesPlayed,
      mostLopsidedRivalry,
      mostHeartbreakGames,
      longestDominance,
    },
    seasonRecords: {
      bestRegularSeasonRecord,
      worstRegularSeasonRecord,
      mostPointsInSeason,
      fewestPointsInSeason,
    },
  };
}
