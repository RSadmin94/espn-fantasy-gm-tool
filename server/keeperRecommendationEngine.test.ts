/**
 * keeperRecommendationEngine.test.ts
 *
 * Tests for the 2026 keeper recommendation engine.
 *
 * Philosophy under test:
 *   RECOMMENDATIONS = VALUE (round cost vs open-pool ADP) + ROSTER NEED
 *   DNA = PREDICT what each manager will actually do (behavior, biases, tendencies)
 *
 * Keeper eligibility rule:
 *   Players kept in 2 consecutive years are INELIGIBLE in 2026.
 *   Keeper round cost = kept round - 1 (one round cheaper than the round they were kept in).
 */
import { describe, it, expect } from "vitest";
import {
  buildKeeperRecommendations,
  type EligibleKeeper,
  type TeamEligibilityData,
} from "./keeperRecommendationEngine";
import type { ManagerDNA } from "./leagueDNA";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeEligibleKeeper(overrides: Partial<EligibleKeeper> = {}): EligibleKeeper {
  return {
    playerId: 1,
    playerName: "Test Player",
    position: "RB",
    round2025: 3,
    round2024: null,
    roundCost2026: 2,          // kept in round 3 → costs round 2
    consecutiveYears: 1,
    isIneligible: false,
    valueTier: "A",
    valueLabel: "Elite Value",
    ...overrides,
  };
}

function makeIneligibleKeeper(overrides: Partial<EligibleKeeper> = {}): EligibleKeeper {
  return makeEligibleKeeper({
    playerId: 99,
    playerName: "Ineligible Player",
    round2024: 3,
    consecutiveYears: 2,
    isIneligible: true,
    roundCost2026: null,
    ...overrides,
  });
}

function makeTeam(overrides: Partial<TeamEligibilityData> = {}): TeamEligibilityData {
  return {
    teamId: 1,
    teamName: "Team Alpha",
    players: [],
    ineligibleCount: 0,
    eligibleCount: 0,
    ...overrides,
  };
}

function makeManagerDNA(overrides: Partial<ManagerDNA> = {}): ManagerDNA {
  return {
    memberId: "m1",
    ownerName: "Alpha Owner",
    seasonsAnalyzed: 10,
    draft: {
      avgRoundByPosition: { QB: 7, RB: 3, WR: 3, TE: 5 },
      biasVsLeague: { RB: 0, WR: 0, QB: 0, TE: 0 },
      round1Distribution: { RB: 5, WR: 3 },
      keeperRate: 60,
      draftStyleBadge: "Balanced Drafter",
      reachPositions: [],
      valuePositions: [],
    },
    trade: {
      avgTradesPerSeason: 3,
      tradeFrequency: 20,
      desperation_triggers: 0,
      h2hVsRod: { wins: 5, losses: 5, winPct: 50 },
      lossTradeRatio: 1.0,
    },
    waiver: {
      avgAcquisitionsPerSeason: 20,
      waiverAggression: 29,
      injuryOverreactionCount: 0,
      rosterChurnRate: 80,
    },
    tilt: {
      tiltScore: 20,
      waiverTiltScore: 15,
      tiltSampleSeasons: 10,
      tiltLabel: "Steady",
    },
    gmArchetype: "Balanced Manager",
    exploitabilityScore: 15,
    exploitabilityLabel: "Market-Aware",
    exploitWindows: [],
    dnaSummary: "Balanced Manager — 10 seasons",
    ...overrides,
  };
}

// ─── Value score tests ────────────────────────────────────────────────────────

describe("keeperRecommendationEngine — value scoring", () => {
  it("gives high value score when round savings >= 5 (exceptional deal)", () => {
    // RB open-pool ADP = round 3; keeping at round 1 would cost round 1 (savings = 2)
    // To get savings >= 5 we need roundCost = ADP - 5 = 3 - 5 = -2 (impossible for RB)
    // Use QB: ADP round 6; keeping at round 1 → savings = 5
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 1, playerName: "Elite QB", position: "QB", roundCost2026: 1 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt.valueScore).toBeGreaterThanOrEqual(90); // savings = 6-1 = 5 → score 95
    expect(opt.roundSavings).toBe(5); // QB ADP round 6, cost 1 → savings 5
  });

  it("gives moderate value score when savings = 2 (good value)", () => {
    // WR ADP = round 3; keeping at round 1 → savings = 2
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 2, playerName: "Good WR", position: "WR", roundCost2026: 1 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt.roundSavings).toBe(2); // WR ADP 3, cost 1
    expect(opt.valueScore).toBeGreaterThanOrEqual(60);
    expect(opt.valueScore).toBeLessThan(80);
  });

  it("gives low value score when round cost equals ADP (break-even)", () => {
    // RB ADP = round 3; keeping at round 3 → savings = 0
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 3, playerName: "Break-even RB", position: "RB", roundCost2026: 3 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt.roundSavings).toBe(0);
    expect(opt.valueScore).toBeLessThanOrEqual(35);
  });

  it("gives poor value score when round cost exceeds ADP (overpaying)", () => {
    // RB ADP = round 3; keeping at round 5 → savings = -2
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 4, playerName: "Overpriced RB", position: "RB", roundCost2026: 5 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt.roundSavings).toBe(-2);
    expect(opt.valueScore).toBeLessThan(20);
  });

  it("correctly computes roundSavings = estimatedAdpRound - roundCost2026", () => {
    // TE ADP = round 5; keeping at round 3 → savings = 2
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 5, playerName: "Value TE", position: "TE", roundCost2026: 3 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt.estimatedAdpRound).toBe(5); // TE ADP
    expect(opt.roundSavings).toBe(2);
  });
});

// ─── Need score tests ─────────────────────────────────────────────────────────

describe("keeperRecommendationEngine — need scoring", () => {
  it("gives high need score for RB when team is losing RBs to the pool", () => {
    const ineligibleRB = makeIneligibleKeeper({ position: "RB" });
    const eligibleRB = makeEligibleKeeper({ playerId: 10, playerName: "Keepable RB", position: "RB", roundCost2026: 2 });
    const team = makeTeam({
      players: [ineligibleRB, eligibleRB],
      ineligibleCount: 1,
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    // Base RB need = 65, + 15 for losing 1 RB → 80
    expect(opt.needScore).toBeGreaterThanOrEqual(75);
    expect(opt.needReasoning).toContain("RB");
  });

  it("gives low need score for K (kicker — always abundant)", () => {
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 11, playerName: "Kicker", position: "K", roundCost2026: 13 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt.needScore).toBeLessThanOrEqual(20);
  });

  it("penalizes need score when team already has multiple eligible keepers at the same position", () => {
    // 3 eligible RBs → coverage penalty kicks in
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 20, playerName: "RB1", position: "RB", roundCost2026: 2 }),
        makeEligibleKeeper({ playerId: 21, playerName: "RB2", position: "RB", roundCost2026: 3 }),
        makeEligibleKeeper({ playerId: 22, playerName: "RB3", position: "RB", roundCost2026: 4 }),
      ],
      eligibleCount: 3,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    // All options are RBs; need score should be lower due to coverage penalty
    const needScores = result!.allOptions.map(o => o.needScore);
    // With 3 eligible RBs, coverage penalty = (3-1)*20 = 40; base 65 - 40 = 25
    expect(Math.min(...needScores)).toBeLessThan(40);
  });

  it("gives moderate need for QB (not scarce but not abundant)", () => {
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 30, playerName: "QB1", position: "QB", roundCost2026: 5 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt.needScore).toBeGreaterThanOrEqual(40);
    expect(opt.needScore).toBeLessThanOrEqual(70);
  });
});

// ─── Composite score and ranking tests ───────────────────────────────────────

describe("keeperRecommendationEngine — composite score and ranking", () => {
  it("composite score = 60% value + 40% need, rounded", () => {
    // QB at round 1: savings = 5 → valueScore = 95
    // QB need: base 50, no ineligibles, 1 eligible → needScore = 50
    // composite = round(95*0.6 + 50*0.4) = round(57 + 20) = 77
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 40, playerName: "QB Star", position: "QB", roundCost2026: 1 }),
      ],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    const expected = Math.round(opt.valueScore * 0.6 + opt.needScore * 0.4);
    expect(opt.score).toBe(expected);
  });

  it("primaryRecommendation is the highest-scoring option", () => {
    // QB at round 1 (savings=5) vs K at round 13 (savings=1)
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 50, playerName: "QB Star", position: "QB", roundCost2026: 1 }),
        makeEligibleKeeper({ playerId: 51, playerName: "Kicker", position: "K", roundCost2026: 13 }),
      ],
      eligibleCount: 2,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.primaryRecommendation?.playerName).toBe("QB Star");
  });

  it("alternativeOption is set when second option is within 15 points of primary", () => {
    // Two similar WRs: both at round 1 (savings=2 each)
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 60, playerName: "WR1", position: "WR", roundCost2026: 1 }),
        makeEligibleKeeper({ playerId: 61, playerName: "WR2", position: "WR", roundCost2026: 2 }),
      ],
      eligibleCount: 2,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    // Both WRs should be close in score — alternative should be set
    expect(result!.alternativeOption).not.toBeNull();
  });

  it("alternativeOption is null when second option is more than 15 points below primary", () => {
    // QB at round 1 (high score) vs K at round 13 (very low score)
    const team = makeTeam({
      players: [
        makeEligibleKeeper({ playerId: 70, playerName: "QB Star", position: "QB", roundCost2026: 1 }),
        makeEligibleKeeper({ playerId: 71, playerName: "Kicker", position: "K", roundCost2026: 13 }),
      ],
      eligibleCount: 2,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.alternativeOption).toBeNull();
  });
});

// ─── Ineligible player handling ───────────────────────────────────────────────

describe("keeperRecommendationEngine — ineligible players", () => {
  it("excludes ineligible players from allOptions", () => {
    const ineligible = makeIneligibleKeeper({ playerId: 80, playerName: "Locked Out" });
    const eligible = makeEligibleKeeper({ playerId: 81, playerName: "Keepable" });
    const team = makeTeam({
      players: [ineligible, eligible],
      ineligibleCount: 1,
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.allOptions).toHaveLength(1);
    expect(result!.allOptions[0]!.playerName).toBe("Keepable");
  });

  it("populates ineligiblePlayers array with players that have isIneligible=true", () => {
    const ineligible1 = makeIneligibleKeeper({ playerId: 90, playerName: "Ineligible A" });
    const ineligible2 = makeIneligibleKeeper({ playerId: 91, playerName: "Ineligible B" });
    const team = makeTeam({
      players: [ineligible1, ineligible2],
      ineligibleCount: 2,
      eligibleCount: 0,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.ineligiblePlayers).toHaveLength(2);
    expect(result!.ineligiblePlayers.map(p => p.playerName)).toContain("Ineligible A");
    expect(result!.ineligiblePlayers.map(p => p.playerName)).toContain("Ineligible B");
  });

  it("sets primaryRecommendation to null when all players are ineligible", () => {
    const team = makeTeam({
      players: [makeIneligibleKeeper()],
      ineligibleCount: 1,
      eligibleCount: 0,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.primaryRecommendation).toBeNull();
    expect(result!.allOptions).toHaveLength(0);
  });

  it("draftStrategyNote mentions returning players when all keepers are ineligible", () => {
    const team = makeTeam({
      players: [makeIneligibleKeeper({ playerName: "Star RB", position: "RB" })],
      ineligibleCount: 1,
      eligibleCount: 0,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.draftStrategyNote).toContain("pool");
  });
});

// ─── Risk assessment ──────────────────────────────────────────────────────────

describe("keeperRecommendationEngine — risk assessment", () => {
  it("assigns high risk to RB kept at round 2 or earlier (injury risk)", () => {
    const team = makeTeam({
      players: [makeEligibleKeeper({ position: "RB", roundCost2026: 2 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.allOptions[0]!.risk).toBe("high");
  });

  it("assigns medium risk to RB kept at rounds 3-4", () => {
    const team = makeTeam({
      players: [makeEligibleKeeper({ position: "RB", roundCost2026: 3 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.allOptions[0]!.risk).toBe("medium");
  });

  it("assigns low risk when round savings >= 4 (large value cushion)", () => {
    // QB at round 2: savings = 6-2 = 4 → low risk
    const team = makeTeam({
      players: [makeEligibleKeeper({ position: "QB", roundCost2026: 2 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.allOptions[0]!.risk).toBe("low");
  });

  it("assigns low risk to late-round RB (round 5+) even if past ADP", () => {
    // RB assessRisk logic: roundCost <= 2 → high, <= 4 → medium, else → low
    // RB at round 6: falls into the 'else' branch → low risk (late-round RB)
    const team = makeTeam({
      players: [makeEligibleKeeper({ position: "RB", roundCost2026: 6 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    // RB risk is purely position-based: round 5+ → 'low' (late-round RB keeper — low downside)
    expect(result!.allOptions[0]!.risk).toBe("low");
  });

  it("assigns high risk when non-RB round cost exceeds ADP (negative savings)", () => {
    // WR at round 6: ADP = 3, savings = 3-6 = -3 → negative savings → high risk
    const team = makeTeam({
      players: [makeEligibleKeeper({ position: "WR", roundCost2026: 6 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.allOptions[0]!.risk).toBe("high");
  });
});

// ─── DNA behavior prediction ──────────────────────────────────────────────────

describe("keeperRecommendationEngine — DNA behavior prediction", () => {
  it("returns unknown prediction when no DNA profile is available", () => {
    const team = makeTeam({
      players: [makeEligibleKeeper()],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.dnaPrediction.gmArchetype).toBe("Unknown");
    expect(result!.dnaPrediction.keeperBehavior).toContain("unavailable");
  });

  it("includes gmArchetype from DNA profile in dnaPrediction", () => {
    const dna = makeManagerDNA({ ownerName: "Alpha Owner", gmArchetype: "Trade Shark" });
    const team = makeTeam({
      teamName: "Alpha Owner Team",
      players: [makeEligibleKeeper()],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [dna], null);
    expect(result!.dnaPrediction.gmArchetype).toBe("Trade Shark");
  });

  it("generates tilt-based exploitability note for high tilt score", () => {
    const dna = makeManagerDNA({
      ownerName: "Tilter",
      tilt: {
        tiltScore: 80,
        waiverTiltScore: 60,
        tiltSampleSeasons: 8,
        tiltLabel: "High Tilt Risk",
      },
    });
    const team = makeTeam({
      teamName: "Tilter Team",
      players: [makeEligibleKeeper()],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [dna], null);
    expect(result!.dnaPrediction.exploitabilityNote).toContain("80");
    expect(result!.dnaPrediction.exploitabilityNote.toLowerCase()).toContain("exploit");
  });

  it("generates low tilt note for composed manager (tiltScore <= 40)", () => {
    const dna = makeManagerDNA({
      ownerName: "Composed",
      tilt: {
        tiltScore: 15,
        waiverTiltScore: 10,
        tiltSampleSeasons: 8,
        tiltLabel: "Ice Cold",
      },
    });
    const team = makeTeam({
      teamName: "Composed Team",
      players: [makeEligibleKeeper()],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [dna], null);
    expect(result!.dnaPrediction.exploitabilityNote.toLowerCase()).toContain("low");
  });

  it("adds bias warning for high loss-trade ratio", () => {
    const dna = makeManagerDNA({
      ownerName: "Panic Trader",
      trade: {
        avgTradesPerSeason: 8,
        tradeFrequency: 53,
        desperation_triggers: 2,
        h2hVsRod: { wins: 3, losses: 7, winPct: 30 },
        lossTradeRatio: 1.8,
      },
    });
    const team = makeTeam({
      teamName: "Panic Trader Team",
      players: [makeEligibleKeeper()],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [dna], null);
    const warnings = result!.dnaPrediction.biasWarnings;
    expect(warnings.some(w => w.toLowerCase().includes("loss-trade"))).toBe(true);
  });

  it("adds desperation warning when DNA has known desperation triggers", () => {
    const dna = makeManagerDNA({
      ownerName: "Desperate",
      trade: {
        avgTradesPerSeason: 6,
        tradeFrequency: 40,
        desperation_triggers: 3,
        h2hVsRod: { wins: 4, losses: 6, winPct: 40 },
        lossTradeRatio: 1.2,
      },
    });
    const team = makeTeam({
      teamName: "Desperate Team",
      players: [makeEligibleKeeper()],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [dna], null);
    const warnings = result!.dnaPrediction.biasWarnings;
    expect(warnings.some(w => w.toLowerCase().includes("desperation"))).toBe(true);
  });
});

// ─── Output shape tests ───────────────────────────────────────────────────────

describe("keeperRecommendationEngine — output shape", () => {
  it("returns one result per team in eligibilityData", () => {
    const teams = [
      makeTeam({ teamId: 1, teamName: "Team A", players: [makeEligibleKeeper({ playerId: 1 })], eligibleCount: 1 }),
      makeTeam({ teamId: 2, teamName: "Team B", players: [makeEligibleKeeper({ playerId: 2 })], eligibleCount: 1 }),
      makeTeam({ teamId: 3, teamName: "Team C", players: [], eligibleCount: 0 }),
    ];
    const results = buildKeeperRecommendations(teams, [], null);
    expect(results).toHaveLength(3);
  });

  it("each result has required fields: teamId, teamName, ownerName, allOptions, ineligiblePlayers, dnaPrediction, draftStrategyNote", () => {
    const team = makeTeam({ players: [makeEligibleKeeper()], eligibleCount: 1 });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result).toHaveProperty("teamId");
    expect(result).toHaveProperty("teamName");
    expect(result).toHaveProperty("ownerName");
    expect(result).toHaveProperty("allOptions");
    expect(result).toHaveProperty("ineligiblePlayers");
    expect(result).toHaveProperty("dnaPrediction");
    expect(result).toHaveProperty("draftStrategyNote");
    expect(result).toHaveProperty("primaryRecommendation");
    expect(result).toHaveProperty("alternativeOption");
  });

  it("each KeeperOption has all required fields", () => {
    const team = makeTeam({
      players: [makeEligibleKeeper({ playerId: 100, playerName: "Star RB", position: "RB", roundCost2026: 2 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    const opt = result!.allOptions[0]!;
    expect(opt).toHaveProperty("playerId");
    expect(opt).toHaveProperty("playerName");
    expect(opt).toHaveProperty("position");
    expect(opt).toHaveProperty("roundCost2026");
    expect(opt).toHaveProperty("estimatedAdpRound");
    expect(opt).toHaveProperty("roundSavings");
    expect(opt).toHaveProperty("score");
    expect(opt).toHaveProperty("valueScore");
    expect(opt).toHaveProperty("needScore");
    expect(opt).toHaveProperty("valueTier");
    expect(opt).toHaveProperty("valueLabel");
    expect(opt).toHaveProperty("valueReasoning");
    expect(opt).toHaveProperty("needReasoning");
    expect(opt).toHaveProperty("risk");
    expect(opt).toHaveProperty("riskNote");
  });

  it("handles empty team list gracefully", () => {
    const results = buildKeeperRecommendations([], [], null);
    expect(results).toEqual([]);
  });

  it("handles team with no players gracefully", () => {
    const team = makeTeam({ players: [], eligibleCount: 0 });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.allOptions).toHaveLength(0);
    expect(result!.primaryRecommendation).toBeNull();
    expect(result!.ineligiblePlayers).toHaveLength(0);
  });

  it("draftStrategyNote mentions keeper player name and round when primary recommendation exists", () => {
    const team = makeTeam({
      players: [makeEligibleKeeper({ playerName: "Derrick Henry", position: "RB", roundCost2026: 2 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.draftStrategyNote).toContain("Derrick Henry");
    expect(result!.draftStrategyNote).toContain("2");
  });
});

// ─── Position ADP constants ───────────────────────────────────────────────────

describe("keeperRecommendationEngine — position ADP constants", () => {
  const adpExpectations: Array<[string, number]> = [
    ["QB", 6],
    ["RB", 3],
    ["WR", 3],
    ["TE", 5],
    ["K", 14],
    ["DEF", 13],
  ];

  for (const [pos, expectedAdp] of adpExpectations) {
    it(`estimatedAdpRound for ${pos} = ${expectedAdp}`, () => {
      const team = makeTeam({
        players: [makeEligibleKeeper({ position: pos, roundCost2026: 1 })],
        eligibleCount: 1,
      });
      const [result] = buildKeeperRecommendations([team], [], null);
      expect(result!.allOptions[0]!.estimatedAdpRound).toBe(expectedAdp);
    });
  }

  it("unknown position defaults to ADP round 7", () => {
    const team = makeTeam({
      players: [makeEligibleKeeper({ position: "FLEX", roundCost2026: 1 })],
      eligibleCount: 1,
    });
    const [result] = buildKeeperRecommendations([team], [], null);
    expect(result!.allOptions[0]!.estimatedAdpRound).toBe(7);
  });
});
