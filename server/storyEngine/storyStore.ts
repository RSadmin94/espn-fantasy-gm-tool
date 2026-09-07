/**
 * storyEngine/storyStore.ts
 * ─────────────────────────
 * Persistence adapter for the Story Engine. Maps the pure Story shape to/from
 * the rfsn_stories table and reuses the shared getDb() handle. Retirement is
 * realised here by pruning league rows that fall out of the reconciled set.
 *
 * The pure engine (types/detectors/ledger/queries) never imports this file, so
 * it stays fully unit-testable without a database.
 */
import { getDb } from "../db";
import { rfsnStories, type RfsnStoryRow, type InsertRfsnStory } from "../../drizzle/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { applyMention } from "./storyLedger";
import type { Story, StoryStatus, SupportingFact } from "./storyTypes";

const toMs = (d: Date | null): number | null => (d ? d.getTime() : null);

function rowToStory(row: RfsnStoryRow): Story {
  return {
    storyId: row.storyId,
    storyType: row.storyType as Story["storyType"],
    leagueId: row.leagueId,
    owners: (row.owners as string[]) ?? [],
    ownerDisplay: (row.ownerDisplay as string[]) ?? [],
    priority: row.priority,
    status: row.status as StoryStatus,
    createdAt: row.createdAt.getTime(),
    lastMentioned: toMs(row.lastMentioned),
    mentionCount: row.mentionCount,
    confidence: row.confidence / 100,
    resolution: row.resolution ?? null,
    expiry: row.expiry.getTime(),
    supportingFacts: (row.supportingFacts as SupportingFact[]) ?? [],
    headline: row.headline,
    lastDetectedAt: toMs(row.lastDetectedAt) ?? row.createdAt.getTime(),
  };
}

function storyToInsert(s: Story): InsertRfsnStory {
  return {
    storyId: s.storyId,
    leagueId: s.leagueId,
    storyType: s.storyType,
    status: s.status,
    owners: s.owners,
    ownerDisplay: s.ownerDisplay,
    headline: s.headline.slice(0, 512),
    priority: s.priority,
    confidence: Math.round(Math.max(0, Math.min(1, s.confidence)) * 100),
    mentionCount: s.mentionCount,
    resolution: s.resolution ? s.resolution.slice(0, 512) : null,
    supportingFacts: s.supportingFacts,
    createdAt: new Date(s.createdAt),
    lastMentioned: s.lastMentioned != null ? new Date(s.lastMentioned) : null,
    lastDetectedAt: new Date(s.lastDetectedAt),
    expiry: new Date(s.expiry),
  };
}

/** Load all persisted stories for a league (empty if no DB). */
export async function loadLeagueStories(leagueId: string): Promise<Story[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(rfsnStories).where(eq(rfsnStories.leagueId, leagueId));
  return rows.map(rowToStory);
}

/**
 * Persist the reconciled story set for a league: upsert every story by storyId
 * (createdAt is preserved on update) and prune any league rows no longer in the
 * set (that is how retirement is committed).
 */
export async function saveLeagueStories(leagueId: string, stories: Story[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  for (const s of stories) {
    const v = storyToInsert(s);
    await db
      .insert(rfsnStories)
      .values(v)
      .onDuplicateKeyUpdate({
        set: {
          storyType: v.storyType,
          status: v.status,
          owners: v.owners,
          ownerDisplay: v.ownerDisplay,
          headline: v.headline,
          priority: v.priority,
          confidence: v.confidence,
          mentionCount: v.mentionCount,
          resolution: v.resolution,
          supportingFacts: v.supportingFacts,
          lastMentioned: v.lastMentioned,
          lastDetectedAt: v.lastDetectedAt,
          expiry: v.expiry,
        },
      });
  }

  const keepIds = stories.map((s) => s.storyId);
  if (keepIds.length === 0) {
    await db.delete(rfsnStories).where(eq(rfsnStories.leagueId, leagueId));
  } else {
    await db
      .delete(rfsnStories)
      .where(and(eq(rfsnStories.leagueId, leagueId), notInArray(rfsnStories.storyId, keepIds)));
  }
}

/**
 * Record that a story was surfaced in a broadcast. Reads the row, applies the
 * pure mention update (lastMentioned/mentionCount/confidence/priority) and
 * writes it back. Returns the updated Story, or null if not found / no DB.
 */
export async function recordStoryMention(
  storyId: string,
  now: number = Date.now(),
): Promise<Story | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(rfsnStories).where(eq(rfsnStories.storyId, storyId)).limit(1);
  if (rows.length === 0) return null;
  const updated = applyMention(rowToStory(rows[0]), now);
  await db
    .update(rfsnStories)
    .set({
      lastMentioned: updated.lastMentioned != null ? new Date(updated.lastMentioned) : null,
      mentionCount: updated.mentionCount,
      confidence: Math.round(updated.confidence * 100),
      priority: updated.priority,
    })
    .where(eq(rfsnStories.storyId, storyId));
  return updated;
}
