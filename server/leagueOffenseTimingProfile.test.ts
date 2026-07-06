import { describe, expect, it } from "vitest";
import {
  evaluateOffenseTimingDraftability,
  buildTimingDeferralExplanation,
  isPositionWindowOpen,
} from "./draftPickIntelligence";
import { offenseTimingToProfile, type OffenseTimingRawProfile } from "./leagueOffenseTimingProfile";
import type { PositionTimingProfile } from "./leagueDraftTimingProfile";

function sampleProfile(overrides?: Partial<PositionTimingProfile>): PositionTimingProfile {
  return {
    position: "QB",
    leagueId: "test",
    teamCount: 14,
    confidence: "High",
    confidenceReasons: ["test"],
    baselineFirstPick: 55,
    baselineFirstRound: 4,
    firstPickP25: 40,
    firstPickP75: 80,
    windowStartPick: 40,
    windowEndPick: 80,
    window: { windowOpen: 40, baseline: 55, softClose: 80, hardClose: 90 },
    seasonsAnalyzed: 6,
    totalPositionPicks: 84,
    seasonsWithEarlyFirst: 1,
    earliestFirstBySeason: [],
    interpretation: "test",
    ...overrides,
  };
}

describe("league offense timing", () => {
  it("blocks QB before window open", () => {
    const prof = sampleProfile();
    expect(isPositionWindowOpen(25, prof)).toBe(false);
    expect(evaluateOffenseTimingDraftability(25, 2, prof).selectable).toBe(false);
    expect(evaluateOffenseTimingDraftability(45, 4, prof).selectable).toBe(true);
  });

  it("builds deferral explanation with round context", () => {
    const text = buildTimingDeferralExplanation({
      position: "QB",
      pickNum: 20,
      round: 2,
      profile: sampleProfile(),
    });
    expect(text).toContain("QB window not yet open");
    expect(text).toContain("Round 2");
    expect(text).toContain("Delayed QB selection");
  });

  it("maps raw offense stats to profile with window fields", () => {
    const raw: OffenseTimingRawProfile = {
      position: "TE",
      leagueId: "457622",
      teamCount: 14,
      seasonsAnalyzed: 5,
      totalPositionPicks: 70,
      labeledCoveragePct: 95,
      firstPicks: [45, 50, 55, 60, 48],
      confidence: "Medium",
      confidenceReasons: ["5 seasons"],
      earliestFirstBySeason: [
        { season: 2022, firstPick: 45, firstRound: 4, firstPlayer: "Kelce", positionPickCount: 14, labeledCoveragePct: 95 },
      ],
    };
    const prof = offenseTimingToProfile(raw);
    expect(prof.position).toBe("TE");
    expect(prof.window?.baseline).toBe(50);
    expect(prof.window?.windowOpen).not.toBeNull();
  });
});
