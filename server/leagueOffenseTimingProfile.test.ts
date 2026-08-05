import { describe, expect, it } from "vitest";
import {
  evaluateDpDraftability,
  isDpWindowOpen,
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
    expect(isDpWindowOpen(25, prof)).toBe(false);
    expect(evaluateDpDraftability(25, prof).selectable).toBe(false);
    expect(evaluateDpDraftability(45, prof).selectable).toBe(true);
  });

  it("explains deferral before the DP window opens", () => {
    const result = evaluateDpDraftability(20, sampleProfile());
    expect(result.selectable).toBe(false);
    expect(result.reason).toMatch(/window open/i);
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
        {
          season: 2022,
          firstPick: 45,
          firstRound: 4,
          firstPlayer: "Kelce",
          positionPickCount: 14,
          labeledCoveragePct: 95,
        },
      ],
    };
    const prof = offenseTimingToProfile(raw);
    expect(prof.position).toBe("TE");
    expect(prof.window).toBeTruthy();
    expect(prof.windowStartPick ?? prof.window?.windowOpen).not.toBeNull();
  });
});
