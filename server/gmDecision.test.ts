/**
 * Tests for gmDecisionService pure functions:
 * - computeAccuracyStats
 * - computePatterns
 */
import { describe, it, expect } from "vitest";
import { computeAccuracyStats, computePatterns } from "./gmDecisionService";
import type { GmDecision } from "../drizzle/schema";

// ─── Fixture helpers ──────────────────────────────────────────────────────────
function makeDecision(overrides: Partial<GmDecision> = {}): GmDecision {
  return {
    id: 1,
    toolSource: "start_sit",
    decisionType: "start_sit",
    description: "Start Ja'Marr Chase over Tee Higgins",
    recommendation: "Start Chase",
    followedRecommendation: true,
    accepted: true,
    playersInvolved: JSON.stringify(["Ja'Marr Chase", "Tee Higgins"]),
    counterparty: null,
    aiContext: null,
    season: 2025,
    weekNum: 8,
    outcome: "correct",
    outcomeScore: 80,
    outcomeNotes: "Chase scored 22 pts, Higgins scored 8",
    resolvedAt: new Date("2025-11-01"),
    createdAt: new Date("2025-10-31"),
    ...overrides,
  } as GmDecision;
}

// ─── computeAccuracyStats ─────────────────────────────────────────────────────
describe("computeAccuracyStats", () => {
  it("returns zero stats for empty input", () => {
    const stats = computeAccuracyStats([]);
    expect(stats.total).toBe(0);
    expect(stats.resolved).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.correct).toBe(0);
    expect(stats.incorrect).toBe(0);
    expect(stats.accuracyPct).toBe(0);
  });

  it("counts total, correct, incorrect, neutral, pending correctly", () => {
    const rows = [
      makeDecision({ outcome: "correct" }),
      makeDecision({ id: 2, outcome: "correct" }),
      makeDecision({ id: 3, outcome: "incorrect" }),
      makeDecision({ id: 4, outcome: "neutral" }),
      makeDecision({ id: 5, outcome: "pending" }),
    ];
    const stats = computeAccuracyStats(rows);
    expect(stats.total).toBe(5);
    expect(stats.correct).toBe(2);
    expect(stats.incorrect).toBe(1);
    expect(stats.neutral).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.resolved).toBe(4);
  });

  it("computes accuracyPct as correct / (correct + incorrect) * 100", () => {
    const rows = [
      makeDecision({ outcome: "correct" }),
      makeDecision({ id: 2, outcome: "correct" }),
      makeDecision({ id: 3, outcome: "incorrect" }),
    ];
    const stats = computeAccuracyStats(rows);
    // 2 correct, 1 incorrect → 2/3 * 100 ≈ 66.67
    expect(stats.accuracyPct).toBeCloseTo(66.67, 0);
  });

  it("returns 0 accuracyPct when no resolved decisions", () => {
    const rows = [
      makeDecision({ outcome: "pending" }),
      makeDecision({ id: 2, outcome: "pending" }),
    ];
    const stats = computeAccuracyStats(rows);
    expect(stats.accuracyPct).toBe(0);
  });

  it("computes followedRecommendationPct correctly", () => {
    const rows = [
      makeDecision({ followedRecommendation: true }),
      makeDecision({ id: 2, followedRecommendation: true }),
      makeDecision({ id: 3, followedRecommendation: false }),
      makeDecision({ id: 4, followedRecommendation: null }),
    ];
    const stats = computeAccuracyStats(rows);
    // 2 followed out of 4 total decisions → 50%
    expect(stats.followedRecommendationPct).toBe(50);
  });

  it("computes followedAndCorrectPct correctly", () => {
    const rows = [
      makeDecision({ followedRecommendation: true, outcome: "correct" }),
      makeDecision({ id: 2, followedRecommendation: true, outcome: "incorrect" }),
      makeDecision({ id: 3, followedRecommendation: false, outcome: "correct" }),
    ];
    const stats = computeAccuracyStats(rows);
    // 1 correct out of 2 followed → 50%
    expect(stats.followedAndCorrectPct).toBe(50);
    // 1 correct out of 1 ignored → 100%
    expect(stats.ignoredAndCorrectPct).toBe(100);
  });

  it("groups byTool correctly", () => {
    const rows = [
      makeDecision({ toolSource: "start_sit", outcome: "correct" }),
      makeDecision({ id: 2, toolSource: "start_sit", outcome: "incorrect" }),
      makeDecision({ id: 3, toolSource: "trade_analyzer", outcome: "correct" }),
    ];
    const stats = computeAccuracyStats(rows);
    expect(stats.byTool["start_sit"].total).toBe(2);
    expect(stats.byTool["start_sit"].correct).toBe(1);
    expect(stats.byTool["trade_analyzer"].total).toBe(1);
    expect(stats.byTool["trade_analyzer"].accuracyPct).toBe(100);
  });

  it("groups byDecisionType correctly", () => {
    const rows = [
      makeDecision({ decisionType: "trade_accept", outcome: "correct" }),
      makeDecision({ id: 2, decisionType: "trade_accept", outcome: "correct" }),
      makeDecision({ id: 3, decisionType: "waiver_add", outcome: "incorrect" }),
    ];
    const stats = computeAccuracyStats(rows);
    expect(stats.byDecisionType["trade_accept"].accuracyPct).toBe(100);
    expect(stats.byDecisionType["waiver_add"].accuracyPct).toBe(0);
  });
});

// ─── computePatterns ─────────────────────────────────────────────────────────
describe("computePatterns", () => {
  it("returns empty array for empty input", () => {
    expect(computePatterns([])).toEqual([]);
  });

  it("does not generate patterns with fewer than 3 decisions", () => {
    const rows = [
      makeDecision({ followedRecommendation: true, outcome: "correct" }),
      makeDecision({ id: 2, followedRecommendation: true, outcome: "incorrect" }),
    ];
    const patterns = computePatterns(rows);
    // Need at least 3 followed decisions for the "Followed AI" pattern
    const followedPattern = patterns.find((p) => p.pattern === "Followed AI Recommendation");
    expect(followedPattern).toBeUndefined();
  });

  it("generates Followed AI Recommendation pattern with 3+ decisions", () => {
    const rows = [
      makeDecision({ followedRecommendation: true, outcome: "correct" }),
      makeDecision({ id: 2, followedRecommendation: true, outcome: "correct" }),
      makeDecision({ id: 3, followedRecommendation: true, outcome: "incorrect" }),
    ];
    const patterns = computePatterns(rows);
    const p = patterns.find((x) => x.pattern === "Followed AI Recommendation");
    expect(p).toBeDefined();
    expect(p!.frequency).toBe(3);
    expect(p!.successRate).toBeCloseTo(67, 0);
  });

  it("generates Ignored AI Recommendation pattern with 3+ decisions", () => {
    const rows = [
      makeDecision({ followedRecommendation: false, outcome: "incorrect" }),
      makeDecision({ id: 2, followedRecommendation: false, outcome: "incorrect" }),
      makeDecision({ id: 3, followedRecommendation: false, outcome: "incorrect" }),
    ];
    const patterns = computePatterns(rows);
    const p = patterns.find((x) => x.pattern === "Ignored AI Recommendation");
    expect(p).toBeDefined();
    expect(p!.successRate).toBe(0);
  });

  it("generates Trade Acceptance pattern with 2+ decisions", () => {
    const rows = [
      makeDecision({ decisionType: "trade_accept", outcome: "correct" }),
      makeDecision({ id: 2, decisionType: "trade_accept", outcome: "correct" }),
    ];
    const patterns = computePatterns(rows);
    const p = patterns.find((x) => x.pattern === "Trade Acceptance");
    expect(p).toBeDefined();
    expect(p!.successRate).toBe(100);
  });

  it("each pattern has required fields", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeDecision({ id: i + 1, followedRecommendation: true, outcome: "correct" })
    );
    const patterns = computePatterns(rows);
    for (const p of patterns) {
      expect(typeof p.pattern).toBe("string");
      expect(typeof p.frequency).toBe("number");
      expect(typeof p.successRate).toBe("number");
      expect(typeof p.description).toBe("string");
      expect(p.successRate).toBeGreaterThanOrEqual(0);
      expect(p.successRate).toBeLessThanOrEqual(100);
    }
  });
});
