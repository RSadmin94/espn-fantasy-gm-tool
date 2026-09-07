import { describe, it, expect } from "vitest";
import { reconcile, applyMention, buildStoryId } from "./storyLedger";
import { STORY_CONFIG } from "./storyTypes";
import type { DetectedStory, Story } from "./storyTypes";

const LEAGUE = "457622";

function det(partial: Partial<DetectedStory> = {}): DetectedStory {
  return {
    storyType: "rise",
    owners: ["m1"],
    ownerDisplay: ["M1"],
    headline: "M1 is rising",
    priority: 60,
    confidence: 0.7,
    supportingFacts: [{ kind: "record", text: "6-1" }],
    ...partial,
  };
}

function story(partial: Partial<Story> = {}): Story {
  return {
    storyId: buildStoryId(LEAGUE, "rise", ["m1"]),
    storyType: "rise",
    leagueId: LEAGUE,
    owners: ["m1"],
    ownerDisplay: ["M1"],
    priority: 60,
    status: "active",
    createdAt: 0,
    lastMentioned: null,
    mentionCount: 0,
    confidence: 0.7,
    resolution: null,
    expiry: STORY_CONFIG.activeTtlMs,
    supportingFacts: [],
    headline: "M1 is rising",
    lastDetectedAt: 0,
    ...partial,
  };
}

describe("storyLedger.reconcile — begin & grow", () => {
  it("creates a new emerging story from a fresh detection", () => {
    const out = reconcile({ leagueId: LEAGUE, existing: [], detected: [det()], now: 1000 });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("emerging");
    expect(out[0].mentionCount).toBe(0);
    expect(out[0].createdAt).toBe(1000);
    expect(out[0].priority).toBe(60);
    expect(out[0].storyId).toBe(buildStoryId(LEAGUE, "rise", ["m1"]));
  });

  it("escalates on re-detection: emerging -> active, priority grows", () => {
    const first = reconcile({ leagueId: LEAGUE, existing: [], detected: [det()], now: 1000 });
    const second = reconcile({ leagueId: LEAGUE, existing: first, detected: [det()], now: 2000 });
    expect(second).toHaveLength(1);
    expect(second[0].status).toBe("active");
    expect(second[0].priority).toBeGreaterThan(first[0].priority);
    expect(second[0].lastDetectedAt).toBe(2000);
  });

  it("prevents duplicates: two identical detections collapse to one story", () => {
    const out = reconcile({ leagueId: LEAGUE, existing: [], detected: [det(), det()], now: 1000 });
    expect(out).toHaveLength(1);
  });

  it("re-detecting an existing story never creates a second row", () => {
    const first = reconcile({ leagueId: LEAGUE, existing: [], detected: [det()], now: 1000 });
    const second = reconcile({ leagueId: LEAGUE, existing: first, detected: [det()], now: 2000 });
    expect(second).toHaveLength(1);
  });
});

describe("storyLedger.reconcile — resolve, cool, retire", () => {
  it("resolves when a detection carries a resolution, and stays resolved (sticky)", () => {
    const created = reconcile({ leagueId: LEAGUE, existing: [], detected: [det()], now: 1000 });
    const resolved = reconcile({
      leagueId: LEAGUE,
      existing: created,
      detected: [det({ resolution: "Won the title" })],
      now: 2000,
    });
    expect(resolved[0].status).toBe("resolved");
    expect(resolved[0].resolution).toBe("Won the title");

    // re-detected later WITHOUT a resolution → remains resolved
    const stillResolved = reconcile({
      leagueId: LEAGUE,
      existing: resolved,
      detected: [det()],
      now: 3000,
    });
    expect(stillResolved[0].status).toBe("resolved");
  });

  it("cools an undetected story (priority drops, status leaves active)", () => {
    const s = story({ priority: 60, status: "active", expiry: 10_000_000 });
    const out = reconcile({ leagueId: LEAGUE, existing: [s], detected: [], now: 1000 });
    expect(out).toHaveLength(1);
    expect(out[0].priority).toBe(60 - STORY_CONFIG.coolStep);
    expect(out[0].status).not.toBe("active");
  });

  it("retires (drops) an undetected story once it passes expiry", () => {
    const s = story({ expiry: 5000 });
    const out = reconcile({ leagueId: LEAGUE, existing: [s], detected: [], now: 6000 });
    expect(out).toHaveLength(0);
  });
});

describe("storyLedger.applyMention", () => {
  it("bumps mentionCount + lastMentioned, reinforces confidence, damps priority", () => {
    const s = story({ priority: 60, confidence: 0.7, mentionCount: 0, lastMentioned: null });
    const m = applyMention(s, 4242);
    expect(m.mentionCount).toBe(1);
    expect(m.lastMentioned).toBe(4242);
    expect(m.priority).toBe(60 - STORY_CONFIG.mentionCooldown);
    expect(m.confidence).toBeCloseTo(0.73, 5);
  });
});
