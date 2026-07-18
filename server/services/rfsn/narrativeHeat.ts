/**
 * narrativeHeat — airtime worthiness (0..100). Independent of confidence.
 */

import type { NarrativeType } from "./historicalContext";

export type HeatInputs = {
  /** Championship title count. */
  titleCount?: number;
  /** Absolute picks-early / picks-late magnitude vs ADP. */
  adpMagnitude?: number;
  /** How sharply owner deviates from own pattern (0..1). */
  deviationStrength?: number;
  /** H2H win differential absolute, or eliminations. */
  rivalrySkew?: number;
  playoffEliminations?: number;
  /** Prior seasons with same behavior / player. */
  repeatCount?: number;
  /** Player connection notability boost (0..1). */
  connectionNotability?: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Starting heat heuristics by NarrativeType (locked Phase 1 table).
 * Scales within the published band using evidence-backed inputs only.
 */
export function scoreNarrativeHeat(type: NarrativeType, inputs: HeatInputs = {}): number {
  switch (type) {
    case "championship": {
      const titles = Math.max(0, inputs.titleCount ?? 1);
      // 85–95: more titles → chasing-another-ring tension
      return clamp(85 + Math.min(10, (titles - 1) * 3), 85, 95);
    }
    case "rivalry": {
      const skew = Math.max(0, inputs.rivalrySkew ?? 0);
      const elims = Math.max(0, inputs.playoffEliminations ?? 0);
      return clamp(80 + Math.min(10, skew * 0.5 + elims * 2), 80, 95);
    }
    case "breaking_tendency": {
      const d = clamp(inputs.deviationStrength ?? 0.5, 0, 1);
      return clamp(75 + d * 10, 75, 85);
    }
    case "major_reach":
    case "major_steal": {
      const mag = Math.max(0, inputs.adpMagnitude ?? 20);
      return clamp(60 + Math.min(20, mag / 2), 60, 80);
    }
    case "repeat_behavior":
    case "draft_dna": {
      const reps = Math.max(1, inputs.repeatCount ?? 1);
      return clamp(40 + Math.min(20, reps * 4), 40, 60);
    }
    case "player_connection": {
      const n = clamp(inputs.connectionNotability ?? 0.3, 0, 1);
      return clamp(20 + n * 25, 20, 45);
    }
    default:
      return 0;
  }
}
