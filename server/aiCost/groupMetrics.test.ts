import { describe, expect, it } from "vitest";
import {
  featureBreakdown,
  intentBreakdown,
  modelBreakdown,
  userBreakdown,
  fillDailySeries,
  wasteMetrics,
  type UsageEventLike,
} from "./groupMetrics";
import { resolveDateRange } from "./dateRange";

function ev(partial: Partial<UsageEventLike> & { createdAt?: Date }): UsageEventLike {
  return {
    createdAt: partial.createdAt ?? new Date("2026-08-10T12:00:00Z"),
    provider: "provider" in partial ? (partial.provider ?? null) : "ANTHROPIC",
    model: "model" in partial ? (partial.model ?? null) : "claude-sonnet-4-20250514",
    featureId: "featureId" in partial ? (partial.featureId ?? null) : "ADVISOR",
    intent: "intent" in partial ? (partial.intent ?? null) : "UNATTRIBUTED",
    userId: "userId" in partial ? (partial.userId ?? null) : "1",
    leagueId: "leagueId" in partial ? (partial.leagueId ?? null) : "457622",
    promptTokens: partial.promptTokens ?? 100,
    cachedInputTokens: partial.cachedInputTokens ?? 0,
    completionTokens: partial.completionTokens ?? 20,
    totalTokens: partial.totalTokens ?? 120,
    estimatedCostUsd: partial.estimatedCostUsd ?? 0.01,
    durationMs: partial.durationMs ?? 800,
    status: partial.status ?? "SUCCESS",
    retryCount: partial.retryCount ?? 0,
    requestId: partial.requestId ?? "r1",
    parentRequestId: partial.parentRequestId ?? null,
    generated: partial.generated ?? true,
    delivered: partial.delivered ?? true,
    displayed: partial.displayed ?? null,
    discarded: partial.discarded ?? false,
    costPriced: partial.costPriced ?? true,
  };
}

describe("aggregation grouping", () => {
  const rows = [
    ev({ featureId: "ADVISOR", intent: "UNATTRIBUTED", estimatedCostUsd: 0.4, promptTokens: 200 }),
    ev({ featureId: "TRADE_ANALYSIS", intent: null, estimatedCostUsd: 0.1, promptTokens: 50, userId: "2" }),
    ev({ featureId: "ADVISOR", intent: "UNATTRIBUTED", estimatedCostUsd: 0.2, promptTokens: 300 }),
  ];

  it("groups by feature and reports percent of cost", () => {
    const features = featureBreakdown(rows);
    const advisor = features.find((f) => f.featureId === "ADVISOR");
    expect(advisor?.requests).toBe(2);
    expect(advisor?.pctTotalCost).toBeCloseTo((0.6 / 0.7) * 100, 5);
  });

  it("groups Advisor intents only", () => {
    const intents = intentBreakdown(rows);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.intent).toBe("UNATTRIBUTED");
    expect(intents[0]?.requests).toBe(2);
  });

  it("groups provider → model", () => {
    const models = modelBreakdown(rows);
    expect(models[0]?.provider).toBe("ANTHROPIC");
    expect(models[0]?.requests).toBe(3);
  });

  it("groups users", () => {
    const users = userBreakdown(rows);
    expect(users).toHaveLength(2);
  });

  it("fills missing days in a custom range", () => {
    const range = resolveDateRange({
      preset: "custom",
      start: "2026-08-01",
      end: "2026-08-03",
      now: new Date("2026-08-10T00:00:00Z"),
    });
    const filled = fillDailySeries(
      [{ date: "2026-08-02", costUsd: 1, requests: 2, inputTokens: 10, outputTokens: 4 }],
      range.start,
      range.end,
    );
    expect(filled.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
    expect(filled[0]?.requests).toBe(0);
    expect(filled[1]?.costUsd).toBe(1);
  });
});

describe("attribution gaps", () => {
  it("keeps missing feature as UNATTRIBUTED", () => {
    const features = featureBreakdown([ev({ featureId: null })]);
    expect(features[0]?.featureId).toBe("UNATTRIBUTED");
  });

  it("keeps missing intent on Advisor as UNATTRIBUTED", () => {
    const intents = intentBreakdown([ev({ intent: null, featureId: "ADVISOR" })]);
    expect(intents[0]?.intent).toBe("UNATTRIBUTED");
  });

  it("keeps missing user as UNATTRIBUTED", () => {
    const users = userBreakdown([ev({ userId: null })]);
    expect(users[0]?.userId).toBe("UNATTRIBUTED");
  });
});

describe("retry handling", () => {
  it("counts each retry attempt separately without collapsing request metadata", () => {
    const rows = [
      ev({ requestId: "a1", parentRequestId: "logical-1", retryCount: 0, estimatedCostUsd: 0.01 }),
      ev({ requestId: "a2", parentRequestId: "logical-1", retryCount: 1, estimatedCostUsd: 0.01 }),
    ];
    const features = featureBreakdown(rows);
    expect(features[0]?.requests).toBe(2);
    expect(features[0]?.costUsd).toBeCloseTo(0.02, 8);
    expect(rows[0]?.requestId).not.toBe(rows[1]?.requestId);
    expect(rows[0]?.parentRequestId).toBe(rows[1]?.parentRequestId);
  });
});

describe("waste", () => {
  it("counts discarded and failed cost conservatively", () => {
    const w = wasteMetrics([
      ev({ generated: true, delivered: true, discarded: false, status: "SUCCESS", estimatedCostUsd: 1 }),
      ev({ discarded: true, estimatedCostUsd: 0.25, status: "SUCCESS" }),
      ev({ status: "ERROR", estimatedCostUsd: 0.1, generated: false, delivered: false }),
    ]);
    expect(w.suppressed).toBe(1);
    expect(w.failed).toBe(1);
    expect(w.estimatedWastedCostUsd).toBeCloseTo(0.35, 8);
  });
});
