import { describe, expect, it } from "vitest";
import {
  acrossCoveragePhrase,
  formatDeterministicAdvisorAnswer,
  formatH2HAdvisorAnswer,
  missingDatasetSentence,
  runAdvisorEvidencePath,
} from "./advisorEvidenceExecutor";
import {
  buildAdvisorEvidencePackage,
  type AdvisorEvidenceSources,
  type ChampionshipSnapshot,
  type H2HSnapshot,
} from "./advisorEvidencePackage";
import type { AdvisorEvidencePlan } from "./advisorEvidencePlanner";
import type { AdvisorQuestionScope } from "./advisorScopeResolver";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";
import type { MatchupMarginAnalyticsResult } from "./matchupMarginAnalytics";

const LEAGUE_HISTORY: AdvisorQuestionScope = {
  scopeType: "league_history",
  startSeason: null,
  endSeason: null,
  phase: "all",
  ownerNames: [],
  confidence: "medium",
  explicitSeasonRequested: false,
};

const CHAMP_PLAN: AdvisorEvidencePlan = {
  intent: "reigning_champion",
  authorities: ["championships"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["reigning_champion"],
  fallbackToAdvisorContext: false,
};

const LEADERBOARD_PLAN: AdvisorEvidencePlan = {
  intent: "championship_leaderboard",
  authorities: ["championships"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["title_counts"],
  fallbackToAdvisorContext: false,
};

const H2H_PLAN: AdvisorEvidencePlan = {
  intent: "h2h_pair",
  authorities: ["owner_identity", "h2h", "playoffs"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["h2h_career_record"],
  fallbackToAdvisorContext: false,
};

const MARGIN_PLAN: AdvisorEvidencePlan = {
  intent: "matchup_margins",
  authorities: ["owner_identity", "matchup_margins"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["margin_query"],
  fallbackToAdvisorContext: false,
};

const DRAFT_INTEL_PLAN: AdvisorEvidencePlan = {
  intent: "draft_intelligence",
  authorities: ["owner_identity", "draft_history"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["draft_picks", "draft_adp_join"],
  fallbackToAdvisorContext: false,
};

const PERSONS = [
  {
    canonicalPersonId: "id:rod",
    canonicalName: "Rod Sellers",
    resolvedBy: "espn-id",
    aliases: ["rod sellers", "rod"],
  },
  {
    canonicalPersonId: "id:bruce",
    canonicalName: "Bruce Edwards",
    resolvedBy: "espn-id",
    aliases: ["bruce edwards", "bruce"],
  },
];

const OWNER_ALIASES: AdvisorOwnerAlias[] = [
  { memberId: "rod-id", displayName: "Rod Sellers", aliases: ["rod sellers", "rod"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
];

function champSnap(): ChampionshipSnapshot {
  return {
    latestCompletedSeason: 2024,
    reigningKey: "id:bruce",
    seasons: [
      { season: 2012, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "finalStanding-fallback" },
      { season: 2015, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "medal" },
      { season: 2018, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "medal" },
      { season: 2021, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "medal" },
      { season: 2024, ownerKey: "id:bruce", ownerName: "Bruce Edwards", source: "medal" },
    ],
  };
}

function h2hSnap(): H2HSnapshot {
  return {
    personA: "id:rod",
    personB: "id:bruce",
    displayA: "Rod Sellers",
    displayB: "Bruce Edwards",
    meetings: [
      { season: 2018, week: 3, isPlayoff: false, winner: "A", scoreA: 120, scoreB: 110 },
      { season: 2019, week: 7, isPlayoff: false, winner: "B", scoreA: 95, scoreB: 101 },
      { season: 2020, week: 15, isPlayoff: true, winner: "B", scoreA: 88, scoreB: 99 },
      { season: 2023, week: 4, isPlayoff: false, winner: "A", scoreA: 130, scoreB: 100 },
    ],
  };
}

function baseSources(over: Partial<AdvisorEvidenceSources> = {}): AdvisorEvidenceSources {
  return {
    leagueName: "Rivals",
    provider: "espn",
    coverageStartSeason: 2010,
    coverageEndSeason: 2025,
    persons: PERSONS,
    ...over,
  };
}

describe("coverage phrasing", () => {
  it("never says all-time", () => {
    expect(acrossCoveragePhrase(2010, 2025)).toBe(
      "Across recorded league history from 2010–2025",
    );
    expect(acrossCoveragePhrase(2010, 2025).toLowerCase()).not.toMatch(/all.?time/);
  });

  it("uses the specific missing-data sentence", () => {
    expect(missingDatasetSentence("championships", "2018–2024")).toBe(
      "This league does not have recorded championships for 2018–2024.",
    );
    expect(missingDatasetSentence("championships", "2018–2024").toLowerCase()).not.toMatch(
      /i don't have that information/,
    );
  });
});

describe("formatDeterministicAdvisorAnswer", () => {
  it("answers reigning champion from the package with coverage", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who is the champ?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: CHAMP_PLAN,
      },
      baseSources({ championships: champSnap() }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.message).toMatch(/Across recorded championship history from 2012–2024/);
    expect(out?.message).toMatch(/Bruce Edwards/);
    expect(out?.message).toMatch(/2024/);
    expect(out?.message.toLowerCase()).not.toMatch(/championshipauthority|all.?time/);
  });

  it("does not silently merge medal vs standings-inferred title counts", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the most championships?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: LEADERBOARD_PLAN,
      },
      baseSources({ championships: champSnap() }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.message).toMatch(/Rod Sellers — 3/);
    expect(out?.message).toMatch(/not merged/);
    expect(out?.message).toMatch(/Rod Sellers — 4/);
    expect(out?.message.toLowerCase()).not.toMatch(/finalstanding-fallback/);
  });

  it("uses the specific missing sentence when championships are absent", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who is the champ?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: CHAMP_PLAN,
      },
      baseSources({ coverageStartSeason: 2018, coverageEndSeason: 2024, championships: null }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.message).toBe(
      "This league does not have recorded championships for 2018–2024.",
    );
  });

  it("returns a deterministic matchup-margin answer with tool name", () => {
    const margins: MatchupMarginAnalyticsResult = {
      query: { metric: "losses_by_margin", marginExact: 1, phase: "regular" },
      scoringPrecision: "integer",
      appliedBand: { minInclusive: 1, maxInclusive: 1, definition: "exact 1-point" },
      coverage: { recordedGames: 400, seasonFrom: 2010, seasonTo: 2025, phase: "regular" },
      unsupported: false,
      unsupportedReason: null,
      noData: false,
      missingDataset: null,
      ties: 1,
      averageAbsMargin: 11.2,
      closestGame: null,
      highlightGame: null,
      ownerMaxMargins: [],
      matchingGames: 40,
      byOwner: [
        { personId: "id:rod", displayName: "Rod Sellers", count: 11, gamesPlayed: 80 },
        { personId: "id:bruce", displayName: "Bruce Edwards", count: 8, gamesPlayed: 80 },
      ],
      byTeam: [],
    };
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the most one-point losses?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, phase: "regular" },
        owners: [],
        plan: MARGIN_PLAN,
      },
      baseSources({ margins, marginsAnswer: "Rod Sellers has the most one-point losses: 11." }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.tool).toBe("query_matchup_margins");
    expect(out?.message).toContain("Rod Sellers");
    expect(out?.message).toContain("11");
  });

  it("returns a deterministic draft-intelligence answer with tool name (RFSN-055)", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who reaches the most?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: DRAFT_INTEL_PLAN,
      },
      baseSources({
        draftAnswer:
          "Across recorded ADP-joined drafts from 2024–2025, reach frequency:\n1. LOZELL — 2 reaches / 2 ADP-joined picks (100%)\nNot all-time. ADP-joined coverage is 2024–2025. Recorded draft board also covers 2010–2025 without ADP.",
      }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.tool).toBe("query_draft_intelligence");
    expect(out?.message).toContain("LOZELL");
    expect(out?.message).toMatch(/2024–2025/);
    expect(out?.message).not.toMatch(/lacks draft strategy/i);
  });

  it("keeps a draft-intelligence follow-up on query_draft_intelligence (RFSN-055)", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "and who waits on quarterback?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: DRAFT_INTEL_PLAN,
      },
      baseSources({
        draftAnswer:
          "Across recorded drafts from 2010–2026, latest average QB selection:\n1. Jan Graham — round 9.0 (2 QB picks, earliest R6)\nNot all-time. Recorded draft coverage is 2010–2026.",
      }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.tool).toBe("query_draft_intelligence");
    expect(out?.message).toMatch(/Jan Graham/);
    expect(out?.message).not.toMatch(/lacks draft strategy/i);
  });
});

describe("formatH2HAdvisorAnswer", () => {
  it("answers Rod vs Bruce from H2H Authority with meeting coverage, not all-time", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Rod vs Bruce",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "rivalry_history", ownerNames: ["Rod", "Bruce"] },
        owners: [{ displayName: "Rod" }, { displayName: "Bruce" }],
        plan: H2H_PLAN,
      },
      baseSources({ h2h: h2hSnap() }),
    );
    const text = formatH2HAdvisorAnswer(pkg);
    expect(text).toMatch(/Across recorded meetings from 2018–2023/);
    expect(text).toMatch(/Regular season:.*Rod Sellers leads 2–1–0/);
    expect(text).toMatch(/Playoffs:/);
    expect(text).toMatch(/Meetings: 4/);
    expect(text).toMatch(/eliminated/);
    expect(text).toMatch(/Closest game/);
    expect(text).toMatch(/Biggest blowout/);
    expect(text).toMatch(/Not all-time/);
    expect(text.toLowerCase()).not.toMatch(/h2hauthority|championshipauthority/);
  });
});

describe("runAdvisorEvidencePath", () => {
  it("short-circuits reigning champion without LLM messages", async () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who is the champ?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: CHAMP_PLAN,
      },
      baseSources({ championships: champSnap() }),
    );
    const result = await runAdvisorEvidencePath(
      { message: "Who is the champ?", leagueId: "457622", userId: 1, season: 2026 },
      {
        assemblePackage: async () => pkg,
        buildFallbackMessages: async () => [{ role: "user", content: "should not run" }],
        getHistory: async () => [],
      },
    );
    expect(result.kind).toBe("deterministic");
    if (result.kind !== "deterministic") return;
    expect(result.message).toMatch(/Bruce Edwards/);
    expect(result.telemetry.deterministicShortCircuit).toBe(true);
    expect(result.telemetry.intent).toBe("reigning_champion");
    expect(result.telemetry.authoritiesUsed).toEqual(["championships"]);
    expect(result.telemetry.resolvedLeagueId).toBe("457622");
    expect(result.telemetry.resolvedScope.type).toBe("league_history");
    expect(result.telemetry.evidenceCoverage).toMatchObject({
      startSeason: 2010,
      endSeason: 2025,
    });
  });

  it("short-circuits H2H to the authority answer without LLM", async () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Rod vs Bruce",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "rivalry_history", ownerNames: ["Rod", "Bruce"] },
        owners: [{ displayName: "Rod" }, { displayName: "Bruce" }],
        plan: H2H_PLAN,
      },
      baseSources({ h2h: h2hSnap() }),
    );
    const result = await runAdvisorEvidencePath(
      {
        message: "Rod vs Bruce",
        leagueId: "457622",
        userId: 1,
        season: 2026,
        ownerAliases: OWNER_ALIASES,
      },
      {
        assemblePackage: async () => pkg,
        getHistory: async () => [],
        buildFallbackMessages: async () => [{ role: "user", content: "should not run" }],
      },
    );
    expect(result.kind).toBe("deterministic");
    if (result.kind !== "deterministic") return;
    expect(result.message).toMatch(/Across recorded meetings from 2018–2023/);
    expect(result.telemetry.deterministicShortCircuit).toBe(true);
    expect(result.telemetry.intent).toBe("h2h_pair");
    expect(result.telemetry.authoritiesUsed).toEqual(["owner_identity", "h2h", "playoffs"]);
    expect(pkg.owners.every((o) => o.status === "resolved")).toBe(true);
  });

  it("does not pull full-history narrative for current-season coaching", async () => {
    const result = await runAdvisorEvidencePath(
      {
        message: "Who should I start this week?",
        leagueId: "457622",
        userId: 1,
        season: 2026,
      },
      {
        assemblePackage: async () => {
          throw new Error("must not assemble historical package for current-season");
        },
        buildFallbackMessages: async () => [
          { role: "system", content: "current-season advisor context" },
          { role: "user", content: "Who should I start this week?" },
        ],
      },
    );
    expect(result.kind).toBe("llm");
    if (result.kind !== "llm") return;
    expect(String(result.messages[0]?.content)).toBe("current-season advisor context");
    expect(result.telemetry.intent).toBe("advisor_fallback");
    expect(result.telemetry.deterministicShortCircuit).toBe(false);
    expect(result.telemetry.authoritiesUsed).toEqual([]);
    expect(result.telemetry.resolvedScope.type).toBe("current_season");
  });

  it("resolves owner aliases before H2H evidence assembly", async () => {
    let sawOwners: Array<{ displayName: string }> | null = null;
    await runAdvisorEvidencePath(
      {
        message: "Rod vs Bruce",
        leagueId: "457622",
        userId: 1,
        season: 2026,
        ownerAliases: OWNER_ALIASES,
      },
      {
        assemblePackage: async (input) => {
          sawOwners = input.owners;
          return buildAdvisorEvidencePackage(input, baseSources({ h2h: h2hSnap() }));
        },
        getHistory: async () => [],
      },
    );
    expect(sawOwners?.map((o) => o.displayName)).toEqual(["Rod Sellers", "Bruce Edwards"]);
  });

  it("RFSN-053D returns visual gallery and merges follow-ups until Clear", async () => {
    const {
      clearAllAdvisorConversationContext,
      getAdvisorConversationContext,
    } = await import("./advisorConversationContext");
    clearAllAdvisorConversationContext();

    const calls: Array<{ message: string; priorFilter?: unknown }> = [];
    const tryGallery = async (args: {
      message: string;
      priorFilter?: unknown;
      lastIntent?: string | null;
    }) => {
      calls.push({ message: args.message, priorFilter: args.priorFilter });
      const noMercy = /no mercy/i.test(args.message);
      const playoffFollow = /playoff ones/i.test(args.message);
      return {
        selected: true as const,
        toolName: "query_matchup_gallery" as const,
        query: {
          ownerName: "Rod Sellers",
          noMercy: true,
          marginMin: 50,
          result: "win" as const,
          ...(playoffFollow ? { phase: "playoffs" as const } : {}),
        },
        preset: noMercy ? ("no_mercy" as const) : ("custom" as const),
        answer: playoffFollow
          ? "You have 3 No Mercy Rule victories in recorded playoff matchups."
          : "You have 22 No Mercy Rule victories across recorded league history.",
        analytics: {} as never,
        visual: {
          type: "matchup_gallery" as const,
          preset: noMercy ? ("no_mercy" as const) : ("custom" as const),
          filters: {
            owner: "Rod Sellers",
            marginMin: 50,
            winsOnly: true,
            ...(playoffFollow ? { phase: "playoffs" as const } : {}),
          },
          result: { matchups: [], total: playoffFollow ? 3 : 22, summary: "", empty: false, emptyReason: null, seeAllHref: "/league/history/matchups", filter: {}, coverage: {} as never },
          href: "/league/history/matchups?noMercy=1&ownerName=Rod+Sellers",
        },
      };
    };

    const first = await runAdvisorEvidencePath(
      {
        message: "Show me my No Mercy wins.",
        leagueId: "457622",
        userId: 1,
        season: 2026,
        ownerAliases: OWNER_ALIASES,
      },
      {
        tryGallery: tryGallery as never,
        resolveViewerOwnerName: async () => "Rod Sellers",
        assemblePackage: async () => {
          throw new Error("gallery must not assemble historical package");
        },
        getHistory: async () => [],
      },
    );
    expect(first.kind).toBe("deterministic");
    if (first.kind !== "deterministic") return;
    expect(first.tool).toBe("query_matchup_gallery");
    expect(first.visual?.type).toBe("matchup_gallery");
    if (first.visual?.type === "matchup_gallery") {
      expect(first.visual.filters.owner).toBe("Rod Sellers");
      expect(first.visual.filters.winsOnly).toBe(true);
    }
    expect(first.message).toMatch(/22 No Mercy/);
    expect(getAdvisorConversationContext(1, "457622")?.lastIntent).toBe("matchup_gallery");
    expect(getAdvisorConversationContext(1, "457622")?.lastGalleryFilter?.noMercy).toBe(true);

    const follow = await runAdvisorEvidencePath(
      {
        message: "Show only the playoff ones.",
        leagueId: "457622",
        userId: 1,
        season: 2026,
        ownerAliases: OWNER_ALIASES,
      },
      {
        tryGallery: tryGallery as never,
        resolveViewerOwnerName: async () => "Rod Sellers",
        assemblePackage: async () => {
          throw new Error("gallery follow-up must not assemble historical package");
        },
        getHistory: async () => [],
      },
    );
    expect(follow.kind).toBe("deterministic");
    if (follow.kind !== "deterministic") return;
    expect(follow.visual?.type).toBe("matchup_gallery");
    if (follow.visual?.type === "matchup_gallery") {
      expect(follow.visual.filters.phase).toBe("playoffs");
    }
    expect(calls[1]?.priorFilter).toMatchObject({ noMercy: true, ownerName: "Rod Sellers" });

    const { clearAdvisorConversationContext } = await import("./advisorConversationContext");
    clearAdvisorConversationContext(1, "457622");
    expect(getAdvisorConversationContext(1, "457622")).toBeNull();

    const afterClear = await runAdvisorEvidencePath(
      {
        message: "Show only the playoff ones.",
        leagueId: "457622",
        userId: 1,
        season: 2026,
        ownerAliases: OWNER_ALIASES,
      },
      {
        tryGallery: tryGallery as never,
        resolveViewerOwnerName: async () => "Rod Sellers",
        assemblePackage: async () => {
          throw new Error("should not assemble");
        },
        getHistory: async () => [],
      },
    );
    expect(afterClear.kind).toBe("deterministic");
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.priorFilter).toBeUndefined();
  });

  it("RFSN-053D unrelated intent clears gallery context", async () => {
    const { clearAllAdvisorConversationContext, getAdvisorConversationContext } = await import(
      "./advisorConversationContext"
    );
    clearAllAdvisorConversationContext();
    await runAdvisorEvidencePath(
      {
        message: "Show me my No Mercy wins.",
        leagueId: "457622",
        userId: 9,
        season: 2026,
      },
      {
        tryGallery: async () => ({
          selected: true as const,
          toolName: "query_matchup_gallery" as const,
          query: { ownerName: "Rod Sellers", noMercy: true, marginMin: 50, result: "win" as const },
          preset: "no_mercy",
          answer: "You have 22 No Mercy Rule victories.",
          analytics: {} as never,
          visual: {
            type: "matchup_gallery",
            preset: "no_mercy",
            filters: { owner: "Rod Sellers", marginMin: 50, winsOnly: true },
            result: {} as never,
            href: "/league/history/matchups",
          },
        }),
        resolveViewerOwnerName: async () => "Rod Sellers",
        getHistory: async () => [],
      },
    );
    expect(getAdvisorConversationContext(9, "457622")?.lastGalleryFilter?.noMercy).toBe(true);

    await runAdvisorEvidencePath(
      {
        message: "Who has the most championships?",
        leagueId: "457622",
        userId: 9,
        season: 2026,
      },
      {
        assemblePackage: async () =>
          buildAdvisorEvidencePackage(
            {
              message: "Who has the most championships?",
              leagueId: "457622",
              scope: LEAGUE_HISTORY,
              owners: [],
              plan: LEADERBOARD_PLAN,
            },
            baseSources({ championships: champSnap() }),
          ),
        getHistory: async () => [],
      },
    );
    expect(getAdvisorConversationContext(9, "457622")?.lastIntent).toBe("championship_leaderboard");
    expect(getAdvisorConversationContext(9, "457622")?.lastGalleryFilter).toBeUndefined();
  });

  it("RFSN-055C keeps Draft Intelligence follow-ups on query_draft_intelligence", async () => {
    const {
      clearAllAdvisorConversationContext,
      getAdvisorConversationContext,
    } = await import("./advisorConversationContext");
    clearAllAdvisorConversationContext();

    const reachQuery = { metric: "reach_frequency" as const, topN: 5 };
    const assemble = async (message: string) =>
      buildAdvisorEvidencePackage(
        {
          message,
          leagueId: "457622",
          scope: LEAGUE_HISTORY,
          owners: [],
          plan: DRAFT_INTEL_PLAN,
        },
        baseSources({
          draftAnswer: message.startsWith("What about QBs")
            ? "Reach frequency is computed league-wide by owner and cannot be filtered to quarterbacks only."
            : message.startsWith("Only 2024")
              ? "Across recorded ADP-joined drafts from 2024, reach frequency:\n1. Mark Deroux — 34 reaches / 49 picks (69%)"
              : "Across recorded ADP-joined drafts from 2018–2024, reach frequency:\n1. Mark Deroux — 34 reaches / 49 picks (69%)",
          draftIntelligenceQuery:
            message.startsWith("Only 2024") || message.startsWith("What about QBs")
              ? { ...reachQuery, seasonFrom: 2024, seasonTo: 2024 }
              : reachQuery,
          draftIntelligenceLeader: "Mark Deroux",
        }),
      );

    const first = await runAdvisorEvidencePath(
      { message: "Who reaches the most?", leagueId: "457622", userId: 7, season: 2026 },
      { assemblePackage: async () => assemble("Who reaches the most?"), getHistory: async () => [] },
    );
    expect(first.kind).toBe("deterministic");
    if (first.kind !== "deterministic") return;
    expect(first.tool).toBe("query_draft_intelligence");
    expect(getAdvisorConversationContext(7, "457622")?.lastDraftIntelligenceQuery?.metric).toBe(
      "reach_frequency",
    );

    const season = await runAdvisorEvidencePath(
      { message: "Only 2024.", leagueId: "457622", userId: 7, season: 2026 },
      { assemblePackage: async () => assemble("Only 2024."), getHistory: async () => [] },
    );
    expect(season.kind).toBe("deterministic");
    if (season.kind !== "deterministic") return;
    expect(season.tool).toBe("query_draft_intelligence");
    expect(season.telemetry.intent).toBe("draft_intelligence");

    const position = await runAdvisorEvidencePath(
      { message: "What about QBs?", leagueId: "457622", userId: 7, season: 2026 },
      { assemblePackage: async () => assemble("What about QBs?"), getHistory: async () => [] },
    );
    expect(position.kind).toBe("deterministic");
    if (position.kind !== "deterministic") return;
    expect(position.tool).toBe("query_draft_intelligence");
    expect(position.telemetry.intent).toBe("draft_intelligence");
    expect(position.message).toMatch(/cannot be filtered to quarterbacks/i);
  });

  it("RFSN-055C unrelated intent and Clear exit Draft Intelligence context", async () => {
    const {
      clearAllAdvisorConversationContext,
      clearAdvisorConversationContext,
      getAdvisorConversationContext,
      setAdvisorConversationContext,
    } = await import("./advisorConversationContext");
    clearAllAdvisorConversationContext();

    setAdvisorConversationContext(8, "457622", {
      lastResolvedOwners: [],
      lastIntent: "draft_intelligence",
      lastScope: LEAGUE_HISTORY,
      lastLeagueId: "457622",
      lastDraftIntelligenceQuery: { metric: "reach_frequency", topN: 5 },
    });

    const champ = await runAdvisorEvidencePath(
      { message: "Who has the most championships?", leagueId: "457622", userId: 8, season: 2026 },
      {
        assemblePackage: async () =>
          buildAdvisorEvidencePackage(
            {
              message: "Who has the most championships?",
              leagueId: "457622",
              scope: LEAGUE_HISTORY,
              owners: [],
              plan: LEADERBOARD_PLAN,
            },
            baseSources({ championships: champSnap() }),
          ),
        getHistory: async () => [],
      },
    );
    expect(champ.kind).toBe("deterministic");
    expect(getAdvisorConversationContext(8, "457622")?.lastIntent).toBe("championship_leaderboard");
    expect(getAdvisorConversationContext(8, "457622")?.lastDraftIntelligenceQuery).toBeUndefined();

    setAdvisorConversationContext(8, "457622", {
      lastResolvedOwners: [],
      lastIntent: "draft_intelligence",
      lastScope: LEAGUE_HISTORY,
      lastLeagueId: "457622",
      lastDraftIntelligenceQuery: { metric: "reach_frequency", topN: 5, seasonFrom: 2024, seasonTo: 2024 },
    });
    clearAdvisorConversationContext(8, "457622");

    const afterClear = await runAdvisorEvidencePath(
      { message: "Only 2024.", leagueId: "457622", userId: 8, season: 2026 },
      {
        assemblePackage: async () => {
          throw new Error("must not inherit draft intelligence after Clear");
        },
        buildFallbackMessages: async () => [{ role: "user", content: "fallback" }],
        getHistory: async () => [],
      },
    );
    expect(afterClear.kind).toBe("llm");
    expect(afterClear.telemetry.intent).toBe("advisor_fallback");
  });
});
