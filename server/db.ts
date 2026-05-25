import { eq, desc, and, gt, or, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import type { EspnRawCache, EspnSeasonCache, FantasyDataCache, RefreshManifest } from "../drizzle/schema";
import {
  InsertUser, users, fantasyDataCache, chatHistory,
  pickTrades, InsertPickTrade, espnViewHealth,
  weeklyPlayerStats, InsertWeeklyPlayerStats,
  scheduledJobs, ScheduledJob,
  userMemory, UserMemory,
  leagueConnections,
  llmUsage,
  scrapedTrades, InsertScrapedTrade,
  leagueEvents, InsertLeagueEvent,
  espnRawCache,
  espnSeasonCache,
  syncRuns,
} from "../drizzle/schema";
import { upsertRawEspnCache, writeLegacyEspnCaches } from "./espnPersistence";
import type { EspnCreds } from "./espnService";
import { decryptCredentialsFromDb } from "./_core/crypto";
import { ENV } from "./_core/env";

/** Drizzle client typed with the app schema (matches `espnPersistence` `AppDb`). */
export type AppDb = MySql2Database<typeof schema>;

let _db: AppDb | null = null;

export async function getDb(): Promise<AppDb | null> {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized; updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Cache key for ESPN view payloads in `fantasy_data_cache`. */
export function buildEspnFantasyDataCacheKey(leagueId: string, season: number, viewName: string): string {
  return `espn:${leagueId}:${season}:${viewName}`;
}

export function parseEspnFantasyDataCacheKey(key: string): { leagueId: string; season: number; viewName: string } | null {
  if (!key.startsWith("espn:")) return null;
  const rest = key.slice(5);
  const firstColon = rest.indexOf(":");
  if (firstColon < 0) return null;
  const leagueId = rest.slice(0, firstColon);
  const afterLid = rest.slice(firstColon + 1);
  const secondColon = afterLid.indexOf(":");
  if (secondColon < 0) return null;
  const seasonStr = afterLid.slice(0, secondColon);
  const viewName = afterLid.slice(secondColon + 1);
  const season = Number(seasonStr);
  if (!Number.isFinite(season)) return null;
  return { leagueId, season, viewName };
}

function escapeMysqlLikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Row shape returned from ESPN cache reads (`payload` is decoded JSON). */
export type CachedEspnSeasonRow = {
  id: number;
  cacheKey: string;
  leagueId: string;
  season: number;
  viewName: string;
  payload: unknown;
  fetchedAt: Date;
  updatedAt: Date;
};

function decodeFantasyDataJsonPayload(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  return raw ?? {};
}

function fantasyDataRowToCachedEspnSeason(row: FantasyDataCache): CachedEspnSeasonRow {
  const meta = parseEspnFantasyDataCacheKey(row.cacheKey);
  return {
    id: row.id,
    cacheKey: row.cacheKey,
    leagueId: meta?.leagueId ?? "default",
    season: meta?.season ?? 0,
    viewName: meta?.viewName ?? "",
    payload: decodeFantasyDataJsonPayload(row.payload),
    fetchedAt: row.fetchedAt,
    updatedAt: row.updatedAt,
  };
}

function rawEspnCacheRowToCached(row: EspnRawCache): CachedEspnSeasonRow {
  return {
    id: row.id,
    cacheKey: buildEspnFantasyDataCacheKey(row.leagueId, row.season, row.viewName),
    leagueId: row.leagueId,
    season: row.season,
    viewName: row.viewName,
    payload: decodeFantasyDataJsonPayload(row.payload),
    fetchedAt: row.fetchedAt,
    updatedAt: row.updatedAt,
  };
}

function espnSeasonCacheRowToCached(row: EspnSeasonCache): CachedEspnSeasonRow {
  return {
    id: row.id,
    cacheKey: buildEspnFantasyDataCacheKey(row.leagueId, row.season, row.viewName),
    leagueId: row.leagueId,
    season: row.season,
    viewName: row.viewName,
    payload: decodeFantasyDataJsonPayload(row.payload),
    fetchedAt: row.fetchedAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCachedView(
  season: number,
  viewName: string,
  leagueId?: string,
  opts?: { userId?: number }
): Promise<CachedEspnSeasonRow | null> {
  const db = await getDb();
  if (!db) return null;
  const yr = Math.floor(Number(season));
  const vn = String(viewName).slice(0, 64);
  let lid: string;
  if (leagueId != null && String(leagueId).trim() !== "") {
    lid = String(leagueId).trim().slice(0, 32);
  } else {
    const resolved = await resolveActiveLeagueId(
      { user: opts?.userId != null ? { id: opts.userId } : undefined },
      null,
      yr
    );
    lid = resolved.leagueId;
  }

  const rawPrimary = await db
    .select()
    .from(espnRawCache)
    .where(and(eq(espnRawCache.leagueId, lid), eq(espnRawCache.season, yr), eq(espnRawCache.viewName, vn)))
    .orderBy(desc(espnRawCache.updatedAt))
    .limit(1);
  if (rawPrimary[0]) return rawEspnCacheRowToCached(rawPrimary[0]);

  if (lid !== "default") {
    const rawDefault = await db
      .select()
      .from(espnRawCache)
      .where(and(eq(espnRawCache.leagueId, "default"), eq(espnRawCache.season, yr), eq(espnRawCache.viewName, vn)))
      .orderBy(desc(espnRawCache.updatedAt))
      .limit(1);
    if (rawDefault[0]) return rawEspnCacheRowToCached(rawDefault[0]);
  }

  const primaryKey = buildEspnFantasyDataCacheKey(lid, yr, vn);
  const primary = await db
    .select()
    .from(fantasyDataCache)
    .where(eq(fantasyDataCache.cacheKey, primaryKey))
    .orderBy(desc(fantasyDataCache.updatedAt))
    .limit(1);
  if (primary[0]) return fantasyDataRowToCachedEspnSeason(primary[0]);

  if (lid !== "default") {
    const legacyKey = buildEspnFantasyDataCacheKey("default", yr, vn);
    const legacy = await db
      .select()
      .from(fantasyDataCache)
      .where(eq(fantasyDataCache.cacheKey, legacyKey))
      .orderBy(desc(fantasyDataCache.updatedAt))
      .limit(1);
    if (legacy[0]) return fantasyDataRowToCachedEspnSeason(legacy[0]);
  }

  const escPrimary = await db
    .select()
    .from(espnSeasonCache)
    .where(and(eq(espnSeasonCache.leagueId, lid), eq(espnSeasonCache.season, yr), eq(espnSeasonCache.viewName, vn)))
    .orderBy(desc(espnSeasonCache.updatedAt))
    .limit(1);
  if (escPrimary[0]) return espnSeasonCacheRowToCached(escPrimary[0]);

  if (lid !== "default") {
    const escDefault = await db
      .select()
      .from(espnSeasonCache)
      .where(
        and(eq(espnSeasonCache.leagueId, "default"), eq(espnSeasonCache.season, yr), eq(espnSeasonCache.viewName, vn))
      )
      .orderBy(desc(espnSeasonCache.updatedAt))
      .limit(1);
    if (escDefault[0]) return espnSeasonCacheRowToCached(escDefault[0]);
  }

  return null;
}

export async function upsertCachedView(season: number, viewName: string, payload: unknown, leagueId?: string) {
  if (String(viewName) === "combined") {
    console.warn(
      '[db] upsertCachedView(..., "combined", ...) is deprecated; use syncEspnCombinedFullPipeline from ./espnPersistence'
    );
    return;
  }
  const lid = String(leagueId ?? process.env.ESPN_LEAGUE_ID ?? "default").slice(0, 32);
  const yr = Math.floor(Number(season));
  const vn = String(viewName).slice(0, 64);
  try {
    await upsertRawEspnCache(lid, yr, vn, payload);
  } catch (e) {
    console.warn("[db] upsertCachedView upsertRawEspnCache failed:", { season: yr, viewName: vn, leagueId: lid, err: e });
  }
  try {
    await writeLegacyEspnCaches(lid, yr, vn, payload);
  } catch (e) {
    console.warn("[db] upsertCachedView writeLegacyEspnCaches failed:", { season: yr, viewName: vn, leagueId: lid, err: e });
  }
}

export async function getAllCachedSeasons(
  leagueId?: string,
  userId?: number
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const { leagueId: resolvedLid } = await resolveActiveLeagueId(
    { user: userId != null ? { id: userId } : undefined },
    leagueId ?? null,
    undefined
  );
  const lid = String(resolvedLid).slice(0, 32);
  const esc = escapeMysqlLikePattern(lid);
  const rows = await db
    .select({ cacheKey: fantasyDataCache.cacheKey })
    .from(fantasyDataCache)
    .where(
      and(
        like(fantasyDataCache.cacheKey, "espn:%"),
        or(
          like(fantasyDataCache.cacheKey, `espn:${esc}:%`),
          like(fantasyDataCache.cacheKey, "espn:default:%")
        )
      )
    );
  const seasons = new Set<number>();
  for (const { cacheKey } of rows) {
    const parsed = parseEspnFantasyDataCacheKey(cacheKey);
    if (!parsed || parsed.season <= 2000) continue;
    if (parsed.leagueId === lid || parsed.leagueId === "default") {
      seasons.add(parsed.season);
    }
  }

  const rawLeagueWhere =
    lid !== "default"
      ? or(eq(espnRawCache.leagueId, lid), eq(espnRawCache.leagueId, "default"))
      : eq(espnRawCache.leagueId, lid);
  const rawSeasonRows = await db
    .selectDistinct({ season: espnRawCache.season })
    .from(espnRawCache)
    .where(rawLeagueWhere);
  for (const r of rawSeasonRows) {
    if (r.season > 2000) seasons.add(r.season);
  }

  const seasonCacheLeagueWhere =
    lid !== "default"
      ? or(eq(espnSeasonCache.leagueId, lid), eq(espnSeasonCache.leagueId, "default"))
      : eq(espnSeasonCache.leagueId, lid);
  const escSeasonRows = await db
    .selectDistinct({ season: espnSeasonCache.season })
    .from(espnSeasonCache)
    .where(seasonCacheLeagueWhere);
  for (const r of escSeasonRows) {
    if (r.season > 2000) seasons.add(r.season);
  }

  return Array.from(seasons).sort((a, b) => b - a);
}

/**
 * Returns the most recently completed NFL season that should be used as the
 * historical baseline for offseason planning. This is always <= current year - 1
 * so that a partial 2026 sync never overwrites the 2025 keeper baseline.
 */
export async function getCompletedSeasonForOffseason(): Promise<number | null> {
  const currentYear = new Date().getFullYear();
  const maxCompletedSeason = currentYear - 1; // e.g. in 2026, max is 2025
  const seasons = await getAllCachedSeasons();
  // Find the highest cached season that is <= maxCompletedSeason
  const completed = seasons.filter(s => s <= maxCompletedSeason);
  return completed.length > 0 ? completed[0] : null; // already sorted desc
}

type SyncRunRow = typeof syncRuns.$inferSelect;

/** Newest run wins: finishedAt (or startedAt if still running), then higher id. */
function pickNewestSyncRun(pool: SyncRunRow[]): SyncRunRow | null {
  if (pool.length === 0) return null;
  return pool.reduce((best, r) => {
    const tBest = (best.finishedAt ?? best.startedAt).getTime();
    const tR = (r.finishedAt ?? r.startedAt).getTime();
    if (tR !== tBest) return tR > tBest ? r : best;
    return r.id > best.id ? r : best;
  });
}

/**
 * One manifest per season: latest `sync_runs` row for that season (by finishedAt/startedAt, then id).
 * When multiple leagueIds exist, prefers the active ESPN league from connections/env if that league has
 * any run for the season; otherwise falls back to the newest run across all leagues. Does not delete history.
 */
export async function getRefreshManifests(): Promise<RefreshManifest[]> {
  const db = await getDb();
  if (!db) return [];

  const activeLeagueId = await getDefaultEspnLeagueId();
  const runs = await db.select().from(syncRuns);

  const bySeason = new Map<number, SyncRunRow[]>();
  for (const r of runs) {
    const list = bySeason.get(r.season) ?? [];
    list.push(r);
    bySeason.set(r.season, list);
  }

  const deduped: SyncRunRow[] = [];
  for (const [, seasonRuns] of bySeason) {
    const forActive = seasonRuns.filter(r => r.leagueId === activeLeagueId);
    const pool = forActive.length > 0 ? forActive : seasonRuns;
    const chosen = pickNewestSyncRun(pool);
    if (chosen) deduped.push(chosen);
  }

  deduped.sort((a, b) => b.season - a.season);
  return deduped.map(mapSyncRunToRefreshManifest);
}

const MAX_REFRESH_MANIFEST_ERROR_LEN = 16_000;

function truncateRefreshManifestError(msg: string | null): string | null {
  if (msg == null) return null;
  if (msg.length <= MAX_REFRESH_MANIFEST_ERROR_LEN) return msg;
  return `${msg.slice(0, MAX_REFRESH_MANIFEST_ERROR_LEN)}…(truncated)`;
}

function mapSyncRunToRefreshManifest(r: typeof syncRuns.$inferSelect): RefreshManifest {
  const lastAt = r.finishedAt ?? r.startedAt;
  const manifestStatus: "success" | "partial" | "failed" =
    r.status === "success"
      ? "success"
      : r.status === "failed"
        ? "failed"
        : "partial"; // running | partial → partial for legacy enum
  const views =
    r.rawViewsSaved > 0 ? (["combined"] as unknown as RefreshManifest["viewsRefreshed"]) : null;
  return {
    id: r.id,
    season: r.season,
    lastRefreshedAt: lastAt,
    viewsRefreshed: views,
    teamCount: r.teamsSaved,
    rosterCount: r.rosterEntriesSaved,
    matchupCount: r.matchupsSaved,
    draftPickCount: r.draftPicksSaved,
    transactionCount: r.transactionsSaved,
    status: manifestStatus,
    errorMessage: truncateRefreshManifestError(r.errorMessage ?? null),
  };
}

/** @deprecated No-op — `refresh_manifest` retired; pipeline persists to `sync_runs` only. */
export async function upsertRefreshManifest(
  _season: number,
  _data: {
    teamCount?: number;
    rosterCount?: number;
    matchupCount?: number;
    draftPickCount?: number;
    transactionCount?: number;
    status: "success" | "partial" | "failed";
    errorMessage?: string;
    viewsRefreshed?: string[];
  }
): Promise<void> {
  return;
}

export async function getChatHistory(userId: number, season?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = season
    ? and(eq(chatHistory.userId, userId), eq(chatHistory.season, season))
    : eq(chatHistory.userId, userId);
  return db.select().from(chatHistory).where(conditions).orderBy(chatHistory.createdAt).limit(100);
}

export async function addChatMessage(userId: number, role: "user" | "assistant", content: string, season?: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatHistory).values({ userId, role, content, season: season ?? null });
}

export async function clearChatHistory(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(chatHistory).where(eq(chatHistory.userId, userId));
}

// ── Pick Trade helpers ────────────────────────────────────────────────────────
export async function getPickTrades(draftYear: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pickTrades)
    .where(eq(pickTrades.draftYear, draftYear))
    .orderBy(pickTrades.round, pickTrades.pickInRound);
}

export async function addPickTrade(trade: InsertPickTrade) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(pickTrades).values(trade);
  return result;
}

export async function removePickTrade(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pickTrades).where(eq(pickTrades.id, id));
}

// ── ESPN View Health helpers ──────────────────────────────────────────────────

/** Active ESPN league id for cron/global jobs (first active DB connection, else env). */
export async function getDefaultEspnLeagueId(): Promise<string> {
  const db = await getDb();
  if (db) {
    const rows = await db
      .select({
        leagueId: leagueConnections.leagueId,
        credentials: leagueConnections.credentials,
      })
      .from(leagueConnections)
      .where(
        and(
          eq(leagueConnections.isActive, true),
          eq(leagueConnections.provider, "espn")
        )
      )
      .orderBy(desc(leagueConnections.updatedAt))
      .limit(1);
    if (rows[0]) {
      const creds = decryptCredentialsFromDb(rows[0].credentials) as Record<string, string> | null;
      return (creds?.leagueId as string) ?? rows[0].leagueId;
    }
  }
  return process.env.ESPN_LEAGUE_ID ?? "default";
}

/**
 * Upsert ESPN view health by (season, viewName) using raw SQL + `ON DUPLICATE KEY UPDATE`.
 */
export async function upsertViewHealth(
  season: number,
  viewName: string,
  data: { status: "ok" | "error" | "stale" | "empty"; errorMessage?: string; recordCount?: number }
) {
  const db = await getDb();
  if (!db) return;

  const yr = Math.floor(Number(season));
  if (!Number.isFinite(yr) || yr < 1900 || yr > 2200) {
    console.warn("[upsertViewHealth] invalid season:", season);
    return;
  }
  const vn = String(viewName).slice(0, 64);

  const now = new Date();
  const st = data.status;
  const err = data.errorMessage ?? null;
  const rc = data.recordCount ?? null;

  await db.execute(sql`
    INSERT INTO \`espn_view_health\` (
      \`season\`, \`viewName\`, \`status\`, \`errorMessage\`, \`recordCount\`, \`fetchedAt\`, \`updatedAt\`
    ) VALUES (
      ${yr}, ${vn}, ${st}, ${err}, ${rc}, ${now}, ${now}
    )
    ON DUPLICATE KEY UPDATE
      \`status\` = VALUES(\`status\`),
      \`errorMessage\` = VALUES(\`errorMessage\`),
      \`recordCount\` = VALUES(\`recordCount\`),
      \`fetchedAt\` = VALUES(\`fetchedAt\`),
      \`updatedAt\` = VALUES(\`updatedAt\`)
  `);
}

export async function getViewHealthForSeason(season: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(espnViewHealth)
    .where(eq(espnViewHealth.season, season))
    .orderBy(espnViewHealth.viewName);
}

export async function getAllViewHealth() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(espnViewHealth)
    .orderBy(desc(espnViewHealth.season), espnViewHealth.viewName);
}

// ── Weekly Player Stats helpers ───────────────────────────────────────────────

/** Upsert a batch of weekly stat rows (insert or replace on season+week+playerId) */
export async function upsertWeeklyStats(rows: InsertWeeklyPlayerStats[]): Promise<void> {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const row of batch) {
      await db.insert(weeklyPlayerStats)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            targets: row.targets,
            receptions: row.receptions,
            receivingYards: row.receivingYards,
            receivingTDs: row.receivingTDs,
            rushingAttempts: row.rushingAttempts,
            rushingYards: row.rushingYards,
            rushingTDs: row.rushingTDs,
            passingAttempts: row.passingAttempts,
            completions: row.completions,
            passingYards: row.passingYards,
            passingTDs: row.passingTDs,
            interceptions: row.interceptions,
            snapCount: row.snapCount,
            snapPct: row.snapPct,
            fantasyPoints: row.fantasyPoints,
            ownerName: row.ownerName,
            teamId: row.teamId,
            updatedAt: new Date(),
          },
        });
    }
  }
}

/** Get all cached weekly stats for a season */
export async function getWeeklyStatsBySeason(season: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weeklyPlayerStats)
    .where(eq(weeklyPlayerStats.season, season))
    .orderBy(weeklyPlayerStats.week, weeklyPlayerStats.playerName);
}

/** Get all weekly stats for a specific player in a season */
export async function getWeeklyStatsByPlayer(season: number, playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weeklyPlayerStats)
    .where(and(eq(weeklyPlayerStats.season, season), eq(weeklyPlayerStats.playerId, playerId)))
    .orderBy(weeklyPlayerStats.week);
}

/** Get stats for a specific week */
export async function getWeeklyStatsByWeek(season: number, week: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weeklyPlayerStats)
    .where(and(eq(weeklyPlayerStats.season, season), eq(weeklyPlayerStats.week, week)))
    .orderBy(desc(weeklyPlayerStats.fantasyPoints));
}

/** Get which weeks have already been cached for a season */
export async function getCachedWeeksForSeason(season: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ week: weeklyPlayerStats.week })
    .from(weeklyPlayerStats)
    .where(eq(weeklyPlayerStats.season, season))
    .orderBy(weeklyPlayerStats.week);
  return rows.map(r => r.week);
}

/** Delete all cached weekly stats for a season */
export async function deleteWeeklyStatsForSeason(season: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(weeklyPlayerStats).where(eq(weeklyPlayerStats.season, season));
}

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────
export async function getScheduledJobs(): Promise<ScheduledJob[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scheduledJobs).orderBy(scheduledJobs.name);
}
export async function getScheduledJobByName(name: string): Promise<ScheduledJob | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(scheduledJobs).where(eq(scheduledJobs.name, name)).limit(1);
  return rows[0] ?? null;
}
export async function getScheduledJobByTaskUid(taskUid: string): Promise<ScheduledJob | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(scheduledJobs).where(eq(scheduledJobs.taskUid, taskUid)).limit(1);
  return rows[0] ?? null;
}
export async function upsertScheduledJob(data: {
  name: string; description?: string; cronExpression?: string;
  callbackPath?: string; taskUid?: string; isEnabled?: boolean; nextRunAt?: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const isEnabledInt = data.isEnabled === false ? 0 : 1;
  const existing = await getScheduledJobByName(data.name);
  if (existing) {
    await db.update(scheduledJobs).set({
      description: data.description ?? existing.description,
      cronExpression: data.cronExpression ?? existing.cronExpression,
      callbackPath: data.callbackPath ?? existing.callbackPath,
      taskUid: data.taskUid ?? existing.taskUid,
      isEnabled: isEnabledInt,
      nextRunAt: data.nextRunAt ?? existing.nextRunAt,
      updatedAt: new Date(),
    }).where(eq(scheduledJobs.name, data.name));
  } else {
    await db.insert(scheduledJobs).values({
      name: data.name, description: data.description ?? null,
      cronExpression: data.cronExpression ?? null, callbackPath: data.callbackPath ?? null,
      taskUid: data.taskUid ?? null, isEnabled: isEnabledInt, nextRunAt: data.nextRunAt ?? null,
    });
  }
}
export async function updateScheduledJobRun(taskUid: string, status: "success" | "partial" | "failed", details?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledJobs)
    .set({ lastRunAt: new Date(), lastRunStatus: status, lastRunDetails: details ?? null, updatedAt: new Date() })
    .where(eq(scheduledJobs.taskUid, taskUid));
}

// ── GM Memory helpers ─────────────────────────────────────────────────────────
export async function getUserMemory(userId: number): Promise<UserMemory | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(userMemory).where(eq(userMemory.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertUserMemory(userId: number, data: {
  riskTolerance?: string;
  tradePhilosophy?: string;
  keeperPhilosophy?: string;
  draftStyle?: string;
  favoritePlayerTypes?: string;
  rivalManagers?: string;
  notes?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const updateSet = {
    riskTolerance: data.riskTolerance ?? null,
    tradePhilosophy: data.tradePhilosophy ?? null,
    keeperPhilosophy: data.keeperPhilosophy ?? null,
    draftStyle: data.draftStyle ?? null,
    favoritePlayerTypes: data.favoritePlayerTypes ?? null,
    rivalManagers: data.rivalManagers ?? null,
    notes: data.notes ?? null,
    updatedAt: new Date(),
  };
  await db.insert(userMemory)
    .values({ userId, ...updateSet })
    .onDuplicateKeyUpdate({ set: updateSet });
}

// ── Per-user ESPN credentials ─────────────────────────────────────────────────
/**
 * Look up the active ESPN league connection for a user and return EspnCreds.
 * Falls back gracefully (returns undefined) if no connection found.
 * Callers should fall back to env vars when undefined is returned.
 */
export async function getActiveEspnCredentials(userId: number): Promise<EspnCreds | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(leagueConnections)
    .where(and(
      eq(leagueConnections.userId, userId),
      eq(leagueConnections.provider, "espn"),
      eq(leagueConnections.isActive, true)
    ))
    .orderBy(desc(leagueConnections.updatedAt))
    .limit(1);
  if (!rows.length) return undefined;
  const row = rows[0];
  // Decrypt credentials (supports both encrypted enc:v1 and legacy plain-object formats)
  const creds = decryptCredentialsFromDb(row.credentials) as Record<string, string> | null;
  if (!creds?.swid || !creds?.espnS2) return undefined;
  return {
    leagueId: (creds.leagueId as string) ?? row.leagueId,
    swid: creds.swid,
    espnS2: creds.espnS2,
  };
}

// ─── Active League Context ─────────────────────────────────────────────────

export type ActiveLeagueResolveCtx = { user?: { id: number } | null };

export type ResolvedActiveLeagueId = { leagueId: string; source: string };

function logActiveLeagueResolve(opts: {
  requestedSeason: number | null;
  inputLeagueId: string | null;
  resolvedLeagueId: string;
  source: string;
}) {
  console.warn("[resolveActiveLeagueId]", JSON.stringify(opts));
}

async function getUserEspnLeagueIds(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ leagueId: leagueConnections.leagueId })
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, userId),
        eq(leagueConnections.provider, "espn"),
        eq(leagueConnections.isActive, true)
      )
    );
  const out = new Set<string>();
  for (const r of rows) {
    if (r.leagueId) out.add(String(r.leagueId).trim().slice(0, 32));
  }
  return Array.from(out);
}

/** Latest successful sync row's league (any season) — for anonymous reads on single-league installs. */
async function resolveLatestSuccessfulLeagueFromSyncRuns(): Promise<{ leagueId: string; source: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db
    .select({ leagueId: syncRuns.leagueId })
    .from(syncRuns)
    .where(eq(syncRuns.status, "success"))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);
  const lid = row[0]?.leagueId != null ? String(row[0].leagueId).trim().slice(0, 32) : "";
  if (!lid) return null;
  return { leagueId: lid, source: "sync_runs_latest_success" };
}

/**
 * For a season: pick leagueId from recent successful sync_runs, preferring rows
 * whose league matches the user's ESPN connections, then a single-league season, then most recent.
 */
async function resolveLeagueFromSyncRunsForSeason(
  season: number,
  userId?: number
): Promise<{ leagueId: string; source: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const yr = Math.floor(Number(season));
  if (!Number.isFinite(yr) || yr < 1900 || yr > 2200) return null;

  const runs = await db
    .select({ leagueId: syncRuns.leagueId })
    .from(syncRuns)
    .where(and(eq(syncRuns.season, yr), eq(syncRuns.status, "success")))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(40);

  if (!runs.length) return null;

  if (userId != null) {
    const allowed = new Set(await getUserEspnLeagueIds(userId));
    for (const r of runs) {
      const id = String(r.leagueId).trim().slice(0, 32);
      if (allowed.has(id)) return { leagueId: id, source: "sync_runs_user_recent" };
    }
  }

  const distinct = Array.from(new Set(runs.map(r => String(r.leagueId).trim().slice(0, 32))));
  if (distinct.length === 1) return { leagueId: distinct[0]!, source: "sync_runs_single_league" };

  const first = String(runs[0].leagueId).trim().slice(0, 32);
  return { leagueId: first, source: "sync_runs_recent_any" };
}

/**
 * Resolve ESPN cache / normalized-table league id for reads.
 *
 * Order: explicit input → user's ESPN credentials leagueId → sync_runs for season
 * (prefer user's leagues, else single-league season, else most recent) → latest
 * successful sync (no season) → ESPN_LEAGUE_ID → non-production dev fallback → default.
 */
export async function resolveActiveLeagueId(
  ctx: ActiveLeagueResolveCtx,
  inputLeagueId?: string | null,
  season?: number
): Promise<ResolvedActiveLeagueId> {
  const inL =
    inputLeagueId != null && String(inputLeagueId).trim() !== ""
      ? String(inputLeagueId).trim().slice(0, 32)
      : null;
  if (inL) {
    const r = { leagueId: inL, source: "input" };
    logActiveLeagueResolve({
      requestedSeason: season ?? null,
      inputLeagueId: inputLeagueId ?? null,
      resolvedLeagueId: r.leagueId,
      source: r.source,
    });
    return r;
  }

  const uid = ctx.user?.id ?? undefined;
  if (uid != null) {
    const creds = await getActiveEspnCredentials(uid);
    const cid = creds?.leagueId ? String(creds.leagueId).trim().slice(0, 32) : "";
    if (cid) {
      const r = { leagueId: cid, source: "credentials" };
      logActiveLeagueResolve({
        requestedSeason: season ?? null,
        inputLeagueId: inputLeagueId ?? null,
        resolvedLeagueId: r.leagueId,
        source: r.source,
      });
      return r;
    }
  }

  const syncSeason =
    season != null && Number.isFinite(Number(season)) ? Math.floor(Number(season)) : null;
  const allowSeasonScopedSync = syncSeason != null && syncSeason >= 2000;
  const allowLatestSyncFallback =
    season === null || season === undefined || allowSeasonScopedSync;

  if (allowSeasonScopedSync) {
    const fromRuns = await resolveLeagueFromSyncRunsForSeason(syncSeason!, uid);
    if (fromRuns) {
      logActiveLeagueResolve({
        requestedSeason: season ?? null,
        inputLeagueId: inputLeagueId ?? null,
        resolvedLeagueId: fromRuns.leagueId,
        source: fromRuns.source,
      });
      return { leagueId: fromRuns.leagueId, source: fromRuns.source };
    }
  }

  if (allowLatestSyncFallback) {
    const latest = await resolveLatestSuccessfulLeagueFromSyncRuns();
    if (latest) {
      logActiveLeagueResolve({
        requestedSeason: season ?? null,
        inputLeagueId: inputLeagueId ?? null,
        resolvedLeagueId: latest.leagueId,
        source: latest.source,
      });
      return latest;
    }
  }

  const envId = process.env.ESPN_LEAGUE_ID?.trim().slice(0, 32);
  if (envId) {
    const r = { leagueId: envId, source: "env_espn_league_id" };
    logActiveLeagueResolve({
      requestedSeason: season ?? null,
      inputLeagueId: inputLeagueId ?? null,
      resolvedLeagueId: r.leagueId,
      source: r.source,
    });
    return r;
  }

  const isNonProd = process.env.NODE_ENV !== "production";
  if (isNonProd) {
    const r = { leagueId: "457622", source: "dev_fallback_league" };
    logActiveLeagueResolve({
      requestedSeason: season ?? null,
      inputLeagueId: inputLeagueId ?? null,
      resolvedLeagueId: r.leagueId,
      source: r.source,
    });
    return r;
  }

  const r = { leagueId: "default", source: "fallback_default" };
  logActiveLeagueResolve({
    requestedSeason: season ?? null,
    inputLeagueId: inputLeagueId ?? null,
    resolvedLeagueId: r.leagueId,
    source: r.source,
  });
  return r;
}

/**
 * Get the user's active league connection record.
 * Falls back to the most recently updated active connection if activeLeagueId is 0/null.
 */
export async function getActiveLeagueForUser(userId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get user's activeLeagueId
  const userRows = await db
    .select({ activeLeagueId: users.activeLeagueId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const activeId = userRows[0]?.activeLeagueId;

  if (activeId && activeId > 0) {
    const rows = await db
      .select()
      .from(leagueConnections)
      .where(and(eq(leagueConnections.id, activeId), eq(leagueConnections.userId, userId)))
      .limit(1);
    if (rows.length) return rows[0];
  }

  // Fallback: most recently updated active connection
  const rows = await db
    .select()
    .from(leagueConnections)
    .where(and(eq(leagueConnections.userId, userId), eq(leagueConnections.isActive, true)))
    .orderBy(desc(leagueConnections.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Set the user's active league connection.
 */
export async function setActiveLeagueForUser(userId: number, leagueConnectionId: number) {
  const db = await getDb();
  if (!db) return false;
  await db
    .update(users)
    .set({ activeLeagueId: leagueConnectionId, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return true;
}

// ─── LLM Usage Metering ────────────────────────────────────────────────────

/**
 * Persist one LLM call's usage metrics to the llm_usage table.
 * Fire-and-forget safe — errors are swallowed to never affect the caller.
 */
export async function persistLlmUsage(opts: {
  userId?: number | null;
  callType: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  streaming: boolean;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(llmUsage).values({
      userId: opts.userId ?? null,
      callType: opts.callType,
      model: opts.model,
      promptTokens: opts.promptTokens,
      completionTokens: opts.completionTokens,
      totalTokens: opts.totalTokens,
      durationMs: opts.durationMs,
      streaming: opts.streaming,
      createdAt: new Date(),
    });
  } catch {
    // Never throw — usage logging must not break the main request
  }
}

/**
 * Get LLM usage summary for a user (last 30 days).
 */
export async function getLlmUsageSummary(userId: number) {
  const db = await getDb();
  if (!db) return { totalTokens: 0, totalCalls: 0, byCallType: {} as Record<string, number> };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(llmUsage)
    .where(and(eq(llmUsage.userId, userId), gt(llmUsage.createdAt, thirtyDaysAgo)))
    .orderBy(desc(llmUsage.createdAt))
    .limit(500);

  const totalTokens = rows.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
  const totalCalls = rows.length;
  const byCallType: Record<string, number> = {};
  for (const r of rows) {
    byCallType[r.callType] = (byCallType[r.callType] ?? 0) + (r.totalTokens ?? 0);
  }
  return { totalTokens, totalCalls, byCallType };
}

// ─── Scraped Trades helpers ────────────────────────────────────────────────────

/**
 * Upsert a batch of scraped trades from the Chrome extension.
 * Deduplicates on tradeKey — safe to call multiple times with the same data.
 */
export async function upsertScrapedTrades(rows: InsertScrapedTrade[]): Promise<number> {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;
  let inserted = 0;
  for (const row of rows) {
    try {
      await db.insert(scrapedTrades)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            sideAJson: row.sideAJson,
            sideBJson: row.sideBJson,
            rawJson: row.rawJson ?? null,
            scrapedAt: new Date(),
          },
        });
      inserted++;
    } catch (err) {
      console.warn("[DB] upsertScrapedTrades row error:", err);
    }
  }
  return inserted;
}

/**
 * Get all scraped trades for a season (or all seasons if season=0).
 */
export async function getScrapedTrades(season?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(scrapedTrades);
  if (season && season > 0) {
    return query.where(eq(scrapedTrades.season, season)).orderBy(desc(scrapedTrades.executedAt));
  }
  return query.orderBy(desc(scrapedTrades.executedAt));
}

// ── League Events helpers (ESPN Activity Capture) ────────────────────────────

/**
 * Upsert a batch of league event rows. Dedupes on espnTxId.
 * Returns the number of rows actually inserted (skips duplicates).
 */
export async function upsertLeagueEvents(rows: InsertLeagueEvent[]): Promise<number> {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;
  let inserted = 0;
  for (const row of rows) {
    try {
      await db.insert(leagueEvents)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            // On duplicate espnTxId: update payload in case we get richer data later
            payloadJson: row.payloadJson,
            rawJson: row.rawJson ?? null,
            capturedAt: new Date(),
          },
        });
      inserted++;
    } catch (err) {
      console.warn("[DB] upsertLeagueEvents row error:", err);
    }
  }
  return inserted;
}

/**
 * Get league events for a league+season, newest first.
 * Optionally filter by eventType.
 */
export async function getLeagueEvents(
  leagueId: string,
  season?: number,
  eventType?: string,
  limit = 200
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  conditions.push(eq(leagueEvents.leagueId, leagueId));
  if (season && season > 0) conditions.push(eq(leagueEvents.season, season));
  if (eventType) conditions.push(eq(leagueEvents.eventType, eventType));
  return db.select().from(leagueEvents)
    .where(and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
    .orderBy(desc(leagueEvents.processedAt))
    .limit(limit);
}

/**
 * Get a count summary of league events by type for a league+season.
 */
export async function getLeagueEventsSummary(leagueId: string, season?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(leagueEvents.leagueId, leagueId)];
  if (season && season > 0) conditions.push(eq(leagueEvents.season, season));
  return db.select().from(leagueEvents)
    .where(and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
    .orderBy(desc(leagueEvents.processedAt))
    .limit(500);
}
