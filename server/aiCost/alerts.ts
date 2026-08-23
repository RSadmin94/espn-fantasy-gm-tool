export type AlertSeverity = "info" | "warning" | "critical";

export type CostAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
};

export type AlertInputs = {
  monthlyBudgetUsd: number | null;
  mtdActualUsd: number;
  projectedMonthEndUsd: number;
  daysElapsed: number;
  daysInMonth: number;
  rangeCostUsd: number;
  rangeRequests: number;
  rangeInputTokens: number;
  rangeOutputTokens: number;
  prevCostUsd: number | null;
  prevRequests: number | null;
  prevAvgInputTokens: number | null;
  prevAvgOutputTokens: number | null;
  avgInputTokens: number;
  avgOutputTokens: number;
  errorCount: number;
  retryCount: number;
  prevErrorCount: number | null;
  prevRetryCount: number | null;
  topFeatureShare: { featureId: string; sharePct: number } | null;
  topUserShare: { userId: string; sharePct: number; costUsd: number } | null;
  expensiveModelUsed: { provider: string; model: string; costUsd: number } | null;
  unattributedFeatureCount: number;
  missingUserCount: number;
  generalFullCount: number;
  prevGeneralFullCount: number | null;
};

function expectedDailyBudget(monthly: number, daysInMonth: number): number {
  return daysInMonth > 0 ? monthly / daysInMonth : monthly;
}

/**
 * Deterministic cost/usage alerts. Thresholds are fixed — no model involved.
 */
export function detectCostAlerts(input: AlertInputs): CostAlert[] {
  const alerts: CostAlert[] = [];
  const budget = input.monthlyBudgetUsd;

  if (budget != null && budget > 0 && input.daysElapsed > 0) {
    const dailyExpected = expectedDailyBudget(budget, input.daysInMonth);
    const dailyActual = input.mtdActualUsd / input.daysElapsed;
    if (dailyActual > dailyExpected * 1.25) {
      alerts.push({
        id: "daily_over_pace",
        severity: dailyActual > dailyExpected * 1.75 ? "critical" : "warning",
        title: "Daily spend above expected budget pace",
        detail: `MTD daily run rate is $${dailyActual.toFixed(2)} vs expected $${dailyExpected.toFixed(2)}/day.`,
      });
    }
    if (input.projectedMonthEndUsd > budget) {
      const over = input.projectedMonthEndUsd - budget;
      alerts.push({
        id: "projected_over_budget",
        severity: input.projectedMonthEndUsd > budget * 1.15 ? "critical" : "warning",
        title: "Projected monthly spend exceeds budget",
        detail: `Run-rate projection is $${input.projectedMonthEndUsd.toFixed(2)} ($${over.toFixed(2)} over $${budget.toFixed(2)}).`,
      });
    }
  }

  if (input.prevCostUsd != null && input.rangeRequests > 0 && input.prevRequests != null && input.prevRequests > 0) {
    const cur = input.rangeCostUsd / input.rangeRequests;
    const prev = input.prevCostUsd / input.prevRequests;
    if (prev > 0 && cur > prev * 1.4) {
      alerts.push({
        id: "cost_per_request_up",
        severity: cur > prev * 2 ? "critical" : "warning",
        title: "Cost per request increased significantly",
        detail: `$${cur.toFixed(4)} vs $${prev.toFixed(4)} in the prior equivalent window.`,
      });
    }
  }

  if (input.prevAvgInputTokens != null && input.prevAvgInputTokens > 0 && input.avgInputTokens > input.prevAvgInputTokens * 1.4) {
    alerts.push({
      id: "prompt_tokens_spike",
      severity: "warning",
      title: "Prompt tokens spiked",
      detail: `Average input tokens ${Math.round(input.avgInputTokens)} vs ${Math.round(input.prevAvgInputTokens)} previously.`,
    });
  }

  if (input.prevAvgOutputTokens != null && input.prevAvgOutputTokens > 0 && input.avgOutputTokens > input.prevAvgOutputTokens * 1.4) {
    alerts.push({
      id: "output_tokens_spike",
      severity: "warning",
      title: "Output tokens spiked",
      detail: `Average output tokens ${Math.round(input.avgOutputTokens)} vs ${Math.round(input.prevAvgOutputTokens)} previously.`,
    });
  }

  if (input.topFeatureShare && input.topFeatureShare.sharePct >= 55 && input.rangeCostUsd > 0) {
    alerts.push({
      id: "feature_cost_concentration",
      severity: input.topFeatureShare.sharePct >= 75 ? "critical" : "warning",
      title: "One feature consumes an unusually large share of spend",
      detail: `${input.topFeatureShare.featureId} is ${input.topFeatureShare.sharePct.toFixed(1)}% of filtered AI cost.`,
    });
  }

  if (input.topUserShare && input.topUserShare.sharePct >= 40 && input.topUserShare.costUsd > 1) {
    alerts.push({
      id: "user_usage_outlier",
      severity: input.topUserShare.sharePct >= 60 ? "critical" : "warning",
      title: "One user produces abnormal usage",
      detail: `User ${input.topUserShare.userId} is ${input.topUserShare.sharePct.toFixed(1)}% of filtered cost ($${input.topUserShare.costUsd.toFixed(2)}).`,
    });
  }

  if (input.prevErrorCount != null && input.rangeRequests > 0) {
    const prevErrRate = input.prevRequests && input.prevRequests > 0 ? input.prevErrorCount / input.prevRequests : 0;
    const errRate = input.errorCount / input.rangeRequests;
    if (errRate > 0.08 || (prevErrRate > 0 && errRate > prevErrRate * 2 && input.errorCount >= 3)) {
      alerts.push({
        id: "error_volume",
        severity: errRate > 0.2 ? "critical" : "warning",
        title: "Error volume increased",
        detail: `${input.errorCount} failed requests (${(errRate * 100).toFixed(1)}% error rate).`,
      });
    }
  }

  if (input.retryCount >= 5 && (input.prevRetryCount == null || input.retryCount > Math.max(2, input.prevRetryCount) * 2)) {
    alerts.push({
      id: "retry_volume",
      severity: "warning",
      title: "Retry volume increased",
      detail: `${input.retryCount} retry attempts in the selected window.`,
    });
  }

  if (input.generalFullCount >= 8 && (input.prevGeneralFullCount == null || input.generalFullCount > input.prevGeneralFullCount * 1.5)) {
    alerts.push({
      id: "general_full_spike",
      severity: "warning",
      title: "GENERAL_FULL usage spiked",
      detail: `${input.generalFullCount} Advisor GENERAL_FULL requests in this window.`,
    });
  }

  if (input.expensiveModelUsed && input.expensiveModelUsed.costUsd > 0 && input.rangeCostUsd > 0) {
    const share = (input.expensiveModelUsed.costUsd / input.rangeCostUsd) * 100;
    if (share >= 25) {
      alerts.push({
        id: "expensive_model",
        severity: "info",
        title: "An expensive model accounts for a large share of spend",
        detail: `${input.expensiveModelUsed.provider} / ${input.expensiveModelUsed.model} is ${share.toFixed(1)}% of cost.`,
      });
    }
  }

  if (input.unattributedFeatureCount > 0) {
    alerts.push({
      id: "missing_feature",
      severity: input.unattributedFeatureCount > 20 ? "warning" : "info",
      title: "Requests without feature attribution",
      detail: `${input.unattributedFeatureCount} AI requests stored as UNATTRIBUTED.`,
    });
  }

  if (input.missingUserCount > 0) {
    alerts.push({
      id: "missing_user",
      severity: "info",
      title: "Requests without user attribution",
      detail: `${input.missingUserCount} AI requests have no user id.`,
    });
  }

  return alerts;
}
