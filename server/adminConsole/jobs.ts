import { desc } from "drizzle-orm";
import { getDb } from "../db";
import { scheduledJobs, syncRuns } from "../../drizzle/schema";

export async function listAdminJobs() {
  const db = await getDb();
  if (!db) {
    return {
      scheduled: [],
      recentSyncs: [],
      retrySupported: false,
      note: "Manual job retry is not exposed: ESPN sync requires stored per-league credentials and is not idempotent from this console.",
    };
  }
  const [scheduled, recentSyncs] = await Promise.all([
    db.select().from(scheduledJobs).orderBy(scheduledJobs.name),
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(50),
  ]);
  return {
    scheduled: scheduled.map((j) => ({
      id: j.id,
      name: j.name,
      description: j.description,
      cronExpression: j.cronExpression,
      callbackPath: j.callbackPath,
      isEnabled: j.isEnabled === 1,
      lastRunAt: j.lastRunAt,
      nextRunAt: j.nextRunAt,
      lastRunStatus: j.lastRunStatus,
      lastRunDetails: j.lastRunDetails,
    })),
    recentSyncs: recentSyncs.map((r) => ({
      id: r.id,
      leagueId: r.leagueId,
      season: r.season,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      errorMessage: r.errorMessage,
    })),
    retrySupported: false,
    note: "Manual retry is deferred. Sync is triggered from the product Sync page or scheduled cron, not from this console.",
  };
}
