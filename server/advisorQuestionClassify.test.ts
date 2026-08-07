import { describe, expect, it } from "vitest";
import {
  classifyAdvisorQuestion,
  advisorContextGatesFor,
  gatesForAdvisorMessage,
} from "./advisorQuestionClassify";

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
    expect(classifyAdvisorQuestion("What should I offer for Jefferson?")).toBe(
      "TRADE_STRATEGY",
    );
  });

  it("classifies rivalry history questions", () => {
    expect(classifyAdvisorQuestion("Why do I always lose to Bruce?")).toBe(
      "RIVALRY_HISTORY",
    );
    expect(classifyAdvisorQuestion("What's my record against Vince?")).toBe(
      "RIVALRY_HISTORY",
    );
    expect(classifyAdvisorQuestion("Who owns this rivalry?")).toBe("RIVALRY_HISTORY");
  });

  it("classifies league history questions", () => {
    expect(classifyAdvisorQuestion("Who is the greatest owner in league history?")).toBe(
      "LEAGUE_HISTORY",
    );
    expect(classifyAdvisorQuestion("Who has the most championships?")).toBe(
      "LEAGUE_HISTORY",
    );
    expect(classifyAdvisorQuestion("Tell me about our league history.")).toBe(
      "LEAGUE_HISTORY",
    );
  });

  it("classifies current league questions", () => {
    expect(classifyAdvisorQuestion("Who is my biggest threat right now?")).toBe(
      "CURRENT_LEAGUE",
    );
    expect(classifyAdvisorQuestion("Who is in first place?")).toBe("CURRENT_LEAGUE");
    expect(classifyAdvisorQuestion("Who has the strongest roster?")).toBe(
      "CURRENT_LEAGUE",
    );
  });

  it("classifies team improvement questions", () => {
    expect(classifyAdvisorQuestion("How can I improve my team?")).toBe("TEAM_IMPROVEMENT");
    expect(classifyAdvisorQuestion("What should I do to improve my team?")).toBe(
      "TEAM_IMPROVEMENT",
    );
    expect(classifyAdvisorQuestion("What's my biggest weakness?")).toBe("TEAM_IMPROVEMENT");
    expect(classifyAdvisorQuestion("How close am I to winning?")).toBe("TEAM_IMPROVEMENT");
    expect(classifyAdvisorQuestion("What should I do this week?")).toBe("TEAM_IMPROVEMENT");
    expect(classifyAdvisorQuestion("What's my biggest need?")).toBe("TEAM_IMPROVEMENT");
    expect(classifyAdvisorQuestion("How do I win this league?")).toBe("TEAM_IMPROVEMENT");
  });

  it("classifies light feedback as GENERAL_SMALL", () => {
    expect(classifyAdvisorQuestion("How am I doing?")).toBe("GENERAL_SMALL");
    expect(classifyAdvisorQuestion("What do you think?")).toBe("GENERAL_SMALL");
    expect(classifyAdvisorQuestion("Any advice?")).toBe("GENERAL_SMALL");
    expect(classifyAdvisorQuestion("Thoughts on my team?")).toBe("GENERAL_SMALL");
    expect(classifyAdvisorQuestion("Give me some feedback.")).toBe("GENERAL_SMALL");
  });

  it("reserves GENERAL_FULL for broad franchise/legacy asks and ambiguity", () => {
    expect(classifyAdvisorQuestion("Tell me everything about my franchise.")).toBe(
      "GENERAL_FULL",
    );
    expect(classifyAdvisorQuestion("Explain my legacy.")).toBe("GENERAL_FULL");
    expect(classifyAdvisorQuestion("Give me a complete breakdown of my career.")).toBe(
      "GENERAL_FULL",
    );
    expect(classifyAdvisorQuestion("Something vague and weird")).toBe("GENERAL_FULL");
    expect(classifyAdvisorQuestion("")).toBe("GENERAL_FULL");
  });
});

describe("advisorContextGatesFor", () => {
  it("omits trophy and career history for START_SIT", () => {
    const g = advisorContextGatesFor("START_SIT");
    expect(g.includeCareerHistory).toBe(false);
    expect(g.includeTrophyHistory).toBe(false);
    expect(g.includeAnalytics).toBe(true);
    expect(g.includeInjuries).toBe(true);
    expect(g.includeCurrentWeekH2h).toBe(true);
    expect(g.includeDna).toBe(false);
    expect(g.includeDraft).toBe(false);
  });

  it("keeps history blocks for RIVALRY_HISTORY and LEAGUE_HISTORY", () => {
    const rivalry = advisorContextGatesFor("RIVALRY_HISTORY");
    expect(rivalry.includeCareerHistory).toBe(true);
    expect(rivalry.includeTrophyHistory).toBe(true);

    const league = advisorContextGatesFor("LEAGUE_HISTORY");
    expect(league.includeCareerHistory).toBe(true);
    expect(league.includeTrophyHistory).toBe(true);
    expect(league.includeCurrentWeekH2h).toBe(false);
  });

  it("TEAM_IMPROVEMENT and GENERAL_SMALL omit historical bags", () => {
    for (const cat of ["TEAM_IMPROVEMENT", "GENERAL_SMALL"] as const) {
      const g = advisorContextGatesFor(cat);
      expect(g.includeCareerHistory).toBe(false);
      expect(g.includeTrophyHistory).toBe(false);
      expect(g.includeDna).toBe(false);
      expect(g.includeDraft).toBe(false);
      expect(g.includeAnalytics).toBe(true);
      expect(g.includeInjuries).toBe(true);
    }
  });

  it("GENERAL_FULL keeps the full context bag", () => {
    const g = advisorContextGatesFor("GENERAL_FULL");
    expect(g.includeCareerHistory).toBe(true);
    expect(g.includeTrophyHistory).toBe(true);
    expect(g.includeDna).toBe(true);
    expect(g.includeDraft).toBe(true);
  });

  it("gatesForAdvisorMessage defaults to GENERAL_FULL when message missing", () => {
    expect(gatesForAdvisorMessage(undefined).category).toBe("GENERAL_FULL");
    expect(gatesForAdvisorMessage("").category).toBe("GENERAL_FULL");
    expect(gatesForAdvisorMessage("Who should I start?").category).toBe("START_SIT");
  });
});
