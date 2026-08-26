import type { GradeConfig, GradeLetter } from "./gradeConfig";

const ORDER: GradeLetter[] = ["A", "B", "C", "D", "F"];

export function letterFromPercentile(pctl: number, cfg: GradeConfig): GradeLetter {
  if (pctl < cfg.peerCurve.aMax) return "A";
  if (pctl < cfg.peerCurve.bMax) return "B";
  if (pctl < cfg.peerCurve.cMax) return "C";
  if (pctl < cfg.peerCurve.dMax) return "D";
  return "F";
}

export function letterIndex(letter: GradeLetter): number {
  if (letter === "—") return -1;
  return ORDER.indexOf(letter);
}

export function clampLetterJump(
  from: GradeLetter,
  to: GradeLetter,
  cfg: GradeConfig,
  opts?: { allowMultiDrop?: boolean },
): GradeLetter {
  if (from === "—" || to === "—") return to;
  const fi = letterIndex(from);
  const ti = letterIndex(to);
  if (fi < 0 || ti < 0) return to;
  const maxJump = cfg.smoothing.maxLetterJump;
  const delta = ti - fi;
  if (Math.abs(delta) <= maxJump) return to;
  if (opts?.allowMultiDrop && delta > 0) return to; // worse letter index higher
  const step = delta > 0 ? maxJump : -maxJump;
  return ORDER[fi + step] ?? to;
}

/** Band edge score distance for hysteresis (using peer-relative ranks is hard;
 * we apply hysteresis on smoothed score vs previous letter's implied band). */
export function applyLetterHysteresis(args: {
  previous: GradeLetter;
  candidate: GradeLetter;
  score: number;
  peerScoresSortedDesc: number[];
  cfg: GradeConfig;
}): GradeLetter {
  const { previous, candidate, score, peerScoresSortedDesc, cfg } = args;
  if (previous === "—" || previous === candidate) return candidate;
  // Require clear separation from the threshold score between bands
  const total = peerScoresSortedDesc.length || 1;
  const thresholds: Partial<Record<GradeLetter, number>> = {};
  // Map letter boundaries to score at cutoff index
  const cut = (p: number) => {
    const idx = Math.min(total - 1, Math.max(0, Math.floor(p * total)));
    return peerScoresSortedDesc[idx] ?? score;
  };
  thresholds.A = cut(cfg.peerCurve.aMax);
  thresholds.B = cut(cfg.peerCurve.bMax);
  thresholds.C = cut(cfg.peerCurve.cMax);
  thresholds.D = cut(cfg.peerCurve.dMax);

  const edge =
    candidate < previous
      ? thresholds[candidate]
      : thresholds[previous];
  // String compare wrong for letters — use index
  const improving = letterIndex(candidate) < letterIndex(previous);
  const relevantEdge = improving ? thresholds[candidate] : thresholds[previous];
  if (relevantEdge == null) return candidate;
  if (Math.abs(score - relevantEdge) < cfg.smoothing.hysteresisPoints) {
    return previous;
  }
  void edge;
  return candidate;
}
