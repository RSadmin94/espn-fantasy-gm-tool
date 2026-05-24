/**
 * League Scoring Service
 *
 * Reads the league's actual scoring settings from the ESPN mSettings cache
 * and exposes a `calculateLeaguePoints(stats)` function that converts raw
 * stat lines into league-specific fantasy points.
 *
 * All projection and simulation systems should use this calculator so that
 * every point estimate reflects the true league scoring rules.
 *
 * ESPN Stat ID Reference (key IDs):
 *   Passing:   0=pass attempts, 3=completions, 4=pass yards, 5=pass TDs, 6=interceptions
 *              19=2pt conversions (passing), 20=fumbles lost
 *   Rushing:   23=rush attempts, 24=rush yards, 25=rush TDs, 26=2pt conversions (rushing)
 *   Receiving: 41=receptions, 42=rec yards, 43=rec TDs, 44=2pt conversions (receiving), 58=targets
 *   Usage:     87=snap count, 88=snap pct
 *   Misc:      72=fumbles lost, 74=fumbles recovered
 *   Defense:   99=sacks, 95=INTs, 96=fumble recoveries, 97=forced fumbles, 89=safeties
 *              93=defensive TDs, 123=pts allowed 0, 124=pts allowed 1-6, etc.
 */

import { getCachedView } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoringItem {
  statId: number;
  points: number;
  pointsOverrides?: Record<string, number>;
}

export interface LeagueScoringSettings {
  scoringType: string;                   // "PPR", "HALF_PPR", "STANDARD"
  scoringItems: ScoringItem[];
  scoringMap: Record<number, number>;    // statId → points per unit
  scoringDescription: string;            // human-readable summary
  receptionPoints: number;               // 0, 0.5, or 1.0
  passingTDPoints: number;
  rushingTDPoints: number;
  receivingTDPoints: number;
  passingYardsPerPoint: number;          // yards per 1 point (e.g. 25)
  rushingYardsPerPoint: number;          // yards per 1 point (e.g. 10)
  receivingYardsPerPoint: number;        // yards per 1 point (e.g. 10)
  interceptionPoints: number;            // typically -2 or -1
  fetchedAt: Date;
}

export interface RawStatLine {
  // Passing
  passingYards?: number;
  passingTDs?: number;
  completions?: number;
  passingAttempts?: number;
  interceptions?: number;
  // Rushing
  rushingYards?: number;
  rushingTDs?: number;
  rushingAttempts?: number;
  // Receiving
  receivingYards?: number;
  receivingTDs?: number;
  receptions?: number;
  targets?: number;
  // Misc
  fumblesLost?: number;
  twoPointConversions?: number;
}

// ─── ESPN stat ID → RawStatLine field mapping ─────────────────────────────────

const STAT_ID_TO_FIELD: Record<number, keyof RawStatLine> = {
  4:  "passingYards",
  5:  "passingTDs",
  3:  "completions",
  0:  "passingAttempts",
  6:  "interceptions",
  24: "rushingYards",
  25: "rushingTDs",
  23: "rushingAttempts",
  42: "receivingYards",
  43: "receivingTDs",
  41: "receptions",
  58: "targets",
  72: "fumblesLost",
  20: "fumblesLost",
};

// ─── In-memory cache (per season + user league resolution) ────────────────────

const scoringSettingsCache = new Map<string, { settings: LeagueScoringSettings; loadedAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ─── Fallback defaults (standard half-PPR) ────────────────────────────────────

const FALLBACK_SCORING_MAP: Record<number, number> = {
  4:  0.04,    // 1 pt per 25 pass yards
  5:  4,       // 4 pts per pass TD
  6:  -2,      // -2 per INT
  24: 0.1,     // 1 pt per 10 rush yards
  25: 6,       // 6 pts per rush TD
  42: 0.1,     // 1 pt per 10 rec yards
  43: 6,       // 6 pts per rec TD
  41: 0.5,     // 0.5 pts per reception (half-PPR)
  72: -2,      // -2 per fumble lost
  20: -2,      // -2 per fumble lost (alt ID)
};

// ─── Scoring settings loader ──────────────────────────────────────────────────

/**
 * Load league scoring settings from the ESPN mSettings cache.
 * Falls back to standard half-PPR defaults if cache is unavailable.
 */
export async function getLeagueScoringSettings(season?: number, userId?: number): Promise<LeagueScoringSettings> {
  const targetSeason = season ?? new Date().getFullYear();
  const cacheKey = `${targetSeason}:${userId ?? "anon"}`;
  const cachedRow = scoringSettingsCache.get(cacheKey);
  if (cachedRow && Date.now() - cachedRow.loadedAt < CACHE_TTL_MS) {
    return cachedRow.settings;
  }

  try {
    // Try current season first, then fall back to most recent cached season
    let cached = await getCachedView(targetSeason, "mSettings", undefined, { userId });

    // Try previous season if current not cached
    if (!cached) {
      cached = await getCachedView(targetSeason - 1, "mSettings", undefined, { userId });
    }

    if (cached?.payload) {
      const payload = cached.payload as Record<string, unknown>;
      const settings = (payload.settings as Record<string, unknown>) || {};
      const scoringSettings = (settings.scoringSettings as Record<string, unknown>) || {};
      const rawItems = (scoringSettings.scoringItems as ScoringItem[]) || [];
      const scoringType = (scoringSettings.scoringType as string) || "HALF_PPR";

      const scoringMap: Record<number, number> = {};
      for (const item of rawItems) {
        if (item.statId !== undefined && item.points !== undefined) {
          scoringMap[item.statId] = item.points;
        }
      }

      const result = buildScoringSettings(scoringType, scoringMap, rawItems);
      scoringSettingsCache.set(cacheKey, { settings: result, loadedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn("[LeagueScoring] Failed to load from cache:", err);
  }

  // Fallback
  const fallback = buildScoringSettings("HALF_PPR", FALLBACK_SCORING_MAP, []);
  return fallback;
}

function buildScoringSettings(
  scoringType: string,
  scoringMap: Record<number, number>,
  rawItems: ScoringItem[]
): LeagueScoringSettings {
  const receptionPoints = scoringMap[41] ?? 0.5;
  const passingTDPoints = scoringMap[5] ?? 4;
  const rushingTDPoints = scoringMap[25] ?? 6;
  const receivingTDPoints = scoringMap[43] ?? 6;
  const interceptionPoints = scoringMap[6] ?? -2;

  // Yards-per-point: ESPN stores as "points per yard" (e.g. 0.04 = 1pt/25yds)
  const passYardsPerPt = scoringMap[4] ? Math.round(1 / scoringMap[4]) : 25;
  const rushYardsPerPt = scoringMap[24] ? Math.round(1 / scoringMap[24]) : 10;
  const recYardsPerPt = scoringMap[42] ? Math.round(1 / scoringMap[42]) : 10;

  const scoringDescription = buildScoringDescription({
    receptionPoints,
    passingTDPoints,
    rushingTDPoints,
    receivingTDPoints,
    interceptionPoints,
    passYardsPerPt,
    rushYardsPerPt,
    recYardsPerPt,
    scoringType,
  });

  return {
    scoringType,
    scoringItems: rawItems,
    scoringMap,
    scoringDescription,
    receptionPoints,
    passingTDPoints,
    rushingTDPoints,
    receivingTDPoints,
    passingYardsPerPoint: passYardsPerPt,
    rushingYardsPerPoint: rushYardsPerPt,
    receivingYardsPerPoint: recYardsPerPt,
    interceptionPoints,
    fetchedAt: new Date(),
  };
}

// ─── Scoring calculator ───────────────────────────────────────────────────────

/**
 * Calculate league fantasy points from a raw stat line.
 * Uses the league's actual scoring map from ESPN.
 *
 * @param stats - Raw stat line (yards, TDs, receptions, etc.)
 * @param scoringMap - Optional override; defaults to cached league settings
 */
export function calculateLeaguePoints(
  stats: RawStatLine,
  scoringMap?: Record<number, number>
): number {
  const map = scoringMap ?? FALLBACK_SCORING_MAP;
  let total = 0;

  // Map RawStatLine fields back to ESPN stat IDs and apply scoring
  const statValues: Record<number, number> = {
    4:  stats.passingYards ?? 0,
    5:  stats.passingTDs ?? 0,
    3:  stats.completions ?? 0,
    0:  stats.passingAttempts ?? 0,
    6:  stats.interceptions ?? 0,
    24: stats.rushingYards ?? 0,
    25: stats.rushingTDs ?? 0,
    23: stats.rushingAttempts ?? 0,
    42: stats.receivingYards ?? 0,
    43: stats.receivingTDs ?? 0,
    41: stats.receptions ?? 0,
    58: stats.targets ?? 0,
    72: stats.fumblesLost ?? 0,
    20: stats.fumblesLost ?? 0,
  };

  for (const [statIdStr, value] of Object.entries(statValues)) {
    const statId = Number(statIdStr);
    const pointsPerUnit = map[statId];
    if (pointsPerUnit !== undefined && value !== 0) {
      total += value * pointsPerUnit;
    }
  }

  return Math.round(total * 100) / 100; // round to 2 decimal places
}

/**
 * Calculate league points directly from ESPN appliedStats object (stat ID → value).
 * This is the most accurate method when raw ESPN data is available.
 */
export function calculateLeaguePointsFromAppliedStats(
  appliedStats: Record<string, number>,
  scoringMap?: Record<number, number>
): number {
  const map = scoringMap ?? FALLBACK_SCORING_MAP;
  let total = 0;
  for (const [statIdStr, value] of Object.entries(appliedStats)) {
    const statId = Number(statIdStr);
    const pointsPerUnit = map[statId];
    if (pointsPerUnit !== undefined && value) {
      total += value * pointsPerUnit;
    }
  }
  return Math.round(total * 100) / 100;
}

// ─── Scoring description builder ─────────────────────────────────────────────

export function buildScoringDescription(params: {
  receptionPoints: number;
  passingTDPoints: number;
  rushingTDPoints: number;
  receivingTDPoints: number;
  interceptionPoints: number;
  passYardsPerPt: number;
  rushYardsPerPt: number;
  recYardsPerPt: number;
  scoringType: string;
}): string {
  const {
    receptionPoints, passingTDPoints, rushingTDPoints, receivingTDPoints,
    interceptionPoints, passYardsPerPt, rushYardsPerPt, recYardsPerPt,
  } = params;

  const pprLabel = receptionPoints === 1 ? "Full PPR" : receptionPoints === 0.5 ? "Half PPR" : "Standard";
  const parts: string[] = [
    `${pprLabel} (${receptionPoints} pt/rec)`,
    `${passingTDPoints} pts/pass TD`,
    `${rushingTDPoints} pts/rush TD`,
    `${receivingTDPoints} pts/rec TD`,
    `1 pt/${passYardsPerPt} pass yds`,
    `1 pt/${rushYardsPerPt} rush yds`,
    `1 pt/${recYardsPerPt} rec yds`,
  ];
  if (interceptionPoints !== 0) {
    parts.push(`${interceptionPoints} pts/INT`);
  }
  return parts.join(" · ");
}

/**
 * Get a structured breakdown of all scoring categories for UI display.
 */
export function getScoringBreakdown(settings: LeagueScoringSettings): {
  category: string;
  stat: string;
  points: string;
}[] {
  const { scoringMap } = settings;
  const rows: { category: string; stat: string; points: string }[] = [];

  const categories: { category: string; statId: number; label: string; perUnit?: string }[] = [
    // Passing
    { category: "Passing", statId: 4,  label: "Passing Yards",       perUnit: "per yard" },
    { category: "Passing", statId: 5,  label: "Passing TD",          perUnit: "each" },
    { category: "Passing", statId: 6,  label: "Interception",        perUnit: "each" },
    { category: "Passing", statId: 3,  label: "Completion",          perUnit: "each" },
    // Rushing
    { category: "Rushing", statId: 24, label: "Rushing Yards",       perUnit: "per yard" },
    { category: "Rushing", statId: 25, label: "Rushing TD",          perUnit: "each" },
    // Receiving
    { category: "Receiving", statId: 41, label: "Reception",         perUnit: "each" },
    { category: "Receiving", statId: 42, label: "Receiving Yards",   perUnit: "per yard" },
    { category: "Receiving", statId: 43, label: "Receiving TD",      perUnit: "each" },
    { category: "Receiving", statId: 58, label: "Target",            perUnit: "each" },
    // Misc
    { category: "Misc", statId: 72, label: "Fumble Lost",            perUnit: "each" },
    { category: "Misc", statId: 20, label: "Fumble Lost (alt)",      perUnit: "each" },
  ];

  for (const cat of categories) {
    const pts = scoringMap[cat.statId];
    if (pts !== undefined && pts !== 0) {
      // Format: if per-yard, show as "1 pt / N yds" for readability
      let pointsStr: string;
      if (cat.perUnit === "per yard" && Math.abs(pts) < 1) {
        const ydsPerPt = Math.round(1 / Math.abs(pts));
        pointsStr = `${pts > 0 ? "+" : ""}${Math.round(1 / Math.abs(pts))} yds = 1 pt`;
        pointsStr = `1 pt / ${ydsPerPt} yds`;
      } else {
        pointsStr = `${pts > 0 ? "+" : ""}${pts} pts`;
      }
      rows.push({ category: cat.category, stat: cat.label, points: pointsStr });
    }
  }

  return rows;
}

/**
 * Invalidate the in-memory cache (call after a settings refresh).
 */
export function invalidateScoringCache(): void {
  scoringSettingsCache.clear();
}
