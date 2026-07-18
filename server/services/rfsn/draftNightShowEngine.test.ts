/**
 * Draft Night Show engine — builds awards from picks + seeded LeagueContext.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildDraftNightShowFromPicks,
  awardFactsForWrapUp,
  type DraftNightLockedPick,
} from "./draftNightShowEngine";
import {
  resetLeagueContextCacheForTests,
  seedLeagueContextCache,
  type LeagueContextSnapshot,
} from "./leagueContextCache";

const LEAGUE = "dns-league";
const DRAFT = "dns-draft";

function snapshot(partial: Partial<LeagueContextSnapshot> = {}): LeagueContextSnapshot {
  return {
    leagueId: LEAGUE,
    draftId: DRAFT,
    loadedAt: Date.now(),
    championships: [
      {
        ownerKey: "rod",
        displayName: "Rod",
        titles: 2,
        titleSeasons: [2019, 2022],
      },
    ],
    choices: [],
    rivalries: [
      {
        focalOwnerName: "Rod",
        rivalOwnerName: "Bruce",
        h2hRecord: "8-4",
        rivalWins: 8,
        rivalLosses: 4,
        playoffEliminations: 3,
      },
    ],
    ...partial,
  };
}

function samplePicks(): DraftNightLockedPick[] {
  return [
    { overall: 1, round: 1, roundPick: 1, teamId: "1", ownerName: "Rod", playerId: "cmc", playerName: "CMC", position: "RB", nflTeam: "SF", adp: 1.5 },
    { overall: 2, round: 1, roundPick: 2, teamId: "2", ownerName: "Bruce", playerId: "te", playerName: "Early TE", position: "TE", nflTeam: "KC", adp: 40 },
    { overall: 3, round: 1, roundPick: 3, teamId: "3", ownerName: "Mike", playerId: "jj", playerName: "JJ", position: "WR", nflTeam: "MIN", adp: 4 },
    { overall: 15, round: 2, roundPick: 1, teamId: "3", ownerName: "Mike", playerId: "steal", playerName: "Steal", position: "WR", nflTeam: "DET", adp: 5 },
    { overall: 16, round: 2, roundPick: 2, teamId: "2", ownerName: "Bruce", playerId: "rb", playerName: "RB", position: "RB", nflTeam: "ATL", adp: 20 },
    { overall: 17, round: 2, roundPick: 3, teamId: "1", ownerName: "Rod", playerId: "wr2", playerName: "WR2", position: "WR", nflTeam: "MIA", adp: 18 },
    { overall: 29, round: 3, roundPick: 1, teamId: "1", ownerName: "Rod", playerId: "rb2", playerName: "RB2", position: "RB", nflTeam: "CHI", adp: 30 },
    { overall: 30, round: 3, roundPick: 2, teamId: "2", ownerName: "Bruce", playerId: "wrb", playerName: "WRB", position: "WR", nflTeam: "GB", adp: 35 },
    { overall: 31, round: 3, roundPick: 3, teamId: "3", ownerName: "Mike", playerId: "te2", playerName: "TE", position: "TE", nflTeam: "BAL", adp: 50 },
  ];
}

describe("draftNightShowEngine", () => {
  beforeEach(() => {
    resetLeagueContextCacheForTests();
  });

  it("builds awards enriched with championship / rivalry context", () => {
    seedLeagueContextCache(snapshot());
    const show = buildDraftNightShowFromPicks({
      leagueId: LEAGUE,
      draftId: DRAFT,
      picks: samplePicks(),
      teamCount: 3,
      snapshot: snapshot(),
    });
    expect(show.totalPicks).toBe(9);
    expect(show.awards.length).toBeGreaterThan(0);
    const pressure = show.awards.find((a) => a.awardType === "under_intense_pressure");
    expect(pressure?.ownerName).toBe("Rod");
    expect(pressure?.fact).toMatch(/championship/i);
    const facts = awardFactsForWrapUp(show);
    expect(facts.some((f) => f.includes("Winner") || f.includes("["))).toBe(true);
  });

  it("suppresses biggest mistake when no catastrophic reach exists", () => {
    const even: DraftNightLockedPick[] = [
      { overall: 1, round: 1, roundPick: 1, teamId: "1", ownerName: "A", playerId: "p1", playerName: "P1", position: "RB", nflTeam: null, adp: 1 },
      { overall: 2, round: 1, roundPick: 2, teamId: "2", ownerName: "B", playerId: "p2", playerName: "P2", position: "WR", nflTeam: null, adp: 2 },
      { overall: 3, round: 1, roundPick: 3, teamId: "1", ownerName: "A", playerId: "p3", playerName: "P3", position: "WR", nflTeam: null, adp: 3 },
      { overall: 4, round: 1, roundPick: 4, teamId: "2", ownerName: "B", playerId: "p4", playerName: "P4", position: "RB", nflTeam: null, adp: 4 },
      { overall: 5, round: 1, roundPick: 5, teamId: "1", ownerName: "A", playerId: "p5", playerName: "P5", position: "TE", nflTeam: null, adp: 5 },
      { overall: 6, round: 1, roundPick: 6, teamId: "2", ownerName: "B", playerId: "p6", playerName: "P6", position: "TE", nflTeam: null, adp: 6 },
    ];
    const show = buildDraftNightShowFromPicks({
      leagueId: LEAGUE,
      draftId: DRAFT,
      picks: even,
      teamCount: 2,
      snapshot: snapshot({ championships: [], rivalries: [] }),
    });
    expect(
      show.suppressed.find((s) => s.awardType === "biggest_mistake")?.reason,
    ).toBe("No catastrophic draft mistake detected.");
  });
});
