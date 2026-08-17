/**
 * RFSN-055A — Historical draft evaluation composition (no new formula).
 */
import { describe, expect, it } from "vitest";
import { classifyReach } from "../shared/reachClassification";
import { isUsableAdp, type DraftPickEvidence } from "./draftIntelligence";
import {
  ADP_UNAVAILABLE_REASON,
  REALITY_FLOOR_REASON,
  REALITY_INSUFFICIENT_REASON,
  REALITY_UNMATCHED_REASON,
  composeHistoricalDraftEvaluation,
} from "./historicalDraftEvaluation";
import type { DraftRealityResult, OwnerImpact } from "./draftRealitySimulator";

function pick(
  over: Partial<DraftPickEvidence> & Pick<DraftPickEvidence, "season" | "overallPick" | "ownerName">,
): DraftPickEvidence {
  return {
    round: over.round ?? Math.ceil(over.overallPick / 12),
    teamId: over.teamId ?? 1,
    playerName: over.playerName ?? "Player",
    position: over.position ?? "RB",
    numberOfTeams: over.numberOfTeams ?? 12,
    ownerKey: over.ownerKey ?? over.ownerName,
    isKeeper: over.isKeeper ?? false,
    ...over,
  };
}

function impact(over: Partial<OwnerImpact> & Pick<OwnerImpact, "ownerKey" | "ownerName">): OwnerImpact {
  return {
    teamId: 1,
    actualRank: 7,
    actualRecord: "7-7",
    actualPointsFor: 1400,
    draftRank: 2,
    draftRecord: "10-4",
    draftPointsFor: 1600,
    rankDelta: 5,
    pointsAddedByMgmt: -200,
    draftGrade: 91,
    rosterMgmtGrade: 64,
    overallGrade: 79,
    draftedPlayerCount: 15,
    ...over,
  };
}

function reality(over: Partial<DraftRealityResult> = {}): DraftRealityResult {
  const oi = over.ownerImpacts ?? [
    impact({ ownerKey: "guid-a", ownerName: "Rod Sellers", teamId: 3, draftGrade: 91, rosterMgmtGrade: 64 }),
  ];
  return {
    season: 2022,
    leagueId: "457622",
    teamCount: 14,
    weeksSimulated: 14,
    scheduleMatchupWeeks: 14,
    confidence: "High",
    confidenceReason: "ok",
    actualStandings: [
      {
        rank: 7,
        ownerKey: "guid-a",
        ownerName: "Rod Sellers",
        teamId: 3,
        wins: 7,
        losses: 7,
        ties: 0,
        pointsFor: 1400,
      },
    ],
    draftOnlyStandings: [
      {
        rank: 2,
        ownerKey: "guid-a",
        ownerName: "Rod Sellers",
        teamId: 3,
        wins: 10,
        losses: 4,
        ties: 0,
        pointsFor: 1600,
      },
    ],
    ownerImpacts: oi,
    superlatives: {},
    insights: [],
    ...over,
  };
}

describe("RFSN-055A historical draft evaluation", () => {
  const nightPicks: DraftPickEvidence[] = [
    pick({
      season: 2022,
      overallPick: 12,
      round: 1,
      teamId: 3,
      ownerName: "Rod Sellers",
      ownerKey: "guid-a",
      playerName: "Reach Guy",
      adp: 40,
    }),
    pick({
      season: 2022,
      overallPick: 36,
      round: 3,
      teamId: 3,
      ownerName: "Rod Sellers",
      ownerKey: "guid-a",
      playerName: "Steal Guy",
      adp: 8,
    }),
    pick({
      season: 2022,
      overallPick: 48,
      round: 4,
      teamId: 3,
      ownerName: "Rod Sellers",
      ownerKey: "guid-a",
      playerName: "Fair Guy",
      adp: 50,
    }),
    pick({
      season: 2022,
      overallPick: 13,
      round: 2,
      teamId: 4,
      ownerName: "Other Owner",
      ownerKey: "guid-b",
      playerName: "B1",
      adp: 14,
    }),
    pick({
      season: 2022,
      overallPick: 25,
      round: 3,
      teamId: 4,
      ownerName: "Other Owner",
      ownerKey: "guid-b",
      playerName: "B2",
      adp: 26,
    }),
    pick({
      season: 2022,
      overallPick: 37,
      round: 4,
      teamId: 4,
      ownerName: "Other Owner",
      ownerKey: "guid-b",
      playerName: "B3",
      adp: 38,
    }),
  ];

  it("computes Draft Night letter from computeOwnerDraftMetrics when same-season ADP exists", () => {
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks: nightPicks,
      reality: null,
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(ev.draftNightSeasonAvailable).toBe(true);
    expect(rod.draftNight.available).toBe(true);
    expect(rod.draftNight.grade).toMatch(/^[ABCDF—]$/);
    expect(rod.draftNight.valueScore).not.toBeNull();
  });

  it("2010 Draft Night is unavailable (no usable ADP)", () => {
    const picks = [
      pick({ season: 2010, overallPick: 1, ownerName: "Rod Sellers", playerName: "A", teamId: 1 }),
      pick({ season: 2010, overallPick: 2, ownerName: "Other", playerName: "B", teamId: 2 }),
    ];
    const ev = composeHistoricalDraftEvaluation({
      season: 2010,
      leagueId: "457622",
      picks,
      reality: null,
    });
    expect(ev.draftNightSeasonAvailable).toBe(false);
    expect(ev.draftNightCoverageReason).toBe(ADP_UNAVAILABLE_REASON);
    expect(ev.draftRealityCoverageReason).toBe(REALITY_FLOOR_REASON);
    expect(ev.owners.every((o) => o.draftNight.available === false)).toBe(true);
    expect(ev.owners[0]!.draftNight.reason).toBe(ADP_UNAVAILABLE_REASON);
    expect(ev.owners[0]!.draftNight.grade).toBeNull();
    expect(ev.owners[0]!.draftReality.reason).toBe(REALITY_FLOOR_REASON);
  });

  it("2017 Draft Night is unavailable", () => {
    const ev = composeHistoricalDraftEvaluation({
      season: 2017,
      leagueId: "457622",
      picks: [pick({ season: 2017, overallPick: 1, ownerName: "Rod", playerName: "X", teamId: 1 })],
      reality: null,
    });
    expect(ev.draftNightSeasonAvailable).toBe(false);
    expect(ev.owners[0]!.draftNight.reason).toBe(ADP_UNAVAILABLE_REASON);
  });

  it("2025 Draft Night is unavailable when ADP is missing/sentinel-stripped", () => {
    const ev = composeHistoricalDraftEvaluation({
      season: 2025,
      leagueId: "457622",
      picks: [
        pick({
          season: 2025,
          overallPick: 1,
          ownerName: "Rod",
          playerName: "Chase",
          playerId: 1,
          teamId: 1,
          adp: null,
        }),
      ],
      reality: null,
    });
    expect(ev.draftNightSeasonAvailable).toBe(false);
    expect(ev.owners[0]!.draftNight.reason).toBe(ADP_UNAVAILABLE_REASON);
  });

  it("rejects ESPN ~170 undrafted sentinel (isUsableAdp)", () => {
    expect(isUsableAdp(170)).toBe(false);
    const ev = composeHistoricalDraftEvaluation({
      season: 2025,
      leagueId: "457622",
      picks: [
        pick({
          season: 2025,
          overallPick: 12,
          ownerName: "Rod",
          playerName: "X",
          teamId: 1,
          adp: 170,
        }),
      ],
      reality: null,
    });
    expect(ev.draftNightSeasonAvailable).toBe(false);
  });

  it("excludes keepers from value / reach / steal", () => {
    const picks: DraftPickEvidence[] = [
      pick({
        season: 2022,
        overallPick: 1,
        round: 1,
        teamId: 3,
        ownerName: "Rod Sellers",
        playerName: "Keeper Superstar",
        adp: 80,
        isKeeper: true,
      }),
      ...nightPicks.filter((p) => p.teamId === 3 || p.teamId === 4),
    ];
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks,
      reality: null,
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftNight.biggestSteal?.playerName).not.toBe("Keeper Superstar");
    expect(rod.draftNight.biggestReach?.playerName).not.toBe("Keeper Superstar");
    expect(rod.draftNight.pickCount).toBe(3);
  });

  it("Biggest Reach uses classifyReach phase floors, not hardcoded >= 8", () => {
    const mildEarly = classifyReach({ pickNumber: 10, playerAdp: 17, round: 1, numberOfTeams: 12 });
    expect(mildEarly.isReach).toBe(false);
    const realReach = classifyReach({ pickNumber: 10, playerAdp: 40, round: 1, numberOfTeams: 12 });
    expect(realReach.isReach).toBe(true);

    const picks: DraftPickEvidence[] = [
      pick({
        season: 2022,
        overallPick: 10,
        round: 1,
        teamId: 3,
        ownerName: "Rod Sellers",
        playerName: "Not A Reach",
        adp: 17,
      }),
      pick({
        season: 2022,
        overallPick: 24,
        round: 2,
        teamId: 3,
        ownerName: "Rod Sellers",
        playerName: "Real Reach",
        adp: 50,
      }),
      pick({
        season: 2022,
        overallPick: 36,
        round: 3,
        teamId: 3,
        ownerName: "Rod Sellers",
        playerName: "Fair",
        adp: 38,
      }),
      pick({
        season: 2022,
        overallPick: 13,
        round: 2,
        teamId: 4,
        ownerName: "Other Owner",
        playerName: "B1",
        adp: 14,
      }),
      pick({
        season: 2022,
        overallPick: 25,
        round: 3,
        teamId: 4,
        ownerName: "Other Owner",
        playerName: "B2",
        adp: 26,
      }),
      pick({
        season: 2022,
        overallPick: 37,
        round: 4,
        teamId: 4,
        ownerName: "Other Owner",
        playerName: "B3",
        adp: 38,
      }),
    ];
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks,
      reality: null,
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftNight.biggestReach?.playerName).toBe("Real Reach");
    expect(rod.draftNight.biggestReach?.playerName).not.toBe("Not A Reach");
  });

  it("Biggest Steal uses 055 stealDelta (pick − ADP)", () => {
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks: nightPicks,
      reality: null,
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftNight.biggestSteal?.playerName).toBe("Steal Guy");
    expect(rod.draftNight.biggestSteal?.delta).toBe(36 - 8);
    expect(rod.draftNight.biggestReach?.playerName).toBe("Reach Guy");
    expect(rod.draftNight.biggestReach?.delta).toBe(40 - 12);
  });

  it("Draft Results uses computeDraftReality fields, not new math", () => {
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks: nightPicks,
      reality: reality(),
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftReality.available).toBe(true);
    expect(rod.draftReality.draftGrade).toBe(91);
    expect(rod.draftReality.simulatedRank).toBe(2);
    expect(rod.draftReality.simulatedRecord).toBe("10-4");
    expect(rod.draftReality.actualRecord).toBe("7-7");
    expect(rod.draftReality.winDifference).toBe(3);
    expect(rod.draftReality.rosterMgmtGrade).toBe(64);
    expect(rod.draftReality).not.toHaveProperty("overallGrade");
  });

  it("Draft Results unavailable when MIN_WEEKS fails", () => {
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks: nightPicks,
      reality: reality({ weeksSimulated: 6, confidence: "Medium" }),
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftReality.available).toBe(false);
    expect(rod.draftReality.reason).toBe(REALITY_INSUFFICIENT_REASON);
    expect(rod.draftNight.available).toBe(true);
  });

  it("Draft Night and Draft Results can disagree without overwriting", () => {
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks: nightPicks,
      reality: reality({
        ownerImpacts: [
          impact({
            ownerKey: "guid-a",
            ownerName: "Rod Sellers",
            teamId: 3,
            draftGrade: 8,
            rosterMgmtGrade: 90,
            draftRank: 14,
            actualRank: 1,
          }),
        ],
      }),
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftNight.grade).toMatch(/^[ABCDF—]$/);
    expect(rod.draftReality.draftGrade).toBe(8);
    expect(rod.draftNight.grade).not.toBe(String(rod.draftReality.draftGrade));
  });

  it("does not publish Draft Results when the engine cannot be joined to draft owners", () => {
    const picks = nightPicks.map((p) => ({ ...p, season: 2018 }));
    const ev = composeHistoricalDraftEvaluation({
      season: 2018,
      leagueId: "457622",
      picks,
      reality: reality({
        season: 2018,
        weeksSimulated: 18,
        confidence: "High",
        teamCount: 1,
        ownerImpacts: [
          impact({
            ownerKey: "3436600c-3252-4b39-a933-1f7beead9084",
            ownerName: "3436600c-3252-4b39-a933-1f7beead9084",
            teamId: null as unknown as number,
            draftGrade: 50,
          }),
        ],
      }),
    });
    expect(ev.draftNightSeasonAvailable).toBe(true);
    expect(ev.draftRealitySeasonAvailable).toBe(false);
    expect(ev.draftRealityCoverageReason).toBe(REALITY_UNMATCHED_REASON);
    expect(ev.owners.every((o) => o.draftReality.available === false)).toBe(true);
    expect(ev.owners[0]!.draftNight.available).toBe(true);
  });

  it("matches Draft Reality owner keys with or without ESPN GUID braces", () => {
    const picks: DraftPickEvidence[] = [
      pick({
        season: 2022,
        overallPick: 12,
        round: 1,
        teamId: 0,
        ownerName: "Rod Sellers",
        ownerKey: "{GUID-A}",
        playerName: "Reach Guy",
        adp: 40,
      }),
      pick({
        season: 2022,
        overallPick: 36,
        round: 3,
        teamId: 0,
        ownerName: "Rod Sellers",
        ownerKey: "{GUID-A}",
        playerName: "Steal Guy",
        adp: 8,
      }),
      pick({
        season: 2022,
        overallPick: 48,
        round: 4,
        teamId: 0,
        ownerName: "Rod Sellers",
        ownerKey: "{GUID-A}",
        playerName: "Fair Guy",
        adp: 50,
      }),
    ];
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks,
      reality: reality({
        ownerImpacts: [
          impact({
            ownerKey: "guid-a",
            ownerName: "ESPN GUID Placeholder",
            teamId: null as unknown as number,
            draftGrade: 91,
          }),
        ],
      }),
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftReality.available).toBe(true);
    expect(rod.draftReality.draftGrade).toBe(91);
  });

  it("does not join another season's picks into the evaluated season", () => {
    const mixed = [
      ...nightPicks,
      pick({
        season: 2024,
        overallPick: 1,
        ownerName: "Rod Sellers",
        teamId: 3,
        playerName: "Future",
        adp: 90,
      }),
    ];
    const ev = composeHistoricalDraftEvaluation({
      season: 2022,
      leagueId: "457622",
      picks: mixed,
      reality: null,
    });
    const rod = ev.owners.find((o) => o.ownerName === "Rod Sellers")!;
    expect(rod.draftNight.pickCount).toBe(3);
    expect(rod.draftNight.biggestReach?.playerName).not.toBe("Future");
  });
});
