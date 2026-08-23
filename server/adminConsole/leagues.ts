import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  leagueConnections,
  users,
  gmTeams,
  gmDraftPicks,
  gmMatchups,
  syncRuns,
  usageEvents,
} from "../../drizzle/schema";
import { resolveDateRange } from "../aiCost/dateRange";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type LeagueHealthClass = "healthy" | "degraded" | "failed" | "stale";

export function classifyLeagueHealth(opts: {
  syncStatus: string | null;
  lastSyncedAt: Date | string | null;
  teams: number;
  drafts: number;
  matchups: number;
  now?: Date;
}): LeagueHealthClass {
  const now = opts.now ?? new Date();
  if (opts.syncStatus === "error") return "failed";
  const last = opts.lastSyncedAt ? new Date(opts.lastSyncedAt).getTime() : 0;
  const staleMs = 48 * 60 * 60 * 1000;
  if (!last || now.getTime() - last > staleMs) return "stale";
  if (opts.teams <= 0 || opts.drafts <= 0) return "degraded";
  return "healthy";
}

export async function listAdminLeagues() {
  const db = await getDb();
  if (!db) return { rows: [], summary: { healthy: 0, degraded: 0, failed: 0, stale: 0 } };

  const connections = await db.select().from(leagueConnections);
  const byLeague = new Map<
    string,
    {
      leagueId: string;
      provider: string;
      leagueName: string;
      season: number;
      members: Set<number>;
      lastSyncedAt: Date | null;
      syncStatus: string | null;
      syncError: string | null;
    }
  >();
  for (const row of connections) {
    const key = `${row.provider}:${row.leagueId}`;
    let rec = byLeague.get(key);
    if (!rec) {
      rec = {
        leagueId: row.leagueId,
        provider: row.provider,
        leagueName: row.leagueName,
        season: row.season,
        members: new Set(),
        lastSyncedAt: row.lastSyncedAt,
        syncStatus: row.syncStatus,
        syncError: row.syncError,
      };
      byLeague.set(key, rec);
    }
    rec.members.add(row.userId);
    if (row.leagueName && !rec.leagueName) rec.leagueName = row.leagueName;
    if (row.season > rec.season) rec.season = row.season;
    if (row.lastSyncedAt && (!rec.lastSyncedAt || row.lastSyncedAt > rec.lastSyncedAt)) {
      rec.lastSyncedAt = row.lastSyncedAt;
      rec.syncStatus = row.syncStatus;
      rec.syncError = row.syncError;
    }
  }

  const leagueIds = [...new Set([...byLeague.values()].map((l) => l.leagueId))];
  const countMap = async (table: typeof gmTeams | typeof gmDraftPicks | typeof gmMatchups) => {
    if (leagueIds.length === 0) return new Map<string, number>();
    const rows = await db
      .select({
        leagueId: table.leagueId,
        c: sql<number>`COUNT(*)`,
      })
      .from(table)
      .groupBy(table.leagueId);
    return new Map(rows.map((r) => [String(r.leagueId), num(r.c)]));
  };

  const [teams, drafts, matchups, recentFails] = await Promise.all([
    countMap(gmTeams),
    countMap(gmDraftPicks),
    countMap(gmMatchups),
    db
      .select({
        leagueId: syncRuns.leagueId,
        status: syncRuns.status,
        errorMessage: syncRuns.errorMessage,
        startedAt: syncRuns.startedAt,
      })
      .from(syncRuns)
      .orderBy(desc(syncRuns.startedAt))
      .limit(200),
  ]);

  const lastFail = new Map<string, { error: string | null; at: Date }>();
  for (const run of recentFails) {
    if (run.status === "failed" && !lastFail.has(run.leagueId)) {
      lastFail.set(run.leagueId, { error: run.errorMessage, at: run.startedAt });
    }
  }

  const rows = [...byLeague.values()].map((l) => {
    const teamCount = teams.get(l.leagueId) ?? 0;
    const draftCount = drafts.get(l.leagueId) ?? 0;
    const matchupCount = matchups.get(l.leagueId) ?? 0;
    const health = classifyLeagueHealth({
      syncStatus: l.syncStatus,
      lastSyncedAt: l.lastSyncedAt,
      teams: teamCount,
      drafts: draftCount,
      matchups: matchupCount,
    });
    return {
      key: `${l.provider}:${l.leagueId}`,
      leagueId: l.leagueId,
      provider: l.provider,
      leagueName: l.leagueName || l.leagueId,
      season: l.season,
      members: l.members.size,
      lastSyncedAt: l.lastSyncedAt,
      syncStatus: l.syncStatus,
      syncError: l.syncError,
      teams: teamCount,
      drafts: draftCount,
      matchups: matchupCount,
      health,
      lastSyncError: lastFail.get(l.leagueId)?.error ?? l.syncError,
    };
  });

  const summary = { healthy: 0, degraded: 0, failed: 0, stale: 0 };
  for (const row of rows) summary[row.health] += 1;
  rows.sort((a, b) => a.leagueName.localeCompare(b.leagueName));
  return { rows, summary };
}

export async function loadAdminLeagueDetail(provider: string, leagueId: string) {
  const db = await getDb();
  if (!db) return null;
  const connections = await db
    .select()
    .from(leagueConnections)
    .where(and(eq(leagueConnections.provider, provider), eq(leagueConnections.leagueId, leagueId)));
  if (connections.length === 0) return null;

  const userIds = [...new Set(connections.map((c) => c.userId))];
  const memberUsers =
    userIds.length > 0 ? await db.select().from(users).where(inArray(users.id, userIds)) : [];

  const mtd = resolveDateRange({ preset: "mtd" });
  const [teamCount, draftCount, matchupCount, runs, usage] = await Promise.all([
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(gmTeams)
      .where(eq(gmTeams.leagueId, leagueId))
      .then((r) => num(r[0]?.c)),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(gmDraftPicks)
      .where(eq(gmDraftPicks.leagueId, leagueId))
      .then((r) => num(r[0]?.c)),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(gmMatchups)
      .where(eq(gmMatchups.leagueId, leagueId))
      .then((r) => num(r[0]?.c)),
    db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.leagueId, leagueId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(20),
    db
      .select({
        requests: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          eq(usageEvents.leagueId, leagueId),
          gte(usageEvents.createdAt, mtd.start),
        ),
      )
      .then((r) => ({ requests: num(r[0]?.requests), costUsd: num(r[0]?.cost) })),
  ]);

  const primary = connections[0]!;
  const health = classifyLeagueHealth({
    syncStatus: primary.syncStatus,
    lastSyncedAt: connections.reduce<Date | null>(
      (acc, c) => (!acc || (c.lastSyncedAt && c.lastSyncedAt > acc) ? c.lastSyncedAt : acc),
      null,
    ),
    teams: teamCount,
    drafts: draftCount,
    matchups: matchupCount,
  });

  return {
    leagueId,
    provider,
    leagueName: primary.leagueName || leagueId,
    season: Math.max(...connections.map((c) => c.season)),
    health,
    counts: { teams: teamCount, drafts: draftCount, matchups: matchupCount, members: connections.length },
    connections: connections.map((c) => {
      const u = memberUsers.find((m) => m.id === c.userId);
      return {
        userId: c.userId,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
        isActive: c.isActive,
        lastSyncedAt: c.lastSyncedAt,
        syncStatus: c.syncStatus,
        syncError: c.syncError,
        selectedTeamId: c.selectedTeamId,
        selectedOwnerName: c.selectedOwnerName,
        selectedFranchiseName: c.selectedFranchiseName,
        season: c.season,
      };
    }),
    recentSyncs: runs.map((r) => ({
      id: r.id,
      season: r.season,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      errorMessage: r.errorMessage,
      teamsSaved: r.teamsSaved,
      matchupsSaved: r.matchupsSaved,
      draftPicksSaved: r.draftPicksSaved,
    })),
    usageMtd: usage,
  };
}
