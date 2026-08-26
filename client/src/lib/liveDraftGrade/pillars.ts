import type { GradeConfig } from "./gradeConfig";
import { normalizeGradePos } from "./formatProfile";
import { countRoster, evaluateStarterFill } from "./rosterMath";
import type { FormatProfile, GradePick, GradePos, PillarScores } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function scorePickValue(
  picks: readonly GradePick[],
  cfg: GradeConfig,
): { pickValue: number; avgDelta: number } {
  const scored = picks.filter((p) => !p.isKeeper && p.adp != null && Number(p.adp) > 0);
  if (scored.length === 0) {
    return { pickValue: cfg.pickValue.emptyDefault, avgDelta: 0 };
  }
  let sumVal = 0;
  let sumDelta = 0;
  for (const p of scored) {
    const delta = Number(p.pickNumber) - Number(p.adp);
    sumDelta += delta;
    sumVal += clamp(
      cfg.pickValue.neutral + cfg.pickValue.scalePerAdpDelta * delta,
      cfg.pickValue.min,
      cfg.pickValue.max,
    );
  }
  return {
    pickValue: sumVal / scored.length,
    avgDelta: sumDelta / scored.length,
  };
}

export function scoreTalent(picks: readonly GradePick[], cfg: GradeConfig): number {
  const scored = picks.filter((p) => !p.isKeeper && p.marketValue != null);
  if (scored.length === 0) return cfg.talent.emptyDefault;
  const mean =
    scored.reduce((s, p) => s + Number(p.marketValue), 0) / scored.length;
  return clamp(mean, cfg.talent.min, cfg.talent.max);
}

export function scoreConstruction(
  counts: Record<GradePos, number>,
  profile: FormatProfile,
  cfg: GradeConfig,
): number {
  let softPen = 0;
  let hardPen = 0;
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF", "DP"] as GradePos[]) {
    const have = counts[pos] ?? 0;
    const soft = profile.softCap[pos];
    const hard = profile.hardCap[pos];
    if (soft != null && have > soft) {
      softPen += cfg.construction.softPenPerOver * (have - soft);
    }
    if (hard != null && have > hard) {
      hardPen += cfg.construction.hardPenPerOver * (have - hard);
    }
  }

  // Balance only over positions that already have ≥1 player
  const shareKeys = (Object.keys(profile.targetShares) as Array<"QB" | "RB" | "WR" | "TE" | "DP">).filter(
    (k) => (counts[k] ?? 0) > 0 || (profile.targetShares[k] ?? 0) > 0,
  );
  const rostered = shareKeys.reduce((s, k) => s + (counts[k] ?? 0), 0);
  let balancePen = 0;
  if (rostered > 0) {
    let l1 = 0;
    for (const k of shareKeys) {
      const ideal = (profile.targetShares[k] ?? 0) * rostered;
      l1 += Math.abs((counts[k] ?? 0) - ideal);
    }
    balancePen = clamp(
      cfg.construction.balanceL1Scale * l1,
      0,
      cfg.construction.balancePenCap,
    );
  }

  return clamp(
    cfg.construction.base - softPen - hardPen - balancePen,
    cfg.construction.min,
    cfg.construction.max,
  );
}

export function scoreLineupDepth(
  picks: readonly GradePick[],
  counts: Record<GradePos, number>,
  profile: FormatProfile,
  cfg: GradeConfig,
  progress: number,
): number {
  const kDue = progress >= cfg.floors.kDueProgress;
  const dstDue = progress >= cfg.floors.dstDueProgress;
  const fill = evaluateStarterFill(counts, profile, { kDue, dstDue });
  const starterFill = fill.filled / fill.required;

  const nonKeepers = picks.filter((p) => !p.isKeeper);
  const starterBodies = fill.required;
  // Approximate bench = non-keepers beyond assigned starters (by count of picks)
  const benchPicks = nonKeepers.slice(Math.min(nonKeepers.length, starterBodies));
  const withMv = benchPicks.filter((p) => p.marketValue != null);
  const depthQuality =
    withMv.length === 0
      ? cfg.lineup.emptyBenchDepthDefault
      : withMv.reduce((s, p) => s + Number(p.marketValue), 0) / withMv.length / 100;

  const sw = profile.scoringHints.isBestBall
    ? cfg.lineup.bestBallStarterWeight
    : cfg.lineup.starterWeight;
  const bw = profile.scoringHints.isBestBall
    ? cfg.lineup.bestBallBenchWeight
    : cfg.lineup.benchWeight;

  const teamPicksTaken = nonKeepers.length;
  const expectedFill = Math.min(1, teamPicksTaken / fill.required);
  const vacancyGap = Math.max(0, expectedFill - starterFill);

  const lRaw = 100 * (sw * starterFill + bw * depthQuality);
  return clamp(lRaw - cfg.lineup.vacancyGapScale * vacancyGap, cfg.lineup.min, cfg.lineup.max);
}

export function scorePillars(
  picks: readonly GradePick[],
  profile: FormatProfile,
  cfg: GradeConfig,
  progress: number,
): PillarScores & { avgDelta: number; counts: Record<GradePos, number> } {
  const counted = picks.filter((p) => !p.isKeeper || profile.keepersOccupySlots);
  const counts = countRoster(counted, profile);
  const { pickValue, avgDelta } = scorePickValue(picks, cfg);
  return {
    pickValue,
    talent: scoreTalent(picks, cfg),
    construction: scoreConstruction(counts, profile, cfg),
    lineupDepth: scoreLineupDepth(picks, counts, profile, cfg, progress),
    avgDelta,
    counts,
  };
}

export function scoredPickCount(picks: readonly GradePick[]): number {
  return picks.filter((p) => !p.isKeeper).length;
}

/** Positions represented in picks (for reasons). */
export function positionList(picks: readonly GradePick[]): GradePos[] {
  const out: GradePos[] = [];
  for (const p of picks) {
    const pos = normalizeGradePos(p.position);
    if (pos) out.push(pos);
  }
  return out;
}
