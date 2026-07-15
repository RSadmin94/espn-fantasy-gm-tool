/**
 * Phase 4 — hierarchical shrinkage + behavioral clustering for owner souls.
 */

import { DRIVE_NAMES, type DriveName } from "../phase3/driveFeatures";
import type { PersonalityCoefficients, PersonalityFitResult } from "../phase3/discreteChoiceModel";

export const SHRINKAGE_K = 100;

export function averageCoefficients(fits: PersonalityCoefficients[]): PersonalityCoefficients {
  const out = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as PersonalityCoefficients;
  if (fits.length === 0) return out;
  for (const f of fits) {
    for (const d of DRIVE_NAMES) out[d] += f[d];
  }
  for (const d of DRIVE_NAMES) out[d] /= fits.length;
  return out;
}

export function blendCoefficients(
  a: PersonalityCoefficients,
  b: PersonalityCoefficients,
  weightA: number,
): PersonalityCoefficients {
  const w = Math.max(0, Math.min(1, weightA));
  const out = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as PersonalityCoefficients;
  for (const d of DRIVE_NAMES) out[d] = w * a[d] + (1 - w) * b[d];
  return out;
}

export function hierarchicalShrink(args: {
  rawFit: PersonalityFitResult;
  clusterMean: PersonalityCoefficients;
  leagueMean: PersonalityCoefficients;
  k?: number;
}): {
  coefficients: PersonalityCoefficients;
  ownWeight: number;
  clusterWeight: number;
  leagueWeight: number;
} {
  const k = args.k ?? SHRINKAGE_K;
  const n = args.rawFit.choiceEventCount;
  const ownWeight = n / (n + k);
  const clusterLeagueBlend = n < 50 ? 0.65 : 0.85;
  const clusterPrior = blendCoefficients(args.clusterMean, args.leagueMean, clusterLeagueBlend);
  const coefficients = blendCoefficients(args.rawFit.coefficients, clusterPrior, ownWeight);
  const clusterWeight = (1 - ownWeight) * clusterLeagueBlend;
  const leagueWeight = (1 - ownWeight) * (1 - clusterLeagueBlend);
  return { coefficients, ownWeight, clusterWeight, leagueWeight };
}

const CLUSTER_DRIVES: DriveName[] = [
  "value",
  "rbEarlyRound",
  "wrEarlyRound",
  "herdFomo",
  "contrarian",
  "rbEarlyLegacyEra",
  "wrEarlyModernEra",
  "panic",
  "comfortAnchor",
  "scarcityTierCliff",
];

export type BehavioralCluster = {
  id: string;
  label: string;
  memberKeys: string[];
  centroid: PersonalityCoefficients;
};

function vectorFromCoefficients(c: PersonalityCoefficients): number[] {
  return CLUSTER_DRIVES.map((d) => c[d]);
}

function dist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s);
}

function labelFromCentroid(c: PersonalityCoefficients): string {
  const rb = c.rbEarlyRound + c.rbEarlyLegacyEra;
  const wr = c.wrEarlyRound + c.wrEarlyModernEra;
  if (c.comfortAnchor > 0.12) return "Comfort Re-Drafter";
  if (c.contrarian < -0.12 || c.herdFomo > 0.12) return "Herd-Responsive";
  if (c.contrarian > 0.12) return "Contrarian Zig-Zagger";
  if (c.panic > 0.15) return "Tier-Urgency Reactor";
  if (wr > rb + 0.1 && c.wrEarlyModernEra > 0.08) return "Modern WR-Forward";
  if (rb > wr + 0.1 && c.rbEarlyLegacyEra > 0.08) return "Legacy RB-Forward";
  if (wr > rb + 0.1) return "WR-Forward";
  if (rb > wr + 0.1) return "RB-Forward";
  if (c.value > 0.12) return "Board-Value Hunter";
  if (c.value < -0.08) return "Shape-Over-Value";
  return "League-typical Builder";
}

export function clusterBehavioralSouls(args: {
  souls: Array<{ profileOwnerKey: string; coefficients: PersonalityCoefficients }>;
  k?: number;
}): BehavioralCluster[] {
  const k = Math.min(args.k ?? 4, args.souls.length);
  if (k <= 0 || args.souls.length === 0) return [];

  const vectors = args.souls.map((s) => vectorFromCoefficients(s.coefficients));
  let centroids = vectors.slice(0, k).map((v) => [...v]);

  for (let iter = 0; iter < 30; iter++) {
    const assignments = vectors.map((v) => {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist(v, centroids[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    });

    const newCentroids = Array.from({ length: k }, () => vectors[0]!.map(() => 0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < vectors.length; i++) {
      const a = assignments[i]!;
      counts[a]++;
      for (let j = 0; j < vectors[i]!.length; j++) newCentroids[a]![j] += vectors[i]![j]!;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < newCentroids[c]!.length; j++) newCentroids[c]![j] /= counts[c]!;
    }
    centroids = newCentroids;
  }

  const finalAssign = vectors.map((v) => {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < k; c++) {
      const d = dist(v, centroids[c]!);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  });

  const clusters: BehavioralCluster[] = [];
  for (let c = 0; c < k; c++) {
    const members = args.souls.filter((_, i) => finalAssign[i] === c);
    const coefMembers = members.map((m) => m.coefficients);
    const centroidCoef = averageCoefficients(coefMembers.length ? coefMembers : [args.souls[0]!.coefficients]);
    clusters.push({
      id: `cluster_${c + 1}`,
      label: labelFromCentroid(centroidCoef),
      memberKeys: members.map((m) => m.profileOwnerKey),
      centroid: centroidCoef,
    });
  }
  return clusters;
}

export function nearestCluster(
  coefficients: PersonalityCoefficients,
  clusters: BehavioralCluster[],
): BehavioralCluster {
  const v = vectorFromCoefficients(coefficients);
  let best = clusters[0]!;
  let bestD = Infinity;
  for (const cl of clusters) {
    const d = dist(v, vectorFromCoefficients(cl.centroid));
    if (d < bestD) {
      bestD = d;
      best = cl;
    }
  }
  return best;
}
