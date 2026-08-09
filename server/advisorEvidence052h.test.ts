import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllAdvisorConversationContext,
  getAdvisorConversationContext,
  isAdvisorFollowUpPairAsk,
  setAdvisorConversationContext,
} from "./advisorConversationContext";
import {
  formatCareerWinPctAnswer,
  formatDeterministicAdvisorAnswer,
  formatMostCareerLossesAnswer,
  formatMostCareerWinsAnswer,
  formatPlayoffEliminationsAnswer,
  formatWorstCareerRecordAnswer,
  missingDatasetSentence,
  runAdvisorEvidencePath,
} from "./advisorEvidenceExecutor";
import {
  buildAdvisorEvidencePackage,
  type AdvisorEvidenceSources,
} from "./advisorEvidencePackage";
import { planAdvisorEvidenceFromMessage } from "./advisorEvidencePlanner";
import type { AdvisorQuestionScope } from "./advisorScopeResolver";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";

const LEAGUE_HISTORY: AdvisorQuestionScope = {
  scopeType: "league_history",
  startSeason: null,
  endSeason: null,
  phase: "all",
  ownerNames: [],
  confidence: "medium",
  explicitSeasonRequested: false,
};

const OWNERS: AdvisorOwnerAlias[] = [
  { memberId: "demetri-id", displayName: "Demetri Clark", aliases: ["demetri clark", "demetri"] },
  { memberId: "lozell-id", displayName: "LOZELL STYLES", aliases: ["lozell styles", "lozell"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
  { memberId: "rod-id", displayName: "Rod Sellers", aliases: ["rod sellers", "rod"] },
];

const CURRENT_SEASON_ONLY: AdvisorOwnerAlias[] = [
  { memberId: "demetri-id", displayName: "Demetri Clark", aliases: ["demetri clark", "demetri"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
];

const PERSONS = [
  {
    canonicalPersonId: "id:demetri",
    canonicalName: "Demetri Clark",
    resolvedBy: "espn-id",
    aliases: ["demetri clark", "demetri"],
  },
  {
    canonicalPersonId: "id:lozell",
    canonicalName: "LOZELL STYLES",
    resolvedBy: "espn-id",
    aliases: ["lozell styles", "lozell"],
  },
  {
    canonicalPersonId: "id:bruce",
    canonicalName: "Bruce Edwards",
    resolvedBy: "espn-id",
    aliases: ["bruce edwards", "bruce"],
  },
];

function demetriLozellH2H() {
  return {
    personA: "id:demetri",
    personB: "id:lozell",
    displayA: "Demetri Clark",
    displayB: "LOZELL STYLES",
    meetings: [
      { season: 2010, week: 3, isPlayoff: false, winner: "A" as const, scoreA: 110, scoreB: 100 },
      { season: 2011, week: 16, isPlayoff: true, winner: "A" as const, scoreA: 120, scoreB: 90 },
      { season: 2021, week: 5, isPlayoff: false, winner: "B" as const, scoreA: 88, scoreB: 99 },
    ],
  };
}

function sources(over: Partial<AdvisorEvidenceSources> = {}): AdvisorEvidenceSources {
  return {
    leagueName: "Rivals",
    provider: "espn",
    coverageStartSeason: 2010,
    coverageEndSeason: 2025,
    persons: PERSONS,
    championships: {
      latestCompletedSeason: 2025,
      reigningKey: "id:demetri",
      seasons: [
        { season: 2011, ownerKey: "id:lozell", ownerName: "LOZELL STYLES", source: "medal" },
        { season: 2021, ownerKey: "id:lozell", ownerName: "LOZELL STYLES", source: "medal" },
        { season: 2012, ownerKey: "id:demetri", ownerName: "Demetri Clark", source: "medal" },
      ],
    },
    h2h: demetriLozellH2H(),
    playoffEliminations: [
      {
        ownerKey: "id:demetri",
        ownerName: "Demetri Clark",
        inflicted: 8,
        topVictimName: "LOZELL STYLES",
        topVictimCount: 5,
      },
      { ownerKey: "id:lozell", ownerName: "LOZELL STYLES", inflicted: 3 },
    ],
    careerRecords: [
      {
        ownerKey: "id:demetri",
        ownerName: "Demetri Clark",
        wins: 120,
        losses: 80,
        ties: 0,
        games: 200,
        winPct: 0.6,
        seasonsActive: 15,
      },
      {
        ownerKey: "id:bruce",
        ownerName: "Bruce Edwards",
        wins: 70,
        losses: 130,
        ties: 0,
        games: 200,
        winPct: 0.35,
        seasonsActive: 15,
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  clearAllAdvisorConversationContext();
});

describe("RFSN-052H conversation entity continuity", () => {
  it("detects pronoun follow-ups without treating named compares as follow-ups", () => {
    expect(isAdvisorFollowUpPairAsk("Check their head-to-head stats.")).toBe(true);
    expect(isAdvisorFollowUpPairAsk("compare them")).toBe(true);
    expect(isAdvisorFollowUpPairAsk("who leads?")).toBe(true);
    expect(isAdvisorFollowUpPairAsk("Compare Demetri Clark and LOZELL STYLES.")).toBe(false);
    expect(isAdvisorFollowUpPairAsk("Who has the most championships?")).toBe(false);
  });

  it("keeps Demetri + LOZELL on “their H2H” even when current-season aliases omit LOZELL", async () => {
    const assemble = async (input: Parameters<typeof buildAdvisorEvidencePackage>[0]) => {
      expect(input.owners.map((o) => o.displayName)).toEqual(["Demetri Clark", "LOZELL STYLES"]);
      return buildAdvisorEvidencePackage(input, sources());
    };

    const first = await runAdvisorEvidencePath(
      {
        message: "Compare Demetri Clark and LOZELL STYLES.",
        leagueId: "457622",
        userId: 9,
        season: 2025,
        ownerAliases: OWNERS,
      },
      {
        assemblePackage: assemble,
        getHistory: async () => [],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-should-not-run" }],
      },
    );
    expect(first.kind).toBe("deterministic");
    if (first.kind === "deterministic") {
      expect(first.message).toMatch(/Demetri Clark vs LOZELL STYLES/);
      expect(first.telemetry.deterministicShortCircuit).toBe(true);
    }

    const follow = await runAdvisorEvidencePath(
      {
        message: "Check their head-to-head stats.",
        leagueId: "457622",
        userId: 9,
        season: 2025,
        ownerAliases: CURRENT_SEASON_ONLY,
      },
      {
        assemblePackage: assemble,
        getHistory: async () => [
          { role: "user", content: "Compare Demetri Clark and LOZELL STYLES." },
          { role: "assistant", content: "Across recorded meetings, Demetri Clark vs LOZELL STYLES." },
        ],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-should-not-run" }],
      },
    );
    expect(follow.kind).toBe("deterministic");
    if (follow.kind === "deterministic") {
      expect(follow.message).toMatch(/Demetri Clark vs LOZELL STYLES/);
      expect(follow.message).not.toMatch(/Bruce Edwards/);
    }
  });

  it("does not reuse ESPN owners after a league switch", async () => {
    setAdvisorConversationContext(9, "457622", {
      lastResolvedOwners: [
        { displayName: "Demetri Clark", memberId: "demetri-id" },
        { displayName: "LOZELL STYLES", memberId: "lozell-id" },
      ],
      lastIntent: "h2h_pair",
      lastScope: LEAGUE_HISTORY,
      lastLeagueId: "457622",
    });

    const follow = await runAdvisorEvidencePath(
      {
        message: "Check their head-to-head stats.",
        leagueId: "sleeper_smoke_core",
        userId: 9,
        season: 2025,
        ownerAliases: CURRENT_SEASON_ONLY,
      },
      {
        assemblePackage: async (input) => {
          expect(input.owners.map((o) => o.displayName)).not.toEqual([
            "Demetri Clark",
            "LOZELL STYLES",
          ]);
          return buildAdvisorEvidencePackage(input, sources({ h2h: { ...demetriLozellH2H(), meetings: [] } }));
        },
        getHistory: async () => [],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-should-not-run" }],
      },
    );
    expect(getAdvisorConversationContext(9, "sleeper_smoke_core")?.lastLeagueId).toBe(
      "sleeper_smoke_core",
    );
    expect(getAdvisorConversationContext(9, "457622")?.lastResolvedOwners[0]?.displayName).toBe(
      "Demetri Clark",
    );
    expect(follow.kind).toBe("deterministic");
  });

  it("does not inherit prior owners into an unnamed championship leaderboard", async () => {
    await runAdvisorEvidencePath(
      {
        message: "Compare Demetri Clark and LOZELL STYLES.",
        leagueId: "457622",
        userId: 11,
        season: 2025,
        ownerAliases: OWNERS,
      },
      {
        assemblePackage: async (input) => buildAdvisorEvidencePackage(input, sources()),
        getHistory: async () => [],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-should-not-run" }],
      },
    );

    const board = await runAdvisorEvidencePath(
      {
        message: "Who has the most championships?",
        leagueId: "457622",
        userId: 11,
        season: 2025,
        ownerAliases: OWNERS,
      },
      {
        assemblePackage: async (input) => {
          expect(input.plan.intent).toBe("championship_leaderboard");
          return buildAdvisorEvidencePackage(input, sources());
        },
        getHistory: async () => [
          { role: "user", content: "Compare Demetri Clark and LOZELL STYLES." },
        ],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-should-not-run" }],
      },
    );
    expect(board.kind).toBe("deterministic");
    if (board.kind === "deterministic") {
      expect(board.message).toMatch(/championship totals/i);
      expect(board.message).not.toMatch(/has more championships/);
      expect(board.telemetry.deterministicShortCircuit).toBe(true);
    }
  });
});

describe("RFSN-052H championship leaderboard vs compare", () => {
  it("routes unnamed most-championships to leaderboard even with many aliases", () => {
    const p = planAdvisorEvidenceFromMessage("Who has the most championships?", {
      leagueId: "457622",
      ownerAliases: OWNERS,
      currentSeason: 2026,
    });
    expect(p.intent).toBe("championship_leaderboard");
    expect(p.fallbackToAdvisorContext).toBe(false);
    expect(p.authorities).toEqual(["championships"]);
  });

  it("routes named more-championships to comparison", () => {
    const p = planAdvisorEvidenceFromMessage("Who has more championships, Rod or Bruce?", {
      leagueId: "457622",
      ownerAliases: OWNERS,
      currentSeason: 2026,
    });
    expect(p.intent).toBe("championship_compare");
    expect(p.authorities).toEqual(["owner_identity", "championships"]);
  });

  it("returns a ranked leaderboard, not a two-owner compare", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the most championships?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: {
          intent: "championship_leaderboard",
          authorities: ["championships"],
          deterministicFirst: true,
          narrativeAllowed: false,
          requiredEvidence: ["title_counts"],
          fallbackToAdvisorContext: false,
        },
      },
      sources(),
    );
    const det = formatDeterministicAdvisorAnswer(pkg);
    expect(det?.message).toMatch(/championship totals/i);
    expect(det?.message).toMatch(/LOZELL STYLES/);
    expect(det?.message).not.toMatch(/has more championships/);
  });
});

describe("RFSN-052H playoff elims + career records", () => {
  it("answers playoff eliminations from the H2H/Rivalry meeting source", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the most playoff eliminations?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, phase: "playoffs" },
        owners: [],
        plan: {
          intent: "playoff_eliminations",
          authorities: ["owner_identity", "playoffs", "rivalry"],
          deterministicFirst: true,
          narrativeAllowed: false,
          requiredEvidence: ["playoff_eliminations"],
          fallbackToAdvisorContext: false,
        },
      },
      sources(),
    );
    const text = formatPlayoffEliminationsAnswer(pkg, "playoff_eliminations");
    expect(text).toMatch(/Demetri Clark/);
    expect(text).toMatch(/playoffs only/);
    expect(text).toMatch(/2010/);
    expect(text).toMatch(/Most often vs LOZELL STYLES \(5\)/);
    expect(text).toMatch(/recorded playoff wins/i);
    expect(text).not.toMatch(/I don't have that information/i);
  });

  it("answers career win% / worst / most wins / most losses from historical records", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the best career winning percentage?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career" },
        owners: [],
        plan: {
          intent: "career_win_pct",
          authorities: ["owner_identity", "league_records"],
          deterministicFirst: true,
          narrativeAllowed: false,
          requiredEvidence: ["career_records"],
          fallbackToAdvisorContext: false,
        },
      },
      sources(),
    );
    expect(formatCareerWinPctAnswer(pkg)).toMatch(/Demetri Clark/);
    expect(formatCareerWinPctAnswer(pkg)).toMatch(/regular season/);
    expect(formatWorstCareerRecordAnswer(pkg)).toMatch(/Bruce Edwards/);
    expect(formatMostCareerWinsAnswer(pkg)).toMatch(/Demetri Clark/);
    expect(formatMostCareerLossesAnswer(pkg)).toMatch(/Bruce Edwards/);
  });

  it("uses the precise missing-dataset sentence when snapshots are empty", () => {
    expect(missingDatasetSentence("playoff wins", "2010–2025")).toBe(
      "This league does not have recorded playoff wins for 2010–2025.",
    );
    expect(missingDatasetSentence("career records", "2010–2025")).toBe(
      "This league does not have recorded career records for 2010–2025.",
    );
    const empty = buildAdvisorEvidencePackage(
      {
        message: "Who has the most playoff eliminations?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: {
          intent: "playoff_eliminations",
          authorities: ["playoffs"],
          deterministicFirst: true,
          narrativeAllowed: false,
          requiredEvidence: ["playoff_eliminations"],
          fallbackToAdvisorContext: false,
        },
      },
      sources({ playoffEliminations: [], careerRecords: [] }),
    );
    expect(formatPlayoffEliminationsAnswer(empty, "playoff_eliminations")).toMatch(
      /does not have recorded playoff wins/,
    );
    expect(formatCareerWinPctAnswer(empty)).toMatch(/does not have recorded career records/);
  });

  it("does not fall back to the LLM for elim / career / leaderboard / H2H follow-up", async () => {
    for (const message of [
      "Who has the most championships?",
      "Who has the most playoff eliminations?",
      "Who has the best career winning percentage?",
      "Who has the worst career record?",
      "Who has the most career wins?",
      "Compare Demetri Clark and LOZELL STYLES.",
    ]) {
      const p = planAdvisorEvidenceFromMessage(message, {
        leagueId: "457622",
        ownerAliases: OWNERS,
        currentSeason: 2026,
      });
      expect(p.fallbackToAdvisorContext, message).toBe(false);
      expect(p.deterministicFirst, message).toBe(true);
    }
  });
});
