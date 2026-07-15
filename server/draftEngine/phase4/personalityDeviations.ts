/**
 * Owner personality as deviation from league baseline — "read the gap, not the pick."
 */

import { DRIVE_NAMES, type DriveName } from "../phase3/driveFeatures";
import type { PersonalityCoefficients } from "../phase3/discreteChoiceModel";

/** Drives nearly everyone shares; not useful for distinguishing leaguemates. */
export const TABLE_STAKES_DRIVES: DriveName[] = ["need"];

/** Drives used to cluster and headline owner differences. */
export const DISTINCTIVE_DRIVES: DriveName[] = [
  "value",
  "rbEarlyRound",
  "wrEarlyRound",
  "rbEarlyLegacyEra",
  "wrEarlyModernEra",
  "herdFomo",
  "contrarian",
  "comfortAnchor",
  "panic",
  "scarcityTierCliff",
];

export function subtractCoefficients(
  a: PersonalityCoefficients,
  b: PersonalityCoefficients,
): PersonalityCoefficients {
  const out = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as PersonalityCoefficients;
  for (const d of DRIVE_NAMES) out[d] = a[d] - b[d];
  return out;
}

export function deviationFromLeague(
  owner: PersonalityCoefficients,
  leagueMean: PersonalityCoefficients,
): PersonalityCoefficients {
  return subtractCoefficients(owner, leagueMean);
}

export function distinctiveDriveRankings(
  deviation: PersonalityCoefficients,
  args?: { exclude?: DriveName[]; topN?: number },
): Array<{ drive: DriveName; delta: number }> {
  const exclude = new Set(args?.exclude ?? TABLE_STAKES_DRIVES);
  return DISTINCTIVE_DRIVES.filter((d) => !exclude.has(d))
    .map((d) => ({ drive: d, delta: deviation[d] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, args?.topN ?? 4);
}

export function archetypeFromDeviation(deviation: PersonalityCoefficients): string {
  const rb = deviation.rbEarlyRound + deviation.rbEarlyLegacyEra;
  const wr = deviation.wrEarlyRound + deviation.wrEarlyModernEra;
  const legacyRb = deviation.rbEarlyLegacyEra;
  const modernWr = deviation.wrEarlyModernEra;

  if (legacyRb > 0.15 && modernWr > 0.08) return "Evolving RB-to-WR";
  if (legacyRb > 0.15) return "Legacy RB-Forward";
  if (modernWr > 0.1) return "Modern WR-Forward";
  if (wr > rb + 0.1) return "WR-Forward";
  if (rb > wr + 0.1) return "RB-Forward";
  if (deviation.comfortAnchor > 0.12) return "Comfort Re-Drafter";
  if (deviation.contrarian < -0.15 || deviation.herdFomo > 0.15) return "Herd-Responsive";
  if (deviation.contrarian > 0.12) return "Contrarian Zig-Zagger";
  if (deviation.panic > 0.15) return "Tier-Urgency Reactor";
  if (deviation.value > 0.12) return "Board-Value Hunter";
  if (deviation.value < -0.08) return "Shape-Over-Value";
  if (deviation.scarcityTierCliff > 0.1) return "Tier-Cliff Sensitive";
  return "League-typical Builder";
}

export function spreadScore(souls: Array<{ deviation: PersonalityCoefficients; archetype: string }>): {
  uniqueArchetypes: number;
  meanAbsDeviation: number;
} {
  const archetypes = new Set(souls.map((s) => s.archetype));
  let sum = 0;
  let n = 0;
  for (const s of souls) {
    for (const d of DISTINCTIVE_DRIVES) {
      sum += Math.abs(s.deviation[d]);
      n++;
    }
  }
  return {
    uniqueArchetypes: archetypes.size,
    meanAbsDeviation: n ? sum / n : 0,
  };
}
