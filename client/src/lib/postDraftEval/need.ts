import type { FormatProfile, GradePos } from "@/lib/liveDraftGrade";
import type { DraftPhase } from "./draftPhase";
import { dedicatedCoreFilled, dedicatedCoreRequired } from "./draftPhase";

const SKILL: Array<"QB" | "RB" | "WR" | "TE"> = ["QB", "RB", "WR", "TE"];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export type VacancyReport = {
  dedicatedRemaining: Record<"QB" | "RB" | "WR" | "TE", number>;
  dedicatedRequired: Record<"QB" | "RB" | "WR" | "TE", number>;
  dedicatedRatio: Record<"QB" | "RB" | "WR" | "TE", number>;
  flexRemaining: number;
  flexRequired: number;
  fillRatio: number;
  /** False until enough dedicated chairs are filled for "need" to mean anything. */
  needDifferentiationActive: boolean;
  relative: Record<"QB" | "RB" | "WR" | "TE", number>;
};

function asSkill(pos: GradePos | null): "QB" | "RB" | "WR" | "TE" | null {
  if (pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE") return pos;
  return null;
}

/**
 * Dedicated starter holes only. Surplus RB/WR/TE fill FLEX before FLEX is treated
 * as vacant, and that remainder is never assigned to a single position.
 */
export function computeVacancies(
  counts: Record<GradePos, number>,
  profile: FormatProfile,
): VacancyReport {
  const dedicatedRemaining = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const dedicatedRequired = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const dedicatedRatio = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const leftover = { QB: 0, RB: 0, WR: 0, TE: 0 };

  for (const pos of SKILL) {
    const required = Math.max(0, profile.starters[pos] ?? 0);
    const have = Math.max(0, counts[pos] ?? 0);
    dedicatedRequired[pos] = required;
    dedicatedRemaining[pos] = Math.max(0, required - have);
    leftover[pos] = Math.max(0, have - required);
    dedicatedRatio[pos] = required <= 0 ? 0 : dedicatedRemaining[pos] / required;
  }

  const flexRequired = Math.max(0, profile.starters.FLEX ?? 0);
  let flexPool = 0;
  for (const pos of profile.flexEligibility) {
    if (pos === "RB" || pos === "WR" || pos === "TE" || pos === "QB") {
      flexPool += leftover[pos] ?? 0;
    }
  }
  const flexRemaining = Math.max(0, flexRequired - Math.min(flexRequired, flexPool));
  const fillRatio = dedicatedCoreFilled(counts, profile) / dedicatedCoreRequired(profile);
  const needDifferentiationActive = fillRatio >= 0.18;

  const mean = SKILL.reduce((sum, pos) => sum + dedicatedRatio[pos], 0) / SKILL.length;
  const relative = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const pos of SKILL) {
    relative[pos] = dedicatedRatio[pos] - mean;
  }

  return {
    dedicatedRemaining,
    dedicatedRequired,
    dedicatedRatio,
    flexRemaining,
    flexRequired,
    fillRatio,
    needDifferentiationActive,
    relative,
  };
}

/**
 * Need score in 0–100. An empty roster scores ~50 at every skill position —
 * there is no meaningful "RB hole" when every chair is empty.
 */
export function needScoreForPosition(args: {
  pos: GradePos | null;
  counts: Record<GradePos, number>;
  profile: FormatProfile;
  phase: DraftPhase;
  needImportance: number;
  talentScore: number;
  scarcityScore: number;
}): { score: number; fills: GradePos | null; report: VacancyReport } {
  const report = computeVacancies(args.counts, args.profile);
  const skill = asSkill(args.pos);
  if (!skill) {
    return { score: 22, fills: null, report };
  }

  const qualityFactor = clamp(args.talentScore / 70, 0.35, 1);
  const flexEligible = args.profile.flexEligibility.includes(skill);

  if (!report.needDifferentiationActive) {
    return {
      score: 50,
      fills: null,
      report,
    };
  }

  const relative = report.relative[skill];
  const dedicatedHole = report.dedicatedRemaining[skill] > 0;
  const flexShare = report.flexRemaining > 0 && flexEligible ? (dedicatedHole ? 3 : 8) : 0;
  const spread = 50 * relative * args.needImportance;
  const raw = 50 + spread + flexShare;
  const gated = raw * qualityFactor;
  const fills: GradePos | null = dedicatedHole ? skill : report.flexRemaining > 0 && flexEligible ? "FLEX" : null;
  void args.phase;
  void args.scarcityScore;
  return { score: clamp(gated, 8, 100), fills, report };
}
