// FILE: server/draftGradeForDna.ts
// Thin orchestration over the existing Draft Reality Simulator (draftRealitySimulator.ts).
// Produces a focal owner's CAREER draft-only grade by aggregating that engine's
// per-season `draftGrade` (the "no moves after draft day" finish, 0-100 = league rank)
// across every season that actually has weekly coverage.
//
// Verified against the live DB (league 457622): player-level data (weekly scores AND
// draft pick player-IDs) begins at 2018, so that is the real floor - not an arbitrary
// cap. Pre-2018 seasons exist as team scores + draft NAMES only, which the lineup
// rebuild cannot use. Each covered season is cached (all owners), so we compute a
// league-season once and share it across users; completed seasons never expire.

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { computeDraftReality } from "./draftRealitySimulator";

export type DraftOnlyGrade = {
  // CAREER rating: average draft-only grade across all covered seasons.
  overall: { grade100: number; seasonsUsed: number; seasons: number[] };
  // CURRENT status: the most recent covered season's draft-only grade.
  current: { grade100: number; season: number } | null;
  // Full per-season series (descending), for display + future DNA Evolution.
  perSeason: Array<{ season: number; grade100: number }>;
} | null;

type SeasonCache = {
  at: number;
  confidence: string;
  weeksSimulated: number;
  byKey: Record<string, number>;   // ownerKey (GUID) -> draftGrade
  byName: Record<string, number>;  // normalized ownerName -> draftGrade
};

const seasonCache = new Map<string, SeasonCache>(); // key `${leagueId}:${season}`
const FRESH_MS = 30 * 60 * 1000; // re-check in-progress (non-High) seasons every 30 min
const FLOOR_SEASON = 2018;       // verified: player-level data begins here
const MIN_WEEKS = 10;            // a season needs a meaningful chunk of weeks to count

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}

/** Run (or reuse cached) Draft Reality for one league-season; caches ALL owners. */
async function getSeason(leagueId: string, season: number): Promise<SeasonCache> {
  const key = `${leagueId}:${season}`;
  const hit = seasonCache.get(key);
  // Completed ("High") seasons are immutable - trust the cache forever.
  if (hit && (hit.confidence === "High" || Date.now() - hit.at < FRESH_MS)) return hit;
  try {
    const res = await computeDraftReality(season, leagueId);
    const byKey: Record<string, number> = {};
    const byName: Record<string, number> = {};
    for (const o of res.ownerImpacts) {
      byKey[o.ownerKey] = o.draftGrade;
      byName[norm(o.ownerName)] = o.draftGrade;
    }
    const entry: SeasonCache = { at: Date.now(), confidence: res.confidence, weeksSimulated: res.weeksSimulated, byKey, byName };
    seasonCache.set(key, entry);
    return entry;
  } catch {
    const entry: SeasonCache = { at: Date.now(), confidence: "Limited", weeksSimulated: 0, byKey: {}, byName: {} };
    seasonCache.set(key, entry);
    return entry;
  }
}

/**
 * Aggregate the focal owner's draft-only ("no moves") grade across covered seasons.
 * Returns null when no season has usable weekly data, so callers can fall back to a
 * style-based drafting grade.
 */
export async function careerDraftOnlyGrade(
  leagueId: string,
  focalKey: string,
  focalName: string,
): Promise<DraftOnlyGrade> {
  const db = await getDb();
  if (!db) return null;

  const seasonRows = rowsOf(
    await db.execute(
      sql`SELECT DISTINCT season FROM espn_raw_cache
          WHERE leagueId=${leagueId} AND viewName='combined' AND season>=${FLOOR_SEASON}
          ORDER BY season DESC`,
    ),
  );
  const seasons = seasonRows
    .map((r) => Number(r.season ?? r.SEASON ?? 0))
    .filter((s) => s >= FLOOR_SEASON);
  if (seasons.length === 0) return null;

  const nk = norm(focalName);
  const pairs: Array<{ season: number; grade100: number }> = [];

  for (const season of seasons) {
    // `seasons` is DESC, so pairs[0] ends up the most recent covered season.
    const sc = await getSeason(leagueId, season);
    // Skip seasons that lack a real draft+weekly picture (Limited) or too few weeks
    // (e.g. an in-progress season whose draft IDs aren't captured yet).
    if (sc.confidence === "Limited" || sc.weeksSimulated < MIN_WEEKS) continue;
    const g = sc.byKey[focalKey] ?? sc.byName[nk];
    if (g != null) pairs.push({ season, grade100: g });
  }

  if (pairs.length === 0) return null;
  const overallAvg = pairs.reduce((a, p) => a + p.grade100, 0) / pairs.length;
  return {
    overall: { grade100: overallAvg, seasonsUsed: pairs.length, seasons: pairs.map((p) => p.season) },
    current: { grade100: pairs[0].grade100, season: pairs[0].season },
    perSeason: pairs,
  };
}
