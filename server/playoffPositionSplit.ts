/**
 * Playoff Position Split
 * ----------------------
 * For a focal owner, compares per-position STARTER scoring in their playoff games to:
 *   - that owner's own REGULAR-season per-position average ("vs season avg"), and
 *   - the league champions' per-position average, in two flavors:
 *       primary   = champion FULL-SEASON positional average (stable benchmark)
 *       secondary = champion PLAYOFF-ONLY positional average ("when it counted")
 *
 * Deterministic-first. Verdict phrases ("RBs disappeared in the playoffs", "QB
 * carried the run", "WR room let him down", "fell short of championship-level
 * production", "dominated the postseason edge") are emitted ONLY when numeric
 * thresholds AND a minimum sample size are met — never on a thin sample.
 *
 * Coverage: seasons with weekly player stats (2018+) only; pre-2018 has no
 * player data. A playoff "game" = a matchup with isPlayoff=1 the team played in.
 * Positions: QB / RB / WR / TE (starter scoring only), mirroring championshipPath.
 *
 * Identity + champion source reuse buildChampionshipAuthority (one authority).
 * Data: gm_weekly_player_stats + gm_player_registry + teams + matchups.
 */
import { sql } from "drizzle-orm";
import { getDb, memberIdFromOwnerKey } from "./db";
import { resolveCurrentOwner } from "./currentOwnerService";
import { getWeeklyStatsSeasonsForLeague } from "./weeklyStatsLeagueCoverage";
import { buildChampionshipAuthority } from "./championshipAuthority";
import { getLeagueWeeklyStats } from "./leagueWeeklyStats";

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Pos = (typeof POSITIONS)[number];

// Verdict gating — a phrase is only earned when the numbers clear these bars.
const MIN_STARTS = 5;            // player-games at a position in the playoffs
const DROP_RATIO = 0.75;         // playoff <= 75% of regular  => "disappeared"
const DROP_ABS = 3;              // ...and at least 3 pts/game lower
const CARRY_RATIO = 1.10;        // playoff >= 110% of regular and >= champ full
const LETDOWN_RATIO = 0.80;      // playoff < 80% of champ full (but not a collapse)
const OVERALL_SHORT = 0.90;      // overall playoff PF < 90% of champ full PF

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}
function r1(n: number): number { return Math.round(n * 10) / 10; }
function avg(nums: number[]): number | null { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }
function plural(p: Pos): string { return p === "TE" ? "TEs" : `${p}s`; }
function roomLabel(p: Pos): string { return p === "WR" || p === "RB" ? `${p} room` : `${p} play`; }

export type PosSplit = {
  position: Pos;
  playoffAvg: number | null;        // focal starter pts/game at pos in playoff games
  playoffStarts: number;            // sample size (player-games)
  regularAvg: number | null;        // focal regular-season avg at pos
  regularStarts: number;
  championFullAvg: number | null;   // PRIMARY benchmark (champion full-season)
  championPlayoffAvg: number | null;// SECONDARY benchmark (champion playoff-only)
  vsOwnRegular: number | null;      // playoffAvg - regularAvg
  vsChampionFull: number | null;    // playoffAvg - championFullAvg
  vsChampionPlayoff: number | null; // playoffAvg - championPlayoffAvg
  verdict: string | null;           // evidence-gated phrase, else null
  confidence: "ok" | "low-sample" | "none";
};

export type PlayoffPositionSplitResult = {
  leagueId: string;
  ownerKey: string | null;
  ownerName: string;
  isSetupComplete: boolean;
  available: boolean;
  reason: string | null;
  coverageSeasons: number[];          // weekly-stats seasons in scope
  playoffSeasonsForOwner: number[];   // seasons the focal owner actually played a playoff game
  positions: PosSplit[];
  overall: {
    playoffPF: number | null;         // QB+RB+WR+TE starter pts/game in playoffs
    regularPF: number | null;
    championFullPF: number | null;
    championPlayoffPF: number | null;
    headline: string | null;          // evidence-gated overall phrase
  };
  narrative: string;
  confidence: "High" | "Medium" | "Limited";
  note?: string;
};

const norm = (g: string | null | undefined): string | null => (g ? memberIdFromOwnerKey(g) : null);

export async function computePlayoffPositionSplit(
  userId?: number,
  ownerKeyOverride?: string | null,
): Promise<PlayoffPositionSplitResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const co = await resolveCurrentOwner(userId != null ? { id: userId } : null);
  const leagueId = co.leagueId ?? "";
  if (!leagueId || leagueId === "default") {
    throw new Error("SETUP_REQUIRED: No active league — connect a league in Settings.");
  }
  const isSetupComplete = co.isSetupComplete;

  // teams: identity + per-season teamId for everyone (league-scoped).
  const teams = rowsOf(await db.execute(sql`
    SELECT season, teamId, ownerId, ownerName
    FROM teams WHERE leagueId=${leagueId} AND ownerId IS NOT NULL AND ownerId<>'' `))
    .map((r: any) => ({ season: Number(r.season), teamId: Number(r.teamId), ownerId: String(r.ownerId), ownerName: String(r.ownerName ?? "") }));

  const champAuthority = await buildChampionshipAuthority({ db, leagueId });
  const canonOf = champAuthority.canonicalKeyForOwnerId;

  // Focal identity (canonical) + display name.
  const focal = norm(ownerKeyOverride) || (isSetupComplete ? norm(co.ownerKey) : null);
  const focalCanon = focal ? canonOf(focal) : null;
  const nameByCanon = new Map<string, string>();
  for (const t of teams) { const c = canonOf(t.ownerId); if (t.ownerName && !nameByCanon.has(c)) nameByCanon.set(c, t.ownerName); }
  const ownerName = (focalCanon && nameByCanon.get(focalCanon)) || co.displayName || "This owner";

  const coverageSeasons = await getWeeklyStatsSeasonsForLeague(leagueId);
  const base = { leagueId, ownerKey: focal, ownerName, isSetupComplete };
  if (!focalCanon) return emptyResult(base, "No owner identity resolved.", coverageSeasons);
  if (coverageSeasons.length === 0) return emptyResult(base, "No weekly player stats for this league (needs 2018+).", coverageSeasons);

  // focal canonical -> set of (season -> teamId)
  const focalTeamBySeason = new Map<number, number>();
  for (const t of teams) if (canonOf(t.ownerId) === focalCanon) focalTeamBySeason.set(t.season, t.teamId);

  // Playoff participation: (season,teamId) -> set of playoff weeks that team played.
  const playoffWeeks = new Map<string, Set<number>>();
  const addPW = (season: number, teamId: number, week: number) => {
    if (!teamId) return;
    const k = `${season}:${teamId}`;
    if (!playoffWeeks.has(k)) playoffWeeks.set(k, new Set());
    playoffWeeks.get(k)!.add(week);
  };
  for (const m of rowsOf(await db.execute(sql`
    SELECT season, week, homeTeamId, awayTeamId
    FROM matchups WHERE leagueId=${leagueId} AND isPlayoff=1 AND isCompleted=1`))) {
    const s = Number(m.season), w = Number(m.week);
    addPW(s, Number(m.homeTeamId), w); addPW(s, Number(m.awayTeamId), w);
  }
  const isPlayoffGame = (season: number, teamId: number, week: number) =>
    playoffWeeks.get(`${season}:${teamId}`)?.has(week) ?? false;

  // Weekly starter scoring via the shared owner-pinned accessor (one join, no cross-league leak).
  const weekly = (await getLeagueWeeklyStats(leagueId, { startersOnly: true, positions: POSITIONS, seasons: coverageSeasons })).rows
    .map((r) => ({ season: r.season, teamId: r.teamId, week: r.week, pts: r.pts, position: r.position as Pos }));

  // Aggregator: returns per-position list of pts for a row predicate.
  function collect(pred: (row: { season: number; teamId: number; week: number; pts: number; position: Pos }) => boolean): Record<Pos, number[]> {
    const out: Record<Pos, number[]> = { QB: [], RB: [], WR: [], TE: [] };
    for (const row of weekly) if (pred(row)) out[row.position].push(row.pts);
    return out;
  }

  const focalIs = (row: { season: number; teamId: number }) => focalTeamBySeason.get(row.season) === row.teamId;
  const focalPlayoff = collect((row) => focalIs(row) && isPlayoffGame(row.season, row.teamId, row.week));
  const focalRegular = collect((row) => focalIs(row) && !isPlayoffGame(row.season, row.teamId, row.week));
  const playoffSeasonsForOwner = [...new Set(weekly.filter((row) => focalIs(row) && isPlayoffGame(row.season, row.teamId, row.week)).map((row) => row.season))].sort((a, b) => a - b);

  // Champion benchmarks: per champion (season,teamId), full-season avg + playoff-only avg, then mean across champions.
  const coverageSet = new Set(coverageSeasons);
  const champFullPerPos: Record<Pos, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  const champPlayoffPerPos: Record<Pos, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const [season, teamId] of champAuthority.championTeamIdBySeason) {
    if (teamId == null || !coverageSet.has(season)) continue;
    const full = collect((row) => row.season === season && row.teamId === teamId);
    const po = collect((row) => row.season === season && row.teamId === teamId && isPlayoffGame(season, teamId, row.week));
    for (const p of POSITIONS) {
      const f = avg(full[p]); if (f != null) champFullPerPos[p].push(f);
      const q = avg(po[p]); if (q != null) champPlayoffPerPos[p].push(q);
    }
  }

  // Per-position split + evidence-gated verdict.
  const positions: PosSplit[] = POSITIONS.map((p) => {
    const playoffAvg = avg(focalPlayoff[p]);
    const playoffStarts = focalPlayoff[p].length;
    const regularAvg = avg(focalRegular[p]);
    const regularStarts = focalRegular[p].length;
    const championFullAvg = avg(champFullPerPos[p]);
    const championPlayoffAvg = avg(champPlayoffPerPos[p]);
    const vsOwnRegular = playoffAvg != null && regularAvg != null ? r1(playoffAvg - regularAvg) : null;
    const vsChampionFull = playoffAvg != null && championFullAvg != null ? r1(playoffAvg - championFullAvg) : null;
    const vsChampionPlayoff = playoffAvg != null && championPlayoffAvg != null ? r1(playoffAvg - championPlayoffAvg) : null;

    let verdict: string | null = null;
    let confidence: "ok" | "low-sample" | "none" = "none";
    if (playoffAvg == null) {
      confidence = "none";
    } else if (playoffStarts < MIN_STARTS) {
      confidence = "low-sample";
    } else {
      confidence = "ok";
      if (regularAvg != null && playoffAvg <= regularAvg * DROP_RATIO && regularAvg - playoffAvg >= DROP_ABS) {
        verdict = `${plural(p)} disappeared in the playoffs`;
      } else if (championFullAvg != null && regularAvg != null && playoffAvg >= championFullAvg && playoffAvg >= regularAvg * CARRY_RATIO) {
        verdict = `${p} carried the run`;
      } else if (championFullAvg != null && playoffAvg < championFullAvg * LETDOWN_RATIO) {
        verdict = `${roomLabel(p)} let him down`;
      }
    }
    return {
      position: p,
      playoffAvg: playoffAvg != null ? r1(playoffAvg) : null,
      playoffStarts,
      regularAvg: regularAvg != null ? r1(regularAvg) : null,
      regularStarts,
      championFullAvg: championFullAvg != null ? r1(championFullAvg) : null,
      championPlayoffAvg: championPlayoffAvg != null ? r1(championPlayoffAvg) : null,
      vsOwnRegular, vsChampionFull, vsChampionPlayoff, verdict, confidence,
    };
  });

  // Overall positional starter output per GAME (sum QB+RB+WR+TE starters in a team-week, averaged across games).
  function gameTotals(pred: (row: { season: number; teamId: number; week: number; pts: number; position: Pos }) => boolean): number[] {
    const m = new Map<string, number>();
    for (const row of weekly) if (pred(row)) m.set(`${row.season}:${row.teamId}:${row.week}`, (m.get(`${row.season}:${row.teamId}:${row.week}`) ?? 0) + row.pts);
    return [...m.values()];
  }
  const focalPlayoffGames = gameTotals((row) => focalIs(row) && isPlayoffGame(row.season, row.teamId, row.week));
  const playoffPF = avg(focalPlayoffGames);
  const regularPF = avg(gameTotals((row) => focalIs(row) && !isPlayoffGame(row.season, row.teamId, row.week)));
  const champFullPFs: number[] = [];
  const champPlayoffPFs: number[] = [];
  for (const [season, teamId] of champAuthority.championTeamIdBySeason) {
    if (teamId == null || !coverageSet.has(season)) continue;
    const f = avg(gameTotals((row) => row.season === season && row.teamId === teamId));
    if (f != null) champFullPFs.push(f);
    const q = avg(gameTotals((row) => row.season === season && row.teamId === teamId && isPlayoffGame(season, teamId, row.week)));
    if (q != null) champPlayoffPFs.push(q);
  }
  const championFullPF = avg(champFullPFs);
  const championPlayoffPF = avg(champPlayoffPFs);

  let headline: string | null = null;
  if (playoffPF != null && championFullPF != null && focalPlayoffGames.length >= 3) {
    if (playoffPF >= championFullPF && (regularPF == null || playoffPF >= regularPF)) {
      headline = "dominated the postseason edge";
    } else if (playoffPF < championFullPF * OVERALL_SHORT) {
      headline = "fell short of championship-level production";
    }
  }

  const verdictPhrases = positions.filter((p) => p.verdict).map((p) => p.verdict!);
  const confidence: "High" | "Medium" | "Limited" =
    playoffSeasonsForOwner.length >= 4 ? "High" : playoffSeasonsForOwner.length >= 2 ? "Medium" : "Limited";

  let narrative: string;
  if (focalPlayoffGames.length === 0) {
    narrative = `No playoff games on record for ${ownerName} in the seasons with player-level data (${coverageSeasons[0]}–${coverageSeasons[coverageSeasons.length - 1]}).`;
  } else {
    const parts: string[] = [];
    if (verdictPhrases.length) parts.push(`In the playoffs, ${ownerName}'s ${verdictPhrases.join("; ")}.`);
    if (headline) parts.push(`Overall, ${ownerName} ${headline}.`);
    if (!parts.length) parts.push(`${ownerName}'s playoff positional output tracked close to both his regular-season baseline and the championship benchmark — no single position stood out enough to call.`);
    narrative = parts.join(" ");
  }

  return {
    leagueId, ownerKey: focal, ownerName, isSetupComplete,
    available: true, reason: null,
    coverageSeasons, playoffSeasonsForOwner, positions,
    overall: {
      playoffPF: playoffPF != null ? r1(playoffPF) : null,
      regularPF: regularPF != null ? r1(regularPF) : null,
      championFullPF: championFullPF != null ? r1(championFullPF) : null,
      championPlayoffPF: championPlayoffPF != null ? r1(championPlayoffPF) : null,
      headline,
    },
    narrative, confidence,
    note: "Playoff samples are small; verdicts require a minimum sample and are observed tendencies, not proof. Player data covers 2018+.",
  };
}

function emptyResult(
  base: { leagueId: string; ownerKey: string | null; ownerName: string; isSetupComplete: boolean },
  reason: string,
  coverageSeasons: number[],
): PlayoffPositionSplitResult {
  return {
    ...base, available: false, reason, coverageSeasons, playoffSeasonsForOwner: [],
    positions: [], overall: { playoffPF: null, regularPF: null, championFullPF: null, championPlayoffPF: null, headline: null },
    narrative: reason, confidence: "Limited",
  };
}
