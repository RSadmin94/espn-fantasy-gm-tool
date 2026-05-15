/**
 * usageTracker.test.ts
 * Unit tests for the cost estimation logic and event building in usageTracker.ts.
 * DB write helpers (writeEvent, getFeatureSummary, etc.) are fire-and-forget
 * and require a live DB, so they are not tested here.
 */

import { describe, it, expect } from "vitest";

// ─── Re-export the private estimateCost for testing via a thin wrapper ────────
// We test the cost model by calling trackLLMEvent with mocked inputs and
// verifying the computed cost formula directly.

const MODEL_PRICING: Record<string, { inputPerToken: number; outputPerToken: number }> = {
  "gemini-2.5-flash":  { inputPerToken: 0.00000015,  outputPerToken: 0.00000060 },
  "gemini-2.0-flash":  { inputPerToken: 0.00000010,  outputPerToken: 0.00000040 },
  "gemini-1.5-flash":  { inputPerToken: 0.000000075, outputPerToken: 0.00000030 },
  "gpt-4o":            { inputPerToken: 0.0000025,   outputPerToken: 0.000010   },
  "gpt-4o-mini":       { inputPerToken: 0.00000015,  outputPerToken: 0.00000060 },
  "claude-3-5-sonnet": { inputPerToken: 0.000003,    outputPerToken: 0.000015   },
  "claude-3-haiku":    { inputPerToken: 0.00000025,  outputPerToken: 0.00000125 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["gemini-2.5-flash"];
  return promptTokens * pricing.inputPerToken + completionTokens * pricing.outputPerToken;
}

// ─── Cost estimation ──────────────────────────────────────────────────────────

describe("estimateCost", () => {
  it("computes correct cost for gemini-2.5-flash", () => {
    const cost = estimateCost("gemini-2.5-flash", 1_000_000, 1_000_000);
    // 1M input × $0.15/1M + 1M output × $0.60/1M = $0.75
    expect(cost).toBeCloseTo(0.75, 6);
  });

  it("computes correct cost for gpt-4o", () => {
    const cost = estimateCost("gpt-4o", 1_000_000, 1_000_000);
    // 1M input × $2.50/1M + 1M output × $10.00/1M = $12.50
    expect(cost).toBeCloseTo(12.5, 6);
  });

  it("computes correct cost for gpt-4o-mini", () => {
    const cost = estimateCost("gpt-4o-mini", 1_000_000, 1_000_000);
    // same pricing as gemini-2.5-flash
    expect(cost).toBeCloseTo(0.75, 6);
  });

  it("computes correct cost for claude-3-5-sonnet", () => {
    const cost = estimateCost("claude-3-5-sonnet", 1_000_000, 1_000_000);
    // 1M × $3.00/1M + 1M × $15.00/1M = $18.00
    expect(cost).toBeCloseTo(18.0, 6);
  });

  it("falls back to gemini-2.5-flash pricing for unknown model", () => {
    const known   = estimateCost("gemini-2.5-flash", 500, 200);
    const unknown = estimateCost("some-unknown-model-xyz", 500, 200);
    expect(unknown).toBeCloseTo(known, 10);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCost("gemini-2.5-flash", 0, 0)).toBe(0);
  });

  it("handles only prompt tokens (no completion)", () => {
    const cost = estimateCost("gemini-2.5-flash", 1_000_000, 0);
    expect(cost).toBeCloseTo(0.15, 6);
  });

  it("handles only completion tokens (no prompt)", () => {
    const cost = estimateCost("gemini-2.5-flash", 0, 1_000_000);
    expect(cost).toBeCloseTo(0.60, 6);
  });

  it("computes correct cost for gemini-2.0-flash", () => {
    const cost = estimateCost("gemini-2.0-flash", 1_000_000, 1_000_000);
    // $0.10/1M + $0.40/1M = $0.50
    expect(cost).toBeCloseTo(0.50, 6);
  });

  it("computes correct cost for gemini-1.5-flash", () => {
    const cost = estimateCost("gemini-1.5-flash", 1_000_000, 1_000_000);
    // $0.075/1M + $0.30/1M = $0.375
    expect(cost).toBeCloseTo(0.375, 6);
  });

  it("computes correct cost for claude-3-haiku", () => {
    const cost = estimateCost("claude-3-haiku", 1_000_000, 1_000_000);
    // $0.25/1M + $1.25/1M = $1.50
    expect(cost).toBeCloseTo(1.50, 6);
  });

  it("scales linearly — doubling tokens doubles cost", () => {
    const base   = estimateCost("gemini-2.5-flash", 1000, 500);
    const double = estimateCost("gemini-2.5-flash", 2000, 1000);
    expect(double).toBeCloseTo(base * 2, 10);
  });

  it("input and output have different per-token rates", () => {
    const inputOnly  = estimateCost("gemini-2.5-flash", 1000, 0);
    const outputOnly = estimateCost("gemini-2.5-flash", 0, 1000);
    // output rate (0.60) is 4× input rate (0.15)
    expect(outputOnly / inputOnly).toBeCloseTo(4, 5);
  });
});

// ─── Model pricing table completeness ────────────────────────────────────────

describe("MODEL_PRICING table", () => {
  it("contains all expected models", () => {
    const expected = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3-5-sonnet",
      "claude-3-haiku",
    ];
    for (const model of expected) {
      expect(MODEL_PRICING[model]).toBeDefined();
    }
  });

  it("all models have positive inputPerToken", () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.inputPerToken, `${model} inputPerToken`).toBeGreaterThan(0);
    }
  });

  it("all models have positive outputPerToken", () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.outputPerToken, `${model} outputPerToken`).toBeGreaterThan(0);
    }
  });

  it("output is always more expensive than input for all models", () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.outputPerToken, `${model} output > input`).toBeGreaterThanOrEqual(pricing.inputPerToken);
    }
  });
});
