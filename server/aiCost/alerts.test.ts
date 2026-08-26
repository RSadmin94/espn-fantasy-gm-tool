import { describe, expect, it } from "vitest";
import { detectCostAlerts, type AlertInputs } from "./alerts";

const base: AlertInputs = {
  monthlyBudgetUsd: 100,
  mtdActualUsd: 10,
  projectedMonthEndUsd: 31,
  daysElapsed: 10,
  daysInMonth: 31,
  rangeCostUsd: 10,
  rangeRequests: 20,
  rangeInputTokens: 2000,
  rangeOutputTokens: 400,
  prevCostUsd: 8,
  prevRequests: 20,
  prevAvgInputTokens: 100,
  prevAvgOutputTokens: 20,
  avgInputTokens: 100,
  avgOutputTokens: 20,
  errorCount: 0,
  retryCount: 0,
  prevErrorCount: 0,
  prevRetryCount: 0,
  topFeatureShare: { featureId: "ADVISOR", sharePct: 40 },
  topUserShare: null,
  expensiveModelUsed: null,
  unattributedFeatureCount: 0,
  missingUserCount: 0,
  generalFullCount: 0,
  prevGeneralFullCount: 0,
};

describe("detectCostAlerts", () => {
  it("flags projected over-budget", () => {
    const alerts = detectCostAlerts({ ...base, projectedMonthEndUsd: 140 });
    expect(alerts.some((a) => a.id === "projected_over_budget")).toBe(true);
  });

  it("flags unattributed feature gaps", () => {
    const alerts = detectCostAlerts({ ...base, unattributedFeatureCount: 4 });
    expect(alerts.some((a) => a.id === "missing_feature")).toBe(true);
  });

  it("flags GENERAL_FULL spikes", () => {
    const alerts = detectCostAlerts({ ...base, generalFullCount: 12, prevGeneralFullCount: 2 });
    expect(alerts.some((a) => a.id === "general_full_spike")).toBe(true);
  });

  it("stays quiet on a healthy window", () => {
    const alerts = detectCostAlerts(base);
    expect(alerts.filter((a) => a.severity === "critical")).toHaveLength(0);
  });
});
