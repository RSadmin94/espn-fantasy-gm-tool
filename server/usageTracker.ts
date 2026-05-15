/**
 * usageTracker.ts
 * ───────────────
 * Single write path for all backend usage events.
 *
 * Three event categories:
 *   "llm"   — every invokeLLM / invokeLLMStream call
 *   "espn"  — every fetchEspnViewsHardened call
 *   "trpc"  — key tRPC procedure hits (advisor.chat, refresh pipelines, etc.)
 *
 * Cost model (Gemini 2.5 Flash, May 2026 pricing):
 *   Input:  $0.15 / 1M tokens  → $0.00000015 / token
 *   Output: $0.60 / 1M tokens  → $0.00000060 / token
 *
 * All writes are fire-and-forget (never throw, never block the caller).
 */

import { getDb } from "./db";
import { usageEvents } from "../drizzle/schema";

// ─── Cost model ───────────────────────────────────────────────────────────────

/** Per-token USD cost for known models. Falls back to Gemini Flash pricing. */
const MODEL_PRICING: Record<string, { inputPerToken: number; outputPerToken: number }> = {
  "gemini-2.5-flash":       { inputPerToken: 0.00000015, outputPerToken: 0.00000060 },
  "gemini-2.0-flash":       { inputPerToken: 0.00000010, outputPerToken: 0.00000040 },
  "gemini-1.5-flash":       { inputPerToken: 0.000000075, outputPerToken: 0.00000030 },
  "gpt-4o":                 { inputPerToken: 0.0000025,  outputPerToken: 0.000010   },
  "gpt-4o-mini":            { inputPerToken: 0.00000015, outputPerToken: 0.00000060 },
  "claude-3-5-sonnet":      { inputPerToken: 0.000003,   outputPerToken: 0.000015   },
  "claude-3-haiku":         { inputPerToken: 0.00000025, outputPerToken: 0.00000125 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["gemini-2.5-flash"];
  return promptTokens * pricing.inputPerToken + completionTokens * pricing.outputPerToken;
}

// ─── Event types ──────────────────────────────────────────────────────────────

export interface LLMUsageEvent {
  featureName: string;       // e.g. "tradeNarrative.generateSentence"
  callType?: string;         // e.g. "json_structured"
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  streaming: boolean;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface EspnUsageEvent {
  featureName: string;       // e.g. "espn.fetchViews"
  viewNames: string[];       // e.g. ["mMatchup", "mTeam"]
  season: number;
  durationMs: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface TrpcUsageEvent {
  featureName: string;       // e.g. "advisor.chat"
  durationMs?: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/** Fire-and-forget: never throws, never awaited by callers. */
async function writeEvent(row: typeof usageEvents.$inferInsert): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(usageEvents).values(row);
  } catch {
    // Silently swallow — usage tracking must never break the main flow
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Track an LLM call. Call this from the persistUsage hook in invokeLLM,
 * or directly from streaming handlers.
 */
export function trackLLMEvent(event: LLMUsageEvent): void {
  const cost = estimateCost(event.model, event.promptTokens, event.completionTokens);
  void writeEvent({
    eventCategory: "llm",
    featureName: event.featureName,
    callType: event.callType ?? "unspecified",
    promptTokens: event.promptTokens,
    completionTokens: event.completionTokens,
    totalTokens: event.totalTokens,
    estimatedCostUsd: cost,
    durationMs: event.durationMs,
    userId: event.userId,
    model: event.model,
    streaming: event.streaming,
    metadata: event.metadata ? JSON.stringify(event.metadata) : undefined,
  });
}

/**
 * Track an ESPN API fetch. Call this from fetchEspnViewsHardened.
 */
export function trackEspnEvent(event: EspnUsageEvent): void {
  void writeEvent({
    eventCategory: "espn",
    featureName: event.featureName,
    callType: event.viewNames.join(","),
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    durationMs: event.durationMs,
    userId: event.userId,
    model: null,
    streaming: false,
    metadata: JSON.stringify({ season: event.season, views: event.viewNames, ...event.metadata }),
  });
}

/**
 * Track a tRPC procedure hit. Call this at the start of key procedures.
 */
export function trackTrpcEvent(event: TrpcUsageEvent): void {
  void writeEvent({
    eventCategory: "trpc",
    featureName: event.featureName,
    callType: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    durationMs: event.durationMs ?? 0,
    userId: event.userId,
    model: null,
    streaming: false,
    metadata: event.metadata ? JSON.stringify(event.metadata) : undefined,
  });
}

// ─── Aggregation helpers (used by the monitor router) ─────────────────────────

export interface FeatureSummaryRow {
  featureName: string;
  eventCategory: string;
  callCount: number;
  totalTokens: number;
  totalCostUsd: number;
  avgDurationMs: number;
  lastUsedAt: Date | null;
}

export interface DailyTrendRow {
  date: string;       // "YYYY-MM-DD"
  callCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface TopCallerRow {
  userId: string;
  callCount: number;
  totalCostUsd: number;
}

export interface LLMCallLogRow {
  id: number;
  featureName: string;
  model: string | null;
  callType: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  streaming: boolean;
  userId: string | null;
  createdAt: Date;
}

/** Aggregate per-feature stats for the last N days. */
export async function getFeatureSummary(days = 30): Promise<FeatureSummaryRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        featureName: usageEvents.featureName,
        eventCategory: usageEvents.eventCategory,
        callCount: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`SUM(${usageEvents.totalTokens})`,
        totalCostUsd: sql<number>`SUM(${usageEvents.estimatedCostUsd})`,
        avgDurationMs: sql<number>`AVG(${usageEvents.durationMs})`,
        lastUsedAt: sql<Date>`MAX(${usageEvents.createdAt})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(usageEvents.featureName, usageEvents.eventCategory)
      .orderBy(sql`SUM(${usageEvents.estimatedCostUsd}) DESC`);
    return rows as FeatureSummaryRow[];
  } catch {
    return [];
  }
}

/** Daily aggregation for trend charts. */
export async function getDailyTrend(days = 30): Promise<DailyTrendRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        date: sql<string>`DATE(${usageEvents.createdAt})`,
        callCount: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`SUM(${usageEvents.totalTokens})`,
        totalCostUsd: sql<number>`SUM(${usageEvents.estimatedCostUsd})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(sql`DATE(${usageEvents.createdAt})`)
      .orderBy(sql`DATE(${usageEvents.createdAt}) ASC`);
    return rows as DailyTrendRow[];
  } catch {
    return [];
  }
}

/** Top callers by cost. */
export async function getTopCallers(days = 30, limit = 20): Promise<TopCallerRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql, isNotNull } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        userId: usageEvents.userId,
        callCount: sql<number>`COUNT(*)`,
        totalCostUsd: sql<number>`SUM(${usageEvents.estimatedCostUsd})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${cutoff} AND ${isNotNull(usageEvents.userId)}`)
      .groupBy(usageEvents.userId)
      .orderBy(sql`SUM(${usageEvents.estimatedCostUsd}) DESC`)
      .limit(limit);
    return rows as TopCallerRow[];
  } catch {
    return [];
  }
}

/** Recent LLM call log. */
export async function getLLMCallLog(limit = 100): Promise<LLMCallLogRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.eventCategory, "llm"))
      .orderBy(usageEvents.createdAt)
      .limit(limit);
    return rows as LLMCallLogRow[];
  } catch {
    return [];
  }
}

/** Total cost and call count for a given period. */
export async function getCostSummary(days = 30): Promise<{
  totalCostUsd: number;
  totalCalls: number;
  llmCostUsd: number;
  llmCalls: number;
  espnCalls: number;
  trpcCalls: number;
}> {
  try {
    const db = await getDb();
    if (!db) return { totalCostUsd: 0, totalCalls: 0, llmCostUsd: 0, llmCalls: 0, espnCalls: 0, trpcCalls: 0 };
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        eventCategory: usageEvents.eventCategory,
        callCount: sql<number>`COUNT(*)`,
        totalCostUsd: sql<number>`SUM(${usageEvents.estimatedCostUsd})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(usageEvents.eventCategory);

    let totalCostUsd = 0, totalCalls = 0, llmCostUsd = 0, llmCalls = 0, espnCalls = 0, trpcCalls = 0;
    for (const row of rows) {
      totalCalls += Number(row.callCount);
      totalCostUsd += Number(row.totalCostUsd);
      if (row.eventCategory === "llm") { llmCostUsd = Number(row.totalCostUsd); llmCalls = Number(row.callCount); }
      if (row.eventCategory === "espn") espnCalls = Number(row.callCount);
      if (row.eventCategory === "trpc") trpcCalls = Number(row.callCount);
    }
    return { totalCostUsd, totalCalls, llmCostUsd, llmCalls, espnCalls, trpcCalls };
  } catch {
    return { totalCostUsd: 0, totalCalls: 0, llmCostUsd: 0, llmCalls: 0, espnCalls: 0, trpcCalls: 0 };
  }
}

// ─── UI Event tracking (client-side events) ───────────────────────────────────

export interface UIUsageEvent {
  eventType: "page_view" | "feature_open" | "ai_action" | "cta_click" | "session_start" | "return_visit" | "league_switch" | "tab_view" | "drop_off";
  featureName: string;
  page: string | null;
  action: string | null;
  sessionId: string | null;
  userId: string | null;
  metadata: string | null;
}

/**
 * Track a client-side UI event (page_view, feature_open, ai_action, cta_click, etc.)
 * Called from the logUIEvent tRPC mutation.
 */
export async function trackUIEvent(event: UIUsageEvent): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(usageEvents).values({
      eventCategory: "ui",
      eventType: event.eventType,
      featureName: event.featureName,
      page: event.page ?? undefined,
      action: event.action ?? undefined,
      sessionId: event.sessionId ?? undefined,
      callType: event.eventType,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      durationMs: 0,
      userId: event.userId ?? undefined,
      model: null,
      streaming: false,
      metadata: event.metadata ?? undefined,
    });
  } catch {
    // Silently swallow — tracking must never break the main flow
  }
}

// ─── Feature utilization queries ──────────────────────────────────────────────

/** All known features — used to surface "ignored" features with 0 events */
const ALL_FEATURES = [
  "ai_gm",
  "weekly_intel",
  "trade_lab",
  "trade_aging",
  "draft_helper",
  "keeper_lab",
  "rivalry",
  "fear_index",
  "reputation",
  "reveal",
  "checkout",
  "subscription",
] as const;

export interface FeatureUtilizationRow {
  featureName: string;
  totalEvents: number;
  uniqueUsers: number;
  lastSeenAt: Date | null;
  isIgnored: boolean;
}

export interface AIByFeatureRow {
  featureName: string;
  llmCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  avgDurationMs: number;
}

export interface RetentionWeekRow {
  week: string;       // "YYYY-WW"
  uniqueUsers: number;
  totalEvents: number;
}

export interface FunnelStepRow {
  step: string;
  featureName: string;
  completions: number;
  uniqueUsers: number;
}

/** Feature utilization: top-used and ignored features by UI event count */
export async function getFeatureUtilization(days = 30): Promise<FeatureUtilizationRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        featureName: usageEvents.featureName,
        totalEvents: sql<number>`COUNT(*)`,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
        lastSeenAt: sql<Date>`MAX(${usageEvents.createdAt})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventCategory} = 'ui' AND ${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(usageEvents.featureName)
      .orderBy(sql`COUNT(*) DESC`);

    const seen = new Set(rows.map((r) => r.featureName));
    const result: FeatureUtilizationRow[] = rows.map((r) => ({
      featureName: r.featureName,
      totalEvents: Number(r.totalEvents),
      uniqueUsers: Number(r.uniqueUsers),
      lastSeenAt: r.lastSeenAt,
      isIgnored: false,
    }));

    // Append features with 0 events
    for (const f of ALL_FEATURES) {
      if (!seen.has(f)) {
        result.push({ featureName: f, totalEvents: 0, uniqueUsers: 0, lastSeenAt: null, isIgnored: true });
      }
    }
    return result;
  } catch {
    return [];
  }
}

/** AI usage broken down by feature name (LLM events only) */
export async function getAIUsageByFeature(days = 30): Promise<AIByFeatureRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        featureName: usageEvents.featureName,
        llmCalls: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`SUM(${usageEvents.totalTokens})`,
        totalCostUsd: sql<number>`SUM(${usageEvents.estimatedCostUsd})`,
        avgDurationMs: sql<number>`AVG(${usageEvents.durationMs})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventCategory} = 'llm' AND ${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(usageEvents.featureName)
      .orderBy(sql`SUM(${usageEvents.estimatedCostUsd}) DESC`);
    return rows.map((r) => ({
      featureName: r.featureName,
      llmCalls: Number(r.llmCalls),
      totalTokens: Number(r.totalTokens),
      totalCostUsd: Number(r.totalCostUsd),
      avgDurationMs: Number(r.avgDurationMs),
    }));
  } catch {
    return [];
  }
}

/** User retention: unique users per ISO week for the last N weeks */
export async function getRetentionByWeek(weeks = 12): Promise<RetentionWeekRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        week: sql<string>`DATE_FORMAT(${usageEvents.createdAt}, '%Y-%u')`,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
        totalEvents: sql<number>`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(sql`DATE_FORMAT(${usageEvents.createdAt}, '%Y-%u')`)
      .orderBy(sql`DATE_FORMAT(${usageEvents.createdAt}, '%Y-%u') ASC`);
    return rows.map((r) => ({
      week: r.week,
      uniqueUsers: Number(r.uniqueUsers),
      totalEvents: Number(r.totalEvents),
    }));
  } catch {
    return [];
  }
}

/** Onboarding funnel: ordered step completion counts */
export async function getOnboardingFunnel(): Promise<FunnelStepRow[]> {
  const FUNNEL_STEPS: Array<{ step: string; featureName: string }> = [
    { step: "1. Session Started",          featureName: "session_start" },
    { step: "2. AI GM Opened",             featureName: "ai_gm" },
    { step: "3. Weekly Intel Viewed",      featureName: "weekly_intel" },
    { step: "4. Trade Lab Opened",         featureName: "trade_lab" },
    { step: "5. Draft Helper Opened",      featureName: "draft_helper" },
    { step: "6. Checkout Clicked",         featureName: "checkout" },
    { step: "7. Subscription Activated",   featureName: "subscription" },
  ];

  try {
    const db = await getDb();
    if (!db) return FUNNEL_STEPS.map((s) => ({ ...s, completions: 0, uniqueUsers: 0 }));
    const { sql } = await import("drizzle-orm");

    const results: FunnelStepRow[] = [];
    for (const step of FUNNEL_STEPS) {
      const rows = await db
        .select({
          completions: sql<number>`COUNT(*)`,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
        })
        .from(usageEvents)
        .where(sql`${usageEvents.featureName} = ${step.featureName}`);
      results.push({
        step: step.step,
        featureName: step.featureName,
        completions: Number(rows[0]?.completions ?? 0),
        uniqueUsers: Number(rows[0]?.uniqueUsers ?? 0),
      });
    }
    return results;
  } catch {
    return FUNNEL_STEPS.map((s) => ({ ...s, completions: 0, uniqueUsers: 0 }));
  }
}

// ─── Behavioral analytics queries (6-question dashboard) ─────────────────────

export interface ActiveLeagueStatRow {
  leagueId: string;
  leagueName: string;
  provider: string;
  uniqueUsers: number;
  sessionCount: number;
  lastActiveAt: Date | null;
}

export interface FeatureRetentionRow {
  featureName: string;
  totalUsers: number;
  returnedWithin7d: number;
  retentionRate: number; // 0-100
}

export interface IgnoredTabRow {
  tabName: string;
  viewCount: number;
  uniqueUsers: number;
  viewRate: number; // % of sessions that viewed this tab
}

export interface LeagueSwitchRow {
  week: string;       // "YYYY-WW"
  switchCount: number;
  uniqueSwitchers: number;
}

export interface ReturnVisitDriverRow {
  featureName: string;
  precedingReturnVisits: number;
  pct: number; // % of all return_visit events preceded by this feature
}

export interface DropOffRow {
  exitPage: string;
  exitCount: number;
  exitRate: number; // % of sessions that ended on this page
}

/** Active leagues: ranked by unique users + session count in last 30 days */
export async function getActiveLeagueStats(days = 30): Promise<ActiveLeagueStatRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const { leagueConnections } = await import("../drizzle/schema");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Join usage_events with league_connections to get per-league activity
    const rows = await db
      .select({
        leagueId: leagueConnections.leagueId,
        leagueName: leagueConnections.leagueName,
        provider: leagueConnections.provider,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
        sessionCount: sql<number>`COUNT(DISTINCT ${usageEvents.sessionId})`,
        lastActiveAt: sql<Date>`MAX(${usageEvents.createdAt})`,
      })
      .from(usageEvents)
      .innerJoin(
        leagueConnections,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${usageEvents.metadata}, '$.leagueId')) = ${leagueConnections.leagueId}
            AND ${usageEvents.userId} = CAST(${leagueConnections.userId} AS CHAR)`
      )
      .where(sql`${usageEvents.createdAt} >= ${cutoff} AND ${usageEvents.eventCategory} = 'ui'`)
      .groupBy(leagueConnections.leagueId, leagueConnections.leagueName, leagueConnections.provider)
      .orderBy(sql`COUNT(DISTINCT ${usageEvents.userId}) DESC`)
      .limit(20);
    return rows.map(r => ({
      leagueId: r.leagueId,
      leagueName: r.leagueName || `League ${r.leagueId}`,
      provider: r.provider,
      uniqueUsers: Number(r.uniqueUsers),
      sessionCount: Number(r.sessionCount),
      lastActiveAt: r.lastActiveAt,
    }));
  } catch {
    return [];
  }
}

/** Feature retention: % of users who returned within 7 days after first using each feature */
export async function getFeatureRetention(days = 60): Promise<FeatureRetentionRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Get first use per user per feature
    const firstUseRows = await db
      .select({
        featureName: usageEvents.featureName,
        userId: usageEvents.userId,
        firstUsedAt: sql<Date>`MIN(${usageEvents.createdAt})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventCategory} = 'ui' AND ${usageEvents.eventType} = 'feature_open' AND ${usageEvents.createdAt} >= ${cutoff} AND ${usageEvents.userId} IS NOT NULL`)
      .groupBy(usageEvents.featureName, usageEvents.userId);

    // Group by feature and check if user returned within 7 days
    const featureMap = new Map<string, { total: number; returned: number }>();
    for (const row of firstUseRows) {
      if (!row.featureName || !row.userId) continue;
      const entry = featureMap.get(row.featureName) ?? { total: 0, returned: 0 };
      entry.total++;
      // Check if this user had any event after firstUsedAt + 1h and within 7 days
      const windowStart = new Date(new Date(row.firstUsedAt).getTime() + 60 * 60 * 1000);
      const windowEnd = new Date(new Date(row.firstUsedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
      const returnRows = await db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(usageEvents)
        .where(sql`${usageEvents.userId} = ${row.userId} AND ${usageEvents.eventCategory} = 'ui' AND ${usageEvents.createdAt} > ${windowStart} AND ${usageEvents.createdAt} <= ${windowEnd}`);
      if (Number(returnRows[0]?.cnt ?? 0) > 0) entry.returned++;
      featureMap.set(row.featureName, entry);
    }

    return Array.from(featureMap.entries()).map(([featureName, { total, returned }]) => ({
      featureName,
      totalUsers: total,
      returnedWithin7d: returned,
      retentionRate: total > 0 ? Math.round((returned / total) * 100) : 0,
    })).sort((a, b) => b.retentionRate - a.retentionRate);
  } catch {
    return [];
  }
}

/** Ignored tabs: tab_view events grouped by tabName, sorted by view count ascending */
export async function getIgnoredTabs(days = 30): Promise<IgnoredTabRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Total sessions for rate calculation
    const totalSessionsRows = await db
      .select({ cnt: sql<number>`COUNT(DISTINCT ${usageEvents.sessionId})` })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${cutoff} AND ${usageEvents.eventCategory} = 'ui'`);
    const totalSessions = Number(totalSessionsRows[0]?.cnt ?? 1);

    const rows = await db
      .select({
        tabName: usageEvents.action,
        viewCount: sql<number>`COUNT(*)`,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventType} = 'tab_view' AND ${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(usageEvents.action)
      .orderBy(sql`COUNT(*) ASC`);

    return rows
      .filter(r => r.tabName)
      .map(r => ({
        tabName: r.tabName!,
        viewCount: Number(r.viewCount),
        uniqueUsers: Number(r.uniqueUsers),
        viewRate: Math.round((Number(r.viewCount) / totalSessions) * 100),
      }));
  } catch {
    return [];
  }
}

/** League switch frequency: switches per week over last N weeks */
export async function getLeagueSwitchFrequency(weeks = 12): Promise<LeagueSwitchRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        week: sql<string>`DATE_FORMAT(${usageEvents.createdAt}, '%Y-%u')`,
        switchCount: sql<number>`COUNT(*)`,
        uniqueSwitchers: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventType} = 'league_switch' AND ${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(sql`DATE_FORMAT(${usageEvents.createdAt}, '%Y-%u')`)
      .orderBy(sql`DATE_FORMAT(${usageEvents.createdAt}, '%Y-%u') ASC`);
    return rows.map(r => ({
      week: r.week,
      switchCount: Number(r.switchCount),
      uniqueSwitchers: Number(r.uniqueSwitchers),
    }));
  } catch {
    return [];
  }
}

/** Return visit drivers: what feature was last opened before each return_visit event */
export async function getReturnVisitDrivers(days = 60): Promise<ReturnVisitDriverRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Get all return_visit events with userId + sessionId
    const returnVisits = await db
      .select({
        userId: usageEvents.userId,
        sessionId: usageEvents.sessionId,
        returnedAt: usageEvents.createdAt,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventType} = 'return_visit' AND ${usageEvents.createdAt} >= ${cutoff} AND ${usageEvents.userId} IS NOT NULL`);

    // For each return visit, find the last feature_open in the PREVIOUS session
    const driverMap = new Map<string, number>();
    for (const rv of returnVisits) {
      if (!rv.userId) continue;
      const prevFeature = await db
        .select({ featureName: usageEvents.featureName })
        .from(usageEvents)
        .where(sql`${usageEvents.userId} = ${rv.userId} AND ${usageEvents.eventType} = 'feature_open' AND ${usageEvents.createdAt} < ${rv.returnedAt}`)
        .orderBy(sql`${usageEvents.createdAt} DESC`)
        .limit(1);
      const name = prevFeature[0]?.featureName;
      if (name) driverMap.set(name, (driverMap.get(name) ?? 0) + 1);
    }
    const total = returnVisits.length || 1;
    return Array.from(driverMap.entries())
      .map(([featureName, count]) => ({
        featureName,
        precedingReturnVisits: count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.precedingReturnVisits - a.precedingReturnVisits)
      .slice(0, 15);
  } catch {
    return [];
  }
}

/** Drop-off map: pages where sessions end (no event within 30 min), ranked by exit count */
export async function getDropOffMap(days = 30): Promise<DropOffRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { sql } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Use drop_off events if available (fired on page unload)
    const dropOffRows = await db
      .select({
        exitPage: usageEvents.page,
        exitCount: sql<number>`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventType} = 'drop_off' AND ${usageEvents.createdAt} >= ${cutoff}`)
      .groupBy(usageEvents.page)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(20);

    if (dropOffRows.length > 0) {
      // Total sessions for rate calculation
      const totalSessionsRows = await db
        .select({ cnt: sql<number>`COUNT(DISTINCT ${usageEvents.sessionId})` })
        .from(usageEvents)
        .where(sql`${usageEvents.createdAt} >= ${cutoff} AND ${usageEvents.eventCategory} = 'ui'`);
      const totalSessions = Number(totalSessionsRows[0]?.cnt ?? 1);
      return dropOffRows
        .filter(r => r.exitPage)
        .map(r => ({
          exitPage: r.exitPage!,
          exitCount: Number(r.exitCount),
          exitRate: Math.round((Number(r.exitCount) / totalSessions) * 100),
        }));
    }

    // Fallback: use last page_view per session as the exit page
    const lastPageRows = await db
      .select({
        exitPage: sql<string>`SUBSTRING_INDEX(GROUP_CONCAT(${usageEvents.page} ORDER BY ${usageEvents.createdAt} DESC), ',', 1)`,
        exitCount: sql<number>`COUNT(DISTINCT ${usageEvents.sessionId})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.eventType} = 'page_view' AND ${usageEvents.createdAt} >= ${cutoff} AND ${usageEvents.sessionId} IS NOT NULL`)
      .groupBy(usageEvents.sessionId)
      .having(sql`COUNT(*) >= 1`);

    // Aggregate by exitPage
    const pageMap = new Map<string, number>();
    for (const row of lastPageRows) {
      if (row.exitPage) pageMap.set(row.exitPage, (pageMap.get(row.exitPage) ?? 0) + Number(row.exitCount));
    }
    const totalSessions2 = lastPageRows.length || 1;
    return Array.from(pageMap.entries())
      .map(([exitPage, exitCount]) => ({
        exitPage,
        exitCount,
        exitRate: Math.round((exitCount / totalSessions2) * 100),
      }))
      .sort((a, b) => b.exitCount - a.exitCount)
      .slice(0, 20);
  } catch {
    return [];
  }
}

// ─── Exported cost estimator (used in tests) ──────────────────────────────────
export { estimateCost };
