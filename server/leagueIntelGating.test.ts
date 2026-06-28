import { describe, expect, it } from "vitest";
import {
  gateNotoriousTradesReport,
  gateOwnerList,
  gateOwnerProfile,
  gatePlayoffPositionSplit,
  gateRivalryScores,
  gateRivalryStoryForOwner,
  gateRivalryStoryPair,
  gateRivalryStoryReceipts,
  gateRivalryStoryStatements,
  gateTradeAnalyzeResult,
  gateWhyHaventIWon,
  gateOwnerAllTimeRecords,
  gateDynastyPowerRankings,
} from "./leagueIntelGating";
import type { RivalryStoryResult } from "./rivalryStoryAuthority";
import type { WhyHaventIWonResult } from "./whyHaventIWon";
import type { PlayoffPositionSplitResult } from "./playoffPositionSplit";

describe("gateTradeAnalyzeResult", () => {
  it("strips pro fields for free users", () => {
    const full = {
      totalA: 100,
      totalB: 90,
      pickValueA: 0,
      pickValueB: 5,
      ratio: 1.11,
      fairnessGrade: "SLIGHT EDGE A",
      leagueFormat: "redraft",
      formatSource: "espn",
      requiresFormatDisclaimer: false,
      disclaimers: [],
      sideAValues: [{ name: "Player A" }],
      aiVerdict: "secret",
      tradeIntelligence: { verdict: { verdict: "WIN" } },
    };
    const gated = gateTradeAnalyzeResult(full, false);
    expect(gated.gated).toBe(true);
    expect(gated.entitled).toBe(false);
    expect(gated.totalA).toBe(100);
    expect(gated.fairnessGrade).toBe("SLIGHT EDGE A");
    expect(gated.sideAValues).toBeUndefined();
    expect(gated.aiVerdict).toBeUndefined();
    expect(gated.tradeIntelligence).toBeUndefined();
  });

  it("passes through full payload for entitled users", () => {
    const full = { totalA: 1, totalB: 2, aiVerdict: "ok" };
    const out = gateTradeAnalyzeResult(full, true);
    expect(out.gated).toBe(false);
    expect(out.entitled).toBe(true);
    expect(out.aiVerdict).toBe("ok");
  });
});

describe("gateWhyHaventIWon", () => {
  const base: WhyHaventIWonResult = {
    leagueId: "1",
    ownerKey: "k",
    ownerName: "Rod",
    isSetupComplete: true,
    hasWon: false,
    titles: 0,
    seasonsPlayed: 10,
    bestFinish: 2,
    playoffAppearances: 5,
    findings: [
      { id: "a", category: "playoffs", severity: 90, headline: "One", detail: "d1", metricValue: 1, leagueBenchmark: 2 },
      { id: "b", category: "rivals", severity: 80, headline: "Two", detail: "d2", metricValue: 3, leagueBenchmark: 4 },
    ],
    narrative: "full story",
    confidence: "High",
    championSeasons: [],
    isReigningChampion: false,
    pageMode: "why-havent-won",
    needsOwnerSelection: false,
  };

  it("redacts to one finding when not entitled", () => {
    const out = gateWhyHaventIWon(base, false);
    expect(out.gated).toBe(true);
    expect(out.findings).toHaveLength(1);
    expect(out.lockedFindings).toBe(1);
    expect(out.narrative).toContain("One");
  });
});

describe("gatePlayoffPositionSplit", () => {
  const base: PlayoffPositionSplitResult = {
    leagueId: "1",
    ownerKey: "k",
    ownerName: "Rod",
    isSetupComplete: true,
    available: true,
    reason: null,
    coverageSeasons: [2021, 2022],
    playoffSeasonsForOwner: [2021],
    positions: [{ position: "RB", playoffAvg: 10, playoffStarts: 6, regularAvg: 12, regularStarts: 14, championFullAvg: 15, championPlayoffAvg: 14, vsOwnRegular: -2, vsChampionFull: -5, vsChampionPlayoff: -4, verdict: "RBs disappeared", confidence: "ok" }],
    overall: { playoffPF: 99, regularPF: 110, championFullPF: 120, championPlayoffPF: 115, headline: "Fell short" },
    narrative: "story",
    confidence: "High",
  };

  it("redacts position data when not entitled", () => {
    const out = gatePlayoffPositionSplit(base, false);
    expect(out.gated).toBe(true);
    expect(out.available).toBe(false);
    expect(out.positions).toHaveLength(0);
    expect(out.overall.headline).toBeNull();
  });
});

const sampleRivalryStory = (): RivalryStoryResult => ({
  focalOwnerKey: "id:focal",
  rivalOwnerKey: "id:rival",
  tier: "legendary",
  headline: {
    key: "THREE_ELIMINATIONS",
    confidence: 0.95,
    receiptIds: ["gm:2016:15", "gm:2021:16", "gm:2023:15"],
  },
  documentaryFacts: [
    { factKey: "PLAYOFF_ELIMINATION", supportingGameIds: ["gm:2016:15"], confidence: 0.9 },
  ],
  availableBlocks: [
    "coldOpen",
    "taleOfTape",
    "turningPoint",
    "playoffWar",
    "championship",
  ],
});

describe("gateRivalryStoryPair", () => {
  it("returns teaser metadata only for free users", () => {
    const out = gateRivalryStoryPair(sampleRivalryStory(), false);
    expect(out.gated).toBe(true);
    expect(out.entitled).toBe(false);
    expect(out.tier).toBe("legendary");
    expect(out.headline.key).toBe("THREE_ELIMINATIONS");
    expect(out.headline.receiptIds).toEqual([]);
    expect(out.documentaryFacts).toEqual([]);
    expect(out.availableBlocks).toEqual(["coldOpen"]);
    expect(out.availableBlocks).not.toContain("taleOfTape");
  });

  it("passes through full story authority for entitled users", () => {
    const full = sampleRivalryStory();
    const out = gateRivalryStoryPair(full, true);
    expect(out.gated).toBe(false);
    expect(out.entitled).toBe(true);
    expect(out.documentaryFacts).toHaveLength(1);
    expect(out.headline.receiptIds).toEqual(full.headline.receiptIds);
    expect(out.availableBlocks).toContain("turningPoint");
  });
});

describe("gateRivalryScores", () => {
  const scores = [
    { rivalName: "Alpha", rivalryScore: 200, heatLabel: "Inferno", rivalId: "1", h2hWins: 3, h2hLosses: 7 },
    { rivalName: "Beta", rivalryScore: 100, heatLabel: "Heated", rivalId: "2" },
    { rivalName: "Gamma", rivalryScore: 50, heatLabel: "Cold", rivalId: "3" },
  ];

  it("returns one preview rivalry and locked stubs for free users", () => {
    const out = gateRivalryScores(scores, false);
    expect(out.gated).toBe(true);
    expect(out.rivalries).toHaveLength(3);
    expect(out.rivalries[0]).toMatchObject({ rivalName: "Alpha", rivalryScore: 200, preview: true });
    expect((out.rivalries[0] as Record<string, unknown>).h2hWins).toBeUndefined();
    expect(out.rivalries[1]).toMatchObject({ rivalName: "Beta", locked: true });
    expect(out.rivalries[2]).toMatchObject({ rivalName: "Gamma", locked: true });
    expect(out.lockedRivalries).toBe(2);
  });

  it("passes through all rivalries for entitled users", () => {
    const out = gateRivalryScores(scores, true);
    expect(out.gated).toBe(false);
    expect(out.rivalries).toHaveLength(3);
    expect((out.rivalries[0] as Record<string, unknown>).h2hWins).toBe(3);
  });
});

describe("gateRivalryStoryForOwner", () => {
  it("gates a single story as teaser for free users", () => {
    const out = gateRivalryStoryForOwner("id:focal", [sampleRivalryStory()], false);
    expect(out.gated).toBe(true);
    expect(out.stories).toHaveLength(1);
    expect(out.stories[0]?.documentaryFacts).toEqual([]);
    expect(out.stories[0]?.availableBlocks).toEqual(["coldOpen"]);
  });

  it("returns one preview story and locked stubs when multiple rivalries exist", () => {
    const second = { ...sampleRivalryStory(), rivalOwnerKey: "id:rival2", tier: "cold" as const };
    const out = gateRivalryStoryForOwner("id:focal", [second, sampleRivalryStory()], false);
    expect(out.gated).toBe(true);
    expect(out.stories).toHaveLength(2);
    expect(out.stories[0]?.documentaryFacts).toEqual([]);
    expect(out.stories[0]?.availableBlocks).toEqual(["coldOpen"]);
    expect(out.stories[1]?.locked).toBe(true);
    expect(out.stories[1]?.documentaryFacts).toEqual([]);
  });
});

describe("gateRivalryStoryReceipts", () => {
  it("returns empty receipts for free users", () => {
    const receipts = [
      { receiptId: "gm:1", type: "game", season: 2024, factKeys: ["PLAYOFF_ELIMINATION"] },
    ] as any;
    const out = gateRivalryStoryReceipts("a", "b", receipts, false);
    expect(out.gated).toBe(true);
    expect(out.receipts).toEqual([]);
  });

  it("passes through receipts for entitled users", () => {
    const receipts = [{ receiptId: "gm:1" }] as any;
    const out = gateRivalryStoryReceipts("a", "b", receipts, true);
    expect(out.gated).toBe(false);
    expect(out.receipts).toHaveLength(1);
  });
});

describe("gateRivalryStoryStatements", () => {
  it("returns only top cold open for free users", () => {
    const statements = [
      { statementKey: "THREE_ELIMINATIONS_LEAD", block: "coldOpen", priority: 100, text: "Teaser", receiptIds: ["gm:1"], factKeys: [], confidence: 0.9 },
      { statementKey: "PLAYOFF_OWNER_LEAD", block: "coldOpen", priority: 80, text: "Other", receiptIds: ["gm:2"], factKeys: [], confidence: 0.8 },
      { statementKey: "CAREER_RECORD", block: "taleOfTape", priority: 50, text: "Secret", receiptIds: [], factKeys: [], confidence: 0.8 },
    ] as any;
    const out = gateRivalryStoryStatements("a", "b", statements, false);
    expect(out.gated).toBe(true);
    expect(out.statements).toHaveLength(1);
    expect(out.statements[0]?.block).toBe("coldOpen");
    expect(out.statements[0]?.statementKey).toBe("THREE_ELIMINATIONS_LEAD");
    expect(out.statements[0]?.receiptIds).toEqual([]);
    expect(out.statements[0]?.factKeys).toEqual([]);
    expect(out.lockedStatements).toBe(2);
  });

  it("returns empty statements when no cold open exists for free users", () => {
    const statements = [
      { statementKey: "CAREER_RECORD", block: "taleOfTape", priority: 50, text: "Secret", receiptIds: [], factKeys: [], confidence: 0.8 },
    ] as any;
    const out = gateRivalryStoryStatements("a", "b", statements, false);
    expect(out.statements).toEqual([]);
    expect(out.lockedStatements).toBe(1);
  });

  it("passes through full statements for entitled users", () => {
    const statements = [
      { statementKey: "THREE_ELIMINATIONS_LEAD", block: "coldOpen", priority: 100, text: "Teaser", receiptIds: ["gm:1"], factKeys: [], confidence: 0.9 },
      { statementKey: "CAREER_RECORD", block: "taleOfTape", priority: 50, text: "Full", receiptIds: [], factKeys: [], confidence: 0.8 },
    ] as any;
    const out = gateRivalryStoryStatements("a", "b", statements, true);
    expect(out.gated).toBe(false);
    expect(out.statements).toHaveLength(2);
    expect(out.lockedStatements).toBe(0);
  });
});

describe("gateOwnerAllTimeRecords", () => {
  it("returns locked owner stubs for free users", () => {
    const owners = [
      { ownerKey: "a", displayName: "Alice", wins: 50, losses: 30, winPct: 62.5 },
      { ownerKey: "b", displayName: "Bob", wins: 40, losses: 40, winPct: 50 },
    ];
    const out = gateOwnerAllTimeRecords(owners, { rawMatchupRows: 1 }, false);
    expect(out.gated).toBe(true);
    expect(out.owners).toHaveLength(2);
    expect(out.owners[0]).toMatchObject({ displayName: "Alice", locked: true });
    expect(out.owners[0]?.wins).toBeUndefined();
    expect(out.diagnostics).toBeNull();
  });
});

describe("gateDynastyPowerRankings", () => {
  it("returns locked team stubs for free users", () => {
    const payload = {
      season: 2026,
      leagueId: "1",
      teamCount: 2,
      thresholds: { high: 70, low: 30 },
      teams: [
        { ownerKey: "a", ownerName: "Alice", nowScore: 80, laterScore: 70 },
        { ownerKey: "b", ownerName: "Bob", nowScore: 60, laterScore: 50 },
      ],
    };
    const out = gateDynastyPowerRankings(payload, false);
    expect(out.gated).toBe(true);
    expect(out.teams[0]).toMatchObject({ ownerName: "Alice", locked: true });
    expect((out.teams[0] as Record<string, unknown>).nowScore).toBeUndefined();
    expect(out.lockedTeamCount).toBe(2);
  });
});

describe("gateOwnerProfile", () => {
  const fullProfile = {
    leagueId: "1",
    ownerName: "Mark",
    snapshot: {
      seasons: [2020, 2021, 2022],
      currentTeam: "Team Mark",
      totalWins: 30,
      totalLosses: 20,
      championships: 1,
      seasonRecords: [{ season: 2022, wins: 10, losses: 4 }],
      bestSeason: { season: 2022 },
      worstSeason: { season: 2020 },
    },
    draftDNA: { totalPicks: 50 },
    keeperDNA: { totalKeepers: 2 },
    activityDNA: { totalAcq: 10 },
    scoutingSummary: "Aggressive drafter",
    matchupIntel: [{ opponentOwner: "Rod" }],
    comparison: { ownerName: "Rod" },
    headToHead: { games: 5 },
    comparisonCandidates: ["Rod"],
  };

  it("returns identity shell only for own profile on free tier", () => {
    const out = gateOwnerProfile(fullProfile, false, true);
    expect(out.gated).toBe(true);
    expect(out.ownProfile).toBe(true);
    expect(out.draftDNA).toBeNull();
    expect(out.scoutingSummary).toBeNull();
    expect(out.snapshot?.seasonRecords).toEqual([]);
    expect(out.snapshot?.totalWins).toBe(0);
    expect(out.snapshot?.championships).toBe(1);
  });

  it("returns locked stub for other owners on free tier", () => {
    const out = gateOwnerProfile(fullProfile, false, false);
    expect(out.gated).toBe(true);
    expect(out.locked).toBe(true);
    expect(out.snapshot).toBeNull();
    expect(out.draftDNA).toBeNull();
  });
});

describe("gateOwnerList", () => {
  const payload = {
    leagueId: "1",
    active: [
      { ownerKey: "id:mark", ownerName: "Mark", currentTeam: "A", seasons: [2022], championships: 1, totalWins: 10, totalLosses: 5, winPct: 66 },
      { ownerKey: "id:rod", ownerName: "Rod", currentTeam: "B", seasons: [2022], championships: 0, totalWins: 8, totalLosses: 7, winPct: 53 },
    ],
    graveyard: [],
    powerRankings: [{ rank: 1 }],
    ownerAwards: [{ awardName: "MVP" }],
    allOwners: [
      { ownerKey: "id:mark", ownerName: "Mark", seasons: [2022], championships: 1 },
      { ownerKey: "id:rod", ownerName: "Rod", seasons: [2022], championships: 0 },
    ],
  };

  it("returns preview row for viewer and locked stubs for others", () => {
    const out = gateOwnerList(payload, false, "id:mark");
    expect(out.gated).toBe(true);
    expect(out.active[0]).toMatchObject({ ownerKey: "id:mark", preview: true });
    expect((out.active[0] as Record<string, unknown>).totalWins).toBeUndefined();
    expect(out.active[1]).toMatchObject({ ownerKey: "id:rod", locked: true });
    expect(out.powerRankings).toEqual([]);
    expect(out.ownerAwards).toEqual([]);
    expect(out.lockedOwners).toBe(1);
  });
});

describe("gateNotoriousTradesReport", () => {
  const fullReport = {
    biggestValueGap: { margin: 100, receiptText: "secret headline" },
    mostLopsided: { margin: 90 },
    closestFairTrade: { margin: 1 },
    biggestPickOnlyGap: null,
    biggestPlayerTrade: null,
    biggestMixedTrade: null,
    mostActivePair: { count: 4 },
    mostSuccessfulOwner: { netValue: 500 },
    rankedByMargin: [{ margin: 100 }, { margin: 90 }],
  } as any;

  it("returns count-only payload for free users", () => {
    const out = gateNotoriousTradesReport(fullReport, false);
    expect(out.gated).toBe(true);
    expect(out.tradeCount).toBe(2);
    expect(out.rankedByMargin).toEqual([]);
    expect(out.biggestValueGap).toBeNull();
    expect(out.mostLopsided).toBeNull();
    expect(out.mostActivePair).toBeNull();
  });

  it("passes through full report for entitled users", () => {
    const out = gateNotoriousTradesReport(fullReport, true);
    expect(out.gated).toBe(false);
    expect(out.tradeCount).toBe(2);
    expect(out.rankedByMargin).toHaveLength(2);
    expect(out.biggestValueGap?.margin).toBe(100);
    expect(out.mostActivePair?.count).toBe(4);
  });
});
