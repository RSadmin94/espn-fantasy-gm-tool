import { and, eq, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { usageEvents, users, leagueConnections } from "../../drizzle/schema";
import { FEATURE_LABELS, type AiFeatureId, UNATTRIBUTED } from "./aiFeatures";
import { fillDailySeries } from "./groupMetrics";
import { detectCostAlerts, type CostAlert } from "./alerts";
import { computeBudgetHealth, periodDelta, projectMonthlySpend } from "./projections";
import { monthBounds, previousEquivalentRange, type ResolvedDateRange } from "./dateRange";
import { getMonthlyAiBudgetUsd } from "./aiBudget";

export type UsageDashboardFilters = {
  range: ResolvedDateRange;
  provider?: string | null;
  model?: string | null;
  featureId?: string | null;
  intent?: string | null;
  leagueId?: string | null;
  userId?: string | null;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown, fallback: string = UNATTRIBUTED): string {
  const s = v == null ? "" : String(v).trim();
  return s || fallback;
}

async function llmWhere(filters: UsageDashboardFilters, start: Date, end: Date) {
  const conds = [
    eq(usageEvents.eventCategory, "llm"),
    gte(usageEvents.createdAt, start),
    lte(usageEvents.createdAt, end),
  ];
  if (filters.provider) conds.push(eq(usageEvents.provider, filters.provider));
  if (filters.model) conds.push(eq(usageEvents.model, filters.model));
  if (filters.featureId) conds.push(eq(usageEvents.featureId, filters.featureId));
  if (filters.intent) conds.push(eq(usageEvents.intent, filters.intent));
  if (filters.leagueId) conds.push(eq(usageEvents.leagueId, filters.leagueId));
  if (filters.userId) conds.push(eq(usageEvents.userId, filters.userId));
  return and(...conds);
}

async function loadKpi(filters: UsageDashboardFilters, start: Date, end: Date) {
  const db = await getDb();
  if (!db) {
    return {
      requests: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      activeUsers: 0,
      errorCount: 0,
      retryCount: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      discardedCount: 0,
      generatedCount: 0,
      displayedCount: 0,
      deliveredCount: 0,
      unattributedFeatureCount: 0,
      missingUserCount: 0,
      generalFullCount: 0,
    };
  }
  const where = await llmWhere(filters, start, end);
  const rows = await db
    .select({
      requests: sql<number>`COUNT(*)`,
      costUsd: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
      inputTokens: sql<number>`COALESCE(SUM(${usageEvents.promptTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${usageEvents.completionTokens}), 0)`,
      activeUsers: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
      errorCount: sql<number>`SUM(CASE WHEN ${usageEvents.status} = 'ERROR' THEN 1 ELSE 0 END)`,
      retryCount: sql<number>`SUM(CASE WHEN ${usageEvents.retryCount} > 0 THEN 1 ELSE 0 END)`,
      discardedCount: sql<number>`SUM(CASE WHEN ${usageEvents.discarded} = 1 THEN 1 ELSE 0 END)`,
      generatedCount: sql<number>`SUM(CASE WHEN ${usageEvents.generated} = 1 THEN 1 ELSE 0 END)`,
      displayedCount: sql<number>`SUM(CASE WHEN ${usageEvents.displayed} = 1 THEN 1 ELSE 0 END)`,
      deliveredCount: sql<number>`SUM(CASE WHEN ${usageEvents.delivered} = 1 THEN 1 ELSE 0 END)`,
      wastedCost: sql<number>`COALESCE(SUM(CASE WHEN ${usageEvents.discarded} = 1 OR ${usageEvents.status} = 'ERROR' THEN ${usageEvents.estimatedCostUsd} ELSE 0 END), 0)`,
      unattributedFeatureCount: sql<number>`SUM(CASE WHEN ${usageEvents.featureId} IS NULL OR ${usageEvents.featureId} IN ('UNATTRIBUTED','UNKNOWN') THEN 1 ELSE 0 END)`,
      missingUserCount: sql<number>`SUM(CASE WHEN ${usageEvents.userId} IS NULL OR ${usageEvents.userId} = '' THEN 1 ELSE 0 END)`,
      generalFullCount: sql<number>`SUM(CASE WHEN ${usageEvents.intent} = 'GENERAL_FULL' THEN 1 ELSE 0 END)`,
    })
    .from(usageEvents)
    .where(where);
  const r = rows[0];
  const requests = num(r?.requests);
  return {
    requests,
    costUsd: num(r?.costUsd),
    inputTokens: num(r?.inputTokens),
    outputTokens: num(r?.outputTokens),
    activeUsers: num(r?.activeUsers),
    errorCount: num(r?.errorCount),
    retryCount: num(r?.retryCount),
    avgInputTokens: requests ? num(r?.inputTokens) / requests : 0,
    avgOutputTokens: requests ? num(r?.outputTokens) / requests : 0,
    discardedCount: num(r?.discardedCount),
    generatedCount: num(r?.generatedCount),
    displayedCount: num(r?.displayedCount),
    deliveredCount: num(r?.deliveredCount),
    wastedCostUsd: num(r?.wastedCost),
    unattributedFeatureCount: num(r?.unattributedFeatureCount),
    missingUserCount: num(r?.missingUserCount),
    generalFullCount: num(r?.generalFullCount),
  };
}

export async function loadUsageDashboard(filters: UsageDashboardFilters) {
  const db = await getDb();
  const { range } = filters;
  const prev = previousEquivalentRange(range);
  const month = monthBounds();
  const budget = await getMonthlyAiBudgetUsd();

  const current = await loadKpi(filters, range.start, range.end);
  const previous = await loadKpi(filters, prev.start, prev.end);
  const mtd = await loadKpi({ ...filters, range: { ...range, start: month.start, end: new Date() } }, month.start, new Date());

  const budgetHealth = computeBudgetHealth({
    monthlyBudgetUsd: budget,
    mtdActualUsd: mtd.costUsd,
  });
  const proj = projectMonthlySpend(mtd.costUsd);

  let daily: { date: string; costUsd: number; requests: number; inputTokens: number; outputTokens: number }[] = [];
  let features: ReturnType<typeof mapFeatureRows> = [];
  let intents: ReturnType<typeof mapIntentRows> = [];
  let models: ReturnType<typeof mapModelRows> = [];
  let userRows: ReturnType<typeof mapUserRows> = [];
  let filterOptions = { providers: [] as string[], models: [] as string[], features: [] as string[], intents: [] as string[], leagues: [] as string[] };
  let p50Prompt: number | null = null;
  let p95Prompt: number | null = null;
  let expensiveModel: { provider: string; model: string; costUsd: number } | null = null;

  if (db) {
    const where = await llmWhere(filters, range.start, range.end);

    const dayRows = await db
      .select({
        date: sql<string>`DATE(${usageEvents.createdAt})`,
        requests: sql<number>`COUNT(*)`,
        costUsd: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
        inputTokens: sql<number>`COALESCE(SUM(${usageEvents.promptTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${usageEvents.completionTokens}), 0)`,
      })
      .from(usageEvents)
      .where(where)
      .groupBy(sql`DATE(${usageEvents.createdAt})`)
      .orderBy(sql`DATE(${usageEvents.createdAt}) ASC`);
    daily = fillDailySeries(
      dayRows.map((r) => ({
        date: String(r.date).slice(0, 10),
        requests: num(r.requests),
        costUsd: num(r.costUsd),
        inputTokens: num(r.inputTokens),
        outputTokens: num(r.outputTokens),
      })),
      range.start,
      range.end,
    );

    const featureRows = await db
      .select({
        featureId: usageEvents.featureId,
        requests: sql<number>`COUNT(*)`,
        inputTokens: sql<number>`COALESCE(SUM(${usageEvents.promptTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${usageEvents.completionTokens}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
      })
      .from(usageEvents)
      .where(where)
      .groupBy(usageEvents.featureId)
      .orderBy(sql`SUM(${usageEvents.estimatedCostUsd}) DESC`);
    features = mapFeatureRows(featureRows, current.costUsd);

    const intentRows = await db
      .select({
        intent: usageEvents.intent,
        requests: sql<number>`COUNT(*)`,
        inputTokens: sql<number>`COALESCE(SUM(${usageEvents.promptTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${usageEvents.completionTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
      })
      .from(usageEvents)
      .where(and(where, eq(usageEvents.featureId, "ADVISOR")))
      .groupBy(usageEvents.intent)
      .orderBy(sql`SUM(${usageEvents.estimatedCostUsd}) DESC`);
    const advisorCost = intentRows.reduce((s, r) => s + num(r.costUsd), 0);
    intents = mapIntentRows(intentRows, advisorCost);

    const modelRows = await db
      .select({
        provider: usageEvents.provider,
        model: usageEvents.model,
        requests: sql<number>`COUNT(*)`,
        inputTokens: sql<number>`COALESCE(SUM(${usageEvents.promptTokens}), 0)`,
        cachedInputTokens: sql<number>`COALESCE(SUM(${usageEvents.cachedInputTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${usageEvents.completionTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
        latencySum: sql<number>`COALESCE(SUM(${usageEvents.durationMs}), 0)`,
        errorCount: sql<number>`SUM(CASE WHEN ${usageEvents.status} = 'ERROR' THEN 1 ELSE 0 END)`,
      })
      .from(usageEvents)
      .where(where)
      .groupBy(usageEvents.provider, usageEvents.model)
      .orderBy(sql`SUM(${usageEvents.estimatedCostUsd}) DESC`);
    models = mapModelRows(modelRows);
    expensiveModel = models
      .filter((m) => /opus|gpt-4o$|gpt-4\.1$|pro/i.test(m.model) || m.costPerRequest > 0.02)
      .sort((a, b) => b.costUsd - a.costUsd)[0] ?? null;

    const userAgg = await db
      .select({
        userId: usageEvents.userId,
        leagueId: usageEvents.leagueId,
        requests: sql<number>`COUNT(*)`,
        tokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
        lastActivity: sql<Date>`MAX(${usageEvents.createdAt})`,
      })
      .from(usageEvents)
      .where(where)
      .groupBy(usageEvents.userId, usageEvents.leagueId)
      .orderBy(sql`SUM(${usageEvents.estimatedCostUsd}) DESC`)
      .limit(100);

    const userIds = userAgg.map((r) => Number(r.userId)).filter((id) => Number.isFinite(id) && id > 0);
    const nameById = new Map<number, string>();
    if (userIds.length > 0) {
      const nameRows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of nameRows) {
        nameById.set(u.id, (u.name || "").trim() || `User ${u.id}`);
      }
    }
    const leagueIds = [...new Set(userAgg.map((r) => r.leagueId).filter(Boolean) as string[])];
    const leagueNameById = new Map<string, string>();
    if (leagueIds.length > 0) {
      const leagues = await db
        .select({ leagueId: leagueConnections.leagueId, leagueName: leagueConnections.leagueName })
        .from(leagueConnections)
        .where(inArray(leagueConnections.leagueId, leagueIds));
      for (const l of leagues) {
        if (l.leagueId && !leagueNameById.has(l.leagueId)) {
          leagueNameById.set(l.leagueId, l.leagueName || l.leagueId);
        }
      }
    }
    userRows = mapUserRows(userAgg, nameById, leagueNameById);

    const optRows = await db
      .select({
        provider: usageEvents.provider,
        model: usageEvents.model,
        featureId: usageEvents.featureId,
        intent: usageEvents.intent,
        leagueId: usageEvents.leagueId,
      })
      .from(usageEvents)
      .where(and(eq(usageEvents.eventCategory, "llm"), gte(usageEvents.createdAt, range.start), lte(usageEvents.createdAt, range.end)));
    filterOptions = {
      providers: uniq(optRows.map((r) => r.provider).filter(Boolean) as string[]),
      models: uniq(optRows.map((r) => r.model).filter(Boolean) as string[]),
      features: uniq(optRows.map((r) => r.featureId).filter(Boolean) as string[]),
      intents: uniq(optRows.map((r) => r.intent).filter(Boolean) as string[]),
      leagues: uniq(optRows.map((r) => r.leagueId).filter(Boolean) as string[]),
    };

    const tokenCountRows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(usageEvents)
      .where(where);
    const n = num(tokenCountRows[0]?.n);
    if (n > 0) {
      const p50off = Math.max(0, Math.floor((n - 1) * 0.5));
      const p95off = Math.max(0, Math.floor((n - 1) * 0.95));
      const p50rows = await db
        .select({ promptTokens: usageEvents.promptTokens })
        .from(usageEvents)
        .where(where)
        .orderBy(usageEvents.promptTokens)
        .limit(1)
        .offset(p50off);
      const p95rows = await db
        .select({ promptTokens: usageEvents.promptTokens })
        .from(usageEvents)
        .where(where)
        .orderBy(usageEvents.promptTokens)
        .limit(1)
        .offset(p95off);
      p50Prompt = p50rows[0]?.promptTokens ?? null;
      p95Prompt = p95rows[0]?.promptTokens ?? null;
    }
  }

  const costDelta = periodDelta(current.costUsd, previous.requests > 0 || previous.costUsd > 0 ? previous.costUsd : null);
  const reqDelta = periodDelta(current.requests, previous.requests > 0 ? previous.requests : null);

  const topFeature = features[0]
    ? { featureId: features[0].featureId, sharePct: features[0].pctTotalCost }
    : null;
  const topUser = userRows[0] && current.costUsd > 0
    ? {
        userId: userRows[0].userId,
        sharePct: (userRows[0].costUsd / current.costUsd) * 100,
        costUsd: userRows[0].costUsd,
      }
    : null;

  const alerts: CostAlert[] = detectCostAlerts({
    monthlyBudgetUsd: budget,
    mtdActualUsd: mtd.costUsd,
    projectedMonthEndUsd: proj.projectedMonthEndUsd,
    daysElapsed: proj.daysElapsed,
    daysInMonth: proj.daysInMonth,
    rangeCostUsd: current.costUsd,
    rangeRequests: current.requests,
    rangeInputTokens: current.inputTokens,
    rangeOutputTokens: current.outputTokens,
    prevCostUsd: previous.costUsd,
    prevRequests: previous.requests,
    prevAvgInputTokens: previous.requests ? previous.avgInputTokens : null,
    prevAvgOutputTokens: previous.requests ? previous.avgOutputTokens : null,
    avgInputTokens: current.avgInputTokens,
    avgOutputTokens: current.avgOutputTokens,
    errorCount: current.errorCount,
    retryCount: current.retryCount,
    prevErrorCount: previous.errorCount,
    prevRetryCount: previous.retryCount,
    topFeatureShare: topFeature,
    topUserShare: topUser,
    expensiveModelUsed: expensiveModel
      ? { provider: expensiveModel.provider, model: expensiveModel.model, costUsd: expensiveModel.costUsd }
      : null,
    unattributedFeatureCount: current.unattributedFeatureCount,
    missingUserCount: current.missingUserCount,
    generalFullCount: current.generalFullCount,
    prevGeneralFullCount: previous.generalFullCount,
  });

  const avgInput = current.avgInputTokens;
  const highPromptFeatures = features
    .filter((f) => f.avgPromptTokens > avgInput * 1.35 && f.requests >= 3)
    .map((f) => ({ featureId: f.featureId, avgPromptTokens: f.avgPromptTokens }));
  const highPromptIntents = intents
    .filter((i) => i.avgInputTokens > avgInput * 1.35 && i.requests >= 3)
    .map((i) => ({ intent: i.intent, avgInputTokens: i.avgInputTokens }));

  return {
    empty: current.requests === 0 && mtd.costUsd === 0,
    range: {
      preset: range.preset,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      label: range.label,
      dayCount: range.dayCount,
    },
    kpis: {
      mtdSpendUsd: mtd.costUsd,
      projectedMonthlyUsd: proj.projectedMonthEndUsd,
      budgetUsed: budgetHealth,
      requests: current.requests,
      requestsDeltaPct: reqDelta.deltaPct,
      avgCostPerRequest: current.requests ? current.costUsd / current.requests : 0,
      costPerActiveUser: current.activeUsers ? current.costUsd / current.activeUsers : 0,
      inputTokens: current.inputTokens,
      outputTokens: current.outputTokens,
      spendUsd: current.costUsd,
      spendDeltaPct: costDelta.deltaPct,
      hasPrevious: costDelta.previous != null,
    },
    daily,
    features,
    intents,
    models,
    users: userRows,
    waste: {
      generated: current.generatedCount,
      displayed: current.displayedCount,
      delivered: current.deliveredCount,
      suppressed: current.discardedCount,
      failed: current.errorCount,
      retries: current.retryCount,
      estimatedWastedCostUsd: current.wastedCostUsd ?? 0,
    },
    efficiency: {
      avgInputTokens: current.avgInputTokens,
      avgOutputTokens: current.avgOutputTokens,
      inputOutputRatio: current.outputTokens > 0 ? current.inputTokens / current.outputTokens : null,
      p50PromptTokens: p50Prompt,
      p95PromptTokens: p95Prompt,
      highPromptFeatures,
      highPromptIntents,
    },
    alerts,
    filterOptions,
    budgetHealth,
  };
}

function mapFeatureRows(
  rows: { featureId: string | null; requests: unknown; inputTokens: unknown; outputTokens: unknown; costUsd: unknown }[],
  totalCost: number,
) {
  return rows.map((r) => {
    const featureId = str(r.featureId);
    const requests = num(r.requests);
    const inputTokens = num(r.inputTokens);
    const outputTokens = num(r.outputTokens);
    const costUsd = num(r.costUsd);
    return {
      featureId,
      featureLabel: FEATURE_LABELS[featureId as AiFeatureId] ?? featureId,
      requests,
      inputTokens,
      outputTokens,
      avgPromptTokens: requests ? inputTokens / requests : 0,
      costUsd,
      pctTotalCost: totalCost > 0 ? (costUsd / totalCost) * 100 : 0,
      costPerRequest: requests ? costUsd / requests : 0,
    };
  });
}

function mapIntentRows(
  rows: {
    intent: string | null;
    requests: unknown;
    inputTokens: unknown;
    outputTokens: unknown;
    totalTokens: unknown;
    costUsd: unknown;
  }[],
  advisorCost: number,
) {
  return rows.map((r) => {
    const requests = num(r.requests);
    const inputTokens = num(r.inputTokens);
    const outputTokens = num(r.outputTokens);
    const costUsd = num(r.costUsd);
    return {
      intent: str(r.intent),
      requests,
      avgInputTokens: requests ? inputTokens / requests : 0,
      avgOutputTokens: requests ? outputTokens / requests : 0,
      totalTokens: num(r.totalTokens),
      costUsd,
      costPerRequest: requests ? costUsd / requests : 0,
      pctAdvisorCost: advisorCost > 0 ? (costUsd / advisorCost) * 100 : 0,
    };
  });
}

function mapModelRows(
  rows: {
    provider: string | null;
    model: string | null;
    requests: unknown;
    inputTokens: unknown;
    cachedInputTokens: unknown;
    outputTokens: unknown;
    totalTokens: unknown;
    costUsd: unknown;
    latencySum: unknown;
    errorCount: unknown;
  }[],
) {
  return rows
    .filter((r) => r.provider || r.model)
    .map((r) => {
      const requests = num(r.requests);
      const costUsd = num(r.costUsd);
      return {
        provider: str(r.provider, "UNKNOWN"),
        model: str(r.model, "UNKNOWN"),
        requests,
        inputTokens: num(r.inputTokens),
        cachedInputTokens: num(r.cachedInputTokens),
        outputTokens: num(r.outputTokens),
        totalTokens: num(r.totalTokens),
        costUsd,
        costPerRequest: requests ? costUsd / requests : 0,
        avgLatencyMs: requests ? num(r.latencySum) / requests : 0,
        errorRate: requests ? num(r.errorCount) / requests : 0,
      };
    });
}

function mapUserRows(
  rows: {
    userId: string | null;
    leagueId: string | null;
    requests: unknown;
    tokens: unknown;
    costUsd: unknown;
    lastActivity: Date | null;
  }[],
  nameById: Map<number, string>,
  leagueNameById: Map<string, string>,
) {
  const meanCost = rows.length ? rows.reduce((s, r) => s + num(r.costUsd), 0) / rows.length : 0;
  return rows.map((r) => {
    const userId = str(r.userId);
    const leagueId = str(r.leagueId, "UNKNOWN");
    const costUsd = num(r.costUsd);
    const numericId = Number(r.userId);
    return {
      userId,
      userLabel: Number.isFinite(numericId) ? (nameById.get(numericId) ?? userId) : userId,
      leagueId,
      leagueLabel: leagueId === "UNKNOWN" ? "—" : (leagueNameById.get(leagueId) ?? leagueId),
      requests: num(r.requests),
      tokens: num(r.tokens),
      costUsd,
      avgCostPerRequest: num(r.requests) ? costUsd / num(r.requests) : 0,
      lastActivity: r.lastActivity ? new Date(r.lastActivity).toISOString() : null,
      highUsage: meanCost > 0 && costUsd > meanCost * 3 && costUsd > 0.5,
    };
  });
}

function uniq(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export async function loadUsageEventByRequestId(requestId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(usageEvents)
    .where(and(eq(usageEvents.eventCategory, "llm"), eq(usageEvents.requestId, requestId)))
    .orderBy(desc(usageEvents.createdAt))
    .limit(5);
  return rows;
}
