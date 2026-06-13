// FILE: server/draftGradeForDna.ts
// Thin orchestration over the existing Draft Reality Simulator (draftRealitySimulator.ts).
// For each season WITH weekly coverage it pulls that engine's per-owner draftGrade
// (draft-only "no moves" finish) AND rosterMgmtGrade (how much in-season moves improved
// the draft baseline), then aggregates the focal owner into current + career ratings.
//
// Verified against the live DB (league 457622): player-level data begins at 2018, so
// that is the real floor. Each league-season is computed once (all owners) and cached;
// completed seasons never change.

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { computeDraftReality } from "./draftRealitySimulator";

export type DimRating = {
  current: { grade100: number; season: number } | null; // most recent covered season
  overall: { grade100: number; seasonsUsed: number; seasons: number[] }; // career average
  perSeason: Array<{ season: number; grade100: number }>; // descending by season
};

export type SimGrades = {
  drafting: DimRating;
  roster: DimRating;
  seasons: number[]; // covered seasons that fed the ratings (descending)
} | null;

type SeasonCache = {
  at: number;
  confidence: string;
  weeksSimulated: number;
  draftByKey: Record<string, number>;
  draftByName: Record<string, number>;
  rosterByKey: Record<string, number>;
  rosterByName: Record<string, number>;
};

const seasonCache = new Map<string, SeasonCache>(); // key `${leagueId}:${season}`
const FRESH_MS = 30 * 60 * 1000;
const FLOOR_SEASON = 2018; // verified: player-level data begins here
const MIN_WEEKS = 10;

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}

function buildDim(pairs: Array<{ season: number; grade100: number }>): DimRating {
  if (pairs.length === 0) {
    return { current: null, overall: { grade100: 50, seasonsUsed: 0, seasons: [] }, perSeason: [] };
  }
  const avg = pairs.reduce((a, p) => a + p.grade100, 0) / pairs.length;
  return {
    current: { grade100: pairs[0].grade100, season: pairs[0].season }, // pairs is DESC
    overall: { grade100: avg, seasonsUsed: pairs.length, seasons: pairs.map((p) => p.season) },
    perSeason: pairs,
  };
}

/**
 * Headroom-aware Roster grade. The engine's rosterMgmtGrade is pure rank improvement
 * (standing pat = 50, a strong draft with no upward room can't score well). We instead
 * weight it so that FINISHING well counts - including the smart decision to stand pat on
 * a strong roster - while climbing from a weak draft is still rewarded and squandering a
 * good draft is still punished.
 *
 *   55% actual-finish percentile (where you ended up - rewards holding a strong position)
 *   45% improvement vs the no-move baseline (rewards climbing, neutral for standing pat)
 *
 * So: strong draft held near the top -> high (standing pat was smart, finish is great);
 * weak draft managed upward -> high; weak draft left weak -> low (headroom wasted);
 * strong draft mismanaged downward -> low.
 */
function headroomRosterGrade(
  draftRank: number | null,
  actualRank: number | null,
  n: number,
  fallback: number,
): number {
  if (draftRank == null || actualRank == null || n <= 1) return fallback;
  const span = n - 1;
  const actualFinishPctile = ((n - actualRank) / span) * 100;
  const improvement = Math.max(0, Math.min(100, 50 + (draftRank - actualRank) * (50 / span)));
  return Math.max(0, Math.min(100, 0.55 * actualFinishPctile + 0.45 * improvement));
}

async function getSeason(leagueId: string, season: number): Promise<SeasonCache> {
  const key = `${leagueId}:${season}`;
  const hit = seasonCache.get(key);
  if (hit && (hit.confidence === "High" || Date.now() - hit.at < FRESH_MS)) return hit;
  try {
    const res = await computeDraftReality(season, leagueId);
    const draftByKey: Record<string, number> = {};
    const draftByName: Record<string, number> = {};
    const rosterByKey: Record<string, number> = {};
    const rosterByName: Record<string, number> = {};
    const n = res.ownerImpacts.length;
    for (const o of res.ownerImpacts) {
      draftByKey[o.ownerKey] = o.draftGrade;
      draftByName[norm(o.ownerName)] = o.draftGrade;
      const rg = headroomRosterGrade(o.draftRank, o.actualRank, n, o.rosterMgmtGrade);
      rosterByKey[o.ownerKey] = rg;
      rosterByName[norm(o.ownerName)] = rg;
    }
    const entry: SeasonCache = {
      at: Date.now(), confidence: res.confidence, weeksSimulated: res.weeksSimulated,
      draftByKey, draftByName, rosterByKey, rosterByName,
    };
    seasonCache.set(key, entry);
    return entry;
  } catch {
    const entry: SeasonCache = {
      at: Date.now(), confidence: "Limited", weeksSimulated: 0,
      draftByKey: {}, draftByName: {}, rosterByKey: {}, rosterByName: {},
    };
    seasonCache.set(key, entry);
    return entry;
  }
}

/**
 * Focal owner's draft-only AND roster-management ratings (current + career) across
 * covered seasons. Returns null when no season has usable weekly data.
 */
export async function careerSimGrades(
  leagueId: string,
  focalKey: string,
  focalName: string,
): Promise<SimGrades> {
  const db = await getDb();
  if (!db) return null;

  const seasonRows = rowsOf(
    await db.execute(
      sql`SELECT DISTINCT season FROM espn_raw_cache
          WHERE leagueId=${leagueId} AND viewName='combined' AND season>=${FLOOR_SEASON}
          ORDER BY season DESC`,
    ),
  );
  const seasons = seasonRows.map((r) => Number(r.season ?? r.SEASON ?? 0)).filter((s) => s >= FLOOR_SEASON);
  if (seasons.length === 0) return null;

  const nk = norm(focalName);
  const draftPairs: Array<{ season: number; grade100: number }> = [];
  const rosterPairs: Array<{ season: number; grade100: number }> = [];
  const used: number[] = [];

  for (const season of seasons) {
    const sc = await getSeason(leagueId, season);
    if (sc.confidence === "Limited" || sc.weeksSimulated < MIN_WEEKS) continue;
    const dg = sc.draftByKey[focalKey] ?? sc.draftByName[nk];
    const rg = sc.rosterByKey[focalKey] ?? sc.rosterByName[nk];
    if (dg != null) draftPairs.push({ season, grade100: dg });
    if (rg != null) rosterPairs.push({ season, grade100: rg });
    if (dg != null || rg != null) used.push(season);
  }

  if (draftPairs.length === 0 && rosterPairs.length === 0) return null;
  return { drafting: buildDim(draftPairs), roster: buildDim(rosterPairs), seasons: used };
}
