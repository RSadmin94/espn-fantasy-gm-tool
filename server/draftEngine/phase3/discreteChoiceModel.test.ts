import { describe, expect, it } from "vitest";
import { fitMultinomialLogit } from "./discreteChoiceModel";
import { DRIVE_NAMES, type DriveFeatures } from "./driveFeatures";

function feat(partial: Partial<DriveFeatures>): DriveFeatures {
  const base = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as DriveFeatures;
  return { ...base, ...partial };
}

describe("fitMultinomialLogit", () => {
  it("learns positive value weight when high-value alts are chosen", () => {
    const events = Array.from({ length: 30 }, () => ({
      chosenKey: "a",
      alts: [
        { key: "a", features: feat({ value: 0.9 }) },
        { key: "b", features: feat({ value: 0.2 }) },
      ],
    }));
    const fit = fitMultinomialLogit(events, 300);
    expect(fit.coefficients.value).toBeGreaterThan(0.1);
    expect(fit.avgChosenProbability).toBeGreaterThan(0.5);
  });
});
