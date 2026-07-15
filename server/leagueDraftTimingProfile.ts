/**
 * leagueDraftTimingProfile.ts — League position timing baselines for mock draft intelligence.
 *
 * Phase 1: DP slice only. Adapter wraps the read-only IDP profile; future positions
 * (QB/TE/K/DEF) will implement the same PositionTimingProfile shape.
 */

import {
  computeLeagueIdpDraftProfile,
  type LeagueIdpDraftProfile,
} from "./leagueIdpDraftProfile";

export type TimingConfidence = "High" | "Medium" | "Low";

/** Shared timing profile shape — one per normalized position. */
export interface PositionTimingProfile {
  position: string;
  leagueId: string;
  teamCount: number;
  confidence: TimingConfidence;
  confidenceReasons: string[];
  /** Median overall pick when this position first leaves the board (league baseline). */
  baselineFirstPick: number | null;
  baselineFirstRound: number | null;
  /** 25th / 75th percentile of first-{pos} pick across seasons. */
  firstPickP25: number | null;
  firstPickP75: number | null;
  /** Overall pick at which the DP window opens (confidence-adjusted). */
  windowStartPick: number | null;
  /** Soft upper bound — after this, urgency to fill the slot increases. */
  windowEndPick: number | null;
  seasonsAnalyzed: number;
  totalPositionPicks: number;
  /** Seasons whose first DP came before pick 50 (repeatable-early evidence). */
  seasonsWithEarlyFirst: number;
  earliestFirstBySeason: Array<{
    season: number;
    firstPick: number;
    firstRound: number;
    firstPlayer: string;
  }>;
  interpretation: string;
}

export interface LeaguePositionTimingProfiles {
  leagueId: string;
  teamCount: number;
  dp: PositionTimingProfile | null;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo));
}

/** Map LeagueIdpDraftProfile → PositionTimingProfile for "DP". */
export function dpTimingFromIdpProfile(idp: LeagueIdpDraftProfile): PositionTimingProfile {
  const firstPicks = idp.earliestDpBySeason.map((s) => s.firstDpPick).sort((a, b) => a - b);
  const p25 = percentile(firstPicks, 0.25);
  const p75 = percentile(firstPicks, 0.75);
  const teamCount = idp.teamCount;
  const median = idp.medianFirstDpPick;

  // Confidence-adjusted window: sparse data softens (earlier / wider open), never tightens.
  let windowStart: number | null = p25 ?? median;
  let windowEnd: number | null = p75 ?? (median != null ? median + teamCount * 2 : null);

  if (idp.confidence === "Low") {
    windowStart = windowStart != null ? Math.max(1, windowStart - teamCount) : null;
    windowEnd = windowEnd != null ? windowEnd + teamCount : null;
  } else if (idp.confidence === "High" && p25 != null) {
    windowStart = p25;
    windowEnd = p75 ?? windowEnd;
  } else {
    // Medium: P25 baseline; end at P75 or median + 1 round
    windowStart = p25 ?? (median != null ? median - teamCount : null);
    windowEnd = p75 ?? (median != null ? median + teamCount : null);
  }

  return {
    position: "DP",
    leagueId: idp.leagueId,
    teamCount,
    confidence: idp.confidence,
    confidenceReasons: idp.confidenceReasons,
    baselineFirstPick: idp.medianFirstDpPick,
    baselineFirstRound: idp.medianFirstDpRound,
    firstPickP25: p25,
    firstPickP75: p75,
    windowStartPick: windowStart,
    windowEndPick: windowEnd,
    seasonsAnalyzed: idp.seasonsAnalyzed,
    totalPositionPicks: idp.totalDpPicks,
    seasonsWithEarlyFirst: idp.beforePick50.seasonsWithEarlyDp,
    earliestFirstBySeason: idp.earliestDpBySeason.map((s) => ({
      season: s.season,
      firstPick: s.firstDpPick,
      firstRound: s.firstDpRound,
      firstPlayer: s.firstDpPlayer,
    })),
    interpretation: idp.interpretation,
  };
}

export async function computeLeaguePositionTimingProfiles(opts: {
  db: { execute: (q: any) => Promise<any> };
  sql: (strings: TemplateStringsArray, ...vals: any[]) => any;
  leagueId: string;
}): Promise<LeaguePositionTimingProfiles> {
  const idp = await computeLeagueIdpDraftProfile(opts);
  const dp = idp.seasonsAnalyzed > 0 ? dpTimingFromIdpProfile(idp) : null;
  return {
    leagueId: opts.leagueId,
    teamCount: idp.teamCount,
    dp,
  };
}
