import { describe, expect, it } from "vitest";
import {
  classifyAdvisorQuestion,
  classifyAdvisorQuestionDetailed,
  advisorContextGatesFor,
  gatesForAdvisorMessage,
  hasOwnerComparisonIntent,
  findMentionedOwners,
  type AdvisorOwnerAlias,
} from "./advisorQuestionClassify";

const SAMPLE_OWNERS: AdvisorOwnerAlias[] = [
  {
    memberId: "vince-id",
    displayName: "Vince Sellers",
    aliases: ["vince sellers", "vince"],
  },
  {
    memberId: "bruce-id",
    displayName: "Bruce Edwards",
    aliases: ["bruce edwards", "bruce"],
  },
  {
    memberId: "demetri-id",
    displayName: "Demetri Clark",
    aliases: ["demetri clark", "demetri"],
  },
  {
    memberId: "zig-id",
    displayName: "ClassicZig",
    aliases: ["classiczig"],
  },
];

describe("classifyAdvisorQuestion", () => {
  it("classifies start/sit questions", () => {
    expect(classifyAdvisorQuestion("Who should I start at WR2?")).toBe("START_SIT");
    expect(classifyAdvisorQuestion("Higgins or Smith at WR?")).toBe("START_SIT");
    expect(classifyAdvisorQuestion("Which RB should I bench?")).toBe("START_SIT");
  });

  it("classifies trade questions", () => {
    expect(classifyAdvisorQuestion("Should I trade for Justin Jefferson?")).toBe(
      "TRADE_STRATEGY",
    );
    expect(classifyAdvisorQuestion("Is this trade fair?")).toBe("TRADE_STRATEGY");
  });

  it("classifies rivalry history questions", () => {
    expect(classifyAdvisorQuestion("Why do I always lose to Bruce?")).toBe(
      "RIVALRY_HISTORY",
    );
    expect(classifyAdvisorQuestion("Why do I always lose to Vince?")).toBe(
      "RIVALRY_HISTORY",
    );
    expect(classifyAdvisorQuestion("What's my record against Vince?")).toBe(
      "RIVALRY_HISTORY",
    );
  });

  it("classifies league history questions", () => {
    expect(classifyAdvisorQuestion("Who is the greatest owner in league history?")).toBe(
      "LEAGUE_HISTORY",
    );
  });

  it("classifies current league questions", () => {
    expect(classifyAdvisorQuestion("Who is my biggest threat right now?")).toBe(
      "CURRENT_LEAGUE",
    );
  });

  it("classifies team improvement without a named owner", () => {
    expect(classifyAdvisorQuestion("How can I improve my team?")).toBe("TEAM_IMPROVEMENT");
    expect(classifyAdvisorQuestion("What's my biggest weakness?")).toBe("TEAM_IMPROVEMENT");
  });

  it("classifies OWNER_COMPARISON when comparison intent + known owner", () => {
    const opts = { ownerAliases: SAMPLE_OWNERS };
    expect(
      classifyAdvisorQuestion("How can I improve compared with Vince?", opts),
    ).toBe("OWNER_COMPARISON");
    expect(classifyAdvisorQuestion("Am I better than Bruce?", opts)).toBe(
      "OWNER_COMPARISON",
    );
    expect(classifyAdvisorQuestion("Should I worry about Demetri?", opts)).toBe(
      "OWNER_COMPARISON",
    );
    expect(
      classifyAdvisorQuestion("How do I stack up against ClassicZig?", opts),
    ).toBe("OWNER_COMPARISON");
  });

  it("falls back to TEAM_IMPROVEMENT for comparison phrasing without a known owner", () => {
    // Without league aliases, do not escalate to GENERAL_FULL
    expect(classifyAdvisorQuestion("How can I improve compared with Vince?")).toBe(
      "TEAM_IMPROVEMENT",
    );
    expect(
      classifyAdvisorQuestion("How do I stack up against ClassicZig?", {
        ownerAliases: SAMPLE_OWNERS.filter((o) => o.displayName !== "ClassicZig"),
      }),
    ).toBe("TEAM_IMPROVEMENT");
  });

  it("returns matched owners on detailed classification", () => {
    const detailed = classifyAdvisorQuestionDetailed(
      "How can I improve compared with Vince?",
      { ownerAliases: SAMPLE_OWNERS },
    );
    expect(detailed.category).toBe("OWNER_COMPARISON");
    expect(detailed.matchedOwners.map((o) => o.displayName)).toEqual(["Vince Sellers"]);
  });

  it("classifies light feedback as GENERAL_SMALL", () => {
    expect(classifyAdvisorQuestion("How am I doing?")).toBe("GENERAL_SMALL");
  });

  it("reserves GENERAL_FULL for broad franchise asks", () => {
    expect(classifyAdvisorQuestion("Tell me everything about my franchise.")).toBe(
      "GENERAL_FULL",
    );
  });
});

describe("owner comparison helpers", () => {
  it("detects comparison intent phrases", () => {
    expect(hasOwnerComparisonIntent("How can I improve compared with Vince?")).toBe(true);
    expect(hasOwnerComparisonIntent("Am I better than Bruce?")).toBe(true);
    expect(hasOwnerComparisonIntent("Should I worry about Demetri?")).toBe(true);
    expect(hasOwnerComparisonIntent("How do I stack up against ClassicZig?")).toBe(true);
    expect(hasOwnerComparisonIntent("How can I improve my team?")).toBe(false);
  });

  it("matches first names and team-style aliases", () => {
    const hits = findMentionedOwners("compared with Vince", SAMPLE_OWNERS);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.displayName).toBe("Vince Sellers");
    expect(findMentionedOwners("vs ClassicZig", SAMPLE_OWNERS)[0]?.displayName).toBe(
      "ClassicZig",
    );
  });
});

describe("advisorContextGatesFor", () => {
  it("omits trophy and career history for START_SIT / TEAM_IMPROVEMENT", () => {
    for (const cat of ["START_SIT", "TEAM_IMPROVEMENT", "GENERAL_SMALL", "CURRENT_LEAGUE"] as const) {
      const g = advisorContextGatesFor(cat);
      expect(g.includeCareerHistory).toBe(false);
      expect(g.includeTrophyHistory).toBe(false);
      expect(g.includeNamedOwnerH2h).toBe(false);
    }
  });

  it("OWNER_COMPARISON adds focused history without full trophy bag", () => {
    const g = advisorContextGatesFor("OWNER_COMPARISON", [SAMPLE_OWNERS[0]!]);
    expect(g.includeAnalytics).toBe(true);
    expect(g.includeInjuries).toBe(true);
    expect(g.includeCareerHistory).toBe(true);
    expect(g.includeTrophyHistory).toBe(false);
    expect(g.includeDna).toBe(true);
    expect(g.includeNamedOwnerH2h).toBe(true);
    expect(g.includeDraft).toBe(false);
    expect(g.careerMemberIdFilter).toEqual(["vince-id"]);
    expect(g.matchedOwners).toHaveLength(1);
  });

  it("RIVALRY_HISTORY keeps broader history than OWNER_COMPARISON", () => {
    const rivalry = advisorContextGatesFor("RIVALRY_HISTORY");
    expect(rivalry.includeTrophyHistory).toBe(true);
    expect(rivalry.includeNamedOwnerH2h).toBe(false);
  });

  it("gatesForAdvisorMessage with aliases selects OWNER_COMPARISON", () => {
    const g = gatesForAdvisorMessage("Am I better than Bruce?", {
      ownerAliases: SAMPLE_OWNERS,
    });
    expect(g.category).toBe("OWNER_COMPARISON");
    expect(g.matchedOwners[0]?.displayName).toBe("Bruce Edwards");
  });
});
