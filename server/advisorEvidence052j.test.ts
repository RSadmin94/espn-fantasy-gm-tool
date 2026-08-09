import { describe, expect, it } from "vitest";
import {
  formatDeterministicAdvisorAnswer,
  formatOwnerChampionshipAnswer,
  formatPodiumPlacementAnswer,
  acrossChampionshipHistoryPhrase,
  acrossCoveragePhrase,
} from "./advisorEvidenceExecutor";
import { planAdvisorEvidenceFromMessage } from "./advisorEvidencePlanner";
import {
  buildAdvisorEvidencePackage,
  type AdvisorEvidenceSources,
  type ChampionshipSnapshot,
} from "./advisorEvidencePackage";
import type { AdvisorEvidencePlan } from "./advisorEvidencePlanner";
import type { AdvisorQuestionScope } from "./advisorScopeResolver";
import {
  formatPartialLegacyUnavailable,
  isPartialLegacyUnsupportedAsk,
} from "./championshipAuthority";

const LEAGUE_HISTORY: AdvisorQuestionScope = {
  scopeType: "league_history",
  startSeason: null,
  endSeason: null,
  phase: "all",
  ownerNames: [],
  confidence: "medium",
  explicitSeasonRequested: false,
};

const OWNER_CHAMP_PLAN: AdvisorEvidencePlan = {
  intent: "owner_championships",
  authorities: ["owner_identity", "championships"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["title_counts"],
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

const PERSONS = [
  {
    canonicalPersonId: "id:lozell",
    canonicalName: "LOZELL STYLES",
    resolvedBy: "espn-id",
    aliases: ["lozell styles", "lozell"],
  },
  {
    canonicalPersonId: "id:demetri",
    canonicalName: "Demetri Clark",
    resolvedBy: "espn-id",
    aliases: ["demetri clark", "demetri"],
  },
  {
    canonicalPersonId: "id:graham",
    canonicalName: "Christian Graham",
    resolvedBy: "espn-id",
    aliases: ["christian graham", "graham"],
  },
];

function champSnap(): ChampionshipSnapshot {
  return {
    latestCompletedSeason: 2025,
    reigningKey: "id:demetri",
    championshipCoverageStart: 2009,
    championshipCoverageEnd: 2025,
    matchupCoverageStart: 2010,
    matchupCoverageEnd: 2025,
    partialLegacySeasons: [2009],
    seasons: [
      {
        season: 2009,
        ownerKey: "id:lozell",
        ownerName: "LOZELL STYLES",
        source: "medal",
        coverageKind: "partial_legacy",
        runnerUpKey: "id:demetri",
        runnerUpName: "Demetri Clark",
        thirdPlaceKey: "id:graham",
        thirdPlaceName: "Christian Graham",
      },
      { season: 2011, ownerKey: "id:lozell", ownerName: "LOZELL STYLES", source: "medal", coverageKind: "full" },
      { season: 2013, ownerKey: "id:graham", ownerName: "Christian Graham", source: "medal", coverageKind: "full" },
      { season: 2017, ownerKey: "id:graham", ownerName: "Christian Graham", source: "medal", coverageKind: "full" },
      { season: 2020, ownerKey: "id:demetri", ownerName: "Demetri Clark", source: "medal", coverageKind: "full" },
      { season: 2021, ownerKey: "id:lozell", ownerName: "LOZELL STYLES", source: "medal", coverageKind: "full" },
      { season: 2023, ownerKey: "id:graham", ownerName: "Christian Graham", source: "medal", coverageKind: "full" },
      { season: 2024, ownerKey: "id:demetri", ownerName: "Demetri Clark", source: "medal", coverageKind: "full" },
      { season: 2025, ownerKey: "id:demetri", ownerName: "Demetri Clark", source: "medal", coverageKind: "full" },
    ],
  };
}

function sources(over: Partial<AdvisorEvidenceSources> = {}): AdvisorEvidenceSources {
  return {
    leagueName: "ATLANTAS FINEST FF",
    provider: "espn",
    coverageStartSeason: 2010,
    coverageEndSeason: 2025,
    persons: PERSONS,
    championships: champSnap(),
    ...over,
  };
}

describe("RFSN-052J partial legacy championships in Advisor", () => {
  it("counts a partial-legacy champion in named-owner totals", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "How many championships does LOZELL STYLES have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["LOZELL STYLES"] },
        owners: [{ displayName: "LOZELL STYLES" }],
        plan: OWNER_CHAMP_PLAN,
      },
      sources(),
    );
    const text = formatOwnerChampionshipAnswer(pkg);
    expect(text).toMatch(
      /Across recorded championship history from 2009–2025, LOZELL STYLES has 3 championships \(2009, 2011, 2021\)/,
    );
    expect(pkg.championships.partialLegacySeasons).toContain(2009);
    expect(text.toLowerCase()).not.toMatch(/all-time/);
  });

  it("keeps runner-up and third place available on the podium block", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "What podium finishes does LOZELL have, including runner-up?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["LOZELL STYLES"] },
        owners: [{ displayName: "LOZELL STYLES" }],
        plan: OWNER_CHAMP_PLAN,
      },
      sources(),
    );
    const demetri = pkg.championships.podiumByKey.find((p) => p.key === "id:demetri");
    const graham = pkg.championships.podiumByKey.find((p) => p.key === "id:graham");
    expect(demetri?.runnerUpSeasons).toContain(2009);
    expect(graham?.thirdSeasons).toContain(2009);
    const text = formatOwnerChampionshipAnswer(pkg);
    expect(text).toMatch(/LOZELL STYLES has 3 championships/);
  });

  it("does not fabricate matchup history for a partial legacy season", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "What was LOZELL’s 2009 regular-season record?",
        leagueId: "457622",
        scope: {
          ...LEAGUE_HISTORY,
          scopeType: "single_season",
          startSeason: 2009,
          endSeason: 2009,
          explicitSeasonRequested: true,
          ownerNames: ["LOZELL STYLES"],
        },
        owners: [{ displayName: "LOZELL STYLES" }],
        plan: {
          intent: "season_matchup_detail",
          authorities: ["owner_identity", "championships", "league_records"],
          deterministicFirst: true,
          narrativeAllowed: false,
          requiredEvidence: ["season_coverage"],
          fallbackToAdvisorContext: false,
        },
      },
      sources({ careerRecords: [] }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.message).toBe(formatPartialLegacyUnavailable(2009));
    expect(out?.message).not.toMatch(/\d+–\d+–\d+/);
    expect(isPartialLegacyUnsupportedAsk(
      "What was the 2009 championship score?",
      { startSeason: 2009, endSeason: 2009 },
      [2009],
    )).toBe(2009);
    expect(isPartialLegacyUnsupportedAsk(
      "Who did LOZELL beat in Week 8 of 2009?",
      { startSeason: 2009, endSeason: 2009 },
      [2009],
    )).toBe(2009);
    expect(planAdvisorEvidenceFromMessage("What was the 2009 championship score?", { leagueId: "457622" }).intent).toBe(
      "season_matchup_detail",
    );
    expect(
      formatDeterministicAdvisorAnswer(
        buildAdvisorEvidencePackage(
          {
            message: "What was the 2009 championship score?",
            leagueId: "457622",
            scope: {
              ...LEAGUE_HISTORY,
              scopeType: "single_season",
              startSeason: 2009,
              endSeason: 2009,
              explicitSeasonRequested: true,
            },
            owners: [],
            plan: {
              intent: "season_matchup_detail",
              authorities: ["championships"],
              deterministicFirst: true,
              narrativeAllowed: false,
              requiredEvidence: ["season_coverage"],
              fallbackToAdvisorContext: false,
            },
          },
          sources(),
        ),
      )?.message,
    ).toBe(formatPartialLegacyUnavailable(2009));
    expect(
      formatDeterministicAdvisorAnswer(
        buildAdvisorEvidencePackage(
          {
            message: "Who did LOZELL play in Week 8 of 2009?",
            leagueId: "457622",
            scope: {
              ...LEAGUE_HISTORY,
              scopeType: "single_season",
              startSeason: 2009,
              endSeason: 2009,
              explicitSeasonRequested: true,
              ownerNames: ["LOZELL STYLES"],
            },
            owners: [{ displayName: "LOZELL STYLES" }],
            plan: {
              intent: "season_matchup_detail",
              authorities: ["championships"],
              deterministicFirst: true,
              narrativeAllowed: false,
              requiredEvidence: ["season_coverage"],
              fallbackToAdvisorContext: false,
            },
          },
          sources(),
        ),
      )?.message,
    ).toBe(formatPartialLegacyUnavailable(2009));
  });

  it("leaves full-data season title years unchanged beside the partial year", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "How many championships does LOZELL STYLES have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["LOZELL STYLES"] },
        owners: [{ displayName: "LOZELL STYLES" }],
        plan: OWNER_CHAMP_PLAN,
      },
      sources(),
    );
    const lozell = pkg.championships.medalTitles.find((r) => r.key === "id:lozell");
    expect(lozell?.seasons).toEqual([2009, 2011, 2021]);
    expect(pkg.championships.medalTitles.find((r) => r.key === "id:graham")?.seasons).toEqual([
      2013, 2017, 2023,
    ]);
  });

  it("championship leaderboard includes the partial-legacy title and matches medal totals", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the most championships?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: LEADERBOARD_PLAN,
      },
      sources(),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.message).toMatch(/Across recorded championship history from 2009–2025/);
    expect(out?.message).toMatch(/LOZELL STYLES — 3 \(2009, 2011, 2021\)/);
    expect(out?.message).toMatch(/Christian Graham — 3/);
    expect(out?.message).toMatch(/Demetri Clark — 3/);
    expect(pkg.championships.medalTitles.map((r) => `${r.name}:${r.titles}`)).toEqual([
      "Christian Graham:3",
      "Demetri Clark:3",
      "LOZELL STYLES:3",
    ]);
  });

  it("named-owner totals match History-style medal seasons including partial legacy", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "How many championships does LOZELL STYLES have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["LOZELL STYLES"] },
        owners: [{ displayName: "LOZELL STYLES" }],
        plan: OWNER_CHAMP_PLAN,
      },
      sources(),
    );
    const historySeasons = pkg.championships.medalTitles.find((r) => r.key === "id:lozell")?.seasons;
    expect(historySeasons).toEqual([2009, 2011, 2021]);
    expect(formatOwnerChampionshipAnswer(pkg)).toContain("2009, 2011, 2021");
  });

  it("uses championship coverage language for titles and matchup coverage for H2H-style ranges", () => {
    expect(acrossChampionshipHistoryPhrase(2009, 2025)).toBe(
      "Across recorded championship history from 2009–2025",
    );
    expect(acrossCoveragePhrase(2010, 2025)).toBe("Across recorded league history from 2010–2025");
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "How many championships does LOZELL STYLES have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["LOZELL STYLES"] },
        owners: [{ displayName: "LOZELL STYLES" }],
        plan: OWNER_CHAMP_PLAN,
      },
      sources(),
    );
    expect(pkg.championships.coverageStartSeason).toBe(2009);
    expect(pkg.league.coverageStartSeason).toBe(2010);
    expect(pkg.coverageNotes.some((n) => /Championship history coverage is 2009–2025/.test(n))).toBe(true);
    expect(pkg.coverageNotes.some((n) => /Matchup \/ record coverage is recorded 2010–2025/.test(n))).toBe(true);
    expect(formatOwnerChampionshipAnswer(pkg)).toMatch(/championship history from 2009–2025/);
    expect(formatOwnerChampionshipAnswer(pkg)).not.toMatch(/league history from 2010–2025/);
  });

  it("answers runner-up and third place from recorded podium without inventing scores", () => {
    expect(planAdvisorEvidenceFromMessage("Who was runner-up in 2009?", { leagueId: "457622" }).intent).toBe(
      "podium_placement",
    );
    const ruPkg = buildAdvisorEvidencePackage(
      {
        message: "Who was runner-up in 2009?",
        leagueId: "457622",
        scope: {
          ...LEAGUE_HISTORY,
          scopeType: "single_season",
          startSeason: 2009,
          endSeason: 2009,
          explicitSeasonRequested: true,
        },
        owners: [],
        plan: {
          intent: "podium_placement",
          authorities: ["championships"],
          deterministicFirst: true,
          narrativeAllowed: false,
          requiredEvidence: ["podium"],
          fallbackToAdvisorContext: false,
        },
      },
      sources(),
    );
    const ru = formatPodiumPlacementAnswer(ruPkg);
    expect(ru).toMatch(/2009 runner-up is Demetri Clark/);
    expect(ru).not.toMatch(/detailed matchup history is unavailable/);
    const thirdPkg = buildAdvisorEvidencePackage(
      {
        message: "Who finished third in 2009?",
        leagueId: "457622",
        scope: {
          ...LEAGUE_HISTORY,
          scopeType: "single_season",
          startSeason: 2009,
          endSeason: 2009,
          explicitSeasonRequested: true,
        },
        owners: [],
        plan: {
          intent: "podium_placement",
          authorities: ["championships"],
          deterministicFirst: true,
          narrativeAllowed: false,
          requiredEvidence: ["podium"],
          fallbackToAdvisorContext: false,
        },
      },
      sources(),
    );
    expect(formatDeterministicAdvisorAnswer(thirdPkg)?.message).toMatch(
      /2009 third-place finisher is Christian Graham/,
    );
  });

  it("does not invent a second title from alias merge of the same season", () => {
    const snap = champSnap();
    snap.seasons = [
      ...snap.seasons,
      {
        season: 2009,
        ownerKey: "id:lozell",
        ownerName: "LOZELL STYLES",
        source: "medal",
        coverageKind: "partial_legacy",
      },
    ];
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "How many championships does LOZELL STYLES have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["LOZELL STYLES"] },
        owners: [{ displayName: "LOZELL STYLES" }],
        plan: OWNER_CHAMP_PLAN,
      },
      sources({ championships: snap }),
    );
    expect(pkg.championships.medalTitles.find((r) => r.key === "id:lozell")?.titles).toBe(3);
  });
});
