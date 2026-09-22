import { describe, it, expect } from "vitest";
import {
  buildSeasonClock,
  resolveWeekStatus,
  seasonFromProviderPayload,
} from "./weeklySeasonClock";

const CERT_LEAGUE = "457622";

function week1Payload(seasonId: number, currentMatchupPeriod = 2, latestScoringPeriod = 1) {
  return {
    id: Number(CERT_LEAGUE),
    seasonId,
    status: {
      currentMatchupPeriod,
      latestScoringPeriod,
      isActive: true,
    },
    settings: {
      seasonId,
      scheduleSettings: { matchupPeriodCount: 17 },
    },
  };
}

function completedWeek1Matchups() {
  return Array.from({ length: 7 }, (_, i) => ({
    matchupPeriodId: 1,
    week: 1,
    homeTeamId: i * 2 + 1,
    awayTeamId: i * 2 + 2,
    homeScore: 110 + i,
    awayScore: 95 + i,
    winnerTeamId: i * 2 + 1,
    isCompleted: true,
  }));
}

describe("weeklySeasonClock", () => {
  it("resolves season 2026 for certification league 457622 from provider state, not a hardcoded constant", () => {
    const clock = buildSeasonClock({
      leagueId: CERT_LEAGUE,
      payload: week1Payload(2026),
      matchups: completedWeek1Matchups(),
      requestedWeek: 1,
    });
    expect(clock.leagueId).toBe(CERT_LEAGUE);
    expect(clock.season).toBe(2026);
    expect(clock.requestedWeek).toBe(1);
    expect(clock.currentMatchupPeriod).toBe(2);
    expect(clock.weekStatus).toBe("FINAL");
  });

  it("resolves a later season from provider state so 2026 is not a permanent answer", () => {
    const clock = buildSeasonClock({
      leagueId: CERT_LEAGUE,
      payload: week1Payload(2027, 1, 1),
      matchups: completedWeek1Matchups().map((m) => ({ ...m, isCompleted: false, winnerTeamId: null, homeScore: 12, awayScore: 8 })),
      requestedWeek: 1,
    });
    expect(clock.season).toBe(2027);
    expect(clock.weekStatus).toBe("SCORING");
  });

  it("marks a future week UPCOMING from ESPN period fields, not wall-clock time", () => {
    const status = resolveWeekStatus({
      requestedWeek: 3,
      currentMatchupPeriod: 2,
      latestScoringPeriod: 1,
      matchups: completedWeek1Matchups(),
    });
    expect(status).toBe("UPCOMING");
  });

  it("throws when provider payload has no seasonId", () => {
    expect(() =>
      buildSeasonClock({
        leagueId: CERT_LEAGUE,
        payload: { status: { currentMatchupPeriod: 1 } },
      }),
    ).toThrow(/Cannot resolve season/);
  });

  it("treats stale 0-0 pairings as noise when a completed Week 1 slate exists", () => {
    const stale = completedWeek1Matchups().map((m, i) => ({
      ...m,
      homeTeamId: 100 + i,
      awayTeamId: 200 + i,
      homeScore: 0,
      awayScore: 0,
      winnerTeamId: null,
      isCompleted: false,
    }));
    const clock = buildSeasonClock({
      leagueId: CERT_LEAGUE,
      payload: week1Payload(2026),
      matchups: [...stale, ...completedWeek1Matchups()],
      requestedWeek: 1,
    });
    expect(clock.weekStatus).toBe("FINAL");
  });

  it("reads seasonId from payload, never from the calendar year", () => {
    expect(seasonFromProviderPayload({ seasonId: 2019 })).toBe(2019);
    expect(seasonFromProviderPayload({ settings: { seasonId: 2024 } })).toBe(2024);
    expect(seasonFromProviderPayload({})).toBeNull();
  });
});
