// FILE: server/draftGradeForDna.ts
// Thin orchestration over the existing Draft Reality Simulator (draftRealitySimulator.ts).
// Produces a focal owner's CAREER draft-only grade by aggregating that engine's
// per-season `draftGrade` (the "no moves after draft day" finish, 0-100 = league rank)
// across every season that actually has weekly coverage. Past seasons never change,
// so their results are cached for the life of the process; we do NOT recompute them.

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { computeDraftReality } from "./draftRealitySimulator";

export type DraftOnlyGrade = {
  grade100: number;      // 0-100, league-rank based, averaged across covered seasons
  seasonsUsed: number;   // how many seasons fed the average
  seasons: number[];     // which seasons (descending)
} | null;

type Cached = { at: number; focalGrade: number | null; confidence: string };
const seasonCache = new Map<string, Cached>(); // key `${leagueId}:${season}`
const FRESH_MS = 30 * 60 * 1000; // current/in-progress seasons re-check every 30 min
const MAX_SEASONS = 6;           // cap live cost; recent draft skill is what matters

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}

/**
 * Aggregate the focal owner's draft-only ("no moves") grade across covered seasons.
 * Returns null when no season has usable weekly data (e.g. deep pre-2018 history),
 * so callers can fall back to a style-based drafting grade.
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
          WHERE leagueId=${leagueId} AND viewName='combined' AND season>=2018
          ORDER BY season DESC`,
    ),
  );
  const seasons = seasonRows
    .map((r) => Number(r.season ?? r.SEASON ?? 0))
    .filter((s) => s >= 2018)
    .slice(0, MAX_SEASONS);
  if (seasons.length === 0) return null;

  const grades: number[] = [];
  const used: number[] = [];

  for (const season of seasons) {
    const key = `${leagueId}:${season}`;
    const hit = seasonCache.get(key);
    let focalGrade: number | null;
    let confidence: string;

    // Cache hit: trust completed seasons forever; refresh only stale in-progress ones.
    if (hit && (hit.confidence === "High" || Date.now() - hit.at < FRESH_MS)) {
      focalGrade = hit.focalGrade;
      confidence = hit.confidence;
    } else {
      try {
        const res = await computeDraftReality(season, leagueId);
        confidence = res.confidence;
        const impact =
          res.ownerImpacts.find((o) => o.ownerKey === focalKey) ??
          res.ownerImpacts.find((o) => norm(o.ownerName) === norm(focalName));
        focalGrade = impact ? impact.draftGrade : null;
      } catch {
        focalGrade = null;
        confidence = "Limited";
      }
      seasonCache.set(key, { at: Date.now(), focalGrade, confidence });
    }

    if (focalGrade != null && confidence !== "Limited") {
      grades.push(focalGrade);
      used.push(season);
    }
  }

  if (grades.length === 0) return null;
  const grade100 = grades.reduce((a, b) => a + b, 0) / grades.length;
  return { grade100, seasonsUsed: grades.length, seasons: used };
}
