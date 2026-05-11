/**
 * Beat Reporter Signal Extractor — Unit Tests
 *
 * Tests the pure helper functions in beatReporterSignalExtractor.ts:
 *   - computeBeatReporterAdjustment
 *   - formatSignalsForPrompt
 */

import { describe, it, expect } from "vitest";
import {
  computeBeatReporterAdjustment,
  formatSignalsForPrompt,
} from "./beatReporterSignalExtractor";

// ─── computeBeatReporterAdjustment ────────────────────────────────────────────

describe("computeBeatReporterAdjustment", () => {
  it("returns 1.0 for empty signals array", () => {
    expect(computeBeatReporterAdjustment([])).toBe(1.0);
  });

  it("returns multiplier > 1.0 for positive impact signals", () => {
    const signals = [
      { projectionImpactPct: 15, confidence: 80, magnitude: 0.8 },
    ];
    const result = computeBeatReporterAdjustment(signals);
    expect(result).toBeGreaterThan(1.0);
    expect(result).toBeLessThanOrEqual(1.2); // capped at +20%
  });

  it("returns multiplier < 1.0 for negative impact signals", () => {
    const signals = [
      { projectionImpactPct: -12, confidence: 90, magnitude: 0.9 },
    ];
    const result = computeBeatReporterAdjustment(signals);
    expect(result).toBeLessThan(1.0);
    expect(result).toBeGreaterThanOrEqual(0.8); // capped at -20%
  });

  it("caps positive adjustment at +20%", () => {
    const signals = [
      { projectionImpactPct: 25, confidence: 100, magnitude: 1.0 },
      { projectionImpactPct: 25, confidence: 100, magnitude: 1.0 },
    ];
    const result = computeBeatReporterAdjustment(signals);
    expect(result).toBeLessThanOrEqual(1.2);
  });

  it("caps negative adjustment at -20%", () => {
    const signals = [
      { projectionImpactPct: -25, confidence: 100, magnitude: 1.0 },
      { projectionImpactPct: -25, confidence: 100, magnitude: 1.0 },
    ];
    const result = computeBeatReporterAdjustment(signals);
    expect(result).toBeGreaterThanOrEqual(0.8);
  });

  it("weights by confidence × magnitude", () => {
    // High confidence positive signal should dominate low confidence negative
    const signals = [
      { projectionImpactPct: 15, confidence: 95, magnitude: 0.9 },
      { projectionImpactPct: -10, confidence: 20, magnitude: 0.2 },
    ];
    const result = computeBeatReporterAdjustment(signals);
    expect(result).toBeGreaterThan(1.0); // positive should dominate
  });

  it("returns 1.0 when all signals have zero weight", () => {
    const signals = [
      { projectionImpactPct: 10, confidence: 0, magnitude: 0 },
    ];
    const result = computeBeatReporterAdjustment(signals);
    expect(result).toBe(1.0);
  });

  it("handles mixed signals with equal weights correctly", () => {
    const signals = [
      { projectionImpactPct: 10, confidence: 80, magnitude: 0.8 },
      { projectionImpactPct: -10, confidence: 80, magnitude: 0.8 },
    ];
    const result = computeBeatReporterAdjustment(signals);
    // Should average to ~0 impact → multiplier ~1.0
    expect(result).toBeCloseTo(1.0, 1);
  });
});

// ─── formatSignalsForPrompt ───────────────────────────────────────────────────

describe("formatSignalsForPrompt", () => {
  it("returns empty string for empty signals array", () => {
    expect(formatSignalsForPrompt("Patrick Mahomes", [])).toBe("");
  });

  it("includes player name in output", () => {
    const signals = [
      {
        signalType: "role_up",
        summary: "Mahomes is getting more red zone targets.",
        projectionImpactPct: 8,
        confidence: 85,
      },
    ];
    const result = formatSignalsForPrompt("Patrick Mahomes", signals);
    expect(result).toContain("Patrick Mahomes");
  });

  it("includes signal type in output", () => {
    const signals = [
      {
        signalType: "injury_risk",
        summary: "Questionable with knee issue.",
        projectionImpactPct: -10,
        confidence: 75,
      },
    ];
    const result = formatSignalsForPrompt("Saquon Barkley", signals);
    expect(result).toContain("INJURY_RISK");
  });

  it("includes projection impact with sign", () => {
    const signals = [
      {
        signalType: "hidden_opportunity",
        summary: "Starter ruled out — huge opportunity.",
        projectionImpactPct: 18,
        confidence: 90,
      },
    ];
    const result = formatSignalsForPrompt("Jaylen Warren", signals);
    expect(result).toContain("+18%");
  });

  it("includes negative projection impact", () => {
    const signals = [
      {
        signalType: "role_down",
        summary: "Lost starting role to rookie.",
        projectionImpactPct: -15,
        confidence: 88,
      },
    ];
    const result = formatSignalsForPrompt("Zack Moss", signals);
    expect(result).toContain("-15%");
  });

  it("formats multiple signals as separate bullet points", () => {
    const signals = [
      {
        signalType: "role_up",
        summary: "Increased snap share.",
        projectionImpactPct: 8,
        confidence: 80,
      },
      {
        signalType: "coach_trust_up",
        summary: "Coach praised his route running.",
        projectionImpactPct: 5,
        confidence: 70,
      },
    ];
    const result = formatSignalsForPrompt("Puka Nacua", signals);
    const bulletCount = (result.match(/•/g) ?? []).length;
    expect(bulletCount).toBe(2);
  });

  it("includes confidence percentage", () => {
    const signals = [
      {
        signalType: "return_from_injury",
        summary: "Cleared to play after hamstring injury.",
        projectionImpactPct: 12,
        confidence: 92,
      },
    ];
    const result = formatSignalsForPrompt("Davante Adams", signals);
    expect(result).toContain("92%");
  });
});
