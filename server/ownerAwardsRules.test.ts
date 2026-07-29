import { describe, expect, it } from "vitest";
import {
  canAwardWorstDrafter,
  isGraveyardLegendEligible,
  isOneYearWonderEligible,
  ownerAwardNameKeyTie,
} from "./ownerAwardsRules";

describe("ownerAwardsRules", () => {
  it("blocks Worst Drafter when same ownerKey as Best", () => {
    expect(canAwardWorstDrafter("guid:a", "guid:a")).toBe(false);
    expect(canAwardWorstDrafter("guid:a", "guid:b")).toBe(true);
  });

  it("requires games for One-Year Wonder", () => {
    expect(isOneYearWonderEligible(0, 0, 0)).toBe(false);
    expect(isOneYearWonderEligible(8, 5, 0)).toBe(true);
  });

  it("requires positive PF for Graveyard Legend", () => {
    expect(isGraveyardLegendEligible(0)).toBe(false);
    expect(isGraveyardLegendEligible(1200.5)).toBe(true);
  });

  it("tie-breaks deterministically by name then key", () => {
    const a = { ownerName: "Alex", ownerKey: "guid:z" };
    const b = { ownerName: "Alex", ownerKey: "guid:a" };
    expect(ownerAwardNameKeyTie(a, b)).toBeGreaterThan(0);
    expect(ownerAwardNameKeyTie(b, a)).toBeLessThan(0);
  });
});
