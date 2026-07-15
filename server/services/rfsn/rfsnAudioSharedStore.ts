/**
 * Cross-instance RFSN Live audio persistence via existing fantasy_data_cache.
 */
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { fantasyDataCache } from "../../../drizzle/schema";
import { getDb } from "../../db";
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";
import type { RfsnLiveAudioStatus, RfsnVoiceAudioRef } from "./rfsnAudioTypes";

const CLIP_PREFIX = "rfsn:ac:";
const STATUS_PREFIX = "rfsn:as:";

export type StoredAudioClipRecord = {
  audioId: string;
  leagueId: string;
  draftId: string;
  pickId: string;
  pickNumber: number;
  commentaryId: string;
  voice: RfsnCommentatorId;
  contentType: "audio/wav";
  expiresAtMs: number;
  epoch: number;
  bytesBase64: string;
  createdAtMs: number;
};

export type RfsnAudioStoreDriver = {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
};

type CacheRow = { cacheKey: string; payload: string };

class MapAudioStoreDriver implements RfsnAudioStoreDriver {
  constructor(private readonly rows: Map<string, string>) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = this.rows.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    this.rows.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.rows.delete(key);
  }
}

class DbAudioStoreDriver implements RfsnAudioStoreDriver {
  async getJson<T>(key: string): Promise<T | null> {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select({ payload: fantasyDataCache.payload })
      .from(fantasyDataCache)
      .where(eq(fantasyDataCache.cacheKey, key))
      .limit(1);
    if (!rows[0]) return null;
    try {
      return JSON.parse(rows[0].payload) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const body = JSON.stringify(value);
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
          updatedAt: now,
        },
      });
  }

  async delete(key: string): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.delete(fantasyDataCache).where(eq(fantasyDataCache.cacheKey, key));
  }
}

let testDriver: RfsnAudioStoreDriver | null = null;
let testSharedRows: Map<string, string> | null = null;

function activeDriver(): RfsnAudioStoreDriver {
  if (testDriver) return testDriver;
  return new DbAudioStoreDriver();
}

export function clipCacheKey(audioId: string): string {
  return `${CLIP_PREFIX}${audioId}`;
}

export function draftStatusCacheKey(leagueId: string, draftId: string): string {
  const hash = createHash("sha256").update(`${leagueId}:${draftId}`).digest("hex").slice(0, 48);
  return `${STATUS_PREFIX}${hash}`;
}

export async function readAudioClip(audioId: string): Promise<StoredAudioClipRecord | null> {
  return activeDriver().getJson<StoredAudioClipRecord>(clipCacheKey(audioId));
}

export async function writeAudioClip(record: StoredAudioClipRecord): Promise<void> {
  await activeDriver().setJson(clipCacheKey(record.audioId), record);
}

export async function deleteAudioClip(audioId: string): Promise<void> {
  await activeDriver().delete(clipCacheKey(audioId));
}

export async function readDraftAudioStatus(
  leagueId: string,
  draftId: string,
): Promise<RfsnLiveAudioStatus | null> {
  return activeDriver().getJson<RfsnLiveAudioStatus>(draftStatusCacheKey(leagueId, draftId));
}

export async function writeDraftAudioStatus(
  leagueId: string,
  draftId: string,
  status: RfsnLiveAudioStatus,
): Promise<void> {
  await activeDriver().setJson(draftStatusCacheKey(leagueId, draftId), status);
}

export async function deleteDraftAudioStatus(leagueId: string, draftId: string): Promise<void> {
  await activeDriver().delete(draftStatusCacheKey(leagueId, draftId));
}

/** Two logical store clients sharing one backing map (simulates cross-instance reads in tests). */
export function createTestAudioStorePair(): {
  driverA: RfsnAudioStoreDriver;
  driverB: RfsnAudioStoreDriver;
  reset: () => void;
} {
  const rows = new Map<string, string>();
  testSharedRows = rows;
  const driverA = new MapAudioStoreDriver(rows);
  const driverB = new MapAudioStoreDriver(rows);
  return {
    driverA,
    driverB,
    reset: () => rows.clear(),
  };
}

export function setRfsnAudioStoreDriverForTests(driver: RfsnAudioStoreDriver | null): void {
  testDriver = driver;
}

export function resetRfsnAudioSharedStoreForTests(): void {
  testDriver = null;
  testSharedRows?.clear();
  testSharedRows = null;
}

export function emptyDraftAudioStatus(
  leagueId: string,
  draftId: string,
): RfsnLiveAudioStatus {
  return {
    enabled: true,
    leagueId,
    draftId,
    pickId: "",
    pickNumber: 0,
    clips: [] as RfsnVoiceAudioRef[],
    updatedAt: new Date().toISOString(),
  };
}
