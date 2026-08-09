import { describe, expect, it } from "vitest";
import {
  formatCareerWinPctAnswer,
  formatDeterministicAdvisorAnswer,
  formatPlayoffEliminationsAnswer,
  formatWorstCareerRecordAnswer,
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
  { memberId: "reg-id", displayName: "Reginald Sellers", aliases: ["reginald sellers", "reginald"] },
  { memberId: "demetri-id", displayName: "Demetri Clark", aliases: ["demetri clark", "demetri"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
  { memberId: "lozell-id", displayName: "LOZELL STYLES", aliases: ["lozell styles", "lozell"] },
];

const PERSONS = [
  {
    canonicalPersonId: "id:reg",
    canonicalName: "Reginald Sellers",
    resolvedBy: "espn-id",
    aliases: ["reginald sellers", "reginald"],
  },
  {
    canonicalPersonId: "id:demetri",
    canonicalName: "Demetri Clark",
    resolvedBy: "espn-id",
    aliases: ["demetri clark", "demetri"],
  },
  {
    canonicalPersonId: "id:bruce",
    canonicalName: "Bruce Edwards",
    resolvedBy: "espn-id",
    aliases: ["bruce edwards", "bruce"],
  },
];

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
      ],
    },
    careerRecords: [
      {
        ownerKey: "id:reg",
        ownerName: "Reginald Sellers",
        wins: 10,
        losses: 3,
        ties: 0,
        games: 13,
        winPct: 10 / 13,
        seasonsActive: 1,
      },
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
    playoffEliminations: [
      { ownerKey: "id:demetri", ownerName: "Demetri Clark", inflicted: 8, topVictimName: "LOZELL STYLES", topVictimCount: 5 },
      { ownerKey: "id:lozell", ownerName: "LOZELL STYLES", inflicted: 3 },
    ],
    ...over,
  };
}

describe("RFSN-052I career qualification", () => {
  it("excludes short-tenure owners from best/worst career leaderboards", () => {
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
    expect(pkg.careerQualification?.minSeasons).toBe(2);
    expect(pkg.careerQualification?.unqualified.some((r) => r.ownerName === "Reginald Sellers")).toBe(true);
    const best = formatCareerWinPctAnswer(pkg);
    expect(best).toMatch(/Demetri Clark/);
    expect(best).not.toMatch(/Reginald Sellers/);
    expect(best).toMatch(/league median/);
    const worst = formatWorstCareerRecordAnswer(pkg);
    expect(worst).toMatch(/Bruce Edwards/);
    expect(worst).not.toMatch(/Reginald Sellers/);
  });

  it("still answers a named short-tenure owner from the actual HoF row", () => {
    const p = planAdvisorEvidenceFromMessage("How good was Reginald Sellers?", {
      leagueId: "457622",
      ownerAliases: OWNERS,
      currentSeason: 2026,
    });
    expect(p.intent).toBe("career_win_pct");
    expect(p.fallbackToAdvisorContext).toBe(false);

    const pkg = buildAdvisorEvidencePackage(
      {
        message: "How good was Reginald Sellers?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["Reginald Sellers"] },
        owners: [{ displayName: "Reginald Sellers", memberId: "reg-id" }],
        plan: p,
      },
      sources(),
    );
    const text = formatCareerWinPctAnswer(pkg);
    expect(text).toMatch(/Reginald Sellers/);
    expect(text).toMatch(/10–3–0/);
    expect(text).toMatch(/13 regular-season games/);
    expect(text).toMatch(/Below the career leaderboard bar/);
  });

  it("routes most efficient owner to the same qualified career win% path", () => {
    const p = planAdvisorEvidenceFromMessage("Who is the most efficient owner?", {
      leagueId: "457622",
      ownerAliases: OWNERS,
      currentSeason: 2026,
    });
    expect(p.intent).toBe("career_win_pct");
    expect(p.deterministicFirst).toBe(true);
    expect(p.fallbackToAdvisorContext).toBe(false);
  });
});

describe("RFSN-052I playoff elimination semantics", () => {
  it("labels championship-bracket elims when scope is proven", () => {
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
      sources({
        playoffScope: {
          kind: "championship_bracket_eliminations",
          note: "Championship bracket only (ESPN WINNERS_BRACKET). Consolation excluded.",
          playoffMeetings: 40,
          winnersBracketMeetings: 22,
          consolationMeetings: 18,
          unknownTierMeetings: 0,
          placementGamesExcluded: 2,
        },
      }),
    );
    const text = formatPlayoffEliminationsAnswer(pkg, "playoff_eliminations");
    expect(text).toMatch(/championship-bracket playoff eliminations/i);
    expect(text).toMatch(/Consolation excluded/i);
    expect(text).toMatch(/Demetri Clark/);
    const villain = formatPlayoffEliminationsAnswer(pkg, "playoff_villain");
    expect(villain).toMatch(/championship-bracket eliminations/i);
  });

  it("does not call unverified isPlayoff wins eliminations", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the most playoff eliminations?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, phase: "playoffs" },
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
      sources({
        playoffScope: {
          kind: "recorded_playoff_wins",
          note: "Recorded playoff wins (isPlayoff meetings).",
          playoffMeetings: 40,
          winnersBracketMeetings: 0,
          consolationMeetings: 0,
          unknownTierMeetings: 40,
          placementGamesExcluded: 0,
        },
      }),
    );
    const text = formatPlayoffEliminationsAnswer(pkg, "playoff_eliminations");
    expect(text).toMatch(/recorded playoff wins/i);
    expect(text).not.toMatch(/championship-bracket playoff eliminations inflicted/i);
    expect(text).toMatch(/not proven eliminations/i);
  });
});

describe("RFSN-052I regression — prior deterministic facts still route", () => {
  it("keeps championship leaderboard, compare, and H2H intents", () => {
    expect(
      planAdvisorEvidenceFromMessage("Who has the most championships?", {
        ownerAliases: OWNERS,
        currentSeason: 2026,
      }).intent,
    ).toBe("championship_leaderboard");
    expect(
      planAdvisorEvidenceFromMessage("Who has more championships, Demetri or LOZELL?", {
        ownerAliases: OWNERS,
        currentSeason: 2026,
      }).intent,
    ).toBe("championship_compare");
    expect(
      planAdvisorEvidenceFromMessage("Compare Demetri Clark and LOZELL STYLES.", {
        ownerAliases: OWNERS,
        currentSeason: 2026,
      }).intent,
    ).toBe("h2h_pair");
    expect(
      planAdvisorEvidenceFromMessage("Who has the most one-point losses?", {
        ownerAliases: OWNERS,
        currentSeason: 2026,
      }).intent,
    ).toBe("matchup_margins");
    expect(
      planAdvisorEvidenceFromMessage("Who has the most 50-point blowout wins?", {
        ownerAliases: OWNERS,
        currentSeason: 2026,
      }).intent,
    ).toBe("matchup_margins");
    expect(
      planAdvisorEvidenceFromMessage("who has the largest margin of victory in a single game", {
        ownerAliases: OWNERS,
        currentSeason: 2026,
      }).intent,
    ).toBe("matchup_margins");
  });

  it("championship leaderboard still formats ranked totals", () => {
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
  });
});
