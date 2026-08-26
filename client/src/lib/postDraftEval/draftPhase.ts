import type { FormatProfile, GradePos } from "@/lib/liveDraftGrade";

export type DraftPhase = "FOUNDATION" | "CORE_BUILD" | "ROSTER_BUILD" | "DEPTH_UPSIDE";

export type DraftPhaseWeights = {
  talent: number;
  value: number;
  scarcity: number;
  opportunityCost: number;
  need: number;
};

export type DraftPhaseResolution = {
  phase: DraftPhase;
  roundProgress: number;
  rosterFill: number;
  effectiveProgress: number;
  needImportance: number;
  weights: DraftPhaseWeights;
};

const SKILL: GradePos[] = ["QB", "RB", "WR", "TE"];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Dedicated core starters only — FLEX is shared and is not a positional "hole". */
export function dedicatedCoreRequired(profile: FormatProfile): number {
  return Math.max(1, SKILL.reduce((sum, pos) => sum + Math.max(0, profile.starters[pos] ?? 0), 0));
}

export function dedicatedCoreFilled(counts: Record<GradePos, number>, profile: FormatProfile): number {
  let filled = 0;
  for (const pos of SKILL) {
    filled += Math.min(Math.max(0, counts[pos] ?? 0), Math.max(0, profile.starters[pos] ?? 0));
  }
  return filled;
}

export function phaseWeights(phase: DraftPhase): DraftPhaseWeights {
  switch (phase) {
    case "FOUNDATION":
      return { talent: 0.36, value: 0.22, scarcity: 0.20, opportunityCost: 0.14, need: 0.08 };
    case "CORE_BUILD":
      return { talent: 0.28, value: 0.16, scarcity: 0.18, opportunityCost: 0.16, need: 0.22 };
    case "ROSTER_BUILD":
      return { talent: 0.20, value: 0.12, scarcity: 0.16, opportunityCost: 0.16, need: 0.36 };
    case "DEPTH_UPSIDE":
      return { talent: 0.16, value: 0.10, scarcity: 0.18, opportunityCost: 0.16, need: 0.40 };
  }
}

export function needImportanceForPhase(phase: DraftPhase): number {
  switch (phase) {
    case "FOUNDATION":
      return 0.12;
    case "CORE_BUILD":
      return 0.4;
    case "ROSTER_BUILD":
      return 0.85;
    case "DEPTH_UPSIDE":
      return 0.7;
  }
}

/**
 * Phase is normalized to league draft length, then mixed with how full the
 * dedicated starter chairs already are so a keeper-heavy roster can leave
 * FOUNDATION even in round 1.
 */
export function resolveDraftPhase(args: {
  round: number;
  totalRounds: number;
  counts: Record<GradePos, number>;
  profile: FormatProfile;
}): DraftPhaseResolution {
  const totalRounds = Math.max(1, args.totalRounds);
  const roundProgress = clamp((Math.max(1, args.round) - 1) / Math.max(1, totalRounds - 1), 0, 1);
  const rosterFill = dedicatedCoreFilled(args.counts, args.profile) / dedicatedCoreRequired(args.profile);
  const effectiveProgress = Math.max(roundProgress, rosterFill * 0.5);
  const phase: DraftPhase =
    effectiveProgress < 0.18
      ? "FOUNDATION"
      : effectiveProgress < 0.4
        ? "CORE_BUILD"
        : effectiveProgress < 0.72
          ? "ROSTER_BUILD"
          : "DEPTH_UPSIDE";
  return {
    phase,
    roundProgress,
    rosterFill,
    effectiveProgress,
    needImportance: needImportanceForPhase(phase),
    weights: phaseWeights(phase),
  };
}
