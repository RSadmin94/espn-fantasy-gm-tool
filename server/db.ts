import { eq, desc, and, gt, or, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { EspnRawCache, EspnSeasonCache, FantasyDataCache } from "../drizzle/schema";
import {
  InsertUser, users, fantasyDataCache, refreshManifest, chatHistory,
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
} from "../drizzle/schema";
import { upsertRawEspnCache, writeLegacyEspnCaches } from "./espnPersistence";
import type { EspnCreds } from "./espnService";
import { decryptCredentialsFromDb } from "./_core/crypto";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
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
  leagueId?: string
): Promise<CachedEspnSeasonRow | null> {
  const db = await getDb();
  if (!db) return null;
  const lid = String(leagueId ?? process.env.ESPN_LEAGUE_ID ?? "default").slice(0, 32);
  const yr = Math.floor(Number(season));
  const vn = String(viewName).slice(0, 64);

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
  const lid = String(leagueId ?? (await resolveActiveLeagueId(userId))).slice(0, 32);
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

export async function getRefreshManifests() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(refreshManifest).orderBy(desc(refreshManifest.season));
}

/** Coerce manifest status so MySQL enum never receives undefined / garbage (avoids bad bindings on ODKU). */
function normalizeManifestStatus(
  s: unknown
): "success" | "partial" | "failed" {
  if (s === "success" || s === "partial" || s === "failed") return s;
  return "failed";
}

const MAX_REFRESH_MANIFEST_ERROR_LEN = 16_000;

function truncateRefreshManifestError(msg: string | null): string | null {
  if (msg == null) return null;
  if (msg.length <= MAX_REFRESH_MANIFEST_ERROR_LEN) return msg;
  return `${msg.slice(0, MAX_REFRESH_MANIFEST_ERROR_LEN)}…(truncated)`;
}

/**
 * Upsert `refresh_manifest` by unique `season` using raw SQL + `ON DUPLICATE KEY UPDATE`.
 * Ensures Railway MySQL always runs a real upsert (Drizzle-logged SQL may still show `INSERT` only).
 */
export async function upsertRefreshManifest(season: number, data: {
  teamCount?: number; rosterCount?: number; matchupCount?: number;
  draftPickCount?: number; transactionCount?: number;
  status: "success" | "partial" | "failed"; errorMessage?: string; viewsRefreshed?: string[];
}) {
  const db = await getDb();
  if (!db) return;

  const yr = Math.floor(Number(season));
  if (!Number.isFinite(yr) || yr < 1900 || yr > 2200) {
    console.warn("[upsertRefreshManifest] invalid season:", season);
    return;
  }

  const status = normalizeManifestStatus(data.status);
  const errorMessage = truncateRefreshManifestError(data.errorMessage ?? null);
  const now = new Date();

  const hasFullCounts =
    typeof data.teamCount === "number" &&
    typeof data.rosterCount === "number" &&
    typeof data.matchupCount === "number" &&
    typeof data.draftPickCount === "number" &&
    typeof data.transactionCount === "number";

  const viewsRefreshed =
    data.viewsRefreshed !== undefined && data.viewsRefreshed !== null
      ? data.viewsRefreshed
      : null;

  if (hasFullCounts) {
    await db.execute(sql`
      INSERT INTO \`refresh_manifest\` (
        \`season\`, \`lastRefreshedAt\`, \`viewsRefreshed\`, \`teamCount\`, \`rosterCount\`,
        \`matchupCount\`, \`draftPickCount\`, \`transactionCount\`, \`status\`, \`errorMessage\`
      ) VALUES (
        ${yr}, ${now}, ${viewsRefreshed}, ${data.teamCount!}, ${data.rosterCount!},
        ${data.matchupCount!}, ${data.draftPickCount!}, ${data.transactionCount!}, ${status}, ${errorMessage}
      )
      ON DUPLICATE KEY UPDATE
        \`lastRefreshedAt\` = VALUES(\`lastRefreshedAt\`),
        \`viewsRefreshed\` = VALUES(\`viewsRefreshed\`),
        \`teamCount\` = VALUES(\`teamCount\`),
        \`rosterCount\` = VALUES(\`rosterCount\`),
        \`matchupCount\` = VALUES(\`matchupCount\`),
        \`draftPickCount\` = VALUES(\`draftPickCount\`),
        \`transactionCount\` = VALUES(\`transactionCount\`),
        \`status\` = VALUES(\`status\`),
        \`errorMessage\` = VALUES(\`errorMessage\`)
    `);
    return;
  }

  if (data.viewsRefreshed !== undefined) {
    const vr = data.viewsRefreshed ?? null;
    await db.execute(sql`
      INSERT INTO \`refresh_manifest\` (
        \`season\`, \`lastRefreshedAt\`, \`viewsRefreshed\`, \`teamCount\`, \`rosterCount\`,
        \`matchupCount\`, \`draftPickCount\`, \`transactionCount\`, \`status\`, \`errorMessage\`
      ) VALUES (
        ${yr}, ${now}, ${vr}, 0, 0, 0, 0, 0, ${status}, ${errorMessage}
      )
      ON DUPLICATE KEY UPDATE
        \`lastRefreshedAt\` = VALUES(\`lastRefreshedAt\`),
        \`viewsRefreshed\` = VALUES(\`viewsRefreshed\`),
        \`status\` = VALUES(\`status\`),
        \`errorMessage\` = VALUES(\`errorMessage\`)
    `);
    return;
  }

  await db.execute(sql`
    INSERT INTO \`refresh_manifest\` (
      \`season\`, \`lastRefreshedAt\`, \`viewsRefreshed\`, \`teamCount\`, \`rosterCount\`,
      \`matchupCount\`, \`draftPickCount\`, \`transactionCount\`, \`status\`, \`errorMessage\`
    ) VALUES (
      ${yr}, ${now}, ${viewsRefreshed}, 0, 0, 0, 0, 0, ${status}, ${errorMessage}
    )
    ON DUPLICATE KEY UPDATE
      \`lastRefreshedAt\` = VALUES(\`lastRefreshedAt\`),
      \`status\` = VALUES(\`status\`),
      \`errorMessage\` = VALUES(\`errorMessage\`)
  `);
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

let _cachedDefaultLeagueId: { id: string; expiresAt: number } | null = null;

/**
 * Resolve ESPN cache league id: user's active connection, then any active ESPN
 * connection, then ESPN_LEAGUE_ID env, then "default".
 */
export async function resolveActiveLeagueId(userId?: number): Promise<string> {
  const now = Date.now();
  if (!userId && _cachedDefaultLeagueId && _cachedDefaultLeagueId.expiresAt > now) {
    return _cachedDefaultLeagueId.id;
  }

  const db = await getDb();
  let leagueId: string | undefined;

  if (userId && db) {
    const row = await getActiveLeagueForUser(userId);
    if (row?.leagueId) leagueId = row.leagueId;
  }

  if (!leagueId && db) {
    const rows = await db
      .select({ leagueId: leagueConnections.leagueId })
      .from(leagueConnections)
      .where(
        and(
          eq(leagueConnections.isActive, true),
          eq(leagueConnections.provider, "espn")
        )
      )
      .orderBy(desc(leagueConnections.updatedAt))
      .limit(1);
    leagueId = rows[0]?.leagueId;
  }

  const resolved = leagueId || process.env.ESPN_LEAGUE_ID || "default";
  if (!userId) {
    _cachedDefaultLeagueId = { id: resolved, expiresAt: now + 60_000 };
  }
  return resolved;
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
