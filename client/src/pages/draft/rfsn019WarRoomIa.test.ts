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
    expect(warRoom).toContain("View Roster Priorities");
    expect(warRoom).not.toContain("View Build Targets");
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

describe("RFSN-027A — War Room consolidation execution", () => {
  it("desk no longer hosts duplicate intelligence panels", () => {
    expect(desk).not.toContain('title="Owner DNA Map"');
    expect(desk).not.toContain('title="Rival Threat Window"');
    expect(desk).not.toContain('title="Decision Memo"');
    expect(desk).not.toContain("Receipts & Triggers");
    expect(desk).not.toContain("Reality snapshot");
    expect(desk).not.toContain('title="Historical Read"');
  });

  it("preserves high-interest presentation in correct homes", () => {
    // Historical Read + Rival Threat Window → DNA detail home
    expect(warRoom).toContain("Historical Read");
    expect(warRoom).toContain("Rival Threat Window");
    expect(warRoom).toContain("data-dna-threat-lead");
    // Decision Memo synthesis → Briefing scan
    expect(warRoom).toContain("Tonight");
    expect(warRoom).toContain("data-briefing-decision-memo");
    // Command Board keeps rival radar prep cue
    expect(desk).toContain("Also on");
    expect(desk).toContain("radar:");
  });

  it("desk keeps prep-only surfaces", () => {
    expect(desk).toContain("Next-Pick Command Board");
    expect(desk).toContain("Upcoming Picks");
    expect(desk).toContain("Draft Reality Mode");
    expect(desk).toContain("data-rfsn-027a-desk");
  });

  it("briefing is scan layer with one home per insight in war room", () => {
    expect(warRoom).toContain('id="dwr-briefing"');
    expect(warRoom).toContain('id="dwr-build"');
    expect(warRoom).toContain('id="dwr-dna"');
    expect(warRoom).toContain('id="dwr-runs"');
    expect(warRoom).toContain('id="dwr-value"');
    // Briefing appears before Detailed Analytics divider in source order
    const briefingIdx = warRoom.indexOf('id="dwr-briefing"');
    const detailIdx = warRoom.indexOf("Detailed Analytics");
    const deskIdx = warRoom.indexOf("<DraftWarRoomDesk");
    expect(briefingIdx).toBeGreaterThan(-1);
    expect(detailIdx).toBeGreaterThan(briefingIdx);
    expect(deskIdx).toBeGreaterThan(briefingIdx);
    expect(deskIdx).toBeLessThan(detailIdx);
  });

  it("removes dead DraftEnvironmentSection duplicate surface", () => {
    expect(warRoom).not.toContain("function DraftEnvironmentSection");
  });
});
