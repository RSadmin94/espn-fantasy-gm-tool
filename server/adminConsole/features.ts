import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { usageEvents } from "../../drizzle/schema";
import { resolveDateRange } from "../aiCost/dateRange";
import { PRODUCT_FEATURE_CATALOG, productFeatureById } from "./productFeatures";
import { listFeatureOverrides } from "./featureFlags";
import { FEATURE_LABELS } from "../aiCost/aiFeatures";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listAdminFeatures() {
  const db = await getDb();
  const mtd = resolveDateRange({ preset: "mtd" });
  const overrides = await listFeatureOverrides();
  const overrideMap = new Map(overrides.map((o) => [o.featureId, o]));

  let usageByAi = new Map<string, { requests: number; cost: number; users: number; errors: number }>();
  let uiByPage = new Map<string, { users: number; requests: number }>();
  if (db) {
    const [aiRows, uiRows] = await Promise.all([
      db
        .select({
          featureId: usageEvents.featureId,
          requests: sql<number>`COUNT(*)`,
          cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
          users: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
          errors: sql<number>`SUM(CASE WHEN ${usageEvents.status} = 'ERROR' THEN 1 ELSE 0 END)`,
        })
        .from(usageEvents)
        .where(and(eq(usageEvents.eventCategory, "llm"), gte(usageEvents.createdAt, mtd.start)))
        .groupBy(usageEvents.featureId),
      db
        .select({
          page: usageEvents.page,
          requests: sql<number>`COUNT(*)`,
          users: sql<number>`COUNT(DISTINCT ${usageEvents.userId})`,
        })
        .from(usageEvents)
        .where(and(eq(usageEvents.eventCategory, "ui"), gte(usageEvents.createdAt, mtd.start)))
        .groupBy(usageEvents.page),
    ]);
    usageByAi = new Map(
      aiRows.map((r) => [
        r.featureId ?? "UNATTRIBUTED",
        { requests: num(r.requests), cost: num(r.cost), users: num(r.users), errors: num(r.errors) },
      ]),
    );
    uiByPage = new Map(
      uiRows.map((r) => [r.page ?? "", { users: num(r.users), requests: num(r.requests) }]),
    );
  }

  return PRODUCT_FEATURE_CATALOG.map((f) => {
    const ai = f.aiFeatureId ? usageByAi.get(f.aiFeatureId) : undefined;
    const ui = f.route ? uiByPage.get(f.route) : undefined;
    const ov = overrideMap.get(f.id);
    const errors = ai?.errors ?? 0;
    const requests = ai?.requests ?? ui?.requests ?? 0;
    let health: "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN" = "UNKNOWN";
    if (ov && !ov.enabled) health = "DOWN";
    else if (ov?.maintenance) health = "DEGRADED";
    else if (requests > 0 && errors / Math.max(requests, 1) > 0.2) health = "DEGRADED";
    else if (requests > 0) health = "HEALTHY";
    return {
      ...f,
      enabled: ov?.enabled ?? true,
      maintenance: ov?.maintenance ?? false,
      restrictTo: ov?.restrictTo ?? "none",
      enforcement: f.aiFeatureId ? "full" : "partial",
      users: ai?.users ?? ui?.users ?? 0,
      requests,
      costUsd: ai?.cost ?? 0,
      errors,
      health,
    };
  });
}

export async function loadAdminFeatureDetail(featureId: string) {
  const feature = productFeatureById(featureId);
  if (!feature) return null;
  const list = await listAdminFeatures();
  const summary = list.find((f) => f.id === featureId);
  const db = await getDb();
  const last30 = resolveDateRange({ preset: "last_30" });
  if (!db || !feature.aiFeatureId) {
    return {
      feature,
      summary,
      trend: [],
      topUsers: [],
      recentErrors: [],
      aiLabel: feature.aiFeatureId ? FEATURE_LABELS[feature.aiFeatureId as keyof typeof FEATURE_LABELS] : null,
    };
  }

  const [trend, topUsers, recentErrors] = await Promise.all([
    db
      .select({
        day: sql<string>`DATE(${usageEvents.createdAt})`,
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          eq(usageEvents.featureId, feature.aiFeatureId),
          gte(usageEvents.createdAt, last30.start),
        ),
      )
      .groupBy(sql`DATE(${usageEvents.createdAt})`)
      .orderBy(sql`DATE(${usageEvents.createdAt})`),
    db
      .select({
        userId: usageEvents.userId,
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          eq(usageEvents.featureId, feature.aiFeatureId),
          gte(usageEvents.createdAt, last30.start),
        ),
      )
      .groupBy(usageEvents.userId)
      .orderBy(desc(sql`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`))
      .limit(15),
    db
      .select()
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          eq(usageEvents.featureId, feature.aiFeatureId),
          eq(usageEvents.status, "ERROR"),
        ),
      )
      .orderBy(desc(usageEvents.createdAt))
      .limit(20),
  ]);

  return {
    feature,
    summary,
    trend: trend.map((t) => ({ day: t.day, requests: num(t.requests), costUsd: num(t.cost) })),
    topUsers: topUsers.map((u) => ({
      userId: u.userId,
      requests: num(u.requests),
      costUsd: num(u.cost),
    })),
    recentErrors: recentErrors.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      errorCode: e.errorCode,
      userId: e.userId,
      leagueId: e.leagueId,
    })),
    aiLabel: FEATURE_LABELS[feature.aiFeatureId as keyof typeof FEATURE_LABELS] ?? feature.aiFeatureId,
  };
}
