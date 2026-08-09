import { describe, expect, it } from "vitest";
import {
  buildAdvisorEvidencePackage,
  qualifyCoverage,
  resolveOwnersAgainstIdentity,
  type AdvisorEvidenceSources,
  type ChampionshipSnapshot,
  type H2HSnapshot,
} from "./advisorEvidencePackage";
import type { AdvisorEvidencePlan } from "./advisorEvidencePlanner";
import type { AdvisorQuestionScope } from "./advisorScopeResolver";
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

const H2H_PLAN: AdvisorEvidencePlan = {
  intent: "h2h_pair",
  authorities: ["owner_identity", "h2h", "rivalry", "playoffs"],
  deterministicFirst: true,
  narrativeAllowed: true,
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

describe("qualifyCoverage", () => {
  it("never labels recorded history as all-time (full recorded span)", () => {
    const notes = qualifyCoverage(LEAGUE_HISTORY, 2010, 2025);
    expect(notes.some((n) => /not all-time/i.test(n))).toBe(true);
    expect(notes.some((n) => /2010–2025/.test(n))).toBe(true);
    expect(notes.join(" ").toLowerCase()).not.toMatch(/\ball time\b/);
  });

  it("qualifies partial history when request exceeds coverage", () => {
    const scope: AdvisorQuestionScope = {
      ...LEAGUE_HISTORY,
      scopeType: "season_range",
      startSeason: 2005,
      endSeason: 2026,
      explicitSeasonRequested: true,
    };
    const notes = qualifyCoverage(scope, 2018, 2024);
    expect(notes.some((n) => /partial history/i.test(n))).toBe(true);
    expect(notes.some((n) => /starts 2018/.test(n))).toBe(true);
    expect(notes.some((n) => /ends 2024/.test(n))).toBe(true);
  });
});

describe("resolveOwnersAgainstIdentity", () => {
  it("resolves owner aliases to canonical identity before aggregation", () => {
    const resolved = resolveOwnersAgainstIdentity(
      [{ displayName: "Rod" }, { displayName: "Bruce" }],
      PERSONS,
    );
    expect(resolved[0]).toMatchObject({
      displayName: "Rod Sellers",
      canonicalPersonId: "id:rod",
      status: "resolved",
    });
    expect(resolved[1]).toMatchObject({
      displayName: "Bruce Edwards",
      canonicalPersonId: "id:bruce",
      status: "resolved",
    });
  });

  it("leaves unknown aliases unresolved and does not invent an id", () => {
    const resolved = resolveOwnersAgainstIdentity([{ displayName: "LOZELL" }], PERSONS);
    expect(resolved[0]?.status).toBe("unresolved");
    expect(resolved[0]?.canonicalPersonId).toBeNull();
  });
});

describe("buildAdvisorEvidencePackage", () => {
  it("emits championship facts with provenance and recorded coverage (not all-time)", () => {
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
    expect(pkg.league.coverageStartSeason).toBe(2010);
    expect(pkg.championships.reigningName).toBe("Bruce Edwards");
    const medalFact = pkg.facts.find((f) => f.id === "titles_medal");
    expect(medalFact?.sourceAuthority).toBe("championships");
    expect(medalFact?.sourceScope).toMatch(/medals/);
    expect(medalFact?.fact.toLowerCase()).not.toMatch(/all time/);
    expect(medalFact?.fact).toMatch(/recorded 2012–2024/);
    expect(pkg.provenance.some((p) => p.fact === medalFact?.fact)).toBe(true);
    expect(pkg.coverageNotes.some((n) => /not all-time/i.test(n))).toBe(true);
  });

  it("does not silently merge medal vs standings-fallback title counts", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who has the most championships?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: {
          ...CHAMP_PLAN,
          intent: "championship_leaderboard",
          requiredEvidence: ["title_counts"],
        },
      },
      baseSources({ championships: champSnap() }),
    );
    const medal = pkg.championships.medalTitles.find((r) => r.key === "id:rod");
    const inclusive = pkg.championships.fallbackInclusiveTitles.find((r) => r.key === "id:rod");
    expect(medal?.titles).toBe(3);
    expect(inclusive?.titles).toBe(4);
    expect(pkg.conflicts.some((c) => c.topic === "championship_title_counts")).toBe(true);
    expect(pkg.rankings.map((r) => r.id)).toEqual(
      expect.arrayContaining(["titles_medal", "titles_fallback_inclusive"]),
    );
  });

  it("keeps H2H regular season and playoffs distinct", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Rod vs Bruce",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "rivalry_history", ownerNames: ["Rod", "Bruce"] },
        owners: [{ displayName: "Rod" }, { displayName: "Bruce" }],
        plan: H2H_PLAN,
      },
      baseSources({
        h2h: h2hSnap(),
        rivalry: {
          focalName: "Rod Sellers",
          rivalName: "Bruce Edwards",
          rivalryScore: 140,
          heatLabel: "Burning",
          h2hWins: 2,
          h2hLosses: 1,
          playoffEliminations: 1,
        },
      }),
    );
    expect(pkg.owners.every((o) => o.status === "resolved")).toBe(true);
    expect(pkg.h2h.regularSeason).toEqual({ wins: 2, losses: 1, ties: 0, games: 3 });
    expect(pkg.h2h.playoffs).toEqual({ wins: 0, losses: 1, ties: 0, games: 1 });
    expect(pkg.facts.some((f) => f.id === "h2h_regular" && f.sourceScope.includes("regular_season"))).toBe(
      true,
    );
    expect(pkg.facts.some((f) => f.id === "h2h_playoffs" && f.sourceScope.includes("playoffs"))).toBe(
      true,
    );
    expect((pkg.playoffs.h2h as { losses: number }).losses).toBe(1);
  });

  it("labels conflicting H2H vs rivalry records instead of merging them", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Rod vs Bruce",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "rivalry_history", ownerNames: ["Rod", "Bruce"] },
        owners: [{ displayName: "Rod" }, { displayName: "Bruce" }],
        plan: H2H_PLAN,
      },
      baseSources({
        h2h: h2hSnap(),
        rivalry: {
          focalName: "Rod Sellers",
          rivalName: "Bruce Edwards",
          rivalryScore: 90,
          heatLabel: "Heated",
          h2hWins: 4,
          h2hLosses: 3,
          playoffEliminations: 1,
        },
      }),
    );
    const conflict = pkg.conflicts.find((c) => c.topic === "h2h_record");
    expect(conflict).toBeTruthy();
    expect(conflict?.left.sourceAuthority).toBe("h2h");
    expect(conflict?.right.sourceAuthority).toBe("rivalry");
    expect(pkg.h2h.regularSeason?.wins).toBe(2);
  });

  it("qualifies single-season H2H without promoting it to full history", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Rod vs Bruce in 2023",
        leagueId: "457622",
        scope: {
          scopeType: "single_season",
          startSeason: 2023,
          endSeason: 2023,
          phase: "all",
          ownerNames: ["Rod", "Bruce"],
          confidence: "high",
          explicitSeasonRequested: true,
        },
        owners: [{ displayName: "Rod" }, { displayName: "Bruce" }],
        plan: H2H_PLAN,
      },
      baseSources({ coverageStartSeason: 2010, coverageEndSeason: 2025, h2h: h2hSnap() }),
    );
    expect(pkg.h2h.regularSeason).toEqual({ wins: 1, losses: 0, ties: 0, games: 1 });
    expect(pkg.h2h.playoffs).toEqual({ wins: 0, losses: 0, ties: 0, games: 0 });
    expect(pkg.facts.find((f) => f.id === "h2h_regular")?.sourceScope).toMatch(/2023/);
  });

  it("attaches matchup-margin leaderboard with phase provenance", () => {
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
      baseSources({ margins }),
    );
    expect(pkg.matchupStats.phase).toBe("regular");
    expect(pkg.rankings[0]?.rows[0]).toMatchObject({ name: "Rod Sellers", value: 11 });
    expect(pkg.facts[0]?.sourceAuthority).toBe("matchup_margins");
    expect(pkg.facts[0]?.sourceScope).toMatch(/regular/);
  });

  it("does not invent facts when an authority is missing", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Who is the champ?",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: CHAMP_PLAN,
      },
      baseSources({ championships: null }),
    );
    expect(pkg.facts).toEqual([]);
    expect(pkg.championships.medalTitles).toEqual([]);
    expect(pkg.coverageNotes.some((n) => /no data/i.test(n))).toBe(true);
  });
});
