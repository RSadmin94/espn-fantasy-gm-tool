import { describe, expect, it, beforeEach } from "vitest";
import { trackLLMEvent } from "../usageTracker";
import { clearAiUsageTraces, getRecentAiUsageTraces } from "./debugTrace";
import { resolveFeatureId } from "./aiFeatures";

describe("feature attribution", () => {
  it("maps advisor callType to ADVISOR", () => {
    expect(resolveFeatureId({ callType: "advisor" })).toBe("ADVISOR");
  });
  it("does not invent missing features", () => {
    expect(resolveFeatureId({})).toBe("UNATTRIBUTED");
  });
});

describe("retry telemetry traces", () => {
  beforeEach(() => clearAiUsageTraces());

  it("records each attempt with a distinct requestId under one parent", () => {
    trackLLMEvent({
      featureName: "ADVISOR",
      featureId: "ADVISOR",
      model: "claude-sonnet-4-20250514",
      provider: "ANTHROPIC",
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
      durationMs: 100,
      streaming: false,
      requestId: "attempt-1",
      parentRequestId: "logical-9",
      retryCount: 0,
      userId: 42,
    });
    trackLLMEvent({
      featureName: "ADVISOR",
      featureId: "ADVISOR",
      model: "claude-sonnet-4-20250514",
      provider: "ANTHROPIC",
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
      durationMs: 120,
      streaming: false,
      requestId: "attempt-2",
      parentRequestId: "logical-9",
      retryCount: 1,
      userId: 42,
    });
    const traces = getRecentAiUsageTraces(10);
    expect(traces).toHaveLength(2);
    expect(traces.map((t) => t.requestId).sort()).toEqual(["attempt-1", "attempt-2"]);
    expect(new Set(traces.map((t) => t.parentRequestId))).toEqual(new Set(["logical-9"]));
    expect(traces.some((t) => t.retryCount === 1)).toBe(true);
  });
});
