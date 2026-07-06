/**
 * Phase 4.5 — behavioral era chapters from choice ledger + era coefficients.
 */

import { normalizePosition, type ChoiceRecord } from "../phase1/types";
import type { PersonalityCoefficients } from "../phase3/discreteChoiceModel";
import { eraConfidenceLabel, traitConfidencePct } from "./traitConfidence";

export type BehavioralEra = {
  label: string;
  seasonStart: number;
  seasonEnd: number;
  pickCount: number;
  seasonCount: number;
  earlyRbPct: number;
  earlyWrPct: number;
  confidenceLabel: "high" | "medium" | "low" | "tentative";
  summary: string;
};

type SeasonSlice = {
  season: number;
  picks: ChoiceRecord[];
  earlyRb: number;
  earlyWr: number;
  earlyTotal: number;
};

function seasonSlices(records: ChoiceRecord[]): SeasonSlice[] {
  const bySeason = new Map<number, ChoiceRecord[]>();
  for (const r of records) {
    const list = bySeason.get(r.season) ?? [];
    list.push(r);
    bySeason.set(r.season, list);
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, picks]) => {
      const early = picks.filter((p) => p.round <= 2);
      const earlyRb = early.filter((p) => normalizePosition(p.chosenPlayer.position) === "RB").length;
      const earlyWr = early.filter((p) => normalizePosition(p.chosenPlayer.position) === "WR").length;
      return { season, picks, earlyRb, earlyWr, earlyTotal: early.length };
    });
}

function labelForEra(args: {
  rbPct: number;
  wrPct: number;
  seasonStart: number;
  legacyCoef: number;
  modernCoef: number;
}): string {
  const { rbPct, wrPct, seasonStart, legacyCoef, modernCoef } = args;
  if (seasonStart >= 2023 && modernCoef > 0.08) return "Modern WR-lean";
  if (seasonStart < 2023 && legacyCoef > 0.15 && rbPct >= wrPct) return "Legacy RB-first";
  if (wrPct > rbPct + 15) return "WR-forward chapter";
  if (rbPct > wrPct + 15) return "RB-forward chapter";
  if (Math.abs(rbPct - wrPct) <= 15) return "Balanced early-round chapter";
  return "Transitional chapter";
}

function summarizeEra(era: BehavioralEra): string {
  return `${era.label}: rounds 1–2 were ${era.earlyRbPct}% RB / ${era.earlyWrPct}% WR across ${era.pickCount} picks (${era.seasonStart}–${era.seasonEnd}).`;
}

function mergeSlices(chunks: SeasonSlice[]): { earlyRb: number; earlyWr: number; earlyTotal: number; picks: ChoiceRecord[] } {
  const picks = chunks.flatMap((c) => c.picks);
  const earlyRb = chunks.reduce((s, c) => s + c.earlyRb, 0);
  const earlyWr = chunks.reduce((s, c) => s + c.earlyWr, 0);
  const earlyTotal = chunks.reduce((s, c) => s + c.earlyTotal, 0);
  return { earlyRb, earlyWr, earlyTotal, picks };
}

function coarseBoundaries(slices: SeasonSlice[], modernCut: number): number[] {
  const boundaries = [0];
  for (let i = 0; i < slices.length; i++) {
    const season = slices[i]!.season;
    if (season === modernCut && !boundaries.includes(i)) boundaries.push(i);
  }
  if (!boundaries.includes(0)) boundaries.unshift(0);
  boundaries.push(slices.length);
  return [...new Set(boundaries)].sort((a, b) => a - b);
}

function profileSimilar(a: BehavioralEra, b: BehavioralEra): boolean {
  return a.label === b.label && Math.abs(a.earlyRbPct - b.earlyRbPct) <= 20 && Math.abs(a.earlyWrPct - b.earlyWrPct) <= 20;
}

export function detectBehavioralEras(args: {
  records: ChoiceRecord[];
  coefficients: PersonalityCoefficients;
  inverseTemperature: number;
  avgChosenProbability: number;
}): BehavioralEra[] {
  const slices = seasonSlices(args.records);
  if (slices.length === 0) return [];

  const modernCut = 2023;
  const bounds = coarseBoundaries(slices, modernCut);
  const rawEras: BehavioralEra[] = [];

  for (let b = 0; b < bounds.length - 1; b++) {
    const chunk = slices.slice(bounds[b], bounds[b + 1]);
    if (!chunk.length) continue;
    const merged = mergeSlices(chunk);
    const earlyTotal = merged.earlyTotal || 1;
    const rbPct = Math.round((merged.earlyRb / earlyTotal) * 100);
    const wrPct = Math.round((merged.earlyWr / earlyTotal) * 100);
    const seasonStart = chunk[0]!.season;
    const seasonEnd = chunk[chunk.length - 1]!.season;

    const eraCoef =
      seasonStart >= modernCut
        ? args.coefficients.wrEarlyModernEra + args.coefficients.wrEarlyRound
        : args.coefficients.rbEarlyLegacyEra + args.coefficients.rbEarlyRound;

    const confPct = traitConfidencePct({
      coefficient: eraCoef,
      evidenceCount: merged.earlyTotal,
      totalChoices: merged.picks.length,
      inverseTemperature: args.inverseTemperature,
      avgChosenProbability: args.avgChosenProbability,
    });

    const era: BehavioralEra = {
      label: labelForEra({
        rbPct,
        wrPct,
        seasonStart,
        legacyCoef: args.coefficients.rbEarlyLegacyEra,
        modernCoef: args.coefficients.wrEarlyModernEra,
      }),
      seasonStart,
      seasonEnd,
      pickCount: merged.picks.length,
      seasonCount: chunk.length,
      earlyRbPct: rbPct,
      earlyWrPct: wrPct,
      confidenceLabel: eraConfidenceLabel({
        pickCount: merged.picks.length,
        seasonCount: chunk.length,
        traitConfidencePct: confPct,
      }),
      summary: "",
    };
    era.summary = summarizeEra(era);
    rawEras.push(era);
  }

  // Split legacy block at 2018 if long pre-2023 span and RB profile shifts mid-history
  const legacy = rawEras.find((e) => e.seasonEnd < modernCut && e.seasonEnd - e.seasonStart >= 6);
  if (legacy) {
    const legacySlices = slices.filter((s) => s.season < modernCut);
    const pre2018 = legacySlices.filter((s) => s.season <= 2017);
    const post2018 = legacySlices.filter((s) => s.season >= 2018 && s.season < modernCut);
    if (pre2018.length >= 2 && post2018.length >= 2) {
      const withoutLegacy = rawEras.filter((e) => e !== legacy);
      const build = (chunk: SeasonSlice[]) => {
        const merged = mergeSlices(chunk);
        const et = merged.earlyTotal || 1;
        const rbPct = Math.round((merged.earlyRb / et) * 100);
        const wrPct = Math.round((merged.earlyWr / et) * 100);
        const era: BehavioralEra = {
          label: labelForEra({
            rbPct,
            wrPct,
            seasonStart: chunk[0]!.season,
            legacyCoef: args.coefficients.rbEarlyLegacyEra,
            modernCoef: args.coefficients.wrEarlyModernEra,
          }),
          seasonStart: chunk[0]!.season,
          seasonEnd: chunk[chunk.length - 1]!.season,
          pickCount: merged.picks.length,
          seasonCount: chunk.length,
          earlyRbPct: rbPct,
          earlyWrPct: wrPct,
          confidenceLabel: "medium",
          summary: "",
        };
        era.confidenceLabel = eraConfidenceLabel({
          pickCount: era.pickCount,
          seasonCount: era.seasonCount,
          traitConfidencePct: confPctFrom(era, args),
        });
        era.summary = summarizeEra(era);
        return era;
      };
      return [...withoutLegacy, build(pre2018), build(post2018)].sort((a, b) => a.seasonStart - b.seasonStart);
    }
  }

  // Merge adjacent similar eras
  const merged: BehavioralEra[] = [];
  for (const era of rawEras) {
    const prev = merged[merged.length - 1];
    if (prev && profileSimilar(prev, era)) {
      prev.seasonEnd = era.seasonEnd;
      prev.pickCount += era.pickCount;
      prev.seasonCount += era.seasonCount;
      const totalEarly = prev.earlyRbPct + prev.earlyWrPct;
      prev.earlyRbPct = Math.round((prev.earlyRbPct + era.earlyRbPct) / 2);
      prev.earlyWrPct = Math.round((prev.earlyWrPct + era.earlyWrPct) / 2);
      prev.summary = summarizeEra(prev);
      prev.confidenceLabel = eraConfidenceLabel({
        pickCount: prev.pickCount,
        seasonCount: prev.seasonCount,
        traitConfidencePct: Math.max(
          confPctFrom(prev, args),
          confPctFrom(era, args),
        ),
      });
      void totalEarly;
    } else {
      merged.push({ ...era });
    }
  }

  return merged;
}

function confPctFrom(
  era: BehavioralEra,
  args: { coefficients: PersonalityCoefficients; inverseTemperature: number; avgChosenProbability: number },
): number {
  const eraCoef =
    era.seasonStart >= 2023
      ? args.coefficients.wrEarlyModernEra + args.coefficients.wrEarlyRound
      : args.coefficients.rbEarlyLegacyEra + args.coefficients.rbEarlyRound;
  return traitConfidencePct({
    coefficient: eraCoef,
    evidenceCount: Math.round(era.pickCount * 0.15),
    totalChoices: era.pickCount,
    inverseTemperature: args.inverseTemperature,
    avgChosenProbability: args.avgChosenProbability,
  });
}
