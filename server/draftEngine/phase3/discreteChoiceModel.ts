/**
 * Phase 3 — multinomial logit (random utility) MLE for owner personality coefficients.
 */

import { DRIVE_NAMES, type DriveFeatures, type DriveName } from "./driveFeatures";

export type PersonalityCoefficients = Record<DriveName, number>;

export type FitMultinomialOptions = {
  /** L2 penalty per drive (pulls coefficients toward zero). */
  l2ByDrive?: Partial<Record<DriveName, number>>;
  /** Hard ceiling per drive after each update. */
  maxCoefByDrive?: Partial<Record<DriveName, number>>;
  /** Center these drives within each choice's alt set before fitting. */
  centerWithinChoice?: DriveName[];
};

/** Phase 4 soul fits — cap need so distinctive drives can register. */
export const SOUL_FIT_OPTIONS: FitMultinomialOptions = {
  l2ByDrive: {
    need: 2.5,
    value: 0.12,
    scarcityTierCliff: 0.12,
    herdFomo: 0.12,
    contrarian: 0.12,
    comfortAnchor: 0.12,
    panic: 0.12,
    rbEarlyRound: 0.1,
    wrEarlyRound: 0.1,
    rbEarlyLegacyEra: 0.1,
    wrEarlyModernEra: 0.1,
  },
  maxCoefByDrive: { need: 0.35 },
  centerWithinChoice: ["need"],
};

export interface PersonalityFitResult {
  coefficients: PersonalityCoefficients;
  inverseTemperature: number;
  logLikelihood: number;
  avgChosenProbability: number;
  choiceEventCount: number;
  boardScopeNote: string;
}

function utility(features: DriveFeatures, beta: PersonalityCoefficients): number {
  let u = 0;
  for (const d of DRIVE_NAMES) u += beta[d] * features[d];
  return u;
}

export function computeUtility(features: DriveFeatures, beta: PersonalityCoefficients): number {
  return utility(features, beta);
}

export function computeDriveContributions(
  features: DriveFeatures,
  beta: PersonalityCoefficients,
): Array<{ drive: DriveName; contribution: number }> {
  return DRIVE_NAMES.map((drive) => ({
    drive,
    contribution: beta[drive] * features[drive],
  })).sort((a, b) => b.contribution - a.contribution);
}

export function softmaxProbs(utils: number[]): number[] {
  return softmax(utils);
}

function softmax(utils: number[]): number[] {
  if (utils.length === 0) return [];
  const max = Math.max(...utils);
  const exps = utils.map((u) => Math.exp(u - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function zeroBeta(): PersonalityCoefficients {
  return Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as PersonalityCoefficients;
}

function l2Penalty(d: DriveName, beta: number, options?: FitMultinomialOptions): number {
  const lambda = options?.l2ByDrive?.[d] ?? 0;
  return lambda * beta;
}

function applyCoefCaps(beta: PersonalityCoefficients, options?: FitMultinomialOptions): void {
  if (!options?.maxCoefByDrive) return;
  for (const d of DRIVE_NAMES) {
    const cap = options.maxCoefByDrive[d];
    if (cap != null) beta[d] = Math.min(beta[d], cap);
  }
}

export function centerDrivesWithinChoices(
  events: Array<{
    chosenKey: string;
    alts: Array<{ key: string; features: DriveFeatures }>;
  }>,
  drives: DriveName[],
): typeof events {
  return events.map((ev) => {
    const alts = ev.alts.map((a) => ({ ...a, features: { ...a.features } }));
    for (const d of drives) {
      const mean = alts.reduce((s, a) => s + a.features[d], 0) / (alts.length || 1);
      for (const a of alts) a.features[d] -= mean;
    }
    return { ...ev, alts };
  });
}

export function fitMultinomialLogit(
  events: Array<{
    chosenKey: string;
    alts: Array<{ key: string; features: DriveFeatures }>;
  }>,
  maxIter = 400,
  options?: FitMultinomialOptions,
): PersonalityFitResult {
  const fitEvents = options?.centerWithinChoice?.length
    ? centerDrivesWithinChoices(events, options.centerWithinChoice)
    : events;

  const beta = zeroBeta();
  let invT = 1;

  for (let iter = 0; iter < maxIter; iter++) {
    const grad = zeroBeta();
    let gradT = 0;

    for (const ev of fitEvents) {
      const utils = ev.alts.map((a) => utility(a.features, beta) * invT);
      const probs = softmax(utils);
      const chosenIdx = ev.alts.findIndex((a) => a.key === ev.chosenKey);
      if (chosenIdx < 0) continue;

      for (let i = 0; i < ev.alts.length; i++) {
        const feat = ev.alts[i]!.features;
        for (const d of DRIVE_NAMES) {
          grad[d] += feat[d] * invT * (Number(i === chosenIdx) - probs[i]!);
        }
      }

      const uChosen = utility(ev.alts[chosenIdx]!.features, beta);
      let uBar = 0;
      for (let i = 0; i < ev.alts.length; i++) {
        uBar += probs[i]! * utility(ev.alts[i]!.features, beta);
      }
      gradT += uChosen - uBar;
    }

    const lr = 0.08 / (1 + iter * 0.01);
    for (const d of DRIVE_NAMES) {
      grad[d] -= l2Penalty(d, beta[d], options);
      beta[d] += (lr * grad[d]) / fitEvents.length;
    }
    applyCoefCaps(beta, options);
    invT = Math.max(0.3, Math.min(5, invT + (lr * gradT * 0.1) / fitEvents.length));
  }

  let ll = 0;
  let probSum = 0;
  for (const ev of fitEvents) {
    const utils = ev.alts.map((a) => utility(a.features, beta) * invT);
    const probs = softmax(utils);
    const chosenIdx = ev.alts.findIndex((a) => a.key === ev.chosenKey);
    if (chosenIdx >= 0) {
      ll += Math.log(Math.max(probs[chosenIdx]!, 1e-12));
      probSum += probs[chosenIdx]!;
    }
  }

  return {
    coefficients: beta,
    inverseTemperature: invT,
    logLikelihood: ll,
    avgChosenProbability: fitEvents.length ? probSum / fitEvents.length : 0,
    choiceEventCount: fitEvents.length,
    boardScopeNote:
      "Coefficients and choice probabilities computed against the real-but-partial league draft pool (~eventually-drafted players), not ESPN's full national board.",
  };
}
