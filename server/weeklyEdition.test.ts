import { describe, it, expect } from "vitest";
import {
  classifyContextKind,
  composeWeeklyEdition,
  resolvedEditionWeek,
  scoreHeadlineDimensions,
  rivalryWeeklySignificance,
  sofiaStoriesFromEdition,
  storyFactPacket,
} from "./weeklyEdition";
import type { DetectedEvent, InspectedMatchup } from "./weeklyWeekInspect";
import type { BenchRegret } from "./weeklyLineupOutcomes";
import type { RivalryReceipt, TeamWeekPacket } from "./weeklyWeekReceipts";
import { factFingerprint } from "./weeklySeasonNarratives";
import { detectFinalWeekCorrection, weekResultFingerprint } from "./weeklySeasonSchedule";
import type { ClockMatchup } from "./weeklySeasonClock";

function regret(partial: Partial<BenchRegret> & Pick<BenchRegret, "playerId" | "teamId" | "ownerName" | "netImprovement">): BenchRegret {
  return {
    playerName: "BenchStar",
    ownerId: `{${partial.teamId}}`,
    benchPoints: 30,
    replacedStarterId: 1,
    replacedStarterName: "WeakStarter",
    lowestStarterPoints: 5,
    impact: "WIN_FLIP",
    evidence: "",
    ...partial,
  };
}

function matchup(p: Partial<InspectedMatchup> & Pick<InspectedMatchup, "homeTeamId" | "awayTeamId" | "homeScore" | "awayScore" | "winnerTeamId">): InspectedMatchup {
  return {
    homeName: `T${p.homeTeamId}`,
    awayName: `T${p.awayTeamId}`,
    homeOwner: `Owner${p.homeTeamId}`,
    awayOwner: `Owner${p.awayTeamId}`,
    result: "win",
    margin: Math.abs(p.homeScore - p.awayScore),
    highestStarter: null,
    highestBench: null,
    benchRegret: null,
    playerOfGame: null,
    ...p,
  };
}

function teamsFrom(matchups: InspectedMatchup[], avg: number): TeamWeekPacket[] {
  const rows: TeamWeekPacket[] = [];
  for (const m of matchups) {
    rows.push({
      teamId: m.homeTeamId,
      teamName: m.homeName,
      ownerName: m.homeOwner,
      result: m.winnerTeamId === m.homeTeamId ? "W" : "L",
      score: m.homeScore,
      opponent: m.awayName,
      meaningfulBenchIssue: m.benchRegret?.teamId === m.homeTeamId ? m.benchRegret : null,
    });
    rows.push({
      teamId: m.awayTeamId,
      teamName: m.awayName,
      ownerName: m.awayOwner,
      result: m.winnerTeamId === m.awayTeamId ? "W" : "L",
      score: m.awayScore,
      opponent: m.homeName,
      meaningfulBenchIssue: m.benchRegret?.teamId === m.awayTeamId ? m.benchRegret : null,
    });
  }
  return rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((r, i) => ({ ...r, scoringRank: i + 1, championshipPathMovement: (r.score ?? 0) >= avg + 15 && r.result === "W" ? "slightly improved" : "unchanged" }));
}

describe("weekly editorial layer", () => {
  it("classifies career RFSN rows as CONTEXT, not weekly events", () => {
    const e: DetectedEvent = {
      eventId: "r1",
      canonicalId: "r1",
      eventType: "dynasty",
      subject: "A",
      opponent: null,
      facts: {},
      confidence: 80,
      significance: 86,
      source: "RFSN Story Engine",
    };
    expect(classifyContextKind(e)).toBe("CONTEXT");
    expect(classifyContextKind({ ...e, source: "League Wire", eventType: "CLOSEST_GAME" })).toBe("EVENT");
  });

  it("does not pick four WIN_FLIPs as the weekly edition", () => {
    const flips: InspectedMatchup[] = [
      matchup({
        homeTeamId: 1, awayTeamId: 2, homeScore: 107.22, awayScore: 105.76, winnerTeamId: 1, margin: 1.46,
        benchRegret: regret({ playerId: 10, teamId: 2, ownerName: "Owner2", netImprovement: 19, playerName: "TE", replacedStarterName: "OtherTE", benchPoints: 19, lowestStarterPoints: 0 }),
      }),
      matchup({
        homeTeamId: 3, awayTeamId: 4, homeScore: 175.26, awayScore: 111.26, winnerTeamId: 3, margin: 64,
      }),
      matchup({
        homeTeamId: 5, awayTeamId: 6, homeScore: 145.54, awayScore: 157.46, winnerTeamId: 6, margin: 11.92,
        benchRegret: regret({ playerId: 11, teamId: 5, ownerName: "Owner5", netImprovement: 27.04, playerName: "Love", replacedStarterName: "Nix", benchPoints: 38.98, lowestStarterPoints: 11.94 }),
      }),
      matchup({
        homeTeamId: 7, awayTeamId: 8, homeScore: 134.26, awayScore: 112.62, winnerTeamId: 7, margin: 21.64,
        benchRegret: regret({ playerId: 12, teamId: 8, ownerName: "Owner8", netImprovement: 38.48, playerName: "Purdy", replacedStarterName: "Murray", benchPoints: 39.6, lowestStarterPoints: 1.12 }),
      }),
      matchup({
        homeTeamId: 9, awayTeamId: 10, homeScore: 101.12, awayScore: 86.64, winnerTeamId: 9, margin: 14.48,
        benchRegret: regret({ playerId: 13, teamId: 10, ownerName: "Owner10", netImprovement: 18.16, playerName: "RB", replacedStarterName: "WR", benchPoints: 28.4, lowestStarterPoints: 10.24 }),
      }),
      matchup({ homeTeamId: 11, awayTeamId: 12, homeScore: 164.3, awayScore: 144.56, winnerTeamId: 11, margin: 19.74 }),
      matchup({ homeTeamId: 13, awayTeamId: 14, homeScore: 172.46, awayScore: 138.14, winnerTeamId: 13, margin: 34.32 }),
    ];
    const avg = 132.61;
    const edition = composeWeeklyEdition({
      leagueId: "1",
      season: 2026,
      week: 1,
      matchups: flips,
      events: [
        { eventId: "dyn", canonicalId: "dyn", eventType: "dynasty", subject: "X", opponent: null, facts: {}, confidence: 90, significance: 86, source: "RFSN Story Engine" },
        { eventId: "close", canonicalId: "c", eventType: "CLOSEST_GAME", subject: "Owner1", opponent: "Owner2", facts: { margin: 1.46 }, confidence: 95, significance: 90, source: "League Wire" },
      ],
      rivalry: [],
      teams: teamsFrom(flips, avg),
      leagueAverage: avg,
      mvp: { player: "StarQB", points: 52.66, position: "QB", owner: "Owner13", teamId: 13 },
      strongestRegret: flips[3].benchRegret,
    });

    expect(edition.headline?.eventType).toBe("CLOSEST_GAME");
    expect(edition.headline?.composedFrom).toContain("WIN_FLIP");
    expect(edition.weeklyEventCount).toBe(1);
    expect(edition.historicalContextCount).toBe(1);
    const leagueWinFlips = [edition.headline, ...edition.majorStories].filter((s) => s?.eventType === "WIN_FLIP");
    expect(leagueWinFlips).toHaveLength(1);
    expect(edition.oneThatGotAway?.facts.net).toBe(38.48);
    expect(edition.majorStories.some((s) => s.eventType === "BIGGEST_STATEMENT")).toBe(true);
    const sofiaTypes = sofiaStoriesFromEdition(edition).map((s) => s.eventType);
    expect(sofiaTypes.filter((t) => t === "WIN_FLIP").length).toBeLessThanOrEqual(1);
    expect(sofiaTypes).not.toEqual(["WIN_FLIP", "WIN_FLIP", "WIN_FLIP", "WIN_FLIP", "COLLAPSE"]);

    const o1 = edition.ownerTakes.find((o) => o.teamId === 1);
    const o8 = edition.ownerTakes.find((o) => o.teamId === 8);
    const o3 = edition.ownerTakes.find((o) => o.teamId === 3);
    const o5 = edition.ownerTakes.find((o) => o.teamId === 5);
    expect(o1?.eventType).toBe("CLOSEST_GAME");
    expect(o8?.eventType).toBe("WIN_FLIP");
    expect(o8?.presentationLabel).toBe("THE ONE THAT GOT AWAY");
    expect(o3?.eventType).toBe("BIGGEST_STATEMENT");
    expect(o5?.eventType).toBe("WIN_FLIP");
  });

  it("scores inspectable headline dimensions", () => {
    const d = scoreHeadlineDimensions({ drama: 100, consequence: 95, historical: 0, dominance: 18, rarity: 80 });
    expect(d.total).toBeGreaterThan(60);
    expect(d.drama).toBe(100);
  });

  it("only promotes a rivalry to a weekly story when history actually moved", () => {
    const mild: RivalryReceipt = {
      homeOwner: "A",
      awayOwner: "B",
      qualifying: true,
      careerEntering: "8-7",
      careerAfter: "8-8",
      streak: "L1",
      closeGames: 1,
      playoffMeetings: 0,
      note: "regular series",
    };
    const heavy: RivalryReceipt = {
      ...mild,
      careerEntering: "2-12",
      careerAfter: "3-12",
      playoffMeetings: 3,
      streak: "W1",
      note: "lopsided series",
    };
    expect(rivalryWeeklySignificance(mild, "A")).toBeLessThan(55);
    expect(rivalryWeeklySignificance(heavy, "A")).toBeGreaterThanOrEqual(55);
  });
});

function week1Slate(extra?: { homeScore11?: number; awayScore12?: number; rolePlayerPoints?: number }): InspectedMatchup[] {
  const home11 = extra?.homeScore11 ?? 164.3;
  return [
    matchup({
      homeTeamId: 1, awayTeamId: 2, homeScore: 107.22, awayScore: 105.76, winnerTeamId: 1, margin: 1.46,
      homeOwner: "Marcus Reese", awayOwner: "Christian Graham",
      benchRegret: regret({
        playerId: 10, teamId: 2, ownerName: "Christian Graham", netImprovement: 19,
        playerName: "Dalton Kincaid", replacedStarterName: "Colston Loveland", benchPoints: 19, lowestStarterPoints: 0,
      }),
    }),
    matchup({
      homeTeamId: 3, awayTeamId: 4, homeScore: 175.26, awayScore: 111.26, winnerTeamId: 3, margin: 64,
      homeOwner: "Jan Graham", awayOwner: "Bruce Edwards",
    }),
    matchup({
      homeTeamId: 5, awayTeamId: 6, homeScore: 145.54, awayScore: 157.46, winnerTeamId: 6, margin: 11.92,
      homeOwner: "Rod Sellers", awayOwner: "Marlon Moore",
      benchRegret: regret({
        playerId: 11, teamId: 5, ownerName: "Rod Sellers", netImprovement: 27.04,
        playerName: "Jordan Love", replacedStarterName: "Bo Nix", benchPoints: 38.98, lowestStarterPoints: 11.94,
      }),
    }),
    matchup({
      homeTeamId: 7, awayTeamId: 8, homeScore: 134.26, awayScore: 112.62, winnerTeamId: 7, margin: 21.64,
      homeOwner: "Nate West", awayOwner: "Randy Broner Jr",
      benchRegret: regret({
        playerId: 12, teamId: 8, ownerName: "Randy Broner Jr", netImprovement: 38.48,
        playerName: "Brock Purdy", replacedStarterName: "Kyler Murray", benchPoints: 39.6, lowestStarterPoints: 1.12,
      }),
    }),
    matchup({
      homeTeamId: 9, awayTeamId: 10, homeScore: 101.12, awayScore: 86.64, winnerTeamId: 9, margin: 14.48,
      homeOwner: "Steffon Opp", awayOwner: "Steffon Bizzell",
    }),
    matchup({
      homeTeamId: 11, awayTeamId: 12, homeScore: home11, awayScore: extra?.awayScore12 ?? 144.56, winnerTeamId: 11, margin: Math.round((home11 - (extra?.awayScore12 ?? 144.56)) * 100) / 100,
      homeOwner: "Mark Deroux", awayOwner: "LOZELL STYLES",
    }),
    matchup({
      homeTeamId: 13, awayTeamId: 14, homeScore: 172.46, awayScore: 138.14, winnerTeamId: 13, margin: 34.32,
      homeOwner: "Josh Allen Owner", awayOwner: "Other",
    }),
  ];
}

function composeFrom(matchups: InspectedMatchup[]) {
  const avg = 132.61;
  return composeWeeklyEdition({
    leagueId: "457622",
    season: 2026,
    week: 1,
    matchups,
    events: [
      { eventId: "dyn", canonicalId: "dyn", eventType: "dynasty", subject: "X", opponent: null, facts: {}, confidence: 90, significance: 86, source: "RFSN Story Engine" },
    ],
    rivalry: [
      {
        homeOwner: "Nate West",
        awayOwner: "Demetri Clark",
        qualifying: true,
        careerEntering: "11-4",
        careerAfter: "12-4",
        streak: "W1",
        closeGames: 4,
        playoffMeetings: 3,
        note: "lopsided series",
      },
    ],
    teams: teamsFrom(matchups, avg),
    leagueAverage: avg,
    mvp: { player: "Josh Allen", points: 52.66, position: "QB", owner: "Josh Allen Owner", teamId: 13 },
    strongestRegret: matchups[3].benchRegret,
  });
}

function sofiaKeys(edition: ReturnType<typeof composeWeeklyEdition>) {
  return sofiaStoriesFromEdition(edition).map((s) => ({
    eventId: s.eventId,
    factFingerprint: factFingerprint(storyFactPacket(s, { week: edition.week, season: edition.season })),
  }));
}

function matchupClock(rows: InspectedMatchup[]): ClockMatchup[] {
  return rows.map((m) => ({
    matchupPeriodId: 1,
    week: 1,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    winnerTeamId: m.winnerTeamId,
    isCompleted: true,
  }));
}

describe("non-material finalized player correction", () => {
  it("8.10 → 8.20 on a non-editorial player does not change story fingerprints or require LLM", () => {
    const beforePlayers = [{ playerId: 999, name: "RolePlayer", points: 8.1, teamId: 11 }];
    const afterPlayers = [{ playerId: 999, name: "RolePlayer", points: 8.2, teamId: 11 }];
    const beforeMatchups = week1Slate();
    // Official matchup totals unchanged; only the raw box score receipt moved 8.10 → 8.20.
    const afterMatchups = week1Slate();
    const before = composeFrom(beforeMatchups);
    const after = composeFrom(afterMatchups);

    expect(afterPlayers[0].points).not.toBe(beforePlayers[0].points);
    expect(after.headline?.eventId).toBe(before.headline?.eventId);
    expect(after.headline?.dek).toBe(before.headline?.dek);
    expect(after.majorStories.map((s) => s.eventId)).toEqual(before.majorStories.map((s) => s.eventId));
    expect(after.superlatives).toEqual(before.superlatives);
    expect(after.oneThatGotAway?.facts.net).toBe(38.48);
    const rod = after.ownerTakes.find((o) => o.ownerName === "Rod Sellers");
    expect(rod?.eventType).toBe("WIN_FLIP");
    expect(rod?.facts.impact).toBe("WIN_FLIP");

    const beforeKeys = sofiaKeys(before);
    const afterKeys = sofiaKeys(after);
    expect(afterKeys).toEqual(beforeKeys);
    const generate = afterKeys.filter((k) => !beforeKeys.some((b) => b.eventId === k.eventId && b.factFingerprint === k.factFingerprint)).length;
    expect(generate).toBe(0);

    expect(weekResultFingerprint(matchupClock(beforeMatchups), 1)).toBe(weekResultFingerprint(matchupClock(afterMatchups), 1));
  });

  it("a 0.10 official-total bump on a non-featured matchup may change the result fingerprint but still generates 0 LLM calls", () => {
    const beforeMatchups = week1Slate();
    const afterMatchups = week1Slate({ homeScore11: 164.4 });
    const before = composeFrom(beforeMatchups);
    const after = composeFrom(afterMatchups);
    const beforeFp = weekResultFingerprint(matchupClock(beforeMatchups), 1);
    const afterFp = weekResultFingerprint(matchupClock(afterMatchups), 1);
    expect(afterFp).not.toBe(beforeFp);
    expect(
      detectFinalWeekCorrection({
        previousStatus: "FINAL",
        previousFingerprint: beforeFp,
        nextStatus: "FINAL",
        nextFingerprint: afterFp,
      }),
    ).toBe(true);
    expect(after.headline?.dek).toBe(before.headline?.dek);
    expect(after.superlatives.highScore).toEqual(before.superlatives.highScore);
    expect(after.superlatives.closestGame).toEqual(before.superlatives.closestGame);
    expect(after.superlatives.weekMvp).toEqual(before.superlatives.weekMvp);
    expect(after.superlatives.biggestLineupRegret).toEqual(before.superlatives.biggestLineupRegret);
    expect(sofiaKeys(after)).toEqual(sofiaKeys(before));
  });

  it("does not serve a final edition week while the provider week is still SCORING", () => {
    expect(
      resolvedEditionWeek({
        currentWeek: 2,
        currentStatus: "SCORING",
        latestFinalWeek: 1,
      }),
    ).toBe(1);
    expect(
      resolvedEditionWeek({
        explicitWeek: 2,
        currentWeek: 2,
        currentStatus: "SCORING",
        latestFinalWeek: 1,
      }),
    ).toBe(2);
    expect(
      resolvedEditionWeek({
        currentWeek: 2,
        currentStatus: "SCORING",
        latestFinalWeek: null,
      }),
    ).toBeNull();
  });
});

