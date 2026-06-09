/**
 * "Acquisition Impact™" — deterministic measure of how much an owner's season(s)
 * improved because of players NOT originally drafted by them.
 *
 * Core question: "How much value did roster management add beyond draft day?"
 *
 * IMPORTANT LIMITATION (surfaced to the user): historical waiver/trade/free-agent
 * separation is unavailable for 2021-2025 (the transactions feed only covers the
 * current season). This feature therefore uses a transparent "non-drafted player
 * impact" model that COMBINES all post-draft additions. We never fabricate a
 * waiver-vs-trade split.
 *
 * Deterministic-first; no LLM, no DB writes, no scraping.
 * Data: gm_weekly_player_stats + gm_player_registry (starter scoring + espnId),
 *       espn_raw_cache 'combined' (draftDetail.picks -> drafted sets),
 *       teams (names, records), matchups (decisive-win attribution),
 *       Draft Reality Simulator (relative draft vs roster-management grades).
 */
import { sql } from "drizzle-orm";
import { getDb, memberIdFromOwnerKey } from "./db";
import { resolveCurrentOwner } from "./currentOwnerService";
import { computeDraftReality } from "./draftRealitySimulator";

// Phase B4: DEFAULT_LEAGUE_ID constant removed — setup required if no active league.
const WEEKLY_SEASONS = [2021, 2022, 2023, 2024, 2025];
const MIN_SEASONS_FOR_RANKING = 2;

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}
function r0(n: number): number { return Math.round(n); }
function r1(n: number): number { return Math.round(n * 10) / 10; }
function clamp(n: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, n)); }
function normGuid(g: string | null | undefined): string | null { return g ? memberIdFromOwnerKey(g) : null; }
function winsOf(rec: string): number { const m = rec.match(/^(\d+)/); return m ? Number(m[1]) : 0; }

export type AcquisitionOwner = {
  ownerKey: string;
  ownerName: string;
  seasonsPlayed: number;
  pointsAdded: number;            // total non-drafted starter points
  draftedPoints: number;          // total drafted starter points
  lineupDependency: number;       // % of starter points from non-drafted players (0-100)
  pointsAddedPerSeason: number;
  decisiveAcqWins: number;        // games won where acquired starters exceeded the margin
  totalWins: number;
  acquisitionImpactScore: number; // 0-100, league-relative
  draftRelianceScore: number;     // 0-100, higher = leaned on the draft
  rosterBuilderScore: number;     // 0-100, higher = rebuilt during the season
  qualified: boolean;             // enough sample to rank
};

export type AcquisitionSeason = {
  ownerKey: string;
  ownerName: string;
  season: number;
  acquiredPoints: number;
  dependency: number;             // 0-100
};

export type AcquisitionImpactResult = {
  leagueId: string;
  ownerKey: string | null;
  ownerName: string;
  isSetupComplete: boolean;
  focal: AcquisitionOwner | null;
  focalRankImpact: number | null;       // 1-based rank among qualified owners
  qualifiedCount: number;
  bestAcquisitionManagers: AcquisitionOwner[];   // ranked by impact score
  draftRelianceRanking: AcquisitionOwner[];       // ranked by reliance (most draft-reliant first)
  rosterBuilderRanking: AcquisitionOwner[];       // ranked by builder score
  biggestAcquisitionSeason: AcquisitionSeason | null;
  topAcquisitionSeasons: AcquisitionSeason[];     // historical leaderboard
  insights: string[];
  limitationNote: string;
  confidence: "High" | "Medium" | "Limited";
};

export async function computeAcquisitionImpact(userId?: number, ownerKeyOverride?: string | null): Promise<AcquisitionImpactResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const co = await resolveCurrentOwner(userId != null ? { id: userId } : null);
  // Phase B4: no fallback to hardcoded league — throw if no active league.
  const leagueId = co.leagueId ?? "";
  if (!leagueId || leagueId === "default") {
    throw new Error("SETUP_REQUIRED: No active league — connect a league in Settings.");
  }
  const isSetupComplete = co.isSetupComplete;

  const limitationNote =
    "Historical transaction type coverage is limited, so this measures total non-drafted player impact rather than separating waivers, trades, and free agents.";

  // ── teams (names, seasons) ────────────────────────────────────────────
  const teams = rowsOf(await db.execute(sql`
    SELECT season, teamId, ownerId, ownerName FROM teams WHERE leagueId=${leagueId} AND ownerId<>''`))
    .map((r: any) => ({ season: Number(r.season), teamId: Number(r.teamId), ownerId: String(r.ownerId), ownerName: String(r.ownerName ?? "") }));
  const nameByOwner = new Map<string, string>();
  const teamIdByOwnerSeason = new Map<string, number>();
  for (const t of teams) {
    if (t.ownerName) nameByOwner.set(t.ownerId, t.ownerName);
    teamIdByOwnerSeason.set(`${t.ownerId}:${t.season}`, t.teamId);
  }

  // ── focal owner ───────────────────────────────────────────────────────
  let focalKey = normGuid(ownerKeyOverride) || (isSetupComplete ? normGuid(co.ownerKey) : null);

  // ── drafted sets per owner-season (combined cache) ────────────────────
  const drafted = new Map<string, Set<number>>(); // `${guid}:${season}`
  for (const s of WEEKLY_SEASONS) {
    const c = rowsOf(await db.execute(sql`SELECT payload FROM espn_raw_cache WHERE leagueId=${leagueId} AND season=${s} AND viewName='combined' LIMIT 1`));
    if (!c[0]?.payload) continue;
    const o = typeof c[0].payload === "string" ? JSON.parse(c[0].payload) : c[0].payload;
    for (const p of o.draftDetail?.picks ?? []) {
      const g = normGuid(p.memberId); const id = Number(p.playerId);
      if (!g || !Number.isFinite(id)) continue;
      const k = `${g}:${s}`;
      if (!drafted.has(k)) drafted.set(k, new Set());
      drafted.get(k)!.add(id);
    }
  }

  // ── weekly starters joined to registry espnId ─────────────────────────
  const weekly = rowsOf(await db.execute(sql`
    SELECT w.season AS season, w.week AS week, w.ownerKey AS ownerKey, w.pointsScored AS pts, r.espnPlayerId AS espnId
    FROM gm_weekly_player_stats w JOIN gm_player_registry r ON r.id = w.playerId
    WHERE w.season IN (2021,2022,2023,2024,2025) AND w.isStarter=1`))
    .map((r: any) => ({ season: Number(r.season), week: Number(r.week), ownerKey: String(r.ownerKey), pts: Number(r.pts ?? 0), espnId: Number(r.espnId) }));

  // aggregate drafted vs acquired points (overall + per season) + per-owner-week acquired
  type Agg = { drafted: number; acquired: number; seasons: Set<number> };
  const byOwner = new Map<string, Agg>();
  const acqByOwnerSeason = new Map<string, number>();   // `${g}:${s}` -> acquired pts
  const draftedByOwnerSeason = new Map<string, number>();// `${g}:${s}` -> drafted pts
  const acqByOwnerWeek = new Map<string, number>();      // `${g}:${s}:${wk}` -> acquired pts
  for (const w of weekly) {
    const dset = drafted.get(`${w.ownerKey}:${w.season}`);
    const isAcq = dset ? !dset.has(w.espnId) : true; // no draft data -> treat as acquired (conservative)
    const a = byOwner.get(w.ownerKey) ?? { drafted: 0, acquired: 0, seasons: new Set<number>() };
    a.seasons.add(w.season);
    const ks = `${w.ownerKey}:${w.season}`;
    if (isAcq) {
      a.acquired += w.pts;
      acqByOwnerSeason.set(ks, (acqByOwnerSeason.get(ks) ?? 0) + w.pts);
      const wk = `${w.ownerKey}:${w.season}:${w.week}`;
      acqByOwnerWeek.set(wk, (acqByOwnerWeek.get(wk) ?? 0) + w.pts);
    } else {
      a.drafted += w.pts;
      draftedByOwnerSeason.set(ks, (draftedByOwnerSeason.get(ks) ?? 0) + w.pts);
    }
    byOwner.set(w.ownerKey, a);
  }

  // ── decisive-acquisition wins (per-game attribution) ──────────────────
  const matches = rowsOf(await db.execute(sql`
    SELECT season, week, homeTeamId, awayTeamId, homeScore, awayScore, winnerTeamId
    FROM matchups WHERE leagueId=${leagueId} AND isCompleted=1 AND season IN (2021,2022,2023,2024,2025)`))
    .map((r: any) => ({ season: Number(r.season), week: Number(r.week), homeTeamId: Number(r.homeTeamId), awayTeamId: Number(r.awayTeamId), homeScore: Number(r.homeScore ?? 0), awayScore: Number(r.awayScore ?? 0), winnerTeamId: r.winnerTeamId != null ? Number(r.winnerTeamId) : null }));
  const decisiveWins = new Map<string, number>();
  const totalWins = new Map<string, number>();
  for (const m of matches) {
    for (const [guid] of byOwner) {
      const tid = teamIdByOwnerSeason.get(`${guid}:${m.season}`);
      if (tid == null) continue;
      const isHome = m.homeTeamId === tid, isAway = m.awayTeamId === tid;
      if (!isHome && !isAway) continue;
      if (m.winnerTeamId !== tid) continue; // only wins
      totalWins.set(guid, (totalWins.get(guid) ?? 0) + 1);
      const my = isHome ? m.homeScore : m.awayScore;
      const opp = isHome ? m.awayScore : m.homeScore;
      const margin = my - opp;
      const acq = acqByOwnerWeek.get(`${guid}:${m.season}:${m.week}`) ?? 0;
      if (acq >= margin) decisiveWins.set(guid, (decisiveWins.get(guid) ?? 0) + 1);
    }
  }

  // ── Draft Reality grades (relative draft vs roster-management) ────────
  const drGradeByOwner = new Map<string, { draftGrade: number; mgmtGrade: number; n: number }>();
  try {
    const drResults = await Promise.all(WEEKLY_SEASONS.map((s) => computeDraftReality(s, leagueId)));
    for (const dr of drResults) {
      for (const o of dr.ownerImpacts) {
        const g = normGuid(o.ownerKey)!;
        const cur = drGradeByOwner.get(g) ?? { draftGrade: 0, mgmtGrade: 0, n: 0 };
        cur.draftGrade += o.draftGrade; cur.mgmtGrade += o.rosterMgmtGrade; cur.n++;
        drGradeByOwner.set(g, cur);
      }
    }
  } catch { /* non-fatal: grades degrade gracefully */ }

  // ── build per-owner records ───────────────────────────────────────────
  const owners: AcquisitionOwner[] = [];
  for (const [guid, a] of byOwner) {
    const total = a.drafted + a.acquired;
    const seasonsPlayed = a.seasons.size;
    const dependency = total > 0 ? (a.acquired / total) * 100 : 0;
    const grades = drGradeByOwner.get(guid);
    const mgmtGrade = grades && grades.n ? grades.mgmtGrade / grades.n : 50;
    const draftGrade = grades && grades.n ? grades.draftGrade / grades.n : 50;
    owners.push({
      ownerKey: guid,
      ownerName: nameByOwner.get(guid) ?? guid,
      seasonsPlayed,
      pointsAdded: r0(a.acquired),
      draftedPoints: r0(a.drafted),
      lineupDependency: r1(dependency),
      pointsAddedPerSeason: r0(a.acquired / Math.max(1, seasonsPlayed)),
      decisiveAcqWins: decisiveWins.get(guid) ?? 0,
      totalWins: totalWins.get(guid) ?? 0,
      acquisitionImpactScore: 0, // filled below (league-relative)
      draftRelianceScore: clamp(Math.round(0.6 * (100 - dependency) + 0.4 * draftGrade)),
      rosterBuilderScore: clamp(Math.round(0.6 * dependency + 0.4 * mgmtGrade)),
      qualified: seasonsPlayed >= MIN_SEASONS_FOR_RANKING && total >= 1500,
    });
  }

  // league-relative acquisition impact score: percentile of pointsAddedPerSeason
  // (blended with dependency) among QUALIFIED owners.
  const qualified = owners.filter((o) => o.qualified);
  const ppsSorted = [...qualified].map((o) => o.pointsAddedPerSeason).sort((x, y) => x - y);
  const depSorted = [...qualified].map((o) => o.lineupDependency).sort((x, y) => x - y);
  const pct = (sorted: number[], v: number) => sorted.length ? (sorted.filter((x) => x <= v).length / sorted.length) * 100 : 0;
  for (const o of owners) {
    if (!o.qualified) { o.acquisitionImpactScore = 0; continue; }
    const ppsPct = pct(ppsSorted, o.pointsAddedPerSeason);
    const depPct = pct(depSorted, o.lineupDependency);
    o.acquisitionImpactScore = clamp(Math.round(0.6 * ppsPct + 0.4 * depPct));
  }

  // ── rankings ──────────────────────────────────────────────────────────
  const bestAcquisitionManagers = [...qualified].sort((a, b) => b.acquisitionImpactScore - a.acquisitionImpactScore);
  const draftRelianceRanking = [...qualified].sort((a, b) => b.draftRelianceScore - a.draftRelianceScore);
  const rosterBuilderRanking = [...qualified].sort((a, b) => b.rosterBuilderScore - a.rosterBuilderScore);

  // ── biggest acquisition seasons (historical leaderboard) ──────────────
  const seasonRows: AcquisitionSeason[] = [];
  for (const [k, acq] of acqByOwnerSeason) {
    const [g, s] = k.split(":");
    const draftedPts = draftedByOwnerSeason.get(k) ?? 0;
    const total = acq + draftedPts;
    seasonRows.push({ ownerKey: g, ownerName: nameByOwner.get(g) ?? g, season: Number(s), acquiredPoints: r0(acq), dependency: total > 0 ? r1((acq / total) * 100) : 0 });
  }
  seasonRows.sort((a, b) => b.acquiredPoints - a.acquiredPoints);
  const topAcquisitionSeasons = seasonRows.slice(0, 10);
  const biggestAcquisitionSeason = seasonRows[0] ?? null;

  // ── focal resolution / fallback ───────────────────────────────────────
  if (!focalKey) {
    // fallback: franchise with the most seasons of weekly data
    focalKey = owners.sort((a, b) => b.seasonsPlayed - a.seasonsPlayed)[0]?.ownerKey ?? null;
  }
  const focal = owners.find((o) => o.ownerKey === focalKey) ?? null;
  const ownerName = focal?.ownerName || (focalKey && nameByOwner.get(focalKey)) || co.displayName || "This owner";
  const focalRankImpact = focal && focal.qualified ? bestAcquisitionManagers.findIndex((o) => o.ownerKey === focalKey) + 1 : null;

  // ── deterministic insights ────────────────────────────────────────────
  const insights: string[] = [];
  if (focal) {
    insights.push(`${focal.ownerName} generated ${focal.lineupDependency}% of starting points from acquired (non-drafted) players.`);
    if (focal.draftRelianceScore >= 60) {
      insights.push(`${focal.ownerName} relied heavily on draft stability (draft-reliance ${focal.draftRelianceScore}/100).`);
    } else if (focal.rosterBuilderScore >= 60) {
      insights.push(`${focal.ownerName} rebuilt through the season — a true roster builder (builder score ${focal.rosterBuilderScore}/100).`);
    }
    insights.push(`${focal.ownerName} secured ${focal.decisiveAcqWins} of ${focal.totalWins} wins where acquired starters exceeded the margin of victory.`);
  }
  if (biggestAcquisitionSeason) {
    insights.push(`${biggestAcquisitionSeason.ownerName}'s ${biggestAcquisitionSeason.season} season is the biggest single-season acquisition haul in league history (+${biggestAcquisitionSeason.acquiredPoints} pts, ${biggestAcquisitionSeason.dependency}% of lineup).`);
  }
  const topMgr = bestAcquisitionManagers[0];
  if (topMgr && (!focal || topMgr.ownerKey !== focal.ownerKey)) {
    insights.push(`${topMgr.ownerName} added the most acquisition value in the league (${topMgr.pointsAddedPerSeason} pts/season).`);
  }

  const confidence: AcquisitionImpactResult["confidence"] = weekly.length > 0 && drafted.size > 0 ? (qualified.length >= 6 ? "High" : "Medium") : "Limited";

  return {
    leagueId, ownerKey: focalKey, ownerName, isSetupComplete,
    focal, focalRankImpact, qualifiedCount: qualified.length,
    bestAcquisitionManagers, draftRelianceRanking, rosterBuilderRanking,
    biggestAcquisitionSeason, topAcquisitionSeasons,
    insights, limitationNote, confidence,
  };
}
