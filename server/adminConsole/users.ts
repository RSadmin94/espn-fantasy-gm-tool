import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  users,
  leagueConnections,
  usageEvents,
  adminAccountControls,
  adminAuditLog,
} from "../../drizzle/schema";
import { resolveDateRange } from "../aiCost/dateRange";
import { isOwnerAccount } from "../_core/owners";
import { consoleAccessLevel } from "../_core/adminAccess";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listAdminUsers(opts: {
  q?: string;
  status?: string;
  role?: string;
  highUsage?: boolean;
  highCost?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const mtd = resolveDateRange({ preset: "mtd" });
  const last30 = resolveDateRange({ preset: "last_30" });
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conds = [];
  const q = opts.q?.trim();
  if (q) {
    const likeQ = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const parts = [like(users.email, likeQ), like(users.name, likeQ), like(users.openId, likeQ)];
    const idNum = Number(q);
    if (Number.isInteger(idNum) && idNum > 0) parts.push(eq(users.id, idNum));
    conds.push(or(...parts));
  }
  if (opts.role === "user" || opts.role === "admin" || opts.role === "owner") {
    conds.push(eq(users.role, opts.role));
  }
  const where = conds.length ? and(...conds) : undefined;

  const [userRows, countRows] = await Promise.all([
    db.select().from(users).where(where).orderBy(desc(users.lastSignedIn)).limit(limit).offset(offset),
    db.select({ c: sql<number>`COUNT(*)` }).from(users).where(where),
  ]);
  const ids = userRows.map((u) => u.id);
  if (ids.length === 0) return { rows: [], total: num(countRows[0]?.c) };

  const [leagueCounts, usageRows, controls] = await Promise.all([
    db
      .select({
        userId: leagueConnections.userId,
        c: sql<number>`COUNT(*)`,
      })
      .from(leagueConnections)
      .where(inArray(leagueConnections.userId, ids))
      .groupBy(leagueConnections.userId),
    db
      .select({
        userId: usageEvents.userId,
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
        lastAt: sql<string>`MAX(${usageEvents.createdAt})`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          gte(usageEvents.createdAt, mtd.start),
        ),
      )
      .groupBy(usageEvents.userId),
    db.select().from(adminAccountControls),
  ]);

  const leagueMap = new Map<number, number>();
  for (const row of leagueCounts) leagueMap.set(Number(row.userId), num(row.c));

  const usageMap = new Map<string, { requests: number; cost: number; lastAt: string | null }>();
  for (const row of usageRows) {
    if (row.userId) usageMap.set(String(row.userId), { requests: num(row.requests), cost: num(row.cost), lastAt: row.lastAt });
  }
  const ctrlMap = new Map(controls.map((c) => [c.userId, c]));

  let rows = userRows.map((u) => {
    const usage = usageMap.get(String(u.id));
    const ctrl = ctrlMap.get(u.id);
    const access = consoleAccessLevel(u);
    return {
      id: u.id,
      openId: u.openId,
      name: u.name,
      email: u.email,
      role: u.role,
      accessLevel: access,
      isOwner: isOwnerAccount(u),
      leagues: leagueMap.get(u.id) ?? 0,
      lastSignedIn: u.lastSignedIn,
      lastActive: usage?.lastAt ?? u.lastSignedIn?.toISOString?.() ?? null,
      requestsMtd: usage?.requests ?? 0,
      costMtd: usage?.cost ?? 0,
      status: ctrl?.status ?? "active",
      aiDisabled: ctrl?.aiDisabled ?? false,
      createdAt: u.createdAt,
      loginMethod: u.loginMethod,
      subscriptionStatus: u.subscriptionStatus,
    };
  });

  if (opts.status && opts.status !== "all") {
    rows = rows.filter((r) => r.status === opts.status);
  }
  if (opts.highCost) rows = rows.filter((r) => r.costMtd >= 1);
  if (opts.highUsage) rows = rows.filter((r) => r.requestsMtd >= 50);

  void last30;
  return { rows, total: num(countRows[0]?.c) };
}

export async function loadAdminUserDetail(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) return null;
  const mtd = resolveDateRange({ preset: "mtd" });
  const last30 = resolveDateRange({ preset: "last_30" });

  const [leagues, usage, features, errors, audits, control] = await Promise.all([
    db.select().from(leagueConnections).where(eq(leagueConnections.userId, userId)),
    db
      .select({
        requests: sql<number>`COUNT(*)`,
        tokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
        provider: usageEvents.provider,
        model: usageEvents.model,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          eq(usageEvents.userId, String(userId)),
          gte(usageEvents.createdAt, mtd.start),
        ),
      )
      .groupBy(usageEvents.provider, usageEvents.model),
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
          eq(usageEvents.userId, String(userId)),
          gte(usageEvents.createdAt, last30.start),
        ),
      )
      .groupBy(usageEvents.featureId),
    db
      .select()
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, String(userId)),
          eq(usageEvents.status, "ERROR"),
        ),
      )
      .orderBy(desc(usageEvents.createdAt))
      .limit(25),
    db
      .select()
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.targetType, "user"), eq(adminAuditLog.targetId, String(userId))))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(50),
    db.select().from(adminAccountControls).where(eq(adminAccountControls.userId, userId)).limit(1),
  ]);

  return {
    identity: {
      id: user.id,
      openId: user.openId,
      name: user.name,
      email: user.email,
      role: user.role,
      loginMethod: user.loginMethod,
      createdAt: user.createdAt,
      lastSignedIn: user.lastSignedIn,
      subscriptionStatus: user.subscriptionStatus,
      isOwner: isOwnerAccount(user),
      accessLevel: consoleAccessLevel(user),
    },
    leagues: leagues.map((l) => ({
      id: l.id,
      provider: l.provider,
      leagueId: l.leagueId,
      leagueName: l.leagueName,
      season: l.season,
      isActive: l.isActive,
      lastSyncedAt: l.lastSyncedAt,
      syncStatus: l.syncStatus,
      syncError: l.syncError,
      selectedTeamId: l.selectedTeamId,
      selectedOwnerName: l.selectedOwnerName,
      selectedFranchiseName: l.selectedFranchiseName,
    })),
    aiUsage: usage.map((u) => ({
      provider: u.provider,
      model: u.model,
      requests: num(u.requests),
      tokens: num(u.tokens),
      costUsd: num(u.cost),
    })),
    features: features.map((f) => ({
      featureId: f.featureId ?? "UNATTRIBUTED",
      requests: num(f.requests),
      costUsd: num(f.cost),
    })),
    errors: errors.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      featureName: e.featureName,
      errorCode: e.errorCode,
      callType: e.callType,
      leagueId: e.leagueId,
    })),
    audit: audits,
    control: control[0] ?? null,
  };
}

export async function listAuthActivity() {
  const db = await getDb();
  if (!db) {
    return {
      deferred: [
        "Failed sign-ins are stored in Clerk, not in this application database.",
        "OAuth tokens and session secrets are never loaded into this console.",
      ],
      recentSignIns: [],
      loginMethods: [],
      duplicateEmails: [],
    };
  }

  const recent = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      lastSignedIn: users.lastSignedIn,
      createdAt: users.createdAt,
      openId: users.openId,
    })
    .from(users)
    .orderBy(desc(users.lastSignedIn))
    .limit(50);

  const methods = await db
    .select({
      loginMethod: users.loginMethod,
      c: sql<number>`COUNT(*)`,
    })
    .from(users)
    .groupBy(users.loginMethod);

  const dup = await db.execute(
    sql`SELECT email, COUNT(*) AS c FROM users WHERE email IS NOT NULL AND email <> '' GROUP BY email HAVING c > 1 LIMIT 20`,
  );
  const dupRows = (Array.isArray(dup) ? dup : (dup as { [0]: unknown[] })[0]) as Array<{
    email: string;
    c: number;
  }>;

  return {
    deferred: [
      "Failed sign-ins and live Clerk session counts are not stored in this database.",
      "If a user signed into the wrong Google account, they must sign out of Clerk and choose the correct Google account on the next sign-in. This app does not store Google OAuth tokens.",
    ],
    recentSignIns: recent,
    loginMethods: methods.map((m) => ({ method: m.loginMethod ?? "unknown", count: num(m.c) })),
    duplicateEmails: (dupRows ?? []).map((r) => ({ email: r.email, count: num(r.c) })),
  };
}
