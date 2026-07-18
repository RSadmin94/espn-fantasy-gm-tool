import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const warRoom = fs.readFileSync(path.join(repoRoot, "client/src/pages/DraftWarRoom.tsx"), "utf-8");
const desk = fs.readFileSync(path.join(repoRoot, "client/src/pages/DraftWarRoomDesk.tsx"), "utf-8");

describe("RFSN-019 — War Room IA cleanup", () => {
  it("removes duplicate Most Likely to Surprise briefing card", () => {
    expect(warRoom).not.toContain('label: "Most Likely to Surprise"');
    expect(warRoom).toContain('label: "Least Predictable"');
  });

  it("uses Roster Priority scan language and Roster Priorities section", () => {
    expect(warRoom).toContain('label: "Roster Priority"');
    expect(warRoom).toContain('title="Roster Priorities"');
    expect(warRoom).toContain("View Build Targets");
    expect(warRoom).not.toContain('label: "Biggest Roster Hole"');
    expect(warRoom).not.toContain('label: "Weakest Position"');
  });

  it("briefing cards keep analyst narrative, not bare metrics", () => {
    expect(warRoom).toContain("league's wildcard");
    expect(warRoom).toContain("drafts by the book");
    expect(warRoom).toContain("Analyst briefing");
    expect(warRoom).toContain("% predictability");
  });

  it("briefing cards open sections (expand + scroll), not scroll-only", () => {
    expect(warRoom).toContain("openAndScrollTo");
    expect(warRoom).toContain("DwrExpandContext");
    expect(warRoom).toContain("expandToken");
    expect(warRoom).toContain("onOpenSection");
    expect(warRoom).toContain("scroll-mt-28");
  });

  it("Owner DNA emphasizes archetype + visible predictability (not hover-only)", () => {
    expect(warRoom).toContain("draftBehaviorLabel");
    expect(warRoom).toContain("% predictability");
    expect(desk).toContain("% predictability");
    expect(desk).toContain("Draft behavior:");
  });

  it("preserves required sections", () => {
    for (const id of [
      "dwr-keepers",
      "dwr-dna",
      "dwr-runs",
      "dwr-value",
      "dwr-compression",
      "dwr-trades",
      "dwr-mock",
    ]) {
      expect(warRoom).toContain(`id="${id}"`);
    }
  });
});
