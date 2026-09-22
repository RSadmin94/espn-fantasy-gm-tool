import { describe, expect, it } from "vitest";
import {
  buildSeasonClock,
  resolveWeekStatus,
  type ClockMatchup,
  type SeasonClock,
} from "./weeklySeasonClock";
import {
  CRON_CATCHUP_CAP,
  correctionWeeksFromPacks,
  cronWeeksToProcess,
  detectFinalWeekCorrection,
  finalizedProviderWeeks,
  providerWeekStatuses,
  weekResultFingerprint,
  weeklyWorkForStatus,
} from "./weeklySeasonSchedule";

function completedWeek(week: number, n = 7): ClockMatchup[] {
  return Array.from({ length: n }, (_, i) => ({
    matchupPeriodId: week,
    week,
    homeTeamId: i * 2 + 1,
    awayTeamId: i * 2 + 2,
    homeScore: 110 + i + week,
    awayScore: 95 + i,
    winnerTeamId: i * 2 + 1,
    isCompleted: true,
  }));
}

function scoringWeek(week: number): ClockMatchup[] {
  return [
    {
      matchupPeriodId: week,
      week,
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 42.2,
      awayScore: 31.1,
      winnerTeamId: null,
      isCompleted: false,
    },
    {
      matchupPeriodId: week,
      week,
      homeTeamId: 3,
      awayTeamId: 4,
      homeScore: 0,
      awayScore: 0,
      winnerTeamId: null,
      isCompleted: false,
    },
  ];
}

function clock(opts: {
  requestedWeek: number;
  currentMatchupPeriod: number;
  latestScoringPeriod: number | null;
  matchups: ClockMatchup[];
}): SeasonClock {
  return buildSeasonClock({
    leagueId: "457622",
    payload: {
      seasonId: 2026,
      status: {
        currentMatchupPeriod: opts.currentMatchupPeriod,
        latestScoringPeriod: opts.latestScoringPeriod,
      },
      settings: { scheduleSettings: { matchupPeriodCount: 17 } },
    },
    matchups: opts.matchups,
    requestedWeek: opts.requestedWeek,
  });
}

describe("weekly work plan by week status", () => {
  it("FINAL may validate, snapshot, calculate, publish, and serve narratives", () => {
    const work = weeklyWorkForStatus("FINAL", "scheduled");
    expect(work.weeklyStats).toBe(true);
    expect(work.rosterSnapshot).toBe(true);
    expect(work.standingsSnapshot).toBe(true);
    expect(work.lineupFacts).toBe(true);
    expect(work.editionNarratives).toBe(true);
    expect(work.persistPack).toBe(true);
  });

  it("SCORING may refresh live state but must not publish a final Week Pack", () => {
    const work = weeklyWorkForStatus("SCORING", "scheduled");
    expect(work.refreshProvider).toBe(true);
    expect(work.weeklyStats).toBe(true);
    expect(work.standingsSnapshot).toBe(false);
    expect(work.editionNarratives).toBe(false);
    expect(work.persistPack).toBe(true);
    expect(work.persistPack && work.editionNarratives).toBe(false);
  });

  it("UPCOMING must not generate weekly stats, snapshots, storylines, or narratives", () => {
    const work = weeklyWorkForStatus("UPCOMING", "scheduled");
    expect(work.weeklyStats).toBe(false);
    expect(work.rosterSnapshot).toBe(false);
    expect(work.standingsSnapshot).toBe(false);
    expect(work.liveStorylines).toBe(false);
    expect(work.lineupFacts).toBe(false);
    expect(work.editionNarratives).toBe(false);
    expect(work.persistPack).toBe(false);
  });

  it("replay never generates edition narratives", () => {
    expect(weeklyWorkForStatus("FINAL", "replay").editionNarratives).toBe(false);
  });
});

describe("missed-week recovery", () => {
  it("processes unprocessed FINAL Week 2 before the current SCORING Week 3", () => {
    const matchups = [...completedWeek(1), ...completedWeek(2), ...scoringWeek(3)];
    const c = clock({
      requestedWeek: 3,
      currentMatchupPeriod: 3,
      latestScoringPeriod: 3,
      matchups,
    });
    expect(c.weekStatus).toBe("SCORING");
    expect(resolveWeekStatus({
      requestedWeek: 2,
      currentMatchupPeriod: 3,
      latestScoringPeriod: 3,
      matchups,
    })).toBe("FINAL");

    const weeks = cronWeeksToProcess({
      clock: c,
      matchups,
      processedFinalWeeks: [1],
    });
    expect(weeks).toEqual([2, 3]);
    expect(weeks[0]).toBe(2);
  });

  it("does not derive processing solely from currentMatchupPeriod", () => {
    const matchups = [...completedWeek(1), ...completedWeek(2), ...scoringWeek(3)];
    const c = clock({
      requestedWeek: 3,
      currentMatchupPeriod: 3,
      latestScoringPeriod: 3,
      matchups,
    });
    const fromCurrentOnly = [c.currentMatchupPeriod];
    const weeks = cronWeeksToProcess({
      clock: c,
      matchups,
      processedFinalWeeks: [1],
    });
    expect(weeks).not.toEqual(fromCurrentOnly);
    expect(weeks).toContain(2);
  });
});

describe("multi-week catch-up", () => {
  it("processes Weeks 3→4→5 sequentially when latest processed is Week 2 and finals exist through Week 5", () => {
    const matchups = [
      ...completedWeek(1),
      ...completedWeek(2),
      ...completedWeek(3),
      ...completedWeek(4),
      ...completedWeek(5),
    ];
    const c = clock({
      requestedWeek: 5,
      currentMatchupPeriod: 5,
      latestScoringPeriod: 5,
      matchups,
    });
    expect(c.weekStatus).toBe("FINAL");
    const statuses = providerWeekStatuses({
      matchups,
      currentMatchupPeriod: 5,
      latestScoringPeriod: 5,
      maxWeek: 5,
    });
    expect(finalizedProviderWeeks(statuses)).toEqual([1, 2, 3, 4, 5]);

    const weeks = cronWeeksToProcess({
      clock: c,
      matchups,
      processedFinalWeeks: [1, 2],
    });
    expect(weeks).toEqual([3, 4, 5]);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
    expect(new Set(weeks).size).toBe(weeks.length);
  });

  it("keeps the live SCORING week after sequential unprocessed finals, without skipping inside the cap", () => {
    const matchups = [
      ...completedWeek(1),
      ...completedWeek(2),
      ...completedWeek(3),
      ...completedWeek(4),
      ...completedWeek(5),
      ...scoringWeek(6),
    ];
    const c = clock({
      requestedWeek: 6,
      currentMatchupPeriod: 6,
      latestScoringPeriod: 6,
      matchups,
    });
    const weeks = cronWeeksToProcess({
      clock: c,
      matchups,
      processedFinalWeeks: [1, 2],
    });
    expect(weeks).toEqual([3, 4, 5, 6]);
  });

  it("caps a single run so later finals wait for the next scheduler pass", () => {
    const matchups = [
      ...completedWeek(1),
      ...completedWeek(2),
      ...completedWeek(3),
      ...completedWeek(4),
      ...completedWeek(5),
      ...completedWeek(6),
      ...completedWeek(7),
      ...scoringWeek(8),
    ];
    const c = clock({
      requestedWeek: 8,
      currentMatchupPeriod: 8,
      latestScoringPeriod: 8,
      matchups,
    });
    const weeks = cronWeeksToProcess({
      clock: c,
      matchups,
      processedFinalWeeks: [1, 2],
      cap: CRON_CATCHUP_CAP,
    });
    expect(weeks.length).toBeLessThanOrEqual(CRON_CATCHUP_CAP);
    expect(weeks.slice(0, 3)).toEqual([3, 4, 5]);
    expect(weeks).toContain(8);
    expect(weeks).not.toContain(6);
  });

  it("is idempotent when every FINAL week is already persisted", () => {
    const matchups = [...completedWeek(1), ...scoringWeek(2)];
    const c = clock({
      requestedWeek: 2,
      currentMatchupPeriod: 2,
      latestScoringPeriod: 2,
      matchups,
    });
    const first = cronWeeksToProcess({ clock: c, matchups, processedFinalWeeks: [1] });
    const second = cronWeeksToProcess({ clock: c, matchups, processedFinalWeeks: [1] });
    expect(first).toEqual([2]);
    expect(second).toEqual([2]);

    const finalsDone = clock({
      requestedWeek: 1,
      currentMatchupPeriod: 1,
      latestScoringPeriod: 1,
      matchups: completedWeek(1),
    });
    expect(
      cronWeeksToProcess({
        clock: finalsDone,
        matchups: completedWeek(1),
        processedFinalWeeks: [1],
      }),
    ).toEqual([]);
  });
});

describe("finalized-week scoring correction", () => {
  const original: ClockMatchup[] = [
    {
      matchupPeriodId: 2,
      week: 2,
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 120.1,
      awayScore: 119.9,
      winnerTeamId: 1,
      isCompleted: true,
    },
  ];
  const corrected: ClockMatchup[] = [
    {
      ...original[0],
      homeScore: 119.8,
      winnerTeamId: 2,
    },
  ];

  it("detects a winner-flip fingerprint change", () => {
    const before = weekResultFingerprint(original, 2);
    const after = weekResultFingerprint(corrected, 2);
    expect(before).not.toBe(after);
    expect(
      detectFinalWeekCorrection({
        previousStatus: "FINAL",
        previousFingerprint: before,
        nextStatus: "FINAL",
        nextFingerprint: after,
      }),
    ).toBe(true);
  });

  it("does not treat an unchanged FINAL week as a correction", () => {
    const fp = weekResultFingerprint(original, 2);
    expect(
      detectFinalWeekCorrection({
        previousStatus: "FINAL",
        previousFingerprint: fp,
        nextStatus: "FINAL",
        nextFingerprint: fp,
      }),
    ).toBe(false);
  });

  it("queues the corrected FINAL week even when it was already processed", () => {
    const week1 = completedWeek(1);
    const scoring = scoringWeek(3);
    const matchups = [...week1, ...corrected, ...scoring];
    const c = clock({
      requestedWeek: 3,
      currentMatchupPeriod: 3,
      latestScoringPeriod: 3,
      matchups,
    });
    const packs = [
      { week: 1, resultFingerprint: weekResultFingerprint(week1, 1) },
      { week: 2, resultFingerprint: weekResultFingerprint(original, 2) },
    ];
    const corrections = correctionWeeksFromPacks({ matchups, packs });
    expect(corrections).toEqual([2]);
    expect(
      cronWeeksToProcess({
        clock: c,
        matchups,
        processedFinalWeeks: [1, 2],
        correctionWeeks: corrections,
      }),
    ).toEqual([2, 3]);
  });

  it("invalidates standings, lineups, WIN/LOSS stories, and edition narratives on FINAL reprocess", () => {
    const work = weeklyWorkForStatus("FINAL", "scheduled");
    expect(work.standingsSnapshot).toBe(true);
    expect(work.lineupFacts).toBe(true);
    expect(work.storyEngine).toBe(true);
    expect(work.liveStorylines).toBe(true);
    expect(work.editionNarratives).toBe(true);
    expect(work.rosterSnapshot).toBe(true);
  });
});
