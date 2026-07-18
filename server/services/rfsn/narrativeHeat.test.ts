/**
 * narrativeHeat + historicalTrigger unit coverage.
 */
import { describe, expect, it } from "vitest";
import { scoreNarrativeHeat } from "./narrativeHeat";
import { shouldOfferHistoricalContext, shouldTriggerHistoricalContext } from "./historicalTrigger";
import type { HistoricalContext } from "./historicalContext";

describe("narrativeHeat", () => {
  it("keeps championship / rivalry / player_connection in locked bands", () => {
    expect(scoreNarrativeHeat("championship", { titleCount: 1 })).toBeGreaterThanOrEqual(85);
    expect(scoreNarrativeHeat("championship", { titleCount: 5 })).toBeLessThanOrEqual(95);
    expect(scoreNarrativeHeat("rivalry", { rivalrySkew: 7, playoffEliminations: 3 })).toBeGreaterThanOrEqual(80);
    expect(scoreNarrativeHeat("player_connection", { connectionNotability: 0 })).toBeGreaterThanOrEqual(20);
    expect(scoreNarrativeHeat("player_connection", { connectionNotability: 1 })).toBeLessThanOrEqual(45);
  });
});

describe("historicalTrigger", () => {
  const hot: HistoricalContext = {
    fact: "x",
    evidence: [{ source: "s", ref: "r" }],
    confidence: 0.98,
    significance: 0.75,
    narrativeType: "championship",
    narrativeHeat: 90,
  };

  it("offers only when trigger + air rule pass", () => {
    expect(shouldTriggerHistoricalContext("routine")).toBe(false);
    expect(shouldOfferHistoricalContext(hot, "routine")).toBe(false);
    expect(shouldOfferHistoricalContext(hot, "major")).toBe(true);
    expect(shouldOfferHistoricalContext({ ...hot, narrativeHeat: 10 }, "major")).toBe(false);
  });
});
