import { describe, expect, it } from "vitest";
import {
  buildSelfIdentityTendencies,
  isScoutMode,
  isSelfMode,
  matchupTagLabel,
  ownerProfilesLensCopy,
} from "@/lib/ownerProfilesLens";

describe("RFSN-023 ownerProfilesLens", () => {
  it("separates self vs scout copy", () => {
    const self = ownerProfilesLensCopy("self");
    const scout = ownerProfilesLensCopy("scout");
    expect(self.sectionGm).toBe("GM Identity");
    expect(self.sectionRivalries).toBe("Your Rivalries");
    expect(self.sectionHighlights).toBe("Your Legacy");
    expect(scout.sectionGm).toBe("GM Profile");
    expect(scout.sectionMatchups).toBe("Matchup Intelligence");
    expect(scout.toughestLabel).toBe("Biggest threat");
    expect(self.toughestLabel).not.toBe("Biggest threat");
  });

  it("remaps Nemesis only in self mode", () => {
    expect(matchupTagLabel("Nemesis", "self")).toBe("Primary Rival");
    expect(matchupTagLabel("Nemesis", "scout")).toBe("Nemesis");
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
