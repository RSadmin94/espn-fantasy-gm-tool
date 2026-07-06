/**
 * Phase 4.5 — trait confidence from fitted coefficients + ledger evidence.
 */

import type { PersonalityCoefficients } from "../phase3/discreteChoiceModel";
import type { EvidenceBundle } from "./evidenceMining";

export type StabilityBand = "high" | "medium" | "low" | "tentative" | "provisional";

export function coefStrength(absCoef: number): number {
  return 1 - Math.exp(-Math.abs(absCoef) / 0.28);
}

export function sampleCoverage(evidenceCount: number, minFull = 20): number {
  return Math.min(1, evidenceCount / minFull);
}

export function modelSupport(inverseTemperature: number, avgChosenProbability: number): number {
  const sharpness = Math.min(1, inverseTemperature / 1.25);
  const fit = Math.min(1, avgChosenProbability / 0.12);
  return 0.55 * sharpness + 0.45 * fit;
}

export function traitConfidencePct(args: {
  coefficient: number;
  evidenceCount: number;
  totalChoices: number;
  inverseTemperature: number;
  avgChosenProbability: number;
  ownWeight?: number;
}): number {
  const own = args.ownWeight ?? 1;
  const raw =
    coefStrength(args.coefficient) *
    sampleCoverage(args.evidenceCount) *
    modelSupport(args.inverseTemperature, args.avgChosenProbability) *
    own;
  return Math.max(5, Math.min(97, Math.round(raw * 100)));
}

export function overallStabilityBand(args: {
  traitConfidences: number[];
  totalChoices: number;
  personalityFitTier: "full" | "shrinkage_cold";
  ownWeight?: number;
}): StabilityBand {
  if (args.personalityFitTier === "shrinkage_cold") return "provisional";
  const avg = args.traitConfidences.reduce((a, b) => a + b, 0) / (args.traitConfidences.length || 1);
  if (args.totalChoices < 25) return "tentative";
  if (avg >= 72) return "high";
  if (avg >= 48) return "medium";
  return "low";
}

export function eraConfidenceLabel(args: {
  pickCount: number;
  seasonCount: number;
  traitConfidencePct: number;
}): StabilityBand {
  if (args.pickCount < 12 || args.seasonCount < 2) return "tentative";
  if (args.traitConfidencePct >= 70) return "high";
  if (args.traitConfidencePct >= 45) return "medium";
  return "low";
}

export function exposedStability(args: {
  coefficients: PersonalityCoefficients;
  evidence: EvidenceBundle;
  inverseTemperature: number;
  avgChosenProbability: number;
  ownWeight?: number;
  modernEraEarlyWrPct?: number;
  modernEraPickCount?: number;
}): Array<{ trait: string; confidencePct: number }> {
  const { coefficients: c, evidence: e, ownWeight } = args;
  const wrTransitionEvidence =
    e.modernEarlyWr.count +
    (args.modernEraEarlyWrPct != null && args.modernEraEarlyWrPct >= 75 && args.modernEraPickCount
      ? Math.round(args.modernEraPickCount * 0.35)
      : 0);

  const mk = (trait: string, coef: number, ev: number) => ({
    trait,
    confidencePct: traitConfidencePct({
      coefficient: coef,
      evidenceCount: ev,
      totalChoices: e.totalChoices,
      inverseTemperature: args.inverseTemperature,
      avgChosenProbability: args.avgChosenProbability,
      ownWeight,
    }),
  });

  const wrCoef = c.wrEarlyModernEra + c.wrEarlyRound * 0.3;
  let wrTransitionPct = traitConfidencePct({
    coefficient: wrCoef,
    evidenceCount: wrTransitionEvidence,
    totalChoices: e.totalChoices,
    inverseTemperature: args.inverseTemperature,
    avgChosenProbability: args.avgChosenProbability,
    ownWeight,
  });
  if (
    args.modernEraEarlyWrPct != null &&
    args.modernEraEarlyWrPct >= 85 &&
    e.modernEarlyWr.count >= 2
  ) {
    const tape = (args.modernEraEarlyWrPct / 100) * Math.min(1, (args.modernEraPickCount ?? 0) / 15);
    const blended = Math.round(
      100 *
        (0.55 * coefStrength(wrCoef) + 0.45 * tape) *
        modelSupport(args.inverseTemperature, args.avgChosenProbability) *
        (ownWeight ?? 1),
    );
    wrTransitionPct = Math.max(wrTransitionPct, Math.min(48, blended));
  }

  return [
    mk("RB-first (early rounds)", c.rbEarlyRound + c.rbEarlyLegacyEra * 0.5, e.earlyRb.count + e.legacyEarlyRb.count),
    { trait: "WR-transition (2023+)", confidencePct: wrTransitionPct },
    mk("Roster-need fill", c.need, e.needFill.count),
    mk("Run-rider", c.herdFomo - c.contrarian * 0.5, e.runJoin.count),
    mk("Comfort re-draft", c.comfortAnchor, e.comfortReDraft.count),
    mk("Tier urgency", c.panic + c.scarcityTierCliff * 0.5, e.tierUrgency.count),
    mk("Board value", c.value, Math.round(e.totalChoices * 0.35)),
  ].sort((a, b) => b.confidencePct - a.confidencePct);
}
