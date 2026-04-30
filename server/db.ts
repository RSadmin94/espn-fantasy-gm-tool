import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, espnSeasonCache, refreshManifest, chatHistory,
  pickTrades, InsertPickTrade, espnViewHealth, InsertEspnViewHealth,
} from "../drizzle/schema";
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

export async function getCachedView(season: number, viewName: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(espnSeasonCache)
    .where(and(eq(espnSeasonCache.season, season), eq(espnSeasonCache.viewName, viewName))).limit(1);
  return result[0] ?? null;
}

export async function upsertCachedView(season: number, viewName: string, payload: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.insert(espnSeasonCache)
    .values({ season, viewName, payload: payload as Record<string, unknown> })
    .onDuplicateKeyUpdate({ set: { payload: payload as Record<string, unknown>, updatedAt: new Date() } });
}

export async function getAllCachedSeasons(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.selectDistinct({ season: espnSeasonCache.season })
    .from(espnSeasonCache).orderBy(desc(espnSeasonCache.season));
  return result.map((r) => r.season);
}

export async function getRefreshManifests() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(refreshManifest).orderBy(desc(refreshManifest.season));
}

export async function upsertRefreshManifest(season: number, data: {
  teamCount?: number; rosterCount?: number; matchupCount?: number;
  draftPickCount?: number; transactionCount?: number;
  status: "success" | "partial" | "failed"; errorMessage?: string; viewsRefreshed?: string[];
}) {
  const db = await getDb();
  if (!db) return;
  const updateSet = {
    lastRefreshedAt: new Date(), teamCount: data.teamCount ?? null,
    rosterCount: data.rosterCount ?? null, matchupCount: data.matchupCount ?? null,
    draftPickCount: data.draftPickCount ?? null, transactionCount: data.transactionCount ?? null,
    status: data.status, errorMessage: data.errorMessage ?? null, viewsRefreshed: data.viewsRefreshed ?? null,
  };
  await db.insert(refreshManifest).values({ season, ...updateSet })
    .onDuplicateKeyUpdate({ set: updateSet });
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

export async function upsertViewHealth(
  season: number,
  viewName: string,
  data: { status: "ok" | "error" | "stale" | "empty"; errorMessage?: string; recordCount?: number }
) {
  const db = await getDb();
  if (!db) return;
  const updateSet = {
    status: data.status,
    errorMessage: data.errorMessage ?? null,
    recordCount: data.recordCount ?? null,
    fetchedAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(espnViewHealth)
    .values({ season, viewName, ...updateSet })
    .onDuplicateKeyUpdate({ set: updateSet });
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
