import { describe, it, expect } from "vitest";
import { requireAttributedLeagueId } from "./weeklySeasonIdentity";
import { buildSeasonClock } from "./weeklySeasonClock";

describe("weeklySeasonEngine contract", () => {
  it("refuses implicit/default league ids after resolution", () => {
    expect(() => requireAttributedLeagueId("")).toThrow(/explicit attributed leagueId/);
    expect(() => requireAttributedLeagueId("unattributed")).toThrow(/explicit attributed leagueId/);
    expect(() => requireAttributedLeagueId("default")).toThrow(/explicit attributed leagueId/);
    expect(requireAttributedLeagueId("457622")).toBe("457622");
  });

  it("certification league 457622 Week 1 resolves season from ESPN payload (2026 today, not a hardcoded current season)", () => {
    const clock = buildSeasonClock({
      leagueId: "457622",
      payload: {
        id: 457622,
        seasonId: 2026,
        status: { currentMatchupPeriod: 2, latestScoringPeriod: 1, isActive: true },
        settings: { scheduleSettings: { matchupPeriodCount: 17 } },
      },
      matchups: Array.from({ length: 7 }, (_, i) => ({
        matchupPeriodId: 1,
        homeScore: 100,
        awayScore: 90,
        winnerTeamId: i * 2 + 1,
        isCompleted: true,
      })),
      requestedWeek: 1,
    });
    expect(clock.leagueId).toBe("457622");
    expect(clock.season).toBe(2026);
    expect(clock.requestedWeek).toBe(1);
    expect(clock.weekStatus).toBe("FINAL");
  });
});
