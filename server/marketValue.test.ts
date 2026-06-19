import { describe, expect, it } from "vitest";
import {
  computeMarketValues,
  getValuationPhase,
  PHASE_WEIGHTS,
  type MarketValueInput,
} from "./marketValue";

// Minimal input builder (only override what a test cares about).
function mk(over: Partial<MarketValueInput> & { playerId: number; position: string }): MarketValueInput {
  return {
    adpRank: null,
    projection: null,
    keeperRoundSavings: null,
    percentStarted: null,
    currentSeasonWeekly: [],
    history: [],
    currentSeason: 2026,
    ...over,
  };
}

describe("getValuationPhase", () => {
  it("maps played weeks to the approved phases", () => {
    expect(getValuationPhase(0)).toBe("preseason");
    expect(getValuationPhase(-1)).toBe("preseason");
    expect(getValuationPhase(1)).toBe("weeks1to4");
    expect(getValuationPhase(4)).toBe("weeks1to4");
    expect(getValuationPhase(5)).toBe("weeks5to8");
    expect(getValuationPhase(8)).toBe("weeks5to8");
    expect(getValuationPhase(9)).toBe("week9plus");
    expect(getValuationPhase(17)).toBe("week9plus");
  });
});

describe("approved weighting model", () => {
  it("each phase's weighted components sum to 100", () => {
    for (const phase of Object.keys(PHASE_WEIGHTS) as (keyof typeof PHASE_WEIGHTS)[]) {
      const w = PHASE_WEIGHTS[phase];
      const sum = w.adp + w.projection + w.production + w.historical + w.keeper + w.trend;
      expect(sum).toBe(100);
    }
  });
  it("market confidence is unweighted in v2.0 across all phases", () => {
    for (const phase of Object.keys(PHASE_WEIGHTS) as (keyof typeof PHASE_WEIGHTS)[]) {
      expect(PHASE_WEIGHTS[phase].marketConfidence).toBe(0);
    }
  });
});

describe("preseason valuation (the headline fix)", () => {
  const cohort: MarketValueInput[] = [
    mk({ playerId: 1, position: "RB", adpRank: 1, projection: 300, history: [{ season: 2025, avg: 22, stdev: 6, weeks: 17 }] }),
    mk({ playerId: 2, position: "RB", adpRank: 60, projection: 180, history: [{ season: 2025, avg: 11, stdev: 5, weeks: 16 }] }),
    mk({ playerId: 3, position: "RB", adpRank: 120, projection: 120, history: [{ season: 2025, avg: 7, stdev: 4, weeks: 12 }] }),
  ];

  it("no elite player collapses to zero (vs old avgPoints engine)", () => {
    const mv = computeMarketValues(cohort, { playedWeeks: 0 });
    for (const r of mv.values()) expect(r.value).toBeGreaterThan(0);
    expect(mv.get(1)!.phase).toBe("preseason");
  });

  it("ranks by ADP + projection (best ADP wins preseason)", () => {
    const mv = computeMarketValues(cohort, { playedWeeks: 0 });
    expect(mv.get(1)!.value).toBeGreaterThan(mv.get(2)!.value);
    expect(mv.get(2)!.value).toBeGreaterThan(mv.get(3)!.value);
  });
});

describe("cross-position ADP anchoring", () => {
  it("a top kicker (worst global ADP) does not outrank a top RB", () => {
    const cohort: MarketValueInput[] = [
      mk({ playerId: 10, position: "RB", adpRank: 3, projection: 290 }),
      mk({ playerId: 11, position: "RB", adpRank: 40, projection: 200 }),
      // Only kicker in its group -> would be position-#1 (100) on within-pos components,
      // but its global ADP of 175 must keep it below the elite RB.
      mk({ playerId: 20, position: "K", adpRank: 175, projection: 140 }),
    ];
    const mv = computeMarketValues(cohort, { playedWeeks: 0 });
    expect(mv.get(10)!.value).toBeGreaterThan(mv.get(20)!.value);
  });
});

describe("phase switching: production dominates late season", () => {
  it("in week 9+, a high-production low-ADP player beats an elite-ADP underperformer", () => {
    const breakout = mk({
      playerId: 100, position: "WR", adpRank: 90, projection: 150,
      currentSeasonWeekly: [18, 20, 22, 19, 24, 21, 23, 20, 25, 22],
    });
    const bust = mk({
      playerId: 101, position: "WR", adpRank: 4, projection: 280,
      currentSeasonWeekly: [6, 5, 7, 4, 8, 5, 6, 7, 5, 6],
    });
    const mv = computeMarketValues([breakout, bust], { playedWeeks: 10 });
    expect(mv.get(100)!.phase).toBe("week9plus");
    expect(mv.get(100)!.value).toBeGreaterThan(mv.get(101)!.value);
  });

  it("the same two players: elite-ADP player still leads in the preseason", () => {
    const breakout = mk({ playerId: 100, position: "WR", adpRank: 90, projection: 150 });
    const bust = mk({ playerId: 101, position: "WR", adpRank: 4, projection: 280 });
    const mv = computeMarketValues([breakout, bust], { playedWeeks: 0 });
    expect(mv.get(101)!.value).toBeGreaterThan(mv.get(100)!.value);
  });
});

describe("graceful degradation", () => {
  it("a player with only ADP still gets a sensible non-zero value", () => {
    const cohort: MarketValueInput[] = [
      mk({ playerId: 1, position: "RB", adpRank: 5 }),
      mk({ playerId: 2, position: "RB", adpRank: 80 }),
    ];
    const mv = computeMarketValues(cohort, { playedWeeks: 0 });
    expect(mv.get(1)!.value).toBeGreaterThan(0);
    // With only ADP present, ADP carries 100% of effective weight.
    expect(mv.get(1)!.effectiveWeights.adp).toBe(100);
    expect(mv.get(1)!.value).toBeGreaterThan(mv.get(2)!.value);
  });

  it("a player with no usable signal falls back to a neutral midpoint, not zero", () => {
    const cohort: MarketValueInput[] = [mk({ playerId: 99, position: "TE" })];
    const mv = computeMarketValues(cohort, { playedWeeks: 0 });
    expect(mv.get(99)!.value).toBe(50);
  });
});
