import { FEATURE_LABELS, type AiFeatureId, UNATTRIBUTED } from "./aiFeatures";

export type UsageEventLike = {
  createdAt: Date;
  provider: string | null;
  model: string | null;
  featureId: string | null;
  intent: string | null;
  userId: string | null;
  leagueId: string | null;
  promptTokens: number;
  cachedInputTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  status: string | null;
  retryCount: number;
  requestId: string | null;
  parentRequestId: string | null;
  generated: boolean | null;
  delivered: boolean | null;
  displayed: boolean | null;
  discarded: boolean | null;
  costPriced: boolean | null;
};

export function attr(value: string | null | undefined, empty: string = UNATTRIBUTED): string {
  const v = (value ?? "").trim();
  return v ? v : empty;
}

export function sumBy<T>(rows: T[], keyFn: (row: T) => string, num: (row: T) => number): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = keyFn(row);
    map.set(k, (map.get(k) ?? 0) + num(row));
  }
  return map;
}

export type GroupRow = {
  key: string;
  requests: number;
  successCount: number;
  errorCount: number;
  retryCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  latencySumMs: number;
  discardedCount: number;
  displayedCount: number;
  generatedCount: number;
  deliveredCount: number;
  lastActivity: Date | null;
};

function emptyGroup(key: string): GroupRow {
  return {
    key,
    requests: 0,
    successCount: 0,
    errorCount: 0,
    retryCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    latencySumMs: 0,
    discardedCount: 0,
    displayedCount: 0,
    generatedCount: 0,
    deliveredCount: 0,
    lastActivity: null,
  };
}

export function accumulate(groups: Map<string, GroupRow>, key: string, row: UsageEventLike): GroupRow {
  const g = groups.get(key) ?? emptyGroup(key);
  g.requests += 1;
  if ((row.status ?? "SUCCESS") === "ERROR") g.errorCount += 1;
  else g.successCount += 1;
  g.retryCount += row.retryCount > 0 ? 1 : 0;
  g.inputTokens += row.promptTokens || 0;
  g.cachedInputTokens += row.cachedInputTokens || 0;
  g.outputTokens += row.completionTokens || 0;
  g.totalTokens += row.totalTokens || 0;
  g.costUsd += row.estimatedCostUsd || 0;
  g.latencySumMs += row.durationMs || 0;
  if (row.discarded) g.discardedCount += 1;
  if (row.displayed) g.displayedCount += 1;
  if (row.generated) g.generatedCount += 1;
  if (row.delivered) g.deliveredCount += 1;
  if (row.createdAt && (!g.lastActivity || row.createdAt > g.lastActivity)) g.lastActivity = row.createdAt;
  groups.set(key, g);
  return g;
}

export function groupEvents(
  rows: UsageEventLike[],
  keyFn: (row: UsageEventLike) => string,
): GroupRow[] {
  const groups = new Map<string, GroupRow>();
  for (const row of rows) accumulate(groups, keyFn(row), row);
  return [...groups.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export function featureBreakdown(rows: UsageEventLike[]) {
  const totalCost = rows.reduce((s, r) => s + (r.estimatedCostUsd || 0), 0);
  return groupEvents(rows, (r) => attr(r.featureId)).map((g) => {
    const avgPrompt = g.requests ? g.inputTokens / g.requests : 0;
    return {
      featureId: g.key,
      featureLabel: FEATURE_LABELS[g.key as AiFeatureId] ?? g.key,
      requests: g.requests,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
      avgPromptTokens: avgPrompt,
      costUsd: g.costUsd,
      pctTotalCost: totalCost > 0 ? (g.costUsd / totalCost) * 100 : 0,
      costPerRequest: g.requests ? g.costUsd / g.requests : 0,
    };
  });
}

export function intentBreakdown(rows: UsageEventLike[]) {
  const advisor = rows.filter((r) => attr(r.featureId) === "ADVISOR");
  const totalCost = advisor.reduce((s, r) => s + (r.estimatedCostUsd || 0), 0);
  return groupEvents(advisor, (r) => attr(r.intent)).map((g) => ({
    intent: g.key,
    requests: g.requests,
    avgInputTokens: g.requests ? g.inputTokens / g.requests : 0,
    avgOutputTokens: g.requests ? g.outputTokens / g.requests : 0,
    totalTokens: g.totalTokens,
    costUsd: g.costUsd,
    costPerRequest: g.requests ? g.costUsd / g.requests : 0,
    pctAdvisorCost: totalCost > 0 ? (g.costUsd / totalCost) * 100 : 0,
  }));
}

export function modelBreakdown(rows: UsageEventLike[]) {
  return groupEvents(rows, (r) => `${attr(r.provider, "UNKNOWN")}::${attr(r.model, "UNKNOWN")}`).map((g) => {
    const [provider, model] = g.key.split("::");
    return {
      provider,
      model,
      requests: g.requests,
      inputTokens: g.inputTokens,
      cachedInputTokens: g.cachedInputTokens,
      outputTokens: g.outputTokens,
      totalTokens: g.totalTokens,
      costUsd: g.costUsd,
      costPerRequest: g.requests ? g.costUsd / g.requests : 0,
      avgLatencyMs: g.requests ? g.latencySumMs / g.requests : 0,
      errorRate: g.requests ? g.errorCount / g.requests : 0,
    };
  });
}

export function userBreakdown(rows: UsageEventLike[]) {
  return groupEvents(rows, (r) => `${attr(r.userId)}::${attr(r.leagueId, "UNKNOWN")}`).map((g) => {
    const [userId, leagueId] = g.key.split("::");
    return {
      userId,
      leagueId,
      requests: g.requests,
      tokens: g.totalTokens,
      costUsd: g.costUsd,
      avgCostPerRequest: g.requests ? g.costUsd / g.requests : 0,
      lastActivity: g.lastActivity,
    };
  });
}

export function dailySeries(rows: UsageEventLike[]) {
  const byDay = new Map<string, { date: string; costUsd: number; requests: number; inputTokens: number; outputTokens: number }>();
  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(date) ?? { date, costUsd: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
    cur.costUsd += row.estimatedCostUsd || 0;
    cur.requests += 1;
    cur.inputTokens += row.promptTokens || 0;
    cur.outputTokens += row.completionTokens || 0;
    byDay.set(date, cur);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function fillDailySeries(
  series: { date: string; costUsd: number; requests: number; inputTokens: number; outputTokens: number }[],
  start: Date,
  end: Date,
) {
  const map = new Map(series.map((r) => [r.date, r]));
  const out: typeof series = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor.getTime() <= last.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    out.push(map.get(date) ?? { date, costUsd: 0, requests: 0, inputTokens: 0, outputTokens: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function wasteMetrics(rows: UsageEventLike[]) {
  let generated = 0;
  let displayed = 0;
  let suppressed = 0;
  let failed = 0;
  let retries = 0;
  let wastedCost = 0;
  for (const row of rows) {
    if (row.generated) generated += 1;
    if (row.displayed) displayed += 1;
    if (row.discarded) {
      suppressed += 1;
      wastedCost += row.estimatedCostUsd || 0;
    }
    if ((row.status ?? "SUCCESS") === "ERROR") {
      failed += 1;
      wastedCost += row.estimatedCostUsd || 0;
    }
    if (row.retryCount > 0) retries += 1;
  }
  return {
    generated,
    displayed,
    suppressed,
    failed,
    retries,
    estimatedWastedCostUsd: wastedCost,
  };
}

export function promptEfficiency(rows: UsageEventLike[]) {
  const n = rows.length;
  const input = rows.reduce((s, r) => s + (r.promptTokens || 0), 0);
  const output = rows.reduce((s, r) => s + (r.completionTokens || 0), 0);
  const tokens = rows.map((r) => r.promptTokens || 0).sort((a, b) => a - b);
  const pct = (p: number) => {
    if (tokens.length === 0) return null;
    const idx = Math.min(tokens.length - 1, Math.max(0, Math.floor((tokens.length - 1) * p)));
    return tokens[idx] ?? null;
  };
  const avgInput = n ? input / n : 0;
  return {
    avgInputTokens: avgInput,
    avgOutputTokens: n ? output / n : 0,
    inputOutputRatio: output > 0 ? input / output : null,
    p50PromptTokens: pct(0.5),
    p95PromptTokens: pct(0.95),
    highPromptFeatures: featureBreakdown(rows)
      .filter((f) => f.avgPromptTokens > avgInput * 1.35 && f.requests >= 3)
      .map((f) => ({ featureId: f.featureId, avgPromptTokens: f.avgPromptTokens })),
    highPromptIntents: intentBreakdown(rows)
      .filter((i) => i.avgInputTokens > avgInput * 1.35 && i.requests >= 3)
      .map((i) => ({ intent: i.intent, avgInputTokens: i.avgInputTokens })),
  };
}

export function totals(rows: UsageEventLike[]) {
  const requests = rows.length;
  const costUsd = rows.reduce((s, r) => s + (r.estimatedCostUsd || 0), 0);
  const inputTokens = rows.reduce((s, r) => s + (r.promptTokens || 0), 0);
  const outputTokens = rows.reduce((s, r) => s + (r.completionTokens || 0), 0);
  const users = new Set(rows.map((r) => r.userId).filter(Boolean));
  const errorCount = rows.filter((r) => (r.status ?? "SUCCESS") === "ERROR").length;
  const retryCount = rows.filter((r) => r.retryCount > 0).length;
  return {
    requests,
    costUsd,
    inputTokens,
    outputTokens,
    avgCostPerRequest: requests ? costUsd / requests : 0,
    costPerActiveUser: users.size ? costUsd / users.size : 0,
    activeUsers: users.size,
    errorCount,
    retryCount,
  };
}
