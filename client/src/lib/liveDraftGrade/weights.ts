import type { GradeConfig, PhaseWeights } from "./gradeConfig";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpWeights(a: PhaseWeights, b: PhaseWeights, t: number): PhaseWeights {
  return {
    value: lerp(a.value, b.value, t),
    talent: lerp(a.talent, b.talent, t),
    construction: lerp(a.construction, b.construction, t),
    lineup: lerp(a.lineup, b.lineup, t),
  };
}

function renormalize(w: PhaseWeights): PhaseWeights {
  const sum = w.value + w.talent + w.construction + w.lineup;
  if (sum <= 0) return { value: 25, talent: 25, construction: 25, lineup: 25 };
  const s = 100 / sum;
  return {
    value: w.value * s,
    talent: w.talent * s,
    construction: w.construction * s,
    lineup: w.lineup * s,
  };
}

/** Continuous phase weights from league progress p ∈ [0,1]. */
export function interpolateWeights(progress: number, cfg: GradeConfig): PhaseWeights {
  const p = Math.max(0, Math.min(1, progress));
  const { midAnchor, lateAnchor, early, mid, late } = cfg.phases;
  let w: PhaseWeights;
  if (p <= midAnchor) {
    w = lerpWeights(early, mid, midAnchor <= 0 ? 1 : p / midAnchor);
  } else if (p <= lateAnchor) {
    const t = (p - midAnchor) / Math.max(1e-9, lateAnchor - midAnchor);
    w = lerpWeights(mid, late, t);
  } else {
    w = { ...late };
  }
  return renormalize(w);
}

export function blendPillars(
  pillars: {
    pickValue: number;
    talent: number;
    construction: number;
    lineupDepth: number;
  },
  w: PhaseWeights,
): number {
  return (
    (w.value * pillars.pickValue +
      w.talent * pillars.talent +
      w.construction * pillars.construction +
      w.lineup * pillars.lineupDepth) /
    100
  );
}
