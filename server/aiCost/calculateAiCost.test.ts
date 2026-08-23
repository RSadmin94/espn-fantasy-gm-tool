import { describe, expect, it } from "vitest";
import { calculateAiCost } from "./calculateAiCost";
import { lookupModelPrice } from "./aiPricingCatalog";

describe("calculateAiCost", () => {
  it("prices input and output separately for gpt-4o", () => {
    const r = calculateAiCost({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      timestamp: "2026-08-01",
    });
    expect(r.priced).toBe(true);
    expect(r.calculatedCost).toBeCloseTo(12.5, 6);
  });

  it("applies cached input at the cache rate", () => {
    const r = calculateAiCost({
      provider: "OPENAI",
      model: "gpt-4o",
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
      timestamp: "2026-08-01",
    });
    expect(r.calculatedCost).toBeCloseTo(1.25, 6);
  });

  it("clamps cached tokens to input tokens", () => {
    const r = calculateAiCost({
      provider: "ANTHROPIC",
      model: "claude-sonnet-4-20250514",
      inputTokens: 100,
      cachedInputTokens: 500,
      outputTokens: 0,
      timestamp: "2026-08-01",
    });
    expect(r.cachedInputTokens).toBe(100);
  });

  it("matches prefix models (claude-sonnet-4-*)", () => {
    const row = lookupModelPrice({
      provider: "ANTHROPIC",
      model: "claude-sonnet-4-20250514",
      timestamp: "2026-08-01",
    });
    expect(row?.model).toBe("claude-sonnet-4");
    const r = calculateAiCost({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      timestamp: "2026-08-01",
    });
    expect(r.calculatedCost).toBeCloseTo(18, 6);
  });

  it("uses effective-date rates (gemini 2.5 flash after May 2025)", () => {
    const r = calculateAiCost({
      provider: "GEMINI",
      model: "gemini-2.5-flash",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      timestamp: "2026-01-01",
    });
    expect(r.rate?.effectiveFrom).toBe("2025-05-01");
    expect(r.calculatedCost).toBeCloseTo(0.75, 6);
  });

  it("does not guess unknown models", () => {
    const r = calculateAiCost({
      provider: "OPENAI",
      model: "totally-unknown-model-xyz",
      inputTokens: 500,
      outputTokens: 200,
    });
    expect(r.priced).toBe(false);
    expect(r.calculatedCost).toBe(0);
  });

  it("infers provider from model when omitted", () => {
    const r = calculateAiCost({
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(r.provider).toBe("OPENAI");
    expect(r.priced).toBe(true);
    expect(r.calculatedCost).toBeCloseTo(0.15, 6);
  });

  it("prices deepseek-v4-flash", () => {
    const r = calculateAiCost({
      provider: "DEEPSEEK",
      model: "deepseek-v4-flash",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      timestamp: "2026-08-01",
    });
    expect(r.priced).toBe(true);
    expect(r.calculatedCost).toBeCloseTo(0.42, 6);
  });
});
