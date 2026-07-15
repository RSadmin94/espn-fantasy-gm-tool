import { describe, expect, it } from "vitest";
import { DRIVE_NAMES, type DriveFeatures } from "../phase3/driveFeatures";
import { fitMultinomialLogit, SOUL_FIT_OPTIONS } from "../phase3/discreteChoiceModel";
import {
  archetypeFromDeviation,
  deviationFromLeague,
  distinctiveDriveRankings,
} from "./personalityDeviations";

function feat(partial: Partial<DriveFeatures>): DriveFeatures {
  const base = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as DriveFeatures;
  return { ...base, ...partial };
}

describe("SOUL_FIT_OPTIONS", () => {
  it("caps need coefficient when need feature is always high", () => {
    const events = Array.from({ length: 40 }, () => ({
      chosenKey: "a",
      alts: [
        { key: "a", features: feat({ need: 0.9, comfortAnchor: 1 }) },
        { key: "b", features: feat({ need: 0.2, comfortAnchor: 0 }) },
      ],
    }));
    const raw = fitMultinomialLogit(events, 300);
    const tuned = fitMultinomialLogit(events, 300, SOUL_FIT_OPTIONS);
    expect(raw.coefficients.need).toBeGreaterThan(0.5);
    expect(tuned.coefficients.need).toBeLessThanOrEqual(0.35);
    expect(tuned.coefficients.comfortAnchor).toBeGreaterThan(raw.coefficients.comfortAnchor * 0.5);
  });
});

describe("deviationFromLeague", () => {
  it("ranks distinctive drives above table-stakes need", () => {
    const league = Object.fromEntries(DRIVE_NAMES.map((d) => [d, d === "need" ? 0.7 : 0])) as never;
    const owner = { ...league, comfortAnchor: 0.45, need: 0.72 };
    const dev = deviationFromLeague(owner, league);
    const top = distinctiveDriveRankings(dev, { topN: 1 })[0]!;
    expect(top.drive).toBe("comfortAnchor");
  });

  it("assigns archetypes from gaps not raw need", () => {
    const dev = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as never;
    dev.wrEarlyModernEra = 0.2;
    dev.wrEarlyRound = 0.15;
    expect(archetypeFromDeviation(dev)).toBe("Modern WR-Forward");
  });
});
