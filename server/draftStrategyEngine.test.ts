/**
 * draftStrategyEngine.test.ts
 *
 * Tests for the 2026 draft strategy engine.
 *
 * Coverage:
 *   - buildLeagueDraftBoard output shape
 *   - lockedRounds / freeRounds per team
 *   - positionalGaps after keeper decision
 *   - positionalScarcity calculation
 *   - returningPool value tiers (elite/high/medium/low)
 *   - draftDayTips generation
 *   - draftThreat levels
 *   - teamStrategies sorted by pickNumber
 */
import { describe, it, expect } from "vitest";
import {
  buildLeagueDraftBoard,
  type DraftOrderEntry,
  type ReturningPlayer,
} from "./draftStrategyEngine";
import type { ManagerDNA } from "./leagueDNA";
import type { TeamKeeperRecommendation } from "./keeperRecommendationEngine";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDraftEntry(overrides: Partial<DraftOrderEntry> = {}): DraftOrderEntry {
  return {
    teamId: 1,
    teamName: "Team Alpha",
    ownerName: "Alpha Owner",
    pickNumber: 1,
    ...overrides,
  };
}

function makeKeeperRec(overrides: Partial<TeamKeeperRecommendation> = {}): TeamKeeperRecommendation {
  return {
    teamId: 1,
    teamName: "Team Alpha",
    ownerName: "Alpha Owner",
    primaryRecommendation: {
      playerId: 1,
      playerName: "Star RB",
      position: "RB",
      roundCost2026: 2,
      estimatedAdpRound: 3,
      roundSavings: 1,
      score: 75,
      valueScore: 80,
      needScore: 65,
      valueTier: "A",
      valueLabel: "Elite Value",
      valueReasoning: "Good value",
      needReasoning: "RB need",
      risk: "medium",
      riskNote: "Solid",
    },
    alternativeOption: null,
    allOptions: [],
    ineligiblePlayers: [],
    draftStrategyNote: "Keep Star RB at round 2",
    dnaPrediction: {
      keeperBehavior: "Will keep RB",
      draftBehavior: "Low trade frequency",
      biasWarnings: [],
      exploitabilityNote: "Low tilt",
      gmArchetype: "Balanced Manager",
    },
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
      biasVsLeague: { RB: 0.5, WR: 0.2, QB: -0.5, TE: 0.1 },
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

function makeReturningPlayer(overrides: Partial<ReturningPlayer> = {}): ReturningPlayer {
  return {
    playerName: "Returning Star",
    teamName: "Team Alpha",
    position: "RB",
    round2025: 2,
    ...overrides,
  };
}

// ─── Output shape ─────────────────────────────────────────────────────────────

describe("buildLeagueDraftBoard — output shape", () => {
  it("returns a LeagueDraftBoard with required top-level fields", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],
      [makeManagerDNA()],
      [],
    );
    expect(result).toHaveProperty("season", 2026);
    expect(result).toHaveProperty("totalRounds");
    expect(result).toHaveProperty("returningPool");
    expect(result).toHaveProperty("teamStrategies");
    expect(result).toHaveProperty("positionalScarcity");
    expect(result).toHaveProperty("draftDayTips");
  });

  it("totalRounds is 15", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],
      [makeManagerDNA()],
      [],
    );
    expect(result.totalRounds).toBe(15);
  });

  it("returns one teamStrategy per team in draftOrder", () => {
    const draftOrder = [
      makeDraftEntry({ teamId: 1, teamName: "Team A", pickNumber: 1 }),
      makeDraftEntry({ teamId: 2, teamName: "Team B", pickNumber: 2 }),
      makeDraftEntry({ teamId: 3, teamName: "Team C", pickNumber: 3 }),
    ];
    const result = buildLeagueDraftBoard(draftOrder, [], [], []);
    expect(result.teamStrategies).toHaveLength(3);
  });

  it("teamStrategies are sorted by pickNumber ascending", () => {
    const draftOrder = [
      makeDraftEntry({ teamId: 3, teamName: "Team C", pickNumber: 3 }),
      makeDraftEntry({ teamId: 1, teamName: "Team A", pickNumber: 1 }),
      makeDraftEntry({ teamId: 2, teamName: "Team B", pickNumber: 2 }),
    ];
    const result = buildLeagueDraftBoard(draftOrder, [], [], []);
    const picks = result.teamStrategies.map(t => t.pickNumber);
    expect(picks).toEqual([1, 2, 3]);
  });

  it("each TeamDraftStrategy has all required fields", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],
      [makeManagerDNA()],
      [],
    );
    const strategy = result.teamStrategies[0]!;
    expect(strategy).toHaveProperty("teamId");
    expect(strategy).toHaveProperty("teamName");
    expect(strategy).toHaveProperty("ownerName");
    expect(strategy).toHaveProperty("pickNumber");
    expect(strategy).toHaveProperty("gmArchetype");
    expect(strategy).toHaveProperty("lockedRounds");
    expect(strategy).toHaveProperty("freeRounds");
    expect(strategy).toHaveProperty("positionalGaps");
    expect(strategy).toHaveProperty("predictedTargets");
    expect(strategy).toHaveProperty("exploitOpportunity");
    expect(strategy).toHaveProperty("strategyBrief");
    expect(strategy).toHaveProperty("draftThreat");
  });
});

// ─── Locked rounds / free rounds ─────────────────────────────────────────────

describe("buildLeagueDraftBoard — lockedRounds and freeRounds", () => {
  it("lockedRounds contains the keeper's roundCost2026 when primary recommendation exists", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],  // roundCost2026 = 2
      [makeManagerDNA()],
      [],
    );
    expect(result.teamStrategies[0]!.lockedRounds).toContain(2);
  });

  it("lockedRounds is empty when team has no keeper recommendation", () => {
    const noKeeperRec = makeKeeperRec({ primaryRecommendation: null });
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [noKeeperRec],
      [makeManagerDNA()],
      [],
    );
    expect(result.teamStrategies[0]!.lockedRounds).toHaveLength(0);
  });

  it("freeRounds = all 15 rounds minus lockedRounds", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],  // round 2 locked
      [makeManagerDNA()],
      [],
    );
    const strategy = result.teamStrategies[0]!;
    expect(strategy.freeRounds).toHaveLength(14); // 15 - 1 locked
    expect(strategy.freeRounds).not.toContain(2);
    expect(strategy.freeRounds).toContain(1);
    expect(strategy.freeRounds).toContain(3);
  });

  it("freeRounds contains all 15 rounds when no keeper is locked", () => {
    const noKeeperRec = makeKeeperRec({ primaryRecommendation: null });
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [noKeeperRec],
      [makeManagerDNA()],
      [],
    );
    expect(result.teamStrategies[0]!.freeRounds).toHaveLength(15);
  });
});

// ─── Positional gaps ──────────────────────────────────────────────────────────

describe("buildLeagueDraftBoard — positionalGaps", () => {
  it("positionalGaps excludes the position covered by the keeper", () => {
    // Keeper is RB → RB should NOT be in positionalGaps
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],  // RB keeper
      [makeManagerDNA()],
      [],
    );
    expect(result.teamStrategies[0]!.positionalGaps).not.toContain("RB");
  });

  it("positionalGaps includes QB, WR, TE when only RB is kept", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],  // RB keeper
      [makeManagerDNA()],
      [],
    );
    const gaps = result.teamStrategies[0]!.positionalGaps;
    expect(gaps).toContain("QB");
    expect(gaps).toContain("WR");
    expect(gaps).toContain("TE");
  });

  it("positionalGaps includes all 4 core positions when no keeper is set", () => {
    const noKeeperRec = makeKeeperRec({ primaryRecommendation: null });
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [noKeeperRec],
      [makeManagerDNA()],
      [],
    );
    const gaps = result.teamStrategies[0]!.positionalGaps;
    expect(gaps).toContain("RB");
    expect(gaps).toContain("WR");
    expect(gaps).toContain("QB");
    expect(gaps).toContain("TE");
  });
});

// ─── Positional scarcity ──────────────────────────────────────────────────────

describe("buildLeagueDraftBoard — positionalScarcity", () => {
  it("scarcityLevel is 'scarce' when many teams keep the same position", () => {
    // 8+ RB keepers in a 14-team league → scarce
    const draftOrder = Array.from({ length: 10 }, (_, i) =>
      makeDraftEntry({ teamId: i + 1, teamName: `Team ${i + 1}`, pickNumber: i + 1 })
    );
    const keeperRecs = Array.from({ length: 10 }, (_, i) =>
      makeKeeperRec({
        teamId: i + 1,
        teamName: `Team ${i + 1}`,
        primaryRecommendation: {
          playerId: i + 1,
          playerName: `RB ${i + 1}`,
          position: "RB",
          roundCost2026: 2,
          estimatedAdpRound: 3,
          roundSavings: 1,
          score: 75,
          valueScore: 80,
          needScore: 65,
          valueTier: "A",
          valueLabel: "Elite",
          valueReasoning: "Good",
          needReasoning: "Need",
          risk: "medium",
          riskNote: "OK",
        },
      })
    );
    const result = buildLeagueDraftBoard(draftOrder, keeperRecs, [], []);
    expect(result.positionalScarcity["RB"]!.scarcityLevel).toBe("scarce");
    expect(result.positionalScarcity["RB"]!.keptCount).toBe(10);
  });

  it("scarcityLevel is 'deep' when few teams keep a position", () => {
    // Only 1 RB keeper → deep
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],  // 1 RB keeper
      [makeManagerDNA()],
      [],
    );
    expect(result.positionalScarcity["RB"]!.scarcityLevel).toBe("deep");
    expect(result.positionalScarcity["RB"]!.keptCount).toBe(1);
  });
});

// ─── Returning pool ───────────────────────────────────────────────────────────

describe("buildLeagueDraftBoard — returningPool", () => {
  it("assigns poolValue 'elite' to players kept in rounds 1-2", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [],
      [],
      [makeReturningPlayer({ round2025: 1 }), makeReturningPlayer({ round2025: 2 })],
    );
    expect(result.returningPool[0]!.poolValue).toBe("elite");
    expect(result.returningPool[1]!.poolValue).toBe("elite");
  });

  it("assigns poolValue 'high' to players kept in rounds 3-4", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [],
      [],
      [makeReturningPlayer({ round2025: 3 }), makeReturningPlayer({ round2025: 4 })],
    );
    expect(result.returningPool[0]!.poolValue).toBe("high");
    expect(result.returningPool[1]!.poolValue).toBe("high");
  });

  it("assigns poolValue 'medium' to players kept in rounds 5-7", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [],
      [],
      [makeReturningPlayer({ round2025: 5 }), makeReturningPlayer({ round2025: 7 })],
    );
    expect(result.returningPool[0]!.poolValue).toBe("medium");
    expect(result.returningPool[1]!.poolValue).toBe("medium");
  });

  it("assigns poolValue 'low' to players kept in round 8+", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [],
      [],
      [makeReturningPlayer({ round2025: 8 }), makeReturningPlayer({ round2025: 12 })],
    );
    expect(result.returningPool[0]!.poolValue).toBe("low");
    expect(result.returningPool[1]!.poolValue).toBe("low");
  });

  it("returningPool is sorted by round2025 ascending", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [],
      [],
      [
        makeReturningPlayer({ round2025: 5 }),
        makeReturningPlayer({ round2025: 1 }),
        makeReturningPlayer({ round2025: 3 }),
      ],
    );
    const rounds = result.returningPool.map(p => p.round2025);
    expect(rounds).toEqual([1, 3, 5]);
  });

  it("returningPool is empty when no returning players are passed", () => {
    const result = buildLeagueDraftBoard([makeDraftEntry()], [], [], []);
    expect(result.returningPool).toHaveLength(0);
  });
});

// ─── Draft day tips ───────────────────────────────────────────────────────────

describe("buildLeagueDraftBoard — draftDayTips", () => {
  it("generates at least one draft day tip", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],
      [makeManagerDNA()],
      [],
    );
    expect(result.draftDayTips.length).toBeGreaterThanOrEqual(1);
  });

  it("includes scarcity tip when a position is scarce", () => {
    // 10 RB keepers → scarce
    const draftOrder = Array.from({ length: 10 }, (_, i) =>
      makeDraftEntry({ teamId: i + 1, teamName: `Team ${i + 1}`, pickNumber: i + 1 })
    );
    const keeperRecs = Array.from({ length: 10 }, (_, i) =>
      makeKeeperRec({
        teamId: i + 1,
        teamName: `Team ${i + 1}`,
        primaryRecommendation: {
          playerId: i + 1,
          playerName: `RB ${i + 1}`,
          position: "RB",
          roundCost2026: 2,
          estimatedAdpRound: 3,
          roundSavings: 1,
          score: 75,
          valueScore: 80,
          needScore: 65,
          valueTier: "A",
          valueLabel: "Elite",
          valueReasoning: "Good",
          needReasoning: "Need",
          risk: "medium",
          riskNote: "OK",
        },
      })
    );
    const result = buildLeagueDraftBoard(draftOrder, keeperRecs, [], []);
    const hasScarcetyTip = result.draftDayTips.some(t => t.toLowerCase().includes("scarce"));
    expect(hasScarcetyTip).toBe(true);
  });

  it("includes elite returning pool tip when elite players are returning", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [],
      [],
      [makeReturningPlayer({ playerName: "Christian McCaffrey", round2025: 1 })],
    );
    const hasEliteTip = result.draftDayTips.some(t => t.includes("Christian McCaffrey"));
    expect(hasEliteTip).toBe(true);
  });
});

// ─── Draft threat ─────────────────────────────────────────────────────────────

describe("buildLeagueDraftBoard — draftThreat", () => {
  it("draftThreat is one of: critical, high, medium, low", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],
      [makeManagerDNA()],
      [],
    );
    const validThreats = ["critical", "high", "medium", "low"];
    expect(validThreats).toContain(result.teamStrategies[0]!.draftThreat);
  });

  it("team picking at #1 with a strong keeper has higher threat than team picking at #14", () => {
    const draftOrder = [
      makeDraftEntry({ teamId: 1, teamName: "Team A", pickNumber: 1 }),
      makeDraftEntry({ teamId: 2, teamName: "Team B", pickNumber: 14 }),
    ];
    const keeperRecs = [
      makeKeeperRec({ teamId: 1, teamName: "Team A" }),
      makeKeeperRec({ teamId: 2, teamName: "Team B" }),
    ];
    const dnaProfiles = [
      makeManagerDNA({ ownerName: "A Owner", exploitabilityScore: 10 }),
      makeManagerDNA({ ownerName: "B Owner", memberId: "m2", exploitabilityScore: 10 }),
    ];
    const result = buildLeagueDraftBoard(draftOrder, keeperRecs, dnaProfiles, []);
    const threatOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const t1 = threatOrder[result.teamStrategies[0]!.draftThreat];
    const t14 = threatOrder[result.teamStrategies[1]!.draftThreat];
    expect(t1).toBeGreaterThanOrEqual(t14);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("buildLeagueDraftBoard — edge cases", () => {
  it("handles empty draftOrder gracefully", () => {
    const result = buildLeagueDraftBoard([], [], [], []);
    expect(result.teamStrategies).toHaveLength(0);
    expect(result.returningPool).toHaveLength(0);
  });

  it("handles teams with no matching DNA profile gracefully", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry({ teamName: "Unknown Team" })],
      [makeKeeperRec({ teamName: "Unknown Team" })],
      [],  // no DNA profiles
      [],
    );
    // Should not throw; gmArchetype falls back to keeper prediction or "Unknown"
    expect(result.teamStrategies[0]).toBeDefined();
    expect(result.teamStrategies[0]!.gmArchetype).toBeDefined();
  });

  it("strategyBrief mentions keeper player name when primary recommendation exists", () => {
    const result = buildLeagueDraftBoard(
      [makeDraftEntry()],
      [makeKeeperRec()],  // playerName: "Star RB"
      [makeManagerDNA()],
      [],
    );
    expect(result.teamStrategies[0]!.strategyBrief).toContain("Star RB");
  });
});
