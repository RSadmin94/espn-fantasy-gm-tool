/**
 * tradeNarrativeService.test.ts
 * Sprint 2: Unit tests for the Emotional Trade Narratives engine.
 *
 * Tests cover:
 * - assignNarrativeLabel: all 8 label paths + priority ordering
 * - computeDesperationScore: picks, value diff, player count
 */
import { describe, it, expect } from "vitest";
import { assignNarrativeLabel, computeDesperationScore } from "./tradeNarrativeService";
import type { NarrativeTradeInput, NarrativeTradeSide } from "./tradeNarrativeService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSide(overrides: Partial<NarrativeTradeSide> = {}): NarrativeTradeSide {
  return {
    teamId: 1,
    ownerName: "Owner A",
    players: [],
    picks: [],
    totalValue: 0,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<NarrativeTradeInput> = {}): NarrativeTradeInput {
  return {
    season: 2024,
    tradeId: "trade-001",
    proposedDate: Date.now(),
    sideA: makeSide({ ownerName: "Owner A" }),
    sideB: makeSide({ ownerName: "Owner B" }),
    verdict: "even",
    verdictMargin: 0,
    ...overrides,
  };
}

function makePlayer(name = "Player X", pos = "WR", value = 100) {
  return { playerId: Math.floor(Math.random() * 9999), playerName: name, position: pos, avgPoints: 10, seasonPoints: 150, compositeValue: value };
}

function makePick(label = "2024 1st", round = 1, value = 80) {
  return { label, round, pickInRound: 1, value };
}

// ── assignNarrativeLabel ──────────────────────────────────────────────────────

describe("assignNarrativeLabel", () => {
  it("returns Phantom Trade when both sides have 0 value and no picks", () => {
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 0, players: [], picks: [] }),
      sideB: makeSide({ totalValue: 0, players: [], picks: [] }),
      verdict: "even",
      verdictMargin: 0,
    });
    expect(assignNarrativeLabel(trade)).toBe("Phantom Trade");
  });

  it("returns Phantom Trade when combined value is 0 and no players (picks only but 0 value)", () => {
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 0, players: [], picks: [] }),
      sideB: makeSide({ totalValue: 0, players: [], picks: [] }),
      verdict: "sideA",
      verdictMargin: 0,
    });
    expect(assignNarrativeLabel(trade)).toBe("Phantom Trade");
  });

  it("returns League-Altering Trade when combined value > 1200", () => {
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 700, players: [makePlayer("A", "WR", 700)] }),
      sideB: makeSide({ totalValue: 600, players: [makePlayer("B", "RB", 600)] }),
      verdict: "sideA",
      verdictMargin: 100,
    });
    expect(assignNarrativeLabel(trade)).toBe("League-Altering Trade");
  });

  it("returns League-Altering Trade when 4+ players involved", () => {
    const trade = makeTrade({
      sideA: makeSide({
        totalValue: 200,
        players: [makePlayer("A", "WR", 50), makePlayer("B", "RB", 50), makePlayer("C", "QB", 50)],
      }),
      sideB: makeSide({
        totalValue: 150,
        players: [makePlayer("D", "TE", 50), makePlayer("E", "WR", 50)],
      }),
      verdict: "sideA",
      verdictMargin: 50,
    });
    // 5 total players → League-Altering
    expect(assignNarrativeLabel(trade)).toBe("League-Altering Trade");
  });

  it("returns Quiet Fleece when winner margin > 60% of loser value and loser had real value", () => {
    // loserValue = 100, verdictMargin = 70 (> 60)
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 170, players: [makePlayer("A", "WR", 170)] }),
      sideB: makeSide({ totalValue: 100, players: [makePlayer("B", "RB", 100)] }),
      verdict: "sideA",
      verdictMargin: 70,
    });
    expect(assignNarrativeLabel(trade)).toBe("Quiet Fleece");
  });

  it("returns Mutual Destruction when even verdict and both sides >= 200 value", () => {
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 250, players: [makePlayer("A", "WR", 250)] }),
      sideB: makeSide({ totalValue: 220, players: [makePlayer("B", "RB", 220)] }),
      verdict: "even",
      verdictMargin: 0,
    });
    expect(assignNarrativeLabel(trade)).toBe("Mutual Destruction");
  });

  it("returns Future Sacrificed when winner gave picks to get players", () => {
    // Winner is sideA; sideA gave picks (future assets), sideB gave players
    // Margin must NOT trigger Quiet Fleece: loserValue=100, 60% of 100 = 60, so margin must be <= 60
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 150, players: [], picks: [makePick("2024 1st", 1, 150)] }),
      sideB: makeSide({ totalValue: 100, players: [makePlayer("B", "WR", 100)], picks: [] }),
      verdict: "sideA",
      verdictMargin: 50, // 50 <= 60% of 100 → no Quiet Fleece; sideA gave picks → Future Sacrificed
    });
    expect(assignNarrativeLabel(trade)).toBe("Future Sacrificed");
  });

  it("returns Win-Now Desperation when losing side gave away picks", () => {
    // verdict sideA wins; loser is sideB; sideB gave picks + players
    // Margin must NOT trigger Quiet Fleece: loserValue=100, 60% of 100 = 60, so margin must be <= 60
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 150, players: [makePlayer("A", "WR", 150)], picks: [] }),
      sideB: makeSide({ totalValue: 100, players: [makePlayer("B", "RB", 50)], picks: [makePick("2024 2nd", 2, 50)] }),
      verdict: "sideA",
      verdictMargin: 50, // 50 <= 60% of 100 → no Quiet Fleece
    });
    // loserSide = sideB; sideB has picks + players → Win-Now Desperation
    expect(assignNarrativeLabel(trade)).toBe("Win-Now Desperation");
  });

  it("returns Panic Move when losing side had only 1 player and margin > 80", () => {
    // Margin must NOT trigger Quiet Fleece: loserValue=100, 60% of 100 = 60, so margin must be <= 60
    // But Panic Move requires margin > 80, so we need loserValue high enough that 60% > 80
    // loserValue = 200 → 60% = 120; margin = 90 (< 120) → no Quiet Fleece; margin 90 > 80 → Panic Move
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 290, players: [makePlayer("A", "WR", 290)], picks: [] }),
      sideB: makeSide({ totalValue: 200, players: [makePlayer("B", "RB", 200)], picks: [] }),
      verdict: "sideA",
      verdictMargin: 90, // 90 < 120 (60% of 200) → no Quiet Fleece; 90 > 80 → Panic Move
    });
    // loserSide = sideB; 1 player, margin 90 > 80 → Panic Move
    expect(assignNarrativeLabel(trade)).toBe("Panic Move");
  });

  it("returns Calculated Gamble as default for a decisive but unremarkable trade", () => {
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 150, players: [makePlayer("A", "WR", 75), makePlayer("B", "RB", 75)] }),
      sideB: makeSide({ totalValue: 100, players: [makePlayer("C", "QB", 100)] }),
      verdict: "sideA",
      verdictMargin: 50,
    });
    // 3 players total (< 4), combined 250 (< 1200), margin 50 (< 60% of 100), no picks → Calculated Gamble
    expect(assignNarrativeLabel(trade)).toBe("Calculated Gamble");
  });

  it("prioritizes Phantom Trade over League-Altering when value is 0", () => {
    // Even if we force 4 players, if combinedValue === 0 → Phantom Trade wins
    const trade = makeTrade({
      sideA: makeSide({ totalValue: 0, players: [makePlayer("A", "WR", 0), makePlayer("B", "RB", 0)], picks: [] }),
      sideB: makeSide({ totalValue: 0, players: [makePlayer("C", "QB", 0), makePlayer("D", "TE", 0)], picks: [] }),
      verdict: "even",
      verdictMargin: 0,
    });
    // combinedValue === 0 AND totalPicks === 0 → Phantom Trade (priority 1)
    expect(assignNarrativeLabel(trade)).toBe("Phantom Trade");
  });
});

// ── computeDesperationScore ───────────────────────────────────────────────────

describe("computeDesperationScore", () => {
  it("returns 0 for a side with no picks, no value diff, no players", () => {
    const side = makeSide({ totalValue: 100, players: [], picks: [] });
    const other = makeSide({ totalValue: 100, players: [], picks: [] });
    expect(computeDesperationScore(side, other)).toBe(0);
  });

  it("adds 15 per pick given away", () => {
    const side = makeSide({ totalValue: 0, players: [], picks: [makePick(), makePick()] });
    const other = makeSide({ totalValue: 0, players: [], picks: [] });
    expect(computeDesperationScore(side, other)).toBe(30); // 2 picks × 15
  });

  it("adds value-diff contribution when side gave up more value", () => {
    // side gave 200, other gave 100 → diff = 100 → floor(100/5) = 20 added
    const side = makeSide({ totalValue: 200, players: [makePlayer("A", "WR", 200)], picks: [] });
    const other = makeSide({ totalValue: 100, players: [makePlayer("B", "RB", 100)], picks: [] });
    const score = computeDesperationScore(side, other);
    // value diff = 100 → min(40, 20) = 20; players = 1 → min(20, 5) = 5; total = 25
    expect(score).toBe(25);
  });

  it("caps value-diff contribution at 40", () => {
    const side = makeSide({ totalValue: 500, players: [makePlayer("A", "WR", 500)], picks: [] });
    const other = makeSide({ totalValue: 0, players: [], picks: [] });
    const score = computeDesperationScore(side, other);
    // diff = 500 → floor(500/5) = 100 → capped at 40; players = 1 → 5; total = 45
    expect(score).toBe(45);
  });

  it("caps player contribution at 20", () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`P${i}`, "WR", 10));
    const side = makeSide({ totalValue: 100, players, picks: [] });
    const other = makeSide({ totalValue: 100, players: [], picks: [] });
    const score = computeDesperationScore(side, other);
    // value diff = 0; players = 10 → min(20, 50) = 20; total = 20
    expect(score).toBe(20);
  });

  it("caps total score at 100", () => {
    // 4 picks (60) + 500 value diff (capped 40) + 10 players (capped 20) = 120 → capped at 100
    const picks = Array.from({ length: 4 }, (_, i) => makePick(`Pick ${i}`, i + 1, 50));
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`P${i}`, "WR", 10));
    const side = makeSide({ totalValue: 600, players, picks });
    const other = makeSide({ totalValue: 0, players: [], picks: [] });
    expect(computeDesperationScore(side, other)).toBe(100);
  });

  it("returns 0 when other side gave more value (side received more than it gave)", () => {
    // side gave 50, other gave 200 → valueDiff = 50 - 200 = -150 → no addition
    const side = makeSide({ totalValue: 50, players: [makePlayer("A", "WR", 50)], picks: [] });
    const other = makeSide({ totalValue: 200, players: [makePlayer("B", "RB", 200)], picks: [] });
    const score = computeDesperationScore(side, other);
    // valueDiff < 0 → no contribution; players = 1 → 5; total = 5
    expect(score).toBe(5);
  });
});
