/**
 * Phase 4.5 — translate fitted soul coefficients + ledger into if/then decision rules.
 */

import { DRIVE_NAMES, type DriveName } from "../phase3/driveFeatures";
import type { PersonalityCoefficients } from "../phase3/discreteChoiceModel";
import type { OwnerSoulProfile } from "../phase4/fitAllSouls";
import { detectBehavioralEras, type BehavioralEra } from "./behavioralEras";
import { mineLedgerEvidence, type EvidenceBundle } from "./evidenceMining";
import {
  exposedStability,
  overallStabilityBand,
  traitConfidencePct,
  type StabilityBand,
} from "./traitConfidence";

export type RuleEvidence = {
  matchingPicks: number;
  draftSeasons: number;
  seasons: number[];
  seasonRange: string;
};

export type DecisionRule = {
  ifThen: string;
  drive: DriveName;
  evidence: RuleEvidence;
  confidencePct: number;
};

export type DecisionException = {
  unless: string;
  drives: DriveName[];
  evidence: RuleEvidence;
  confidencePct: number;
};

export type OwnerDecisionProfile = {
  leagueId: string;
  profileOwnerKey: string;
  displayName: string;
  personalityFitTier: "full" | "shrinkage_cold";
  provisionalNote?: string;
  rules: DecisionRule[];
  exceptions: DecisionException[];
  ruleModifiers: string[];
  eras: BehavioralEra[];
  stability: Array<{ trait: string; confidencePct: number }>;
  overallStability: StabilityBand;
  avgChosenProbability: number;
  choiceEventCount: number;
  boardScopeNote: string;
};

type RuleCandidate = {
  drive: DriveName;
  coef: number;
  ifThen: string;
  evidenceKey: keyof EvidenceBundle | "total";
  minCoef?: number;
};

const RULE_CANDIDATES: RuleCandidate[] = [
  {
    drive: "need",
    coef: 0,
    minCoef: 0.15,
    ifThen: "If a position is below roster target → prioritize filling that hole over raw board rank.",
    evidenceKey: "needFill",
  },
  {
    drive: "rbEarlyRound",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If rounds 1–2 AND a startable RB is on the board → lean RB over waiting.",
    evidenceKey: "earlyRb",
  },
  {
    drive: "wrEarlyRound",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If rounds 1–2 AND WR value is available → take WR early rather than deferring.",
    evidenceKey: "earlyWr",
  },
  {
    drive: "rbEarlyLegacyEra",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If pre-2023 draft AND rounds 1–2 → RB urgency is higher than league peers.",
    evidenceKey: "legacyEarlyRb",
  },
  {
    drive: "wrEarlyModernEra",
    coef: 0,
    minCoef: 0.08,
    ifThen: "If 2023+ draft AND rounds 1–2 → WR urgency is higher than his legacy era.",
    evidenceKey: "modernEarlyWr",
  },
  {
    drive: "herdFomo",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If a position run is live (3+ of last 4 picks same position) → join the run at that position.",
    evidenceKey: "runJoin",
  },
  {
    drive: "contrarian",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If a position run is live → fade the run and take value at a different position.",
    evidenceKey: "runFade",
  },
  {
    drive: "comfortAnchor",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If a player was on your roster in a prior season → boost his draft priority.",
    evidenceKey: "comfortReDraft",
  },
  {
    drive: "panic",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If tiers are thinning OR late-round hole at a position → act now, don't wait.",
    evidenceKey: "tierUrgency",
  },
  {
    drive: "scarcityTierCliff",
    coef: 0,
    minCoef: 0.1,
    ifThen: "If top-tier players at a position are almost gone → reach before the cliff.",
    evidenceKey: "tierUrgency",
  },
  {
    drive: "value",
    coef: 0,
    minCoef: 0.12,
    ifThen: "If position-normalized board value gap is large → take the stronger value play.",
    evidenceKey: "total",
  },
];

function evidenceForKey(bundle: EvidenceBundle, key: keyof EvidenceBundle | "total"): RuleEvidence {
  if (key === "total") {
    return {
      matchingPicks: bundle.totalChoices,
      draftSeasons: bundle.draftSeasons,
      seasons: [],
      seasonRange: `${bundle.seasonRange[0]}–${bundle.seasonRange[1]}`,
    };
  }
  const slice = bundle[key];
  if (typeof slice === "number") {
    return {
      matchingPicks: slice,
      draftSeasons: bundle.draftSeasons,
      seasons: [],
      seasonRange: `${bundle.seasonRange[0]}–${bundle.seasonRange[1]}`,
    };
  }
  return {
    matchingPicks: slice.count,
    draftSeasons: slice.seasons.length,
    seasons: slice.seasons,
    seasonRange: `${bundle.seasonRange[0]}–${bundle.seasonRange[1]}`,
  };
}

function negRuleForDrive(drive: DriveName, coef: number, bundle: EvidenceBundle): DecisionRule | null {
  if (drive !== "value" || coef >= -0.08) return null;
  return {
    ifThen: "If best board value conflicts with roster shape → take shape/need over pure BPA.",
    drive: "value",
    evidence: evidenceForKey(bundle, "needFill"),
    confidencePct: 0,
  };
}

function buildRules(args: {
  coefficients: PersonalityCoefficients;
  evidence: EvidenceBundle;
  inverseTemperature: number;
  avgChosenProbability: number;
  ownWeight: number;
}): DecisionRule[] {
  const rules: DecisionRule[] = [];

  for (const cand of RULE_CANDIDATES) {
    const coef = args.coefficients[cand.drive];
    const min = cand.minCoef ?? 0.1;
    if (driveIsNegativeRule(cand.drive, coef)) continue;
    if (Math.abs(coef) < min) continue;

    const ev = evidenceForKey(args.evidence, cand.evidenceKey);
    const conf = traitConfidencePct({
      coefficient: coef,
      evidenceCount: ev.matchingPicks,
      totalChoices: args.evidence.totalChoices,
      inverseTemperature: args.inverseTemperature,
      avgChosenProbability: args.avgChosenProbability,
      ownWeight: args.ownWeight,
    });

    rules.push({
      ifThen: cand.ifThen,
      drive: cand.drive,
      evidence: ev,
      confidencePct: conf,
    });
  }

  const negValue = negRuleForDrive("value", args.coefficients.value, args.evidence);
  if (negValue) {
    negValue.confidencePct = traitConfidencePct({
      coefficient: Math.abs(args.coefficients.value),
      evidenceCount: args.evidence.needFill.count,
      totalChoices: args.evidence.totalChoices,
      inverseTemperature: args.inverseTemperature,
      avgChosenProbability: args.avgChosenProbability,
      ownWeight: args.ownWeight,
    });
    rules.push(negValue);
  }

  if (args.coefficients.contrarian < -0.12) {
    const ev = evidenceForKey(args.evidence, "runJoin");
    rules.push({
      ifThen: "If a position run is live → join the run (negative contrarian = herd-responsive).",
      drive: "contrarian",
      evidence: ev,
      confidencePct: traitConfidencePct({
        coefficient: Math.abs(args.coefficients.contrarian),
        evidenceCount: ev.matchingPicks,
        totalChoices: args.evidence.totalChoices,
        inverseTemperature: args.inverseTemperature,
        avgChosenProbability: args.avgChosenProbability,
        ownWeight: args.ownWeight,
      }),
    });
  }

  return rules.sort((a, b) => b.confidencePct - a.confidencePct).slice(0, 5);
}

function driveIsNegativeRule(drive: DriveName, coef: number): boolean {
  if (drive === "contrarian") return coef <= 0;
  if (drive === "value") return coef < 0;
  return coef <= 0;
}

function buildExceptions(args: {
  coefficients: PersonalityCoefficients;
  evidence: EvidenceBundle;
  inverseTemperature: number;
  avgChosenProbability: number;
  ownWeight: number;
}): DecisionException[] {
  const c = args.coefficients;
  const exceptions: DecisionException[] = [];

  const add = (unless: string, drives: DriveName[], evKey: keyof EvidenceBundle, coef: number) => {
    const ev = evidenceForKey(args.evidence, evKey);
    exceptions.push({
      unless,
      drives,
      evidence: ev,
      confidencePct: traitConfidencePct({
        coefficient: Math.abs(coef),
        evidenceCount: ev.matchingPicks,
        totalChoices: args.evidence.totalChoices,
        inverseTemperature: args.inverseTemperature,
        avgChosenProbability: args.avgChosenProbability,
        ownWeight: args.ownWeight,
      }),
    });
  };

  if (c.rbEarlyRound > 0.12 && c.wrEarlyModernEra > 0.08) {
    add(
      "UNLESS draft year is 2023+ AND rounds 1–2 → pivot toward WR even when RB rule would fire.",
      ["rbEarlyRound", "wrEarlyModernEra"],
      "modernEarlyWr",
      c.wrEarlyModernEra,
    );
  }

  if (c.rbEarlyLegacyEra > 0.15 && c.wrEarlyModernEra > 0.08) {
    add(
      "UNLESS in legacy era (pre-2023) → RB rule dominates; modern WR override only applies 2023+.",
      ["rbEarlyLegacyEra", "wrEarlyModernEra"],
      "legacyEarlyRb",
      c.rbEarlyLegacyEra,
    );
  }

  if (c.herdFomo > 0.12 && c.contrarian < -0.08) {
    add(
      "UNLESS run is at a position you already filled → herd rule weakens; shape takes over.",
      ["herdFomo", "need"],
      "runJoin",
      c.herdFomo,
    );
  }

  if (c.panic > 0.12 && c.scarcityTierCliff > 0.08) {
    add(
      "UNLESS a WR tier-cliff is within ~2 picks in rounds 1–2 → pivot to WR before RB urgency fires.",
      ["panic", "scarcityTierCliff"],
      "tierUrgency",
      c.panic,
    );
  }

  if (c.need > 0.15 && c.value < 0.05) {
    add(
      "UNLESS board value gap is extreme at another position → need-fill rule yields to one-time value steal.",
      ["need", "value"],
      "needFill",
      c.need,
    );
  }

  if (c.comfortAnchor > 0.12 && c.value > 0.08) {
    add(
      "UNLESS the comfort re-draft is multiple rounds early for position → value rule overrides nostalgia.",
      ["comfortAnchor", "value"],
      "comfortReDraft",
      c.comfortAnchor,
    );
  }

  return exceptions.sort((a, b) => b.confidencePct - a.confidencePct).slice(0, 3);
}

function buildRuleModifiers(args: {
  coefficients: PersonalityCoefficients;
  eras: BehavioralEra[];
}): string[] {
  const mods: string[] = [];
  const c = args.coefficients;

  if (args.eras.length > 1) {
    mods.push(`Era chapter (${args.eras.map((e) => `${e.seasonStart}–${e.seasonEnd}`).join(" → ")}): early-round RB/WR rules shift by segment — see ERAS.`);
  }
  if (c.herdFomo > 0.1 || c.contrarian < -0.08) {
    mods.push("Run pressure: when the room stacks one position, run-rider vs fade rules activate.");
  }
  if (c.need > 0.15) {
    mods.push("Roster state: open holes at RB/WR/QB/TE strengthen need-fill rules on every pick.");
  }
  if (c.panic > 0.12 || c.scarcityTierCliff > 0.08) {
    mods.push("Tier/scarcity: thinning tiers escalate urgency overrides in middle and late rounds.");
  }
  if (c.wrEarlyModernEra > 0.08) {
    mods.push("2023+ modern era: WR-early override can supersede legacy RB-first habits.");
  }

  return mods.slice(0, 4);
}

export function buildOwnerDecisionProfile(soul: OwnerSoulProfile): OwnerDecisionProfile {
  const evidence = mineLedgerEvidence(soul.records);
  const ownWeight = soul.shrinkage?.ownWeight ?? 1;
  const coefficients = soul.coefficients;

  const eras = detectBehavioralEras({
    records: soul.records,
    coefficients,
    inverseTemperature: soul.inverseTemperature,
    avgChosenProbability: soul.avgChosenProbability,
  });

  const rules = buildRules({
    coefficients,
    evidence,
    inverseTemperature: soul.inverseTemperature,
    avgChosenProbability: soul.avgChosenProbability,
    ownWeight,
  });

  const exceptions = buildExceptions({
    coefficients,
    evidence,
    inverseTemperature: soul.inverseTemperature,
    avgChosenProbability: soul.avgChosenProbability,
    ownWeight,
  });

  const stability = exposedStability({
    coefficients,
    evidence,
    inverseTemperature: soul.inverseTemperature,
    avgChosenProbability: soul.avgChosenProbability,
    ownWeight,
    modernEraEarlyWrPct: eras.find((er) => er.seasonStart >= 2023)?.earlyWrPct,
    modernEraPickCount: eras.find((er) => er.seasonStart >= 2023)?.pickCount,
  });

  const overallStability = overallStabilityBand({
    traitConfidences: stability.slice(0, 4).map((s) => s.confidencePct),
    totalChoices: soul.choiceEventCount,
    personalityFitTier: soul.personalityFitTier,
    ownWeight,
  });

  let provisionalNote: string | undefined;
  if (soul.personalityFitTier === "shrinkage_cold" && soul.shrinkage) {
    const ownPct = Math.round(soul.shrinkage.ownWeight * 100);
    provisionalNote = `Thin history (${soul.choiceEventCount} picks): ~${ownPct}% of rules are own-signal; remainder inferred from league patterns. Marked provisional.`;
  }

  return {
    leagueId: soul.leagueId,
    profileOwnerKey: soul.profileOwnerKey,
    displayName: soul.displayName,
    personalityFitTier: soul.personalityFitTier,
    provisionalNote,
    rules,
    exceptions,
    ruleModifiers: buildRuleModifiers({ coefficients, eras }),
    eras,
    stability,
    overallStability,
    avgChosenProbability: soul.avgChosenProbability,
    choiceEventCount: soul.choiceEventCount,
    boardScopeNote: soul.boardScopeNote,
  };
}

export function buildAllDecisionProfiles(souls: OwnerSoulProfile[]): OwnerDecisionProfile[] {
  return souls.map((s) => ensureMinimumRules(buildOwnerDecisionProfile(s), s));
}

/** Ensure every owner has at least one rule from ledger if coef fit is sparse (cold owners). */
export function ensureMinimumRules(profile: OwnerDecisionProfile, soul: OwnerSoulProfile): OwnerDecisionProfile {
  if (profile.rules.length > 0) return profile;
  const evidence = mineLedgerEvidence(soul.records);
  return {
    ...profile,
    rules: [
      {
        ifThen: "Insufficient own-signal — default to league-average roster-fill behavior until more picks import.",
        drive: "need" as DriveName,
        evidence: evidenceForKey(evidence, "needFill"),
        confidencePct: Math.round((soul.shrinkage?.ownWeight ?? 0.1) * 100),
      },
    ],
  };
}

export { DRIVE_NAMES };
