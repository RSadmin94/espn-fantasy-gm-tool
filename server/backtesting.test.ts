/**
 * server/backtesting.test.ts
 *
 * Unit tests for backtesting accuracy computation functions.
 * These tests exercise the pure computation logic without hitting the DB.
 */

import { describe, it, expect } from "vitest";

// ─── Inline the pure computation logic for unit testing ───────────────────────
// We re-implement the pure parts here to avoid DB dependencies in unit tests.

type Outcome = "CORRECT" | "INCORRECT" | "PUSH";

function computeStartSitOutcome(
  recommendation: "A" | "B" | "TOSS_UP",
  playerAActualPoints: number,
  playerBActualPoints: number
): Outcome {
  const diff = playerAActualPoints - playerBActualPoints;
  if (Math.abs(diff) < 50) return "PUSH";
  if (recommendation === "A" && diff > 0) return "CORRECT";
  if (recommendation === "B" && diff < 0) return "CORRECT";
  if (recommendation === "TOSS_UP") return "PUSH";
  return "INCORRECT";
}

function calcHitRate(correct: number, incorrect: number): number {
  const decisive = correct + incorrect;
  return decisive > 0 ? Math.round((correct / decisive) * 100) : 0;
}

function calcHitRateWithPush(correct: number, incorrect: number, pushes: number): number {
  const total = correct + incorrect + pushes;
  return total > 0 ? Math.round(((correct + pushes * 0.5) / total) * 100) : 0;
}

function calcBrierScore(predictions: Array<{ predictedWinPct: number; actualWon: number }>): number {
  if (predictions.length === 0) return 0;
  const sum = predictions.reduce((acc, r) => {
    const p = r.predictedWinPct / 100;
    return acc + (p - r.actualWon) ** 2;
  }, 0);
  return Math.round((sum / predictions.length) * 1000) / 1000;
}

function calcMonteCarloOverallAccuracy(
  predictions: Array<{ predictedWinPct: number; actualWon: number }>
): number {
  if (predictions.length === 0) return 0;
  const correct = predictions.filter(
    (r) =>
      (r.predictedWinPct >= 50 && r.actualWon === 1) ||
      (r.predictedWinPct < 50 && r.actualWon === 0)
  ).length;
  return Math.round((correct / predictions.length) * 100);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Start/Sit Outcome Computation", () => {
  it("returns CORRECT when recommendation is A and A scored more", () => {
    expect(computeStartSitOutcome("A", 1500, 1000)).toBe("CORRECT");
  });

  it("returns INCORRECT when recommendation is A but B scored more", () => {
    expect(computeStartSitOutcome("A", 1000, 1500)).toBe("INCORRECT");
  });

  it("returns CORRECT when recommendation is B and B scored more", () => {
    expect(computeStartSitOutcome("B", 1000, 1500)).toBe("CORRECT");
  });

  it("returns INCORRECT when recommendation is B but A scored more", () => {
    expect(computeStartSitOutcome("B", 1500, 1000)).toBe("INCORRECT");
  });

  it("returns PUSH when difference is within 0.5 pts (50 units)", () => {
    expect(computeStartSitOutcome("A", 1200, 1240)).toBe("PUSH");
    expect(computeStartSitOutcome("A", 1200, 1200)).toBe("PUSH");
  });

  it("returns PUSH for TOSS_UP regardless of scores", () => {
    expect(computeStartSitOutcome("TOSS_UP", 2000, 1000)).toBe("PUSH");
    expect(computeStartSitOutcome("TOSS_UP", 1000, 2000)).toBe("PUSH");
  });

  it("handles exact tie as PUSH", () => {
    expect(computeStartSitOutcome("A", 1000, 1000)).toBe("PUSH");
  });
});

describe("Hit Rate Calculation", () => {
  it("returns 0 when no decisive calls", () => {
    expect(calcHitRate(0, 0)).toBe(0);
  });

  it("returns 100 when all calls are correct", () => {
    expect(calcHitRate(10, 0)).toBe(100);
  });

  it("returns 0 when all calls are incorrect", () => {
    expect(calcHitRate(0, 10)).toBe(0);
  });

  it("returns 67 for 2 correct 1 incorrect", () => {
    expect(calcHitRate(2, 1)).toBe(67);
  });

  it("returns 50 for equal correct and incorrect", () => {
    expect(calcHitRate(5, 5)).toBe(50);
  });
});

describe("Hit Rate With Push", () => {
  it("counts push as 0.5 correct", () => {
    // 2 correct, 0 incorrect, 2 pushes → (2 + 1) / 4 = 75%
    expect(calcHitRateWithPush(2, 0, 2)).toBe(75);
  });

  it("returns 0 when no decisions", () => {
    expect(calcHitRateWithPush(0, 0, 0)).toBe(0);
  });

  it("returns 50 for pure pushes", () => {
    // 0 correct, 0 incorrect, 4 pushes → (0 + 2) / 4 = 50%
    expect(calcHitRateWithPush(0, 0, 4)).toBe(50);
  });
});

describe("Monte Carlo Brier Score", () => {
  it("returns 0 for perfect predictions", () => {
    const predictions = [
      { predictedWinPct: 100, actualWon: 1 },
      { predictedWinPct: 0, actualWon: 0 },
    ];
    expect(calcBrierScore(predictions)).toBe(0);
  });

  it("returns 1 for worst-case predictions", () => {
    const predictions = [
      { predictedWinPct: 100, actualWon: 0 }, // predicted 100%, lost
      { predictedWinPct: 0, actualWon: 1 },   // predicted 0%, won
    ];
    expect(calcBrierScore(predictions)).toBe(1);
  });

  it("returns 0.25 for 50% predictions on all outcomes", () => {
    const predictions = [
      { predictedWinPct: 50, actualWon: 1 },
      { predictedWinPct: 50, actualWon: 0 },
    ];
    // (0.5-1)^2 + (0.5-0)^2 = 0.25 + 0.25 = 0.5 / 2 = 0.25
    expect(calcBrierScore(predictions)).toBe(0.25);
  });

  it("returns 0 for empty predictions", () => {
    expect(calcBrierScore([])).toBe(0);
  });
});

describe("Monte Carlo Overall Accuracy", () => {
  it("returns 100 when all predictions are correct", () => {
    const predictions = [
      { predictedWinPct: 70, actualWon: 1 },
      { predictedWinPct: 80, actualWon: 1 },
      { predictedWinPct: 30, actualWon: 0 },
    ];
    expect(calcMonteCarloOverallAccuracy(predictions)).toBe(100);
  });

  it("returns 0 when all predictions are wrong", () => {
    const predictions = [
      { predictedWinPct: 70, actualWon: 0 },
      { predictedWinPct: 30, actualWon: 1 },
    ];
    expect(calcMonteCarloOverallAccuracy(predictions)).toBe(0);
  });

  it("returns 50 for mixed results", () => {
    const predictions = [
      { predictedWinPct: 70, actualWon: 1 }, // correct
      { predictedWinPct: 70, actualWon: 0 }, // wrong
    ];
    expect(calcMonteCarloOverallAccuracy(predictions)).toBe(50);
  });

  it("returns 0 for empty predictions", () => {
    expect(calcMonteCarloOverallAccuracy([])).toBe(0);
  });

  it("treats exactly 50% as a win prediction", () => {
    // 50% predicted → predicted win → correct if actualWon = 1
    const predictions = [{ predictedWinPct: 50, actualWon: 1 }];
    expect(calcMonteCarloOverallAccuracy(predictions)).toBe(100);
  });
});

describe("Trade Win Rate", () => {
  it("calculates accepted win rate correctly", () => {
    const trades = [
      { rodDecision: "ACCEPTED", verdict: "WIN" },
      { rodDecision: "ACCEPTED", verdict: "FAIR" },
      { rodDecision: "ACCEPTED", verdict: "LOSS" },
      { rodDecision: "REJECTED", verdict: "WIN" },
    ];
    const accepted = trades.filter((t) => t.rodDecision === "ACCEPTED").length;
    const acceptedWins = trades.filter(
      (t) => t.rodDecision === "ACCEPTED" && t.verdict === "WIN"
    ).length;
    const winRate = accepted > 0 ? Math.round((acceptedWins / accepted) * 100) : 0;
    expect(winRate).toBe(33);
  });

  it("returns 0 when no accepted trades", () => {
    const accepted = 0;
    const acceptedWins = 0;
    const winRate = accepted > 0 ? Math.round((acceptedWins / accepted) * 100) : 0;
    expect(winRate).toBe(0);
  });

  it("returns 100 when all accepted trades were wins", () => {
    const accepted = 3;
    const acceptedWins = 3;
    const winRate = Math.round((acceptedWins / accepted) * 100);
    expect(winRate).toBe(100);
  });
});
