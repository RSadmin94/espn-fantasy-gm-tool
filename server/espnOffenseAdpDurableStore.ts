/**
 * RFSN-031 — Durable last-good ESPN offense ADP (fantasy_data_cache).
 * Survives process restarts; never overwritten by empty / DP-only feeds.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { fantasyDataCache } from "../drizzle/schema";

/** Matches EspnPlayerInfo in playerStatsRouter (kept local to avoid import cycles). */
export type DurableEspnPlayerInfo = {
  adp: number | null;
  projection: number | null;
  percentStarted: number | null;
};

export const ESPN_OFFENSE_ADP_CACHE_PREFIX = "espn:offense-adp:";

export function espnOffenseAdpCacheKey(season: number): string {
  return `${ESPN_OFFENSE_ADP_CACHE_PREFIX}${Math.floor(season)}`;
}

export type DurableEspnOffenseAdpPayload = {
  season: number;
  fetchedAt: string;
  players: Record<string, DurableEspnPlayerInfo>;
};

export type EspnOffenseAdpDurableDriver = {
  load(season: number): Promise<Map<string, DurableEspnPlayerInfo> | null>;
  save(season: number, map: Map<string, DurableEspnPlayerInfo>): Promise<void>;
};

function mapFromPayload(
  payload: DurableEspnOffenseAdpPayload | null,
): Map<string, DurableEspnPlayerInfo> | null {
  if (!payload || typeof payload !== "object" || !payload.players) return null;
  const map = new Map<string, DurableEspnPlayerInfo>();
  for (const [id, info] of Object.entries(payload.players)) {
    const pid = String(id ?? "").trim();
    if (!pid || !info || typeof info !== "object") continue;
    map.set(pid, {
      adp: info.adp == null || !Number.isFinite(Number(info.adp)) ? null : Number(info.adp),
      projection:
        info.projection == null || !Number.isFinite(Number(info.projection))
          ? null
          : Number(info.projection),
      percentStarted:
        info.percentStarted == null || !Number.isFinite(Number(info.percentStarted))
          ? null
          : Number(info.percentStarted),
    });
  }
  return map.size > 0 ? map : null;
}

const dbDriver: EspnOffenseAdpDurableDriver = {
  async load(season) {
    const db = await getDb();
    if (!db) return null;
    try {
      const key = espnOffenseAdpCacheKey(season);
      const rows = await db
        .select({ payload: fantasyDataCache.payload })
        .from(fantasyDataCache)
        .where(eq(fantasyDataCache.cacheKey, key))
        .limit(1);
      if (!rows[0]?.payload) return null;
      const parsed = JSON.parse(rows[0].payload) as DurableEspnOffenseAdpPayload;
      return mapFromPayload(parsed);
    } catch (err) {
      console.warn("[RFSN-031] durable offense ADP load failed (non-fatal):", err);
      return null;
    }
  },

  async save(season, map) {
    if (!map || map.size === 0) return;
    const db = await getDb();
    if (!db) return;
    try {
      const key = espnOffenseAdpCacheKey(season);
      const players: Record<string, DurableEspnPlayerInfo> = {};
      for (const [id, info] of map) {
        players[id] = info;
      }
      const body = JSON.stringify({
        season: Math.floor(season),
        fetchedAt: new Date().toISOString(),
        players,
      } satisfies DurableEspnOffenseAdpPayload);
      const now = new Date();
      await db
        .insert(fantasyDataCache)
        .values({
          cacheKey: key,
          payload: body,
          fetchedAt: now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            payload: body,
            fetchedAt: now,
            updatedAt: now,
          },
        });
    } catch (err) {
      console.warn("[RFSN-031] durable offense ADP save failed (non-fatal):", err);
    }
  },
};

let _driver: EspnOffenseAdpDurableDriver = dbDriver;

/** Test-only: swap durable driver (null restores DB driver). */
export function __setEspnOffenseAdpDurableDriverForTests(
  driver: EspnOffenseAdpDurableDriver | null,
): void {
  _driver = driver ?? dbDriver;
}

export async function loadDurableEspnOffenseAdp(
  season: number,
): Promise<Map<string, DurableEspnPlayerInfo> | null> {
  return _driver.load(season);
}

/**
 * Persist last-good offense ADP. Caller must already pass shouldPersistEspnOffenseCache.
 */
export async function saveDurableEspnOffenseAdp(
  season: number,
  map: Map<string, DurableEspnPlayerInfo>,
): Promise<void> {
  if (!map || map.size === 0) return;
  await _driver.save(season, map);
}

/** Load the newest durable offense map across season candidates (calendar, then −1). */
export async function loadDurableEspnOffenseAdpForSeasons(
  seasons: readonly number[],
): Promise<{ season: number; map: Map<string, DurableEspnPlayerInfo> } | null> {
  for (const season of seasons) {
    const map = await loadDurableEspnOffenseAdp(season);
    if (map && map.size > 0) return { season, map };
  }
  return null;
}

/** In-memory durable driver for unit tests. */
export function createMemoryEspnOffenseAdpDurableDriver(): EspnOffenseAdpDurableDriver & {
  store: Map<number, Map<string, DurableEspnPlayerInfo>>;
} {
  const store = new Map<number, Map<string, DurableEspnPlayerInfo>>();
  return {
    store,
    async load(season) {
      const hit = store.get(Math.floor(season));
      return hit && hit.size > 0 ? new Map(hit) : null;
    },
    async save(season, map) {
      if (!map || map.size === 0) return;
      store.set(Math.floor(season), new Map(map));
    },
  };
}
