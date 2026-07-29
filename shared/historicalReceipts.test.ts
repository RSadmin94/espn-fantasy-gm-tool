import { describe, expect, it } from "vitest";
import {
  assertHistoricalSeasonNotCurrentFallback,
  buildHistoricalReceiptsForPair,
  formatSeasonWeekLabel,
} from "./historicalReceipts";

describe("historicalReceipts", () => {
  it("formats season/week without inventing calendar dates", () => {
    expect(formatSeasonWeekLabel(2018, 15)).toBe("Season 2018 · Week 15");
    expect(formatSeasonWeekLabel(2018, null)).toBe("Season 2018");
    expect(formatSeasonWeekLabel(null, 5)).toBe("Season unknown");
  });

  it("uses playoff elimination season/week — not lastMatchupSeason", () => {
    const views = buildHistoricalReceiptsForPair({
      focalName: "Rod",
      pair: {
        rivalId: "id:abc",
        rivalName: "Mike",
        h2hWins: 8,
        h2hLosses: 12,
        h2hTies: 0,
        playoffEliminations: 2,
        lastMatchupSeason: 2025,
        lastPlayoffEliminationSeason: 2019,
        lastPlayoffEliminationWeek: 16,
        lastPlayoffEliminationFocalScore: 98.2,
        lastPlayoffEliminationRivalScore: 112.4,
      },
    });
    const elim = views.find((v) => v.kind === "playoff_elimination");
    expect(elim?.season).toBe(2019);
    expect(elim?.week).toBe(16);
    expect(elim?.whenLabel).toBe("Season 2019 · Week 16");
    expect(elim?.whenLabel).not.toContain("2025");
    expect(elim?.centralResult).toMatch(/98\.2.*112\.4/);
  });

  it("uses painful loss season/week from the meeting", () => {
    const views = buildHistoricalReceiptsForPair({
      focalName: "Rod",
      pair: {
        rivalId: "id:x",
        rivalName: "Chris",
        painfulLossSeason: 2014,
        painfulLossWeek: 7,
        painfulLossMargin: 2.1,
        painfulLossFocalScore: 110.5,
        painfulLossOpponentScore: 112.6,
      },
    });
    const loss = views.find((v) => v.kind === "painful_loss");
    expect(loss?.season).toBe(2014);
    expect(loss?.week).toBe(7);
    expect(loss?.whyMatters.length).toBeGreaterThan(10);
  });

  it("uses revenge season — not last meeting when revenge was earlier", () => {
    const views = buildHistoricalReceiptsForPair({
      focalName: "Rod",
      pair: {
        rivalId: "id:y",
        rivalName: "Pat",
        playoffEliminations: 1,
        revengeAchieved: true,
        revengeSeason: 2020,
        revengeWeek: 3,
        revengeFocalScore: 120,
        revengeRivalScore: 95,
        lastMatchupSeason: 2025,
      },
    });
    const rev = views.find((v) => v.kind === "revenge");
    expect(rev?.season).toBe(2020);
    expect(rev?.whenLabel).toContain("2020");
    expect(rev?.whenLabel).not.toContain("2025");
  });

  it("does not default historical season to current year", () => {
    const views = buildHistoricalReceiptsForPair({
      focalName: "You",
      pair: {
        rivalId: "id:z",
        rivalName: "Sam",
        painfulLossSeason: 2012,
        painfulLossMargin: 0.5,
        painfulLossOpponentScore: 100,
      },
    });
    for (const v of views) {
      expect(v.season).not.toBe(new Date().getFullYear());
      expect(assertHistoricalSeasonNotCurrentFallback(v.season)).toBe(true);
    }
  });

  it("includes why this matters on every receipt kind", () => {
    const views = buildHistoricalReceiptsForPair({
      focalName: "Rod",
      pair: {
        rivalId: "id:all",
        rivalName: "Alex",
        playoffEliminations: 1,
        lastPlayoffEliminationSeason: 2017,
        painfulLossSeason: 2016,
        painfulLossMargin: 1,
        painfulLossOpponentScore: 99,
        revengeAchieved: true,
        revengeSeason: 2018,
      },
    });
    expect(views.length).toBeGreaterThanOrEqual(2);
    for (const v of views) {
      expect(v.whyMatters.length).toBeGreaterThan(15);
      expect(v.headline.length).toBeGreaterThan(5);
      expect(v.centralResult.length).toBeGreaterThan(3);
    }
  });
});
