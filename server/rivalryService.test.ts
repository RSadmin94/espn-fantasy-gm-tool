/**
 * rivalryService.test.ts
 * Unit tests for the rivalry score engine.
 */
import { describe, it, expect } from "vitest";

// ── Inline the pure scoring helpers so we don't need DB ──────────────────────

type HeatLabel = "Cold" | "Simmering" | "Heated" | "Burning" | "Inferno";

function heatLabel(score: number): HeatLabel {
  if (score >= 150) return "Inferno";
  if (score >= 100) return "Burning";
  if (score >= 60) return "Heated";
  if (score >= 30) return "Simmering";
  return "Cold";
}

interface ScoreInput {
  h2hLosses: number;
  playoffEliminations: number;
  closeLossCount: number;
  tradeVerdictLosses: number;
  recentLosses: number;
}

function computeScore(i: ScoreInput): number {
  return (
    i.h2hLosses * 10 +
    i.playoffEliminations * 40 +
    i.closeLossCount * 15 +
    i.tradeVerdictLosses * 12 +
    i.recentLosses * 8
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("heatLabel", () => {
  it("returns Cold for score < 30", () => {
    expect(heatLabel(0)).toBe("Cold");
    expect(heatLabel(29)).toBe("Cold");
  });

  it("returns Simmering for score 30–59", () => {
    expect(heatLabel(30)).toBe("Simmering");
    expect(heatLabel(59)).toBe("Simmering");
  });

  it("returns Heated for score 60–99", () => {
    expect(heatLabel(60)).toBe("Heated");
    expect(heatLabel(99)).toBe("Heated");
  });

  it("returns Burning for score 100–149", () => {
    expect(heatLabel(100)).toBe("Burning");
    expect(heatLabel(149)).toBe("Burning");
  });

  it("returns Inferno for score >= 150", () => {
    expect(heatLabel(150)).toBe("Inferno");
    expect(heatLabel(999)).toBe("Inferno");
  });
});

describe("computeScore", () => {
  it("returns 0 for a manager with no rivalry history", () => {
    expect(computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    })).toBe(0);
  });

  it("weights playoff eliminations heaviest (40 pts each)", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 2,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(80);
  });

  it("weights H2H losses at 10 pts each", () => {
    const score = computeScore({
      h2hLosses: 5,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(50);
  });

  it("weights close losses at 15 pts each", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 4,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(60);
  });

  it("weights trade verdict losses at 12 pts each", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 3,
      recentLosses: 0,
    });
    expect(score).toBe(36);
  });

  it("weights recent losses at 8 pts each", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 3,
    });
    expect(score).toBe(24);
  });

  it("combines all factors correctly for a high-rivalry opponent", () => {
    // 8 H2H losses (80) + 2 playoff elims (80) + 3 close losses (45) + 2 trade losses (24) + 2 recent (16) = 245
    const score = computeScore({
      h2hLosses: 8,
      playoffEliminations: 2,
      closeLossCount: 3,
      tradeVerdictLosses: 2,
      recentLosses: 2,
    });
    expect(score).toBe(245);
    expect(heatLabel(score)).toBe("Inferno");
  });

  it("produces Simmering for a mild rivalry", () => {
    // 3 H2H losses (30) = 30
    const score = computeScore({
      h2hLosses: 3,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(30);
    expect(heatLabel(score)).toBe("Simmering");
  });
});

describe("rivalry score ordering invariants", () => {
  it("a playoff elimination outweighs 3 regular H2H losses", () => {
    // 1 playoff elim = 40 pts; 3 H2H losses = 30 pts
    const withElim = computeScore({
      h2hLosses: 0,
      playoffEliminations: 1,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    const withH2H = computeScore({
      h2hLosses: 3,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(withElim).toBeGreaterThan(withH2H);
  });

  it("a playoff elimination equals 4 regular H2H losses (40 pts each)", () => {
    const withElim = computeScore({
      h2hLosses: 0,
      playoffEliminations: 1,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    const withH2H = computeScore({
      h2hLosses: 4,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(withElim).toBe(withH2H);
  });

  it("a close loss outweighs 1 regular H2H loss", () => {
    const withClose = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 1,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    const withH2H = computeScore({
      h2hLosses: 1,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(withClose).toBeGreaterThan(withH2H);
  });
});
