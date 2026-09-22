import { describe, it, expect } from "vitest";
import {
  detectDynasty,
  detectRise,
  detectCollapse,
  detectRedemption,
  detectRivalry,
  detectChampionshipChase,
  detectHistoricSeason,
  detectReach,
  detectSteal,
  detectStories,
} from "./storyDetectors";
import type {
  OwnerFacts,
  OwnerSeasonRecord,
  StoryLeagueFacts,
} from "./storyTypes";

function season(
  s: number,
  wins: number,
  losses: number,
  extra: Partial<OwnerSeasonRecord> = {},
): OwnerSeasonRecord {
  return {
    season: s,
    wins,
    losses,
    ties: 0,
    pointsFor: 1000,
    finalStanding: null,
    playoffSeed: null,
    madePlayoffs: false,
    ...extra,
  };
}

function owner(
  ownerKey: string,
  displayName: string,
  seasons: OwnerSeasonRecord[],
  titleSeasons: number[] = [],
): OwnerFacts {
  return { ownerKey, displayName, seasons, titleSeasons, totalTitles: titleSeasons.length };
}

function facts(partial: Partial<StoryLeagueFacts>): StoryLeagueFacts {
  return {
    leagueId: "457622",
    currentSeason: 2026,
    latestCompletedSeason: 2025,
    owners: [],
    rivalries: [],
    tradeSagas: [],
    draftPicks: [],
    leagueRecordWins: null,
    ...partial,
  };
}

describe("storyDetectors — creation triggers", () => {
  it("dynasty: >=2 titles in a 4-season window fires; a single title does not", () => {
    const dyn = owner("m1", "RodZilla", [season(2025, 10, 3)], [2019, 2023, 2025]);
    const one = owner("m2", "Bruce", [season(2025, 8, 5)], [2021]);
    const res = detectDynasty(facts({ owners: [dyn, one] }));
    expect(res).toHaveLength(1);
    expect(res[0].owners).toEqual(["m1"]);
    expect(res[0].storyType).toBe("dynasty");
    expect(res[0].priority).toBeGreaterThan(75);
  });

  it("rise: untitled owner starting far above last year", () => {
    const o = owner("m3", "Randy", [season(2025, 4, 9), season(2026, 6, 1)]);
    const res = detectRise(facts({ owners: [o] }));
    expect(res).toHaveLength(1);
    expect(res[0].storyType).toBe("rise");
    expect(res[0].headline).toContain("6-1");
  });

  it("collapse: strong prior season, sharp current-season fall", () => {
    const o = owner("m4", "Demetri", [season(2025, 10, 3), season(2026, 3, 8)]);
    const res = detectCollapse(facts({ owners: [o] }));
    expect(res).toHaveLength(1);
    expect(res[0].storyType).toBe("collapse");
  });

  it("redemption: playoffs two years ago, missed last year, strong now", () => {
    const o = owner("m5", "Mark", [
      season(2024, 9, 4, { playoffSeed: 3, madePlayoffs: true }),
      season(2025, 4, 9),
      season(2026, 7, 2),
    ]);
    const res = detectRedemption(facts({ owners: [o] }));
    expect(res).toHaveLength(1);
    expect(res[0].storyType).toBe("redemption");
  });
});

describe("storyDetectors — rivalry, chase, historic, draft", () => {
  it("rivalry: close + recent fires; stale (old last meeting) does not", () => {
    const live = detectRivalry(
      facts({
        rivalries: [{
          ownerA: "a", ownerB: "b", displayA: "A", displayB: "B",
          games: 8, winsA: 4, winsB: 4, ties: 0, playoffGames: 1,
          lastMeetingSeason: 2025, streakType: "W", streakCount: 1,
        }],
      }),
    );
    expect(live).toHaveLength(1);
    expect(live[0].owners).toEqual(["a", "b"]);

    const stale = detectRivalry(
      facts({
        rivalries: [{
          ownerA: "a", ownerB: "b", displayA: "A", displayB: "B",
          games: 8, winsA: 4, winsB: 4, ties: 0, playoffGames: 0,
          lastMeetingSeason: 2020, streakType: "none", streakCount: 0,
        }],
      }),
    );
    expect(stale).toHaveLength(0);
  });

  it("championship_chase: top-2 current-season records surface", () => {
    const o1 = owner("c1", "Lead", [season(2026, 8, 1)]);
    const o2 = owner("c2", "Second", [season(2026, 7, 2)]);
    const o3 = owner("c3", "Also", [season(2026, 3, 6)]);
    const res = detectChampionshipChase(facts({ owners: [o1, o2, o3] }));
    const keys = res.map((r) => r.owners[0]).sort();
    expect(keys).toEqual(["c1", "c2"]);
  });

  it("historic_season: ties the league wins record; resolves when completed", () => {
    const o = owner("h1", "Record", [season(2025, 12, 1)]);
    const inProgress = detectHistoricSeason(
      facts({ owners: [o], leagueRecordWins: 11, currentSeason: 2025, latestCompletedSeason: 2024 }),
    );
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0].resolution ?? null).toBeNull();

    const done = detectHistoricSeason(
      facts({ owners: [o], leagueRecordWins: 11, currentSeason: 2025, latestCompletedSeason: 2025 }),
    );
    expect(done[0].resolution).toBeTruthy();
  });
});

describe("storyDetectors — reach/steal + aggregator", () => {
  it("reach fires on a big early pick; steal fires on a big fall", () => {
    const reach = detectReach(
      facts({ draftPicks: [{ season: 2025, ownerKey: "d1", displayName: "D1", playerName: "Player A", overallPick: 10, expectedPick: 30 }] }),
    );
    expect(reach).toHaveLength(1);
    expect(reach[0].storyType).toBe("reach");

    const steal = detectSteal(
      facts({ draftPicks: [{ season: 2025, ownerKey: "d2", displayName: "D2", playerName: "Player B", overallPick: 45, expectedPick: 20 }] }),
    );
    expect(steal).toHaveLength(1);
    expect(steal[0].storyType).toBe("steal");
  });

  it("draft picks near their expected slot produce nothing", () => {
    const f = facts({ draftPicks: [{ season: 2025, ownerKey: "d3", displayName: "D3", playerName: "P", overallPick: 22, expectedPick: 20 }] });
    expect(detectReach(f)).toHaveLength(0);
    expect(detectSteal(f)).toHaveLength(0);
  });

  it("detectStories aggregates across every detector", () => {
    const dyn = owner("m1", "RodZilla", [season(2026, 9, 2)], [2019, 2023, 2025]);
    const rise = owner("m3", "Randy", [season(2025, 4, 9), season(2026, 6, 1)]);
    const all = detectStories(facts({ owners: [dyn, rise] }));
    const types = new Set(all.map((s) => s.storyType));
    expect(types.has("dynasty")).toBe(true);
    expect(types.has("rise")).toBe(true);
  });
});
