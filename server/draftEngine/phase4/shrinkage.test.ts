import { describe, expect, it } from "vitest";
import { hierarchicalShrink, averageCoefficients, blendCoefficients } from "./shrinkage";
import { DRIVE_NAMES } from "../phase3/driveFeatures";
import type { PersonalityCoefficients, PersonalityFitResult } from "../phase3/discreteChoiceModel";

function coefs(partial: Partial<PersonalityCoefficients>): PersonalityCoefficients {
  const base = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as PersonalityCoefficients;
  return { ...base, ...partial };
}

describe("hierarchicalShrink", () => {
  it("pulls thin-history owner toward cluster prior", () => {
    const rawFit: PersonalityFitResult = {
      coefficients: coefs({ rbEarlyRound: 0.8 }),
      inverseTemperature: 1,
      logLikelihood: 0,
      avgChosenProbability: 0.05,
      choiceEventCount: 30,
      boardScopeNote: "test",
    };
    const clusterMean = coefs({ need: 0.5 });
    const leagueMean = coefs({ need: 0.3 });
    const shrunk = hierarchicalShrink({ rawFit, clusterMean, leagueMean, k: 100 });
    expect(shrunk.ownWeight).toBeLessThan(0.3);
    expect(shrunk.coefficients.need).toBeGreaterThan(rawFit.coefficients.need);
  });
});

describe("averageCoefficients", () => {
  it("averages drive weights", () => {
    const avg = averageCoefficients([coefs({ need: 0.4 }), coefs({ need: 0.6 })]);
    expect(avg.need).toBeCloseTo(0.5);
  });
});
