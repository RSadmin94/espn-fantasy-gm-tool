/**
 * "Championship Path™" — deterministic prescription of what a focal owner must
 * improve to match the average-champion profile.
 *
 * Complement to Why Haven't I Won? (which diagnoses the past). This forward-looking
 * view compares the focal owner's recent profile to the league's average champion
 * across positional scoring and total output, surfaces the single biggest gap, the
 * closest champion comparison, and concrete recommended actions.
 *
 * Profile-aware + multi-league. Deterministic-first; narrative is templated from facts.
 * Data: teams (champions, records), gm_weekly_player_stats + gm_player_registry
 * (positional scoring), espn_raw_cache 'combined' (playoff cutoff/settings).
 */
import { sql } from "drizzle-orm";
import { getDb, memberIdFromOwnerKey, getAllCachedSeasons } from "./db";
import { resolveCurrentOwner } from "./currentOwnerService";
import { computeWhyHaventIWon } from "./whyHaventIWon";
import { computeDraftReality } from "./draftRealitySimulator";
import { getWeeklyStatsSeasonsForLeague } from "./weeklyStatsLeagueCoverage";
import { buildChampionshipAuthority } from "./championshipAuthority";
import { getLeagueWeeklyStats } from "./leagueWeeklyStats";
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Pos = (typeof POSITIONS)[number];

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}
function r1(n: number): number { return Math.round(n * 10) / 10; }
function normGuid(g: string | null | undefined): string | null { return g ? memberIdFromOwnerKey(g) : null; }

export type PositionGap = {
  position: Pos;
  ownerAvg: number;       // focal starter pts/game at this position (recent seasons)
  championAvg: number;    // avg champion starter pts/game
  gap: number;            // champion - owner (positive = deficit)
  gapPct: number;         // gap as % of champion benchmark
};

export type ChampionComparison = {
  season: number;
  ownerName: string;      // the champion's name
  totalPointsFor: number;
  similarity: number;     // 0-100, how close focal profile is to this champion
};

export type PathThreat = {
  ownerName: string;
  record: string;         // focal's W-L vs this rival
  netLosses: number;      // losses - wins
  playoffLosses: number;
  detail: string;
};

export type ChampionSeasonProfile = {
  season: number;
  champion: string | null;
  source: string | null;
  byPosition: Record<Pos, number | null>;
};
export type ChampionshipProfile = {
  available: boolean;
  reason: string | null;
  positions: Pos[];
  seasons: ChampionSeasonProfile[];
  combined: Record<Pos, number>;
};
export type ChampionshipPathResult = {
  leagueId: string;
  ownerKey: string | null;
  ownerName: string;
  isSetupComplete: boolean;
  hasWon: boolean;
  // benchmark
  championProfile: Record<Pos, number>;
  championAvgPointsFor: number;
  championAvgWins: number;
  // focal
  ownerProfile: Record<Pos, number>;
  ownerAvgPointsFor: number;
  // analysis
  positionGaps: PositionGap[];          // sorted worst-first
  biggestWeakness: PositionGap | null;
  pointsForGap: number;                 // champion PF - owner PF (per season)
  closestChampion: ChampionComparison | null;
  biggestThreat: PathThreat | null;     // rival who most blocks the path
  biggestRival: PathThreat | null;      // most-contested opponent (longest H2H history)
  topImprovements: string[];            // top 3 required improvements
  draftContext: string | null;          // from Draft Reality outputs
  pastReasonContext: string | null;     // from Why Haven't I Won findings
  recommendedActions: string[];
  headline: string;                     // "You are one WR1 away from the champion profile."
  narrative: string;
  confidence: "High" | "Medium" | "Limited";
  note?: string;
  /** Distinct seasons with a `teams` row for this league (historical footprint). */
  historicalSeasonCount: number;
  /** Teams in the league's most recent season (current league size; 0 if unknown). */
  teamCount: number;
  /** Seasons where this league has weekly player stats joined to `teams`. */
  weeklyStatsSeasons: number[];
  /** Per-season champion positional profile + combined (Championship Profile view). */
  championshipProfile: ChampionshipProfile;
};

// A "WR1/RB1/etc." tier threshold: a top starter at a position roughly equals the
// champion benchmark for that slot. Used to phrase the headline action.
const POS_LABEL: Record<Pos, string> = { QB: "QB1", RB: "RB1", WR: "WR1", TE: "TE1" };

export async function computeChampionshipPath(userId?: number, ownerKeyOverride?: string | null): Promise<ChampionshipPathResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const co = await resolveCurrentOwner(userId != null ? { id: userId } : null);
  // Phase B5: no fallback to hardcoded league — throw if no active league.
  const leagueId = co.leagueId ?? "";
  if (!leagueId || leagueId === "default") {
    throw new Error("SETUP_REQUIRED: No active league — connect a league in Settings.");
  }
  const isSetupComplete = co.isSetupComplete;

  // ── teams: champions + focal identity ─────────────────────────────────
  const teams = rowsOf(await db.execute(sql`
    SELECT season, teamId, ownerId, ownerName, wins, pointsFor AS pf, finalStanding
    FROM teams WHERE leagueId=${leagueId} AND ownerId IS NOT NULL AND ownerId<>'' `))
    .map((r: any) => ({ season: Number(r.season), teamId: Number(r.teamId), ownerId: String(r.ownerId), ownerName: String(r.ownerName ?? ""), wins: Number(r.wins ?? 0), pf: Number(r.pf ?? 0), finalStanding: r.finalStanding != null ? Number(r.finalStanding) : null }));

  const historicalSeasonCount = new Set(teams.map((t) => t.season)).size;
  // Current league size = distinct teamIds in the most recent season (same league-scoped
  // teams data already loaded above; does not affect any championship calculation).
  const latestSeason = teams.length ? Math.max(...teams.map((t) => t.season)) : null;
  const teamCount =
    latestSeason != null ? new Set(teams.filter((t) => t.season === latestSeason).map((t) => t.teamId)).size : 0;
  const weeklyStatsSeasons = await getWeeklyStatsSeasonsForLeague(leagueId);
  const weeklySeasonSql =
    weeklyStatsSeasons.length > 0
      ? sql`w.season IN (${sql.join(
          weeklyStatsSeasons.map((s) => sql`${s}`),
          sql`, `,
        )})`
      : sql`FALSE`;

  const weeklySet = new Set(weeklyStatsSeasons);

  const nameByOwner = new Map<string, string>();
  const seasonsByOwner = new Map<string, number>();
  for (const t of teams) {
    if (t.ownerName) nameByOwner.set(t.ownerId, t.ownerName);
    if (t.wins > 0 || t.pf > 0) seasonsByOwner.set(t.ownerId, (seasonsByOwner.get(t.ownerId) ?? 0) + 1);
  }

  let focal = normGuid(ownerKeyOverride) || (isSetupComplete ? normGuid(co.ownerKey) : null);
  if (!focal) {
    let best: string | null = null, bestN = -1;
    for (const [g, n] of seasonsByOwner) if (n > bestN) { bestN = n; best = g; }
    focal = best;
  }
  const ownerName = (focal && nameByOwner.get(focal)) || co.displayName || "This owner";

  if (!focal) {
    return emptyResult(leagueId, ownerName, isSetupComplete, "No owner data available.", {
      historicalSeasonCount,
      teamCount,
      weeklyStatsSeasons,
    });
  }

  // ── champion identity per season (medals primary; standings fallback) ──
  const champAuthority = await buildChampionshipAuthority({ db, leagueId });
  const champTeamBySeason = new Map<number, number>();
  for (const [s, tid] of champAuthority.championTeamIdBySeason) {
    if (tid != null) champTeamBySeason.set(s, tid);
  }
  const champions = teams.filter((t) => champTeamBySeason.get(t.season) === t.teamId);
  const focalCanon = champAuthority.canonicalKeyForOwnerId(focal);
  const hasWon = (champAuthority.championSeasonsByKey.get(focalCanon)?.length ?? 0) > 0;

  // ── positional starter scoring (owner-pinned, league-scoped accessor) ──
  const weekly = (await getLeagueWeeklyStats(leagueId, { startersOnly: true, positions: POSITIONS, seasons: weeklyStatsSeasons })).rows
    .map((r) => ({ season: r.season, teamId: r.teamId, ownerKey: r.ownerKey, pts: r.pts, position: r.position as Pos }));

  // champion profile: average across champions of each champion's per-position pts/game
  const champPerPos: Record<Pos, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  const championSeasonProfiles: ChampionSeasonProfile[] = [];
  for (const [season, teamId] of champTeamBySeason) {
    if (!weeklySet.has(season)) continue;
    const sums: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const cnts: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const w of weekly) {
      if (w.season !== season || w.teamId !== teamId) continue;
      sums[w.position] += w.pts; cnts[w.position]++;
    }
    const byPosition: Record<Pos, number | null> = { QB: null, RB: null, WR: null, TE: null };
    let anyPos = false;
    for (const p of POSITIONS) {
      if (cnts[p] > 0) { champPerPos[p].push(sums[p] / cnts[p]); byPosition[p] = r1(sums[p] / cnts[p]); anyPos = true; }
    }
    if (anyPos) {
      championSeasonProfiles.push({
        season,
        champion: champAuthority.championNameBySeason.get(season) ?? null,
        source: champAuthority.sourceBySeason.get(season) ?? null,
        byPosition,
      });
    }
  }
  championSeasonProfiles.sort((a, b) => b.season - a.season);
  const championProfile: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of POSITIONS) championProfile[p] = champPerPos[p].length ? r1(champPerPos[p].reduce((a, b) => a + b, 0) / champPerPos[p].length) : 0;

  // focal profile: per-position pts/game across the focal owner's recent seasons
  const fSums: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const fCnts: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const w of weekly) {
    if (w.ownerKey !== focal) continue;
    fSums[w.position] += w.pts; fCnts[w.position]++;
  }
  const ownerProfile: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of POSITIONS) ownerProfile[p] = fCnts[p] ? r1(fSums[p] / fCnts[p]) : 0;

  // ── position gaps ─────────────────────────────────────────────────────
  const positionGaps: PositionGap[] = POSITIONS.map((p) => {
    const gap = r1(championProfile[p] - ownerProfile[p]);
    return { position: p, ownerAvg: ownerProfile[p], championAvg: championProfile[p], gap, gapPct: championProfile[p] > 0 ? r1((gap / championProfile[p]) * 100) : 0 };
  }).sort((a, b) => b.gap - a.gap);
  const biggestWeakness = positionGaps.find((g) => g.gap > 0) ?? null;

  // ── total points-for benchmark ────────────────────────────────────────
  const champPFs = champions.map((c) => c.pf).filter((x) => x > 0);
  const champWinsArr = champions.map((c) => c.wins).filter((x) => x > 0);
  const championAvgPointsFor = champPFs.length ? r1(champPFs.reduce((a, b) => a + b, 0) / champPFs.length) : 0;
  const championAvgWins = champWinsArr.length ? r1(champWinsArr.reduce((a, b) => a + b, 0) / champWinsArr.length) : 0;
  const focalPFs = teams.filter((t) => t.ownerId === focal && t.pf > 0).map((t) => t.pf);
  const ownerAvgPointsFor = focalPFs.length ? r1(focalPFs.reduce((a, b) => a + b, 0) / focalPFs.length) : 0;
  const pointsForGap = r1(championAvgPointsFor - ownerAvgPointsFor);

  // ── closest champion comparison (smallest profile distance) ───────────
  let closestChampion: ChampionComparison | null = null;
  let bestSim = -1;
  for (const [season, teamId] of champTeamBySeason) {
    if (!weeklySet.has(season)) continue;
    const champ = champions.find((c) => c.season === season);
    if (champ && champ.ownerId === focal) continue;
    const sums: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const cnts: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const w of weekly) { if (w.season === season && w.teamId === teamId) { sums[w.position] += w.pts; cnts[w.position]++; } }
    const champPos: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of POSITIONS) champPos[p] = cnts[p] ? sums[p] / cnts[p] : 0;
    let dist = 0, denom = 0;
    for (const p of POSITIONS) { const d = champPos[p] - ownerProfile[p]; dist += d * d; denom += champPos[p] * champPos[p]; }
    const sim = denom > 0 ? Math.max(0, Math.round(100 - (Math.sqrt(dist) / Math.sqrt(denom)) * 100)) : 0;
    if (sim > bestSim) { bestSim = sim; closestChampion = { season, ownerName: champ?.ownerName ?? "Champion", totalPointsFor: champ?.pf ?? 0, similarity: sim }; }
  }

  // ── Biggest threat / biggest rival ────────────────────────────────────
  const teamIdByOwnerSeason = new Map<string, number>();
  const teamOwnerBySeasonTeam = new Map<string, string>();
  for (const t of teams) {
    teamIdByOwnerSeason.set(`${t.ownerId}:${t.season}`, t.teamId);
    teamOwnerBySeasonTeam.set(`${t.season}:${t.teamId}`, t.ownerId);
  }
  const allMatches = rowsOf(await db.execute(sql`
    SELECT season, homeTeamId, awayTeamId, winnerTeamId, isPlayoff
    FROM matchups WHERE leagueId=${leagueId} AND isCompleted=1`));
  const h2h = new Map<string, { w: number; l: number; playoffL: number }>();
  for (const m of allMatches) {
    const ft = teamIdByOwnerSeason.get(`${focal}:${Number(m.season)}`);
    if (ft == null) continue;
    const isHome = Number(m.homeTeamId) === ft, isAway = Number(m.awayTeamId) === ft;
    if (!isHome && !isAway) continue;
    const oppTid = isHome ? Number(m.awayTeamId) : Number(m.homeTeamId);
    const oppOwner = teamOwnerBySeasonTeam.get(`${Number(m.season)}:${oppTid}`);
    if (!oppOwner || oppOwner === focal) continue;
    const rec = h2h.get(oppOwner) ?? { w: 0, l: 0, playoffL: 0 };
    if (Number(m.winnerTeamId) === ft) rec.w++;
    else { rec.l++; if (Number(m.isPlayoff) === 1) rec.playoffL++; }
    h2h.set(oppOwner, rec);
  }
  let biggestThreat: PathThreat | null = null;
  let worstNet = 0;
  for (const [g, rec] of h2h) {
    if (rec.w + rec.l < 3) continue;
    const net = rec.l - rec.w;
    const score = net + rec.playoffL * 2;
    if (score > worstNet) {
      worstNet = score;
      const nm = nameByOwner.get(g) ?? "A rival";
      biggestThreat = {
        ownerName: nm, record: `${rec.w}-${rec.l}`, netLosses: net, playoffLosses: rec.playoffL,
        detail: `You are ${rec.w}-${rec.l} against ${nm}${rec.playoffL > 0 ? `, including ${rec.playoffL} playoff loss${rec.playoffL > 1 ? "es" : ""}` : ""}. They are the rival most often standing in your way.`,
      };
    }
  }
  let biggestRival: PathThreat | null = null;
  let bestRivalScore = -1;
  for (const [g, rec] of h2h) {
    const games = rec.w + rec.l;
    if (games < 3) continue;
    const score = games * 10 - Math.abs(rec.w - rec.l);
    if (score > bestRivalScore) {
      bestRivalScore = score;
      const nm = nameByOwner.get(g) ?? "A rival";
      biggestRival = {
        ownerName: nm, record: `${rec.w}-${rec.l}`, netLosses: rec.l - rec.w, playoffLosses: rec.playoffL,
        detail: `You have faced ${nm} ${games} times (${rec.w}-${rec.l})${rec.playoffL > 0 ? `, with ${rec.playoffL} playoff loss${rec.playoffL > 1 ? "es" : ""}` : ""} -- your most-contested matchup.`,
      };
    }
  }

  // ── Cross-engine context: Why Haven't I Won + Draft Reality ───────────
  let pastReasonContext: string | null = null;
  let draftContext: string | null = null;
  try {
    const why = await computeWhyHaventIWon(userId, focal);
    if (why.findings.length) pastReasonContext = why.findings[0].headline;
  } catch { /* non-fatal */ }
  try {
    const maxRow = rowsOf(
      await db.execute(
        sql`SELECT MAX(season) AS s FROM espn_raw_cache WHERE leagueId=${leagueId} AND viewName='combined'`,
      ),
    )[0] as { s?: unknown; S?: unknown } | undefined;
    let draftYear = Number(maxRow?.s ?? maxRow?.S ?? 0);
    if (!Number.isFinite(draftYear) || draftYear < 2000) {
      const cached = await getAllCachedSeasons(leagueId, userId);
      draftYear = cached[0] ?? 0;
    }
    if (draftYear >= 2000) {
      const dr = await computeDraftReality(draftYear, leagueId);
      const impact = dr.ownerImpacts.find((o) => o.ownerKey === focal);
      if (impact) {
        draftContext = `In ${draftYear} your draft graded ${impact.draftGrade}/100 and your in-season management ${impact.rosterMgmtGrade}/100 (overall ${impact.overallGrade}).`;
      }
    }
  } catch { /* non-fatal */ }

  // ── recommended actions (deterministic) ───────────────────────────────
  const recommendedActions: string[] = [];
  if (biggestWeakness) {
    recommendedActions.push(`Upgrade ${biggestWeakness.position}: your ${biggestWeakness.position}s average ${biggestWeakness.ownerAvg} pts/game, ${biggestWeakness.gap} below the champion average of ${biggestWeakness.championAvg}.`);
  }
  const secondGap = positionGaps.filter((g) => g.gap > 0)[1];
  if (secondGap) recommendedActions.push(`Shore up ${secondGap.position} (${secondGap.gap} pts/game below champion level) as your secondary priority.`);
  if (pointsForGap > 0) recommendedActions.push(`Add roughly ${pointsForGap} points of season output to reach the typical champion's ${championAvgPointsFor} points-for.`);
  const strengths = positionGaps.filter((g) => g.gap <= 0).map((g) => g.position);
  if (strengths.length) recommendedActions.push(`Protect your strength at ${strengths.join(" & ")} — you already meet or exceed the champion bar there.`);
  if (recommendedActions.length === 0) recommendedActions.push("Your profile already matches the champion benchmark across the board — focus on consistency and matchup management.");

  // ── headline ──────────────────────────────────────────────────────────
  let headline: string;
  if (!biggestWeakness) {
    headline = `${ownerName}'s roster already matches the champion profile — the title is within reach.`;
  } else if (biggestWeakness.gapPct >= 12) {
    headline = `You are one ${POS_LABEL[biggestWeakness.position]} away from matching the average champion profile.`;
  } else {
    headline = `You're close — tightening up ${biggestWeakness.position} would put you at the champion benchmark.`;
  }

  // ── narrative ─────────────────────────────────────────────────────────
  const intro = hasWon
    ? `${ownerName} has won before; to climb back, the data shows a clear lever. `
    : `${ownerName} hasn't won yet, but the gap to the champion profile is specific and fixable. `;
  const body = biggestWeakness
    ? `The biggest separator is ${biggestWeakness.position}: ${biggestWeakness.ownerAvg} pts/game vs the champion average of ${biggestWeakness.championAvg} (${biggestWeakness.gapPct}% short). `
    : `Positionally you already match champions. `;
  const close = closestChampion
    ? `Your profile most closely resembles the ${closestChampion.season} champion (${closestChampion.ownerName}) at ${closestChampion.similarity}% similarity.`
    : "";
  const narrative = intro + body + close;

  const confidence: ChampionshipPathResult["confidence"] = weekly.length > 0 && champPerPos.QB.length > 0 ? "High" : "Limited";

  const topImprovements: string[] = [];
  for (const g of positionGaps.filter((x) => x.gap > 0).slice(0, 2)) {
    topImprovements.push(`Raise ${g.position} scoring by ${g.gap} pts/game to reach the champion bar (${g.ownerAvg} → ${g.championAvg}).`);
  }
  if (pointsForGap > 0 && topImprovements.length < 3) {
    topImprovements.push(`Add ~${pointsForGap} points of season output to hit the champion average of ${championAvgPointsFor}.`);
  }
  if (biggestThreat && topImprovements.length < 3) {
    topImprovements.push(`Solve your matchup with ${biggestThreat.ownerName} (currently ${biggestThreat.record}) — they repeatedly block your path.`);
  }
  while (topImprovements.length < 3 && recommendedActions.length > topImprovements.length) {
    topImprovements.push(recommendedActions[topImprovements.length]);
  }

  const championshipProfile: ChampionshipProfile = {
    available: championSeasonProfiles.length > 0,
    reason:
      championSeasonProfiles.length > 0
        ? null
        : weeklyStatsSeasons.length === 0
          ? "No weekly player stats have been ingested for this league yet."
          : "No resolved champion seasons overlap the seasons with player stats.",
    positions: [...POSITIONS],
    seasons: championSeasonProfiles,
    combined: championProfile,
  };
  return {
    leagueId, ownerKey: focal, ownerName, isSetupComplete, hasWon,
    championProfile, championAvgPointsFor, championAvgWins,
    ownerProfile, ownerAvgPointsFor,
    positionGaps, biggestWeakness, pointsForGap, closestChampion,
    biggestThreat, biggestRival, topImprovements: topImprovements.slice(0, 3), draftContext, pastReasonContext,
    recommendedActions, headline, narrative, confidence,
    championshipProfile,
    historicalSeasonCount,
    teamCount,
    weeklyStatsSeasons,
  };
}

function emptyResult(
  leagueId: string,
  ownerName: string,
  isSetupComplete: boolean,
  note: string,
  hist?: { historicalSeasonCount: number; teamCount?: number; weeklyStatsSeasons: number[] },
): ChampionshipPathResult {
  const historicalSeasonCount = hist?.historicalSeasonCount ?? 0;
  const teamCount = hist?.teamCount ?? 0;
  const weeklyStatsSeasons = hist?.weeklyStatsSeasons ?? [];
  const zero: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  return {
    leagueId, ownerKey: null, ownerName, isSetupComplete, hasWon: false,
    championProfile: zero, championAvgPointsFor: 0, championAvgWins: 0,
    ownerProfile: zero, ownerAvgPointsFor: 0,
    positionGaps: [], biggestWeakness: null, pointsForGap: 0, closestChampion: null,
    biggestThreat: null, biggestRival: null, topImprovements: [], draftContext: null, pastReasonContext: null,
    recommendedActions: [], headline: "Not enough data yet.", narrative: note, confidence: "Limited", note,
    championshipProfile: { available: false, reason: note, positions: [...POSITIONS], seasons: [], combined: zero },
    historicalSeasonCount,
    teamCount,
    weeklyStatsSeasons,
  };
}
