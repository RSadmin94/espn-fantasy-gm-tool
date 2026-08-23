import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { usageEvents, syncRuns } from "../../drizzle/schema";
import { resolveDateRange } from "../aiCost/dateRange";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listAdminErrors(opts: {
  area?: string;
  userId?: string;
  leagueId?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return { groups: [], recent: [], deferred: [] as string[] };
  const last30 = resolveDateRange({ preset: "last_30" });
  const limit = Math.min(opts.limit ?? 80, 200);

  const conds = [
    eq(usageEvents.status, "ERROR"),
    gte(usageEvents.createdAt, last30.start),
  ];
  if (opts.userId) conds.push(eq(usageEvents.userId, opts.userId));
  if (opts.leagueId) conds.push(eq(usageEvents.leagueId, opts.leagueId));
  if (opts.area === "AI") conds.push(eq(usageEvents.eventCategory, "llm"));
  if (opts.area === "sync") {
    /* handled below */
  }

  const [llmErrors, syncFails] = await Promise.all([
    opts.area === "sync"
      ? Promise.resolve([])
      : db
          .select()
          .from(usageEvents)
          .where(and(...conds))
          .orderBy(desc(usageEvents.createdAt))
          .limit(limit),
    opts.area && opts.area !== "sync" && opts.area !== "all"
      ? Promise.resolve([])
      : db
          .select()
          .from(syncRuns)
          .where(and(eq(syncRuns.status, "failed"), gte(syncRuns.startedAt, last30.start)))
          .orderBy(desc(syncRuns.startedAt))
          .limit(40),
  ]);

  const groups = new Map<
    string,
    { key: string; area: string; error: string; count: number; lastAt: string; userId: string | null; leagueId: string | null }
  >();
  const recent: Array<{
    time: Date | string;
    area: string;
    userId: string | null;
    leagueId: string | null;
    error: string;
    feature: string | null;
  }> = [];

  for (const row of llmErrors) {
    const err = row.errorCode || row.featureName || "ERROR";
    const key = `ai:${row.featureId ?? row.featureName}:${err}`;
    const g = groups.get(key) ?? {
      key,
      area: "AI",
      error: err,
      count: 0,
      lastAt: "",
      userId: row.userId,
      leagueId: row.leagueId,
    };
    g.count += 1;
    g.lastAt = String(row.createdAt);
    groups.set(key, g);
    recent.push({
      time: row.createdAt,
      area: "AI",
      userId: row.userId,
      leagueId: row.leagueId,
      error: err,
      feature: row.featureName,
    });
  }

  for (const run of syncFails) {
    const err = (run.errorMessage ?? "sync failed").slice(0, 180);
    const key = `sync:${run.leagueId}:${err.slice(0, 80)}`;
    const g = groups.get(key) ?? {
      key,
      area: "sync",
      error: err,
      count: 0,
      lastAt: "",
      userId: null,
      leagueId: run.leagueId,
    };
    g.count += 1;
    g.lastAt = String(run.startedAt);
    groups.set(key, g);
    recent.push({
      time: run.startedAt,
      area: "sync",
      userId: null,
      leagueId: run.leagueId,
      error: err,
      feature: `season ${run.season}`,
    });
  }

  return {
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
    recent: recent.slice(0, limit),
    deferred: [
      "Frontend stack traces are not persisted in this database.",
      "Authentication failure details live in Clerk, not application error rows.",
    ],
  };
}

export { sql };
