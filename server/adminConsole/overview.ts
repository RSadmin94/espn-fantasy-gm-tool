import { and, eq, gte, lte, or, sql, like } from "drizzle-orm";
import { getDb } from "../db";
import {
  users,
  leagueConnections,
  usageEvents,
  syncRuns,
  adminAccountControls,
} from "../../drizzle/schema";
import { collectHealthSnapshot } from "../_core/healthSnapshot";
import { resolveDateRange } from "../aiCost/dateRange";
import { getMonthlyAiBudgetUsd } from "../aiCost/aiBudget";
import { projectMonthlySpend } from "../aiCost/projections";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function classifyAppHealth(opts: {
  healthStatus: "ok" | "degraded";
  failedSyncs: number;
  errorRate: number;
  projectedOverBudget: boolean;
}): "Healthy" | "Degraded" | "Critical" {
  if (opts.healthStatus === "degraded") return "Critical";
  if (opts.failedSyncs > 0 || opts.errorRate >= 0.15 || opts.projectedOverBudget) return "Degraded";
  return "Healthy";
}

export async function loadAdminOverview() {
  const health = await collectHealthSnapshot();
  const db = await getDb();
  const today = resolveDateRange({ preset: "today" });
  const last7 = resolveDateRange({ preset: "last_7" });
  const last30 = resolveDateRange({ preset: "last_30" });
  const mtd = resolveDateRange({ preset: "mtd" });

  const empty = {
    health: classifyAppHealth({
      healthStatus: health.status,
      failedSyncs: 0,
      errorRate: 0,
      projectedOverBudget: false,
    }),
    healthSnapshot: health,
    activeUsers: { today: 0, d7: 0, d30: 0 },
    totalAccounts: 0,
    connectedLeagues: 0,
    activeLeagues: 0,
    aiSpendToday: 0,
    aiSpendMtd: 0,
    projectedAiSpend: 0,
    monthlyBudgetUsd: null as number | null,
    requestsToday: 0,
    errorRate: 0,
    failedJobs: 0,
    dataSyncFailures: 0,
    accountsRequiringAttention: 0,
    mostUsedFeature: null as { id: string; requests: number } | null,
    mostExpensiveFeature: null as { id: string; costUsd: number } | null,
    version: health.version,
    gitSha: health.gitSha,
    gitBranch: health.gitBranch,
    buildTime: health.buildTime,
    attention: [] as Array<{ id: string; title: string; href: string; severity: "warning" | "critical" }>,
  };

  if (!db) return empty;

  const countSince = async (start: Date) => {
    const rows = await db
      .select({ c: sql<number>`COUNT(DISTINCT ${usageEvents.userId})` })
      .from(usageEvents)
      .where(and(gte(usageEvents.createdAt, start), sql`${usageEvents.userId} IS NOT NULL`));
    return num(rows[0]?.c);
  };

  const llmAgg = async (start: Date, end: Date) => {
    const rows = await db
      .select({
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
        errors: sql<number>`SUM(CASE WHEN ${usageEvents.status} = 'ERROR' THEN 1 ELSE 0 END)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          gte(usageEvents.createdAt, start),
          lte(usageEvents.createdAt, end),
        ),
      );
    return {
      requests: num(rows[0]?.requests),
      cost: num(rows[0]?.cost),
      errors: num(rows[0]?.errors),
    };
  };

  const [
    activeToday,
    active7,
    active30,
    accounts,
    leagues,
    activeLeagueRows,
    todayLlm,
    mtdLlm,
    failedSync,
    watched,
    featureRows,
  ] = await Promise.all([
    countSince(today.start),
    countSince(last7.start),
    countSince(last30.start),
    db.select({ c: sql<number>`COUNT(*)` }).from(users).then((r) => num(r[0]?.c)),
    db
      .select({ c: sql<number>`COUNT(DISTINCT ${leagueConnections.leagueId})` })
      .from(leagueConnections)
      .then((r) => num(r[0]?.c)),
    db
      .select({ c: sql<number>`COUNT(DISTINCT ${leagueConnections.leagueId})` })
      .from(leagueConnections)
      .where(eq(leagueConnections.isActive, true))
      .then((r) => num(r[0]?.c)),
    llmAgg(today.start, today.end),
    llmAgg(mtd.start, mtd.end),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(syncRuns)
      .where(and(eq(syncRuns.status, "failed"), gte(syncRuns.startedAt, last7.start)))
      .then((r) => num(r[0]?.c)),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(adminAccountControls)
      .where(
        or(
          eq(adminAccountControls.status, "watched"),
          eq(adminAccountControls.status, "throttled"),
          eq(adminAccountControls.status, "restricted"),
          eq(adminAccountControls.status, "suspended"),
          eq(adminAccountControls.aiDisabled, true),
        ),
      )
      .then((r) => num(r[0]?.c)),
    db
      .select({
        featureId: usageEvents.featureId,
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          gte(usageEvents.createdAt, mtd.start),
          lte(usageEvents.createdAt, mtd.end),
        ),
      )
      .groupBy(usageEvents.featureId),
  ]);

  const budget = await getMonthlyAiBudgetUsd();
  const proj = projectMonthlySpend(mtdLlm.cost);
  const projectedOver =
    budget != null && budget > 0 && proj.projectedMonthEndUsd > budget;
  const errorRate = todayLlm.requests > 0 ? todayLlm.errors / todayLlm.requests : 0;

  let mostUsed: { id: string; requests: number } | null = null;
  let mostExpensive: { id: string; costUsd: number } | null = null;
  for (const row of featureRows) {
    const id = row.featureId || "UNATTRIBUTED";
    const requests = num(row.requests);
    const cost = num(row.cost);
    if (!mostUsed || requests > mostUsed.requests) mostUsed = { id, requests };
    if (!mostExpensive || cost > mostExpensive.costUsd) mostExpensive = { id, costUsd: cost };
  }

  const attention: Array<{ id: string; title: string; href: string; severity: "warning" | "critical" }> = [];
  if (health.status === "degraded") {
    attention.push({
      id: "health",
      title: "Application health checks are degraded",
      href: "/admin/integrations",
      severity: "critical",
    });
  }
  if (projectedOver) {
    attention.push({
      id: "budget",
      title: "Projected AI spend exceeds monthly budget",
      href: "/admin/usage",
      severity: "critical",
    });
  }
  if (failedSync > 0) {
    attention.push({
      id: "sync",
      title: `${failedSync} failed sync run(s) in the last 7 days`,
      href: "/admin/data-health",
      severity: "warning",
    });
  }
  if (errorRate >= 0.1 && todayLlm.requests >= 10) {
    attention.push({
      id: "errors",
      title: `AI error rate is ${(errorRate * 100).toFixed(1)}% today`,
      href: "/admin/errors",
      severity: "warning",
    });
  }
  if (watched > 0) {
    attention.push({
      id: "accounts",
      title: `${watched} account(s) require attention`,
      href: "/admin/users",
      severity: "warning",
    });
  }
  const unattributed = featureRows.find((r) => !r.featureId || r.featureId === "UNATTRIBUTED");
  if (unattributed && num(unattributed.requests) > 0) {
    attention.push({
      id: "unattributed",
      title: "Unattributed AI usage is present",
      href: "/admin/usage",
      severity: "warning",
    });
  }

  return {
    health: classifyAppHealth({
      healthStatus: health.status,
      failedSyncs: failedSync,
      errorRate,
      projectedOverBudget: projectedOver,
    }),
    healthSnapshot: health,
    activeUsers: { today: activeToday, d7: active7, d30: active30 },
    totalAccounts: accounts,
    connectedLeagues: leagues,
    activeLeagues: activeLeagueRows,
    aiSpendToday: todayLlm.cost,
    aiSpendMtd: mtdLlm.cost,
    projectedAiSpend: proj.projectedMonthEndUsd,
    monthlyBudgetUsd: budget,
    requestsToday: todayLlm.requests,
    errorRate,
    failedJobs: failedSync,
    dataSyncFailures: failedSync,
    accountsRequiringAttention: watched,
    mostUsedFeature: mostUsed,
    mostExpensiveFeature: mostExpensive,
    version: health.version,
    gitSha: health.gitSha,
    gitBranch: health.gitBranch,
    buildTime: health.buildTime,
    attention,
  };
}

export async function adminSearch(q: string) {
  const db = await getDb();
  const query = q.trim().slice(0, 128);
  if (!db || query.length < 1) return { users: [], leagues: [] };

  const likeQ = `%${query.replace(/[%_]/g, "\\$&")}%`;
  const idNum = Number(query);
  const userConds = [
    like(users.email, likeQ),
    like(users.name, likeQ),
    like(users.openId, likeQ),
  ];
  if (Number.isInteger(idNum) && idNum > 0) userConds.push(eq(users.id, idNum));

  const [userRows, leagueRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        openId: users.openId,
      })
      .from(users)
      .where(or(...userConds))
      .limit(12),
    db
      .select({
        leagueId: leagueConnections.leagueId,
        leagueName: leagueConnections.leagueName,
        provider: leagueConnections.provider,
        season: leagueConnections.season,
      })
      .from(leagueConnections)
      .where(or(like(leagueConnections.leagueId, likeQ), like(leagueConnections.leagueName, likeQ)))
      .limit(12),
  ]);

  const leagues = new Map<string, (typeof leagueRows)[number]>();
  for (const row of leagueRows) {
    if (!leagues.has(row.leagueId)) leagues.set(row.leagueId, row);
  }

  return { users: userRows, leagues: [...leagues.values()] };
}
