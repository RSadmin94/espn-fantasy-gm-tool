import type { GradeConfig } from "./gradeConfig";
import { evaluateStarterFill } from "./rosterMath";
import type { FormatProfile, GradePos } from "./types";

/** Absolute score ceiling after OC (default 100 = no floor). */
export function scoreCeiling(args: {
  progress: number;
  counts: Record<GradePos, number>;
  profile: FormatProfile;
  cfg: GradeConfig;
}): number {
  const { progress, counts, profile, cfg } = args;
  if (progress < cfg.floors.activateProgress) return 100;

  const kDue = progress >= cfg.floors.kDueProgress;
  const dstDue = progress >= cfg.floors.dstDueProgress;
  const fill = evaluateStarterFill(counts, profile, { kDue, dstDue });

  let ceiling = 100;
  if (fill.coreVacancies >= 2) {
    ceiling = Math.min(ceiling, cfg.floors.twoPlusCoreVacancyCeiling);
  } else if (fill.coreVacancies >= 1) {
    ceiling = Math.min(ceiling, cfg.floors.oneCoreVacancyCeiling);
  }
  if (fill.kVacant) ceiling = Math.min(ceiling, cfg.floors.kVacancyCeiling);
  if (fill.defenseVacant) ceiling = Math.min(ceiling, cfg.floors.defenseVacancyCeiling);

  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF", "DP"] as GradePos[]) {
    const hard = profile.hardCap[pos];
    if (hard != null && (counts[pos] ?? 0) >= hard + 1) {
      ceiling = Math.min(ceiling, cfg.floors.hardCapPlusOneCeiling);
    }
  }
  if (profile.qbMode === "one_qb" && (counts.QB ?? 0) >= 3) {
    ceiling = Math.min(ceiling, cfg.floors.oneQbThreePlusQbCeiling);
  }
  return ceiling;
}
