import { describe, expect, it } from "vitest";
import {
  formatH2HAdvisorAnswer,
  formatOwnerChampionshipAnswer,
  runAdvisorEvidencePath,
} from "./advisorEvidenceExecutor";
import {
  buildAdvisorEvidencePackage,
  type AdvisorEvidenceSources,
  type ChampionshipSnapshot,
  type H2HSnapshot,
} from "./advisorEvidencePackage";
import { planAdvisorEvidenceFromMessage } from "./advisorEvidencePlanner";
import type { AdvisorEvidencePlan } from "./advisorEvidencePlanner";
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

const H2H_PLAN: AdvisorEvidencePlan = {
  intent: "h2h_pair",
  authorities: ["owner_identity", "h2h", "playoffs"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["h2h_career_record"],
  fallbackToAdvisorContext: false,
};

const OWNER_CHAMP_PLAN: AdvisorEvidencePlan = {
  intent: "owner_championships",
  authorities: ["owner_identity", "championships"],
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["title_counts"],
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
  {
    canonicalPersonId: "id:demetri",
    canonicalName: "Demetri Clark",
    resolvedBy: "espn-id",
    aliases: ["demetri clark", "demetri"],
  },
  {
    canonicalPersonId: "id:lozell",
    canonicalName: "LOZELL",
    resolvedBy: "espn-id",
    aliases: ["lozell"],
  },
  {
    canonicalPersonId: "id:vince",
    canonicalName: "Vince Sellers",
    resolvedBy: "espn-id",
    aliases: ["vince sellers", "vince"],
  },
];

const OWNER_ALIASES: AdvisorOwnerAlias[] = [
  { memberId: "rod-id", displayName: "Rod Sellers", aliases: ["rod sellers", "rod"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
  { memberId: "demetri-id", displayName: "Demetri Clark", aliases: ["demetri clark", "demetri"] },
  { memberId: "lozell-id", displayName: "LOZELL", aliases: ["lozell"] },
  { memberId: "vince-id", displayName: "Vince Sellers", aliases: ["vince sellers", "vince"] },
];

function champSnap(): ChampionshipSnapshot {
  return {
    latestCompletedSeason: 2024,
    reigningKey: "id:bruce",
    seasons: [
      { season: 2011, ownerKey: "id:vince", ownerName: "Vince Sellers", source: "medal" },
      { season: 2012, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "finalStanding-fallback" },
      { season: 2015, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "medal" },
      { season: 2016, ownerKey: "id:lozell", ownerName: "LOZELL", source: "medal" },
      { season: 2018, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "medal" },
      { season: 2019, ownerKey: "id:lozell", ownerName: "LOZELL", source: "medal" },
      { season: 2021, ownerKey: "id:rod", ownerName: "Rod Sellers", source: "medal" },
      { season: 2024, ownerKey: "id:bruce", ownerName: "Bruce Edwards", source: "medal" },
    ],
  };
}

function rodBruceH2H(): H2HSnapshot {
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

function demetriLozellH2H(): H2HSnapshot {
  return {
    personA: "id:demetri",
    personB: "id:lozell",
    displayA: "Demetri Clark",
    displayB: "LOZELL",
    meetings: [
      { season: 2017, week: 2, isPlayoff: false, winner: "A", scoreA: 111, scoreB: 98 },
      { season: 2019, week: 11, isPlayoff: false, winner: "B", scoreA: 90, scoreB: 104 },
      { season: 2021, week: 16, isPlayoff: true, winner: "A", scoreA: 108, scoreB: 101 },
      { season: 2022, week: 5, isPlayoff: false, winner: "A", scoreA: 140, scoreB: 88 },
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
    championships: champSnap(),
    ...over,
  };
}

async function runDet(
  message: string,
  assemble: typeof import("./advisorEvidencePackage").assembleAdvisorEvidencePackage,
  history: Array<{ role: string; content: string }> = [],
) {
  return runAdvisorEvidencePath(
    {
      message,
      leagueId: "457622",
      userId: 1,
      season: 2026,
      ownerAliases: OWNER_ALIASES,
    },
    {
      assemblePackage: assemble,
      getHistory: async () => history,
      buildFallbackMessages: async () => [{ role: "user", content: "llm-fallback-should-not-run" }],
    },
  );
}

describe("RFSN-052F planner routing", () => {
  it("routes Rod vs Bruce and Demetri vs LOZELL to deterministic H2H", () => {
    for (const message of ["Rod vs Bruce", "Demetri vs LOZELL", "rod vs bruce", "LOZELL vs Demetri"]) {
      const p = planAdvisorEvidenceFromMessage(message, {
        leagueId: "457622",
        ownerAliases: OWNER_ALIASES,
        currentSeason: 2026,
      });
      expect(p.intent, message).toBe("h2h_pair");
      expect(p.narrativeAllowed, message).toBe(false);
      expect(p.fallbackToAdvisorContext, message).toBe(false);
      expect(p.authorities, message).toEqual(["owner_identity", "h2h", "playoffs"]);
    }
  });

  it("routes championship count questions to Championship Authority only", () => {
    const rings = planAdvisorEvidenceFromMessage("how many rings does LOZELL have?", {
      ownerAliases: OWNER_ALIASES,
      currentSeason: 2026,
    });
    expect(rings.intent).toBe("owner_championships");
    expect(rings.authorities).toEqual(["owner_identity", "championships"]);
    expect(rings.narrativeAllowed).toBe(false);

    const more = planAdvisorEvidenceFromMessage("who has more championships, Rod or Bruce?", {
      ownerAliases: OWNER_ALIASES,
      currentSeason: 2026,
    });
    expect(more.intent).toBe("championship_compare");
    expect(more.authorities).toEqual(["owner_identity", "championships"]);
    expect(more.narrativeAllowed).toBe(false);

    const retired = planAdvisorEvidenceFromMessage("how many rings does Vince have?", {
      ownerAliases: OWNER_ALIASES,
      currentSeason: 2026,
    });
    expect(retired.intent).toBe("owner_championships");
    expect(retired.narrativeAllowed).toBe(false);
  });
});

describe("RFSN-052F H2H answers", () => {
  it("answers Rod vs Bruce with RS, playoffs, meetings, coverage, elims, recent, streak, closest, blowout", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Rod vs Bruce",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "rivalry_history", ownerNames: ["Rod", "Bruce"] },
        owners: [{ displayName: "Rod" }, { displayName: "Bruce" }],
        plan: H2H_PLAN,
      },
      baseSources({ h2h: rodBruceH2H() }),
    );
    const text = formatH2HAdvisorAnswer(pkg);
    expect(text).toMatch(/^Across recorded meetings from 2018–2023/);
    expect(text).toMatch(/Regular season: Rod Sellers leads 2–1–0 \(3 games\)/);
    expect(text).toMatch(/Playoffs: Bruce Edwards leads 1–0–0 \(1 game\)/);
    expect(text).toMatch(/Meetings: 4/);
    expect(text).toMatch(/Bruce Edwards has eliminated Rod Sellers 1 time/);
    expect(text).toMatch(/Recent regular-season/);
    expect(text).toMatch(/Current streak: Rod Sellers, 1-game win streak/);
    expect(text).toMatch(/Closest game: 2019 week 7, 95–101 \(margin 6\)/);
    expect(text).toMatch(/Biggest blowout: 2023 week 4, 130–100 \(margin 30, Rod Sellers\)/);
    expect(text).toMatch(/Not all-time\. Recorded meeting coverage is 2018–2023/);
  });

  it("answers Demetri vs LOZELL from the same H2H path", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Demetri vs LOZELL",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "rivalry_history", ownerNames: ["Demetri", "LOZELL"] },
        owners: [{ displayName: "Demetri" }, { displayName: "LOZELL" }],
        plan: H2H_PLAN,
      },
      baseSources({ h2h: demetriLozellH2H() }),
    );
    const text = formatH2HAdvisorAnswer(pkg);
    expect(text).toMatch(/Across recorded meetings from 2017–2022/);
    expect(text).toMatch(/Demetri Clark vs LOZELL/);
    expect(text).toMatch(/Regular season: Demetri Clark leads 2–1–0/);
    expect(text).toMatch(/Playoffs: Demetri Clark leads 1–0–0/);
    expect(text).toMatch(/Demetri Clark has eliminated LOZELL 1 time/);
  });

  it("resolves owner alias variants before answering", async () => {
    const result = await runDet("rod vs bruce", async (input) => {
      expect(input.owners.map((o) => o.displayName)).toEqual(["Rod Sellers", "Bruce Edwards"]);
      return buildAdvisorEvidencePackage(input, baseSources({ h2h: rodBruceH2H() }));
    });
    expect(result.kind).toBe("deterministic");
    if (result.kind !== "deterministic") return;
    expect(result.telemetry.deterministicShortCircuit).toBe(true);
    expect(result.message).toMatch(/Rod Sellers vs Bruce Edwards/);
  });

  it("uses chat history to resolve “check their head-to-head”", async () => {
    const result = await runDet(
      "check their head-to-head",
      async (input) => {
        expect(input.owners.map((o) => o.displayName)).toEqual(["Rod Sellers", "Bruce Edwards"]);
        return buildAdvisorEvidencePackage(input, baseSources({ h2h: rodBruceH2H() }));
      },
      [{ role: "user", content: "Rod vs Bruce" }],
    );
    expect(result.kind).toBe("deterministic");
    if (result.kind !== "deterministic") return;
    expect(result.message).toMatch(/Across recorded meetings from 2018–2023/);
    expect(result.telemetry.intent).toBe("h2h_pair");
  });

  it("does not invent meetings when a pair has none recorded", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "Demetri vs LOZELL",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "rivalry_history", ownerNames: ["Demetri", "LOZELL"] },
        owners: [{ displayName: "Demetri" }, { displayName: "LOZELL" }],
        plan: H2H_PLAN,
      },
      baseSources({
        h2h: {
          personA: "id:demetri",
          personB: "id:lozell",
          displayA: "Demetri Clark",
          displayB: "LOZELL",
          meetings: [],
        },
      }),
    );
    const text = formatH2HAdvisorAnswer(pkg);
    expect(text).toBe(
      "This league does not have recorded head-to-head meetings for Demetri Clark vs LOZELL for 2010–2025.",
    );
    expect(text.toLowerCase()).not.toMatch(/all-time|likely|nail-biter/);
  });
});

describe("RFSN-052F championship answers", () => {
  it("answers LOZELL ring count from Championship Authority medals only", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "how many rings does LOZELL have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["LOZELL"] },
        owners: [{ displayName: "LOZELL" }],
        plan: OWNER_CHAMP_PLAN,
      },
      baseSources(),
    );
    const text = formatOwnerChampionshipAnswer(pkg);
    expect(text).toMatch(/Across recorded championship history from 2011–2024, LOZELL has 2 championships \(2016, 2019\)/);
    expect(text.toLowerCase()).not.toMatch(/hall of fame|llm|estimate/);
  });

  it("answers retired-owner ring counts from the same authority", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "how many rings does Vince have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["Vince"] },
        owners: [{ displayName: "Vince" }],
        plan: OWNER_CHAMP_PLAN,
      },
      baseSources(),
    );
    expect(pkg.owners[0]).toMatchObject({ displayName: "Vince Sellers", status: "resolved" });
    const text = formatOwnerChampionshipAnswer(pkg);
    expect(text).toMatch(/Vince Sellers has 1 championship \(2011\)/);
  });

  it("compares two owners without letting an LLM invent totals", async () => {
    const result = await runDet("who has more championships, Rod or Bruce?", async (input) =>
      buildAdvisorEvidencePackage(input, baseSources()),
    );
    expect(result.kind).toBe("deterministic");
    if (result.kind !== "deterministic") return;
    expect(result.telemetry.intent).toBe("championship_compare");
    expect(result.telemetry.deterministicShortCircuit).toBe(true);
    expect(result.telemetry.authoritiesUsed).toEqual(["owner_identity", "championships"]);
    expect(result.message).toMatch(/Rod Sellers has 3 championships \(2015, 2018, 2021\)/);
    expect(result.message).toMatch(/Bruce Edwards has 1 championship \(2024\)/);
    expect(result.message).toMatch(/Rod Sellers has more championships/);
    expect(result.message.toLowerCase()).not.toMatch(/\ball-time\b/);
  });

  it("does not silently merge medal vs standings-fallback ring counts", () => {
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "how many rings does Rod have?",
        leagueId: "457622",
        scope: { ...LEAGUE_HISTORY, scopeType: "owner_career", ownerNames: ["Rod"] },
        owners: [{ displayName: "Rod" }],
        plan: OWNER_CHAMP_PLAN,
      },
      baseSources(),
    );
    const text = formatOwnerChampionshipAnswer(pkg);
    expect(text).toMatch(/Rod Sellers has 3 championships \(2015, 2018, 2021\)/);
    expect(text).toMatch(/not merged: 4/);
  });
});
