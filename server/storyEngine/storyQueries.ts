/**
 * storyEngine/storyQueries.ts
 * ───────────────────────────
 * Pure selection helpers that existing editorial routing can consume WITHOUT
 * any change to routing itself. Routing asks for Top Active / Background /
 * Emerging / Resolved stories; these functions filter + rank an in-memory
 * Story[] deterministically. DB-backed wrappers live in index.ts.
 */
import type { Story, StoryStatus } from "./storyTypes";

/**
 * Canonical ranking: priority desc → confidence desc → least-recently-mentioned
 * first (rotation / anti-nag) → oldest first → id (stable tiebreak).
 */
export function rankStories(a: Story, b: Story): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  const am = a.lastMentioned ?? 0;
  const bm = b.lastMentioned ?? 0;
  if (am !== bm) return am - bm; // less-recently mentioned wins
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0;
}

function pick(stories: Story[], statuses: StoryStatus[], limit?: number): Story[] {
  const set = new Set(statuses);
  const filtered = stories.filter((s) => set.has(s.status)).sort(rankStories);
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

/** Highest-priority live stories — the A/B/C material for a broadcast. */
export function getTopActiveStories(stories: Story[], limit = 5): Story[] {
  return pick(stories, ["active"], limit);
}

/** Cooled / dormant stories — texture and callbacks, not the lead. */
export function getBackgroundStories(stories: Story[], limit?: number): Story[] {
  return pick(stories, ["background", "cooling"], limit);
}

/** Freshly seeded stories not yet promoted to active. */
export function getEmergingStories(stories: Story[], limit?: number): Story[] {
  return pick(stories, ["emerging"], limit);
}

/** Paid-off arcs, still queryable while archived. */
export function getResolvedStories(stories: Story[], limit?: number): Story[] {
  return pick(stories, ["resolved"], limit);
}
