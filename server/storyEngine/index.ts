/**
 * storyEngine/index.ts
 * ────────────────────
 * Public surface of the RFSN Story Engine.
 *
 *   refreshLeagueStories(leagueId)  — detect + reconcile + persist one cycle.
 *   getTopActiveStoriesForLeague()  — DB-backed query helpers editorial routing
 *   getBackgroundStoriesForLeague()   consumes. Routing is NOT modified; it just
 *   getEmergingStoriesForLeague()     calls these read helpers.
 *   getResolvedStoriesForLeague()
 *
 * Adds NO routes, NO broadcast changes. Wiring a scheduler / tRPC procedure to
 * refreshLeagueStories is a separate, deliberate step.
 */
import { buildStoryLeagueFacts } from "./storyFacts";
import { detectStories } from "./storyDetectors";
import { loadLeagueStories, saveLeagueStories } from "./storyStore";
import { reconcile } from "./storyLedger";
import {
  getBackgroundStories,
  getEmergingStories,
  getResolvedStories,
  getTopActiveStories,
} from "./storyQueries";
import type { Story } from "./storyTypes";

/**
 * Run one detection + reconciliation cycle for a league and persist the result.
 * Returns the full reconciled story set. Pass `now` to make cycles deterministic.
 */
export async function refreshLeagueStories(
  leagueId: string,
  now: number = Date.now(),
): Promise<Story[]> {
  const facts = await buildStoryLeagueFacts(leagueId);
  const detected = detectStories(facts);
  const existing = await loadLeagueStories(leagueId);
  const next = reconcile({ leagueId, existing, detected, now });
  await saveLeagueStories(leagueId, next);
  return next;
}

// ─── DB-backed query helpers (load persisted stories, then rank in memory) ──────

export async function getTopActiveStoriesForLeague(leagueId: string, limit = 5): Promise<Story[]> {
  return getTopActiveStories(await loadLeagueStories(leagueId), limit);
}

export async function getBackgroundStoriesForLeague(leagueId: string, limit?: number): Promise<Story[]> {
  return getBackgroundStories(await loadLeagueStories(leagueId), limit);
}

export async function getEmergingStoriesForLeague(leagueId: string, limit?: number): Promise<Story[]> {
  return getEmergingStories(await loadLeagueStories(leagueId), limit);
}

export async function getResolvedStoriesForLeague(leagueId: string, limit?: number): Promise<Story[]> {
  return getResolvedStories(await loadLeagueStories(leagueId), limit);
}

// ─── Re-exports (pure API + persistence) ────────────────────────────────────────

export type {
  Story,
  StoryType,
  StoryStatus,
  DetectedStory,
  StoryLeagueFacts,
  SupportingFact,
} from "./storyTypes";
export { STORY_CONFIG } from "./storyTypes";
export { detectStories } from "./storyDetectors";
export { reconcile, applyMention, buildStoryId } from "./storyLedger";
export {
  rankStories,
  getTopActiveStories,
  getBackgroundStories,
  getEmergingStories,
  getResolvedStories,
} from "./storyQueries";
export { buildStoryLeagueFacts } from "./storyFacts";
export { loadLeagueStories, saveLeagueStories, recordStoryMention } from "./storyStore";
