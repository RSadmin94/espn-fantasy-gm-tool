/**
 * ownerDraftDnaTuning.ts — Tunable Phase 2a parameters (simulation-driven defaults).
 */

export interface OwnerDraftDnaTuning {
  inferiorAdpSlots: number;
  inferiorAdpSlotsCritical: number;
  leagueTendencyDelta: number;
  bpaTendencyDelta: number;
  minProbMargin: number;
  minProbHigh: number;
  minProbMedium: number;
  minProbLow: number;
  closeTendencyDelta: number;
  closeProbMargin: number;
  closeDecisionGap: number;
  decayMultipliers: readonly number[];
}

export const DEFAULT_OWNER_DNA_TUNING: OwnerDraftDnaTuning = {
  inferiorAdpSlots: 7,
  inferiorAdpSlotsCritical: 12,
  leagueTendencyDelta: 0.10,
  bpaTendencyDelta: 0.08,
  minProbMargin: 0.18,
  minProbHigh: 0.45,
  minProbMedium: 0.50,
  minProbLow: 0.55,
  closeTendencyDelta: 0.08,
  closeProbMargin: 0.15,
  closeDecisionGap: 14,
  decayMultipliers: [1.0, 0.65, 0.40, 0.20],
};

export function mergeOwnerDnaTuning(partial?: Partial<OwnerDraftDnaTuning>): OwnerDraftDnaTuning {
  return { ...DEFAULT_OWNER_DNA_TUNING, ...partial };
}

/** Grid for large-scale simulation sweeps (135 combinations). */
export function tuningGrid(): OwnerDraftDnaTuning[] {
  const out: OwnerDraftDnaTuning[] = [];
  for (const closeDecisionGap of [10, 11, 12, 13, 14]) {
    for (const leagueTendencyDelta of [0.08, 0.10, 0.12]) {
      for (const minProbMargin of [0.18, 0.20, 0.22]) {
        for (const inferiorAdpSlots of [5, 6, 7]) {
          out.push(mergeOwnerDnaTuning({ closeDecisionGap, leagueTendencyDelta, minProbMargin, inferiorAdpSlots }));
        }
      }
    }
  }
  return out;
}
