import { describe, it, expect } from "vitest";
import { buildStandingsThroughWeek } from "./weeklyStandingsThroughWeek";

describe("buildStandingsThroughWeek", () => {
  it("ranks 14 teams from completed Week 1 matchups without live standings", () => {
    const teams = Array.from({ length: 14 }, (_, i) => ({ teamId: i + 1 }));
    const matchups = Array.from({ length: 7 }, (_, i) => ({
      matchupPeriodId: 1,
      homeTeamId: i * 2 + 1,
      awayTeamId: i * 2 + 2,
      homeScore: 120 - i,
      awayScore: 80 + i,
      winnerTeamId: i * 2 + 1,
      isCompleted: true,
    }));
    const rows = buildStandingsThroughWeek(teams, matchups, 1);
    expect(rows).toHaveLength(14);
    expect(rows[0].teamId).toBe(1);
    expect(rows[0].wins).toBe(1);
    expect(rows[0].pointsFor).toBe(120);
    expect(rows.find((r) => r.teamId === 2)?.losses).toBe(1);
    expect(rows.every((r) => r.rank >= 1 && r.rank <= 14)).toBe(true);
  });

  it("ignores later weeks when snapshotting week 1", () => {
    const teams = [{ teamId: 1 }, { teamId: 2 }];
    const matchups = [
      { matchupPeriodId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 100, awayScore: 90, winnerTeamId: 1, isCompleted: true },
      { matchupPeriodId: 2, homeTeamId: 2, awayTeamId: 1, homeScore: 140, awayScore: 70, winnerTeamId: 2, isCompleted: true },
    ];
    const week1 = buildStandingsThroughWeek(teams, matchups, 1);
    expect(week1.find((r) => r.teamId === 1)?.wins).toBe(1);
    expect(week1.find((r) => r.teamId === 2)?.wins).toBe(0);
  });
});
