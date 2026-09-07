import { describe, it, expect } from "vitest";
import {
  getTopActiveStories,
  getBackgroundStories,
  getEmergingStories,
  getResolvedStories,
} from "./storyQueries";
import type { Story, StoryStatus } from "./storyTypes";

function story(id: string, status: StoryStatus, priority: number, extra: Partial<Story> = {}): Story {
  return {
    storyId: id,
    storyType: "rise",
    leagueId: "457622",
    owners: [id],
    ownerDisplay: [id],
    priority,
    status,
    createdAt: 0,
    lastMentioned: null,
    mentionCount: 0,
    confidence: 0.7,
    resolution: null,
    expiry: 1_000_000,
    supportingFacts: [],
    headline: id,
    lastDetectedAt: 0,
    ...extra,
  };
}

describe("storyQueries — ordering & buckets", () => {
  it("getTopActiveStories ranks active stories by priority and respects the limit", () => {
    const stories = [
      story("a", "active", 40),
      story("b", "active", 90),
      story("c", "active", 65),
    ];
    const top = getTopActiveStories(stories);
    expect(top.map((s) => s.storyId)).toEqual(["b", "c", "a"]);
    expect(getTopActiveStories(stories, 2).map((s) => s.storyId)).toEqual(["b", "c"]);
  });

  it("routes each status into the right bucket", () => {
    const stories = [
      story("act", "active", 70),
      story("emg", "emerging", 55),
      story("bg", "background", 20),
      story("cool", "cooling", 40),
      story("res", "resolved", 30),
    ];
    expect(getTopActiveStories(stories).map((s) => s.storyId)).toEqual(["act"]);
    expect(getEmergingStories(stories).map((s) => s.storyId)).toEqual(["emg"]);
    expect(getBackgroundStories(stories).map((s) => s.storyId).sort()).toEqual(["bg", "cool"]);
    expect(getResolvedStories(stories).map((s) => s.storyId)).toEqual(["res"]);
  });

  it("tie-break: at equal priority, the less-recently-mentioned story ranks higher", () => {
    const stories = [
      story("recent", "active", 60, { lastMentioned: 5000 }),
      story("stale", "active", 60, { lastMentioned: 1000 }),
    ];
    expect(getTopActiveStories(stories).map((s) => s.storyId)).toEqual(["stale", "recent"]);
  });
});
