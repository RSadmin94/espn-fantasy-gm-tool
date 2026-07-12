import { describe, it, expect } from "vitest";
import {
  emptyRealShadowTelemetry,
  estimateShadowCertCostUsd,
  summarizeRealShadowTelemetry,
} from "./realBroadcastShadowDeps";
import type { ShadowPipelineMetrics } from "./broadcastShadowPipeline";

describe("realBroadcastShadowDeps telemetry", () => {
  it("estimates non-zero cost when calls were made", () => {
    const t = emptyRealShadowTelemetry();
    t.voiceGenerationCalls = 10;
    t.entailmentCalls = 8;
    expect(estimateShadowCertCostUsd(t)).toBeGreaterThan(0);
  });

  it("summarizes provider call volume and rejections", () => {
    const t = emptyRealShadowTelemetry();
    t.voiceGenerationCalls = 3;
    t.entailmentCalls = 2;
    t.voiceGenerationLatencyMs = 900;
    t.entailmentLatencyMs = 400;
    const m: ShadowPipelineMetrics = {
      totalMoments: 5,
      commentedMoments: 2,
      silencedMoments: 3,
      silencePct: 60,
      leadVoiceCounts: {},
      voicesOnCommentedMoments: 3,
      avgVoicesPerCommentedMoment: 1.5,
      timeoutCount: 1,
      rejectionCategories: { entailment: 2 },
      totalLatencyMs: 1200,
      expiredFrames: 0,
      adapterConversionFailures: 0,
      staleFrameCount: 0,
    };
    const summary = summarizeRealShadowTelemetry(t, m);
    expect(summary).toContain("voice generation calls: 3");
    expect(summary).toContain("entailment calls: 2");
    expect(summary).toContain("timeouts: 1");
    expect(summary).toContain("entailment");
  });
});
