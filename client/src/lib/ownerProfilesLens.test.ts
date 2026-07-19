import { describe, expect, it } from "vitest";
import {
  buildSelfIdentityTendencies,
  isScoutMode,
  isSelfMode,
  matchupTagLabel,
  ownerProfilesLensCopy,
} from "@/lib/ownerProfilesLens";

describe("RFSN-023 / RFSN-027B ownerProfilesLens", () => {
  it("separates self vs scout copy", () => {
    const self = ownerProfilesLensCopy("self");
    const scout = ownerProfilesLensCopy("scout");
    expect(self.sectionGm).toBe("GM Identity");
    expect(self.sectionRivalries).toBe("Your Rivalries");
    expect(self.sectionHighlights).toBe("Your Legacy");
    expect(self.sectionBuilding).toBe("Your Draft Pattern");
    expect(scout.sectionGm).toBe("Opponent Scout Report");
    expect(scout.sectionMatchups).toBe("Matchup Intelligence");
    expect(scout.sectionHighlights).toBe("Their Legacy");
    expect(scout.toughestLabel).toBe("Biggest threat");
    expect(self.toughestLabel).not.toBe("Biggest threat");
  });

  it("self draft labels do not share a single Draft DNA home", () => {
    const self = ownerProfilesLensCopy("self");
    expect(self.navBuilding).toBe("Your Draft Pattern");
    expect(self.draftDnaEyebrow).toBe("Your Draft Tendencies");
    expect(self.draftDnaEyebrow).not.toBe(self.navBuilding);
    expect(self.tendenciesByRoundTitle).toContain("pattern");
    expect(self.opponentColumn).toBe("Rival");
  });

  it("scout keeps scouting / exploit framing", () => {
    const scout = ownerProfilesLensCopy("scout");
    expect(scout.sectionGm).toContain("Scout");
    expect(scout.tendenciesByRoundTitle).toContain("tendencies");
    expect(scout.opponentColumn).toBe("Opponent");
    expect(scout.rivalriesEmpty).toMatch(/scout rivalries/i);
  });

  it("remaps exploit tags only in self mode", () => {
    expect(matchupTagLabel("Nemesis", "self")).toBe("Primary Rival");
    expect(matchupTagLabel("Nemesis", "scout")).toBe("Nemesis");
    expect(matchupTagLabel("Punching Bag", "self")).toBe("Comfort Matchup");
    expect(matchupTagLabel("Punching Bag", "scout")).toBe("Punching Bag");
    expect(matchupTagLabel("Rival", "self")).toBe("Rival");
  });

  it("builds evidence-backed tendencies and stays silent without evidence", () => {
    expect(buildSelfIdentityTendencies({})).toEqual([]);
    const withEvidence = buildSelfIdentityTendencies({
      draftStyle: "Aggressive Builder",
      mostDraftedPos: ["RB", "WR", "QB"],
      earliestAvgPos: { pos: "RB", r: 2.1 },
      earlyLead: ["RB", 12],
    });
    expect(withEvidence.some((t) => t.text.includes("RB"))).toBe(true);
    expect(withEvidence.every((t) => t.text.length > 0)).toBe(true);
  });

  it("mode helpers", () => {
    expect(isSelfMode("self")).toBe(true);
    expect(isScoutMode("scout")).toBe(true);
    expect(isSelfMode("scout")).toBe(false);
  });
});
