import { describe, expect, it } from "vitest";
import {
  planAdvisorEvidenceFromMessage,
  type AdvisorAuthorityId,
  type AdvisorPlannerIntent,
} from "./advisorEvidencePlanner";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";

const NOW = 2026;
const LEAGUE = "457622";

const OWNERS: AdvisorOwnerAlias[] = [
  {
    memberId: "demetri-id",
    displayName: "Demetri Clark",
    aliases: ["demetri clark", "demetri"],
  },
  {
    memberId: "lozell-id",
    displayName: "LOZELL",
    aliases: ["lozell"],
  },
  {
    memberId: "rod-id",
    displayName: "Rod Sellers",
    aliases: ["rod sellers", "rod"],
  },
  {
    memberId: "bruce-id",
    displayName: "Bruce Edwards",
    aliases: ["bruce edwards", "bruce"],
  },
];

function plan(message: string) {
  return planAdvisorEvidenceFromMessage(message, {
    leagueId: LEAGUE,
    ownerAliases: OWNERS,
    currentSeason: NOW,
  });
}

function expectPlan(
  message: string,
  intent: AdvisorPlannerIntent,
  authorities: AdvisorAuthorityId[],
  opts?: { deterministicFirst?: boolean; narrativeAllowed?: boolean; fallback?: boolean },
) {
  const p = plan(message);
  expect(p.intent, message).toBe(intent);
  expect(p.authorities, message).toEqual(authorities);
  expect(p.deterministicFirst, message).toBe(opts?.deterministicFirst ?? true);
  expect(p.narrativeAllowed, message).toBe(opts?.narrativeAllowed ?? true);
  expect(p.fallbackToAdvisorContext, message).toBe(opts?.fallback ?? false);
  if (!p.fallbackToAdvisorContext) {
    expect(p.requiredEvidence.length, message).toBeGreaterThan(0);
  }
  return p;
}

describe("planAdvisorEvidence", () => {
  it("plans one-point losses via owner identity + matchup margins", () => {
    const p = expectPlan(
      "Who has the most one-point losses?",
      "matchup_margins",
      ["owner_identity", "matchup_margins"],
      { narrativeAllowed: false },
    );
    expect(p.requiredEvidence).toContain("margin_query");
  });

  it("plans a named H2H pair", () => {
    expectPlan(
      "Demetri vs LOZELL",
      "h2h_pair",
      ["owner_identity", "h2h", "playoffs"],
      { narrativeAllowed: false },
    );
  });

  it("plans GOAT with championships, records, HoF, playoffs, and longevity timeline", () => {
    const p = expectPlan("Who's the GOAT?", "goat", [
      "championships",
      "playoffs",
      "league_records",
      "timeline",
      "hall_of_fame",
    ]);
    expect(p.requiredEvidence).toContain("career_longevity");
    expect(p.requiredEvidence).toContain("title_counts");
  });

  it("plans Why Haven't I Won against the existing diagnosis authorities", () => {
    expectPlan("Why haven't I won?", "why_havent_i_won", [
      "championships",
      "matchup_history",
      "playoffs",
      "owner_dossier",
      "draft_history",
      "trades",
    ]);
  });

  it("plans best rivalry ever", () => {
    expectPlan(
      "Best rivalry ever?",
      "best_rivalry",
      ["championships", "h2h", "rivalry", "playoffs"],
      { narrativeAllowed: false },
    );
  });

  it("plans 052G historical intelligence questions deterministically", () => {
    expectPlan("Who has the most blowout wins by 50+?", "matchup_margins", [
      "owner_identity",
      "matchup_margins",
    ], { narrativeAllowed: false });
    expectPlan("who has the largest margin of victory in a single game", "matchup_margins", [
      "owner_identity",
      "matchup_margins",
    ], { narrativeAllowed: false });
    expectPlan("What was the largest margin of victory in league history?", "matchup_margins", [
      "owner_identity",
      "matchup_margins",
    ], { narrativeAllowed: false });
    expectPlan("What's my biggest win?", "matchup_margins", [
      "owner_identity",
      "matchup_margins",
    ], { narrativeAllowed: false });
    expectPlan("What's Rod's biggest win over Bruce?", "matchup_margins", [
      "owner_identity",
      "matchup_margins",
    ], { narrativeAllowed: false });
    expectPlan("Who has the most playoff eliminations?", "playoff_eliminations", [
      "owner_identity",
      "rivalry",
      "playoffs",
    ], { narrativeAllowed: false });
    expectPlan("Who is the biggest playoff villain?", "playoff_villain", [
      "owner_identity",
      "rivalry",
      "playoffs",
    ], { narrativeAllowed: false });
    expectPlan("Who has the best career winning percentage?", "career_win_pct", [
      "owner_identity",
      "league_records",
    ], { narrativeAllowed: false });
    expectPlan("Who is the most efficient owner?", "career_win_pct", [
      "owner_identity",
      "league_records",
    ], { narrativeAllowed: false });
    expectPlan("Who has the worst career record?", "worst_career_record", [
      "owner_identity",
      "league_records",
    ], { narrativeAllowed: false });
    expectPlan("Who has the most career wins?", "career_most_wins", [
      "owner_identity",
      "league_records",
    ], { narrativeAllowed: false });
    expectPlan("Who has the most career losses?", "career_most_losses", [
      "owner_identity",
      "league_records",
    ], { narrativeAllowed: false });
    expectPlan("What is the greatest rivalry?", "best_rivalry", [
      "championships",
      "h2h",
      "rivalry",
      "playoffs",
    ], { narrativeAllowed: false });
  });

  it("plans who is the champ as championships only", () => {
    expectPlan("Who is the champ?", "reigning_champion", ["championships"], {
      narrativeAllowed: false,
    });
  });

  it("does not treat most-titles as GOAT or reigning champ", () => {
    expectPlan("Who has the most championships?", "championship_leaderboard", [
      "championships",
    ], { narrativeAllowed: false });
  });

  it("falls back to normal Advisor context for unknown / current-season coaching", () => {
    expectPlan("Who is strongest this year?", "advisor_fallback", [], {
      deterministicFirst: false,
      narrativeAllowed: true,
      fallback: true,
    });
    expectPlan("What do you think?", "advisor_fallback", [], {
      deterministicFirst: false,
      fallback: true,
    });
    expectPlan("Should I start Higgins this week?", "advisor_fallback", [], {
      deterministicFirst: false,
      fallback: true,
    });
  });

  it("plans draft intelligence deterministically (RFSN-055)", () => {
    expectPlan("Who always reaches in the draft?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who reaches the most?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("What was the biggest reach ever?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Biggest reach?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("What was the biggest steal?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Biggest steal?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who drafts QBs early?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who drafts quarterbacks early?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who waits on QB?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who always waits on QB?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who reached the most in 2010?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who always drafts rookies?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who loves RBs?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who drafts safest?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
    expectPlan("Who gambles the most?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
  });

  it("does not turn two named owners + draft metric into H2H", () => {
    expectPlan("Who reaches more, Demetri or LOZELL?", "draft_intelligence", [
      "owner_identity",
      "draft_history",
    ], { narrativeAllowed: false });
  });

  it("plans trade history from transaction scope", () => {
    expectPlan("Who got robbed in trades?", "trade_history", [
      "owner_identity",
      "trades",
      "transactions",
    ]);
  });

  it("plans single-owner ring counts via Championship Authority only", () => {
    expectPlan(
      "How many titles does Rod have?",
      "owner_championships",
      ["owner_identity", "championships"],
      { narrativeAllowed: false },
    );
    expectPlan(
      "how many rings does LOZELL have?",
      "owner_championships",
      ["owner_identity", "championships"],
      { narrativeAllowed: false },
    );
  });

  it("plans named-year record/score/week asks as season matchup detail", () => {
    expectPlan("What was LOZELL’s 2009 regular-season record?", "season_matchup_detail", [
      "owner_identity",
      "championships",
      "league_records",
    ], { narrativeAllowed: false });
    expectPlan("What was the 2009 championship score?", "season_matchup_detail", [
      "owner_identity",
      "championships",
      "league_records",
    ], { narrativeAllowed: false });
    expectPlan("Who did LOZELL play in Week 8 of 2009?", "season_matchup_detail", [
      "owner_identity",
      "championships",
      "league_records",
    ], { narrativeAllowed: false });
  });

  it("plans 2009-style runner-up / third questions via Championship Authority only", () => {
    expectPlan("Who was runner-up in 2009?", "podium_placement", ["championships"], {
      narrativeAllowed: false,
    });
    expectPlan("Who finished third in 2009?", "podium_placement", ["championships"], {
      narrativeAllowed: false,
    });
  });

  it("plans two-owner championship compare via Championship Authority only", () => {
    expectPlan(
      "who has more championships, Rod or Bruce?",
      "championship_compare",
      ["owner_identity", "championships"],
      { narrativeAllowed: false },
    );
  });

  it("plans H2H cue phrases without falling back to the LLM", () => {
    for (const message of [
      "Rod vs Bruce",
      "check their head-to-head",
      "who owns who?",
      "what's their playoff record?",
      "how many times have they met?",
    ]) {
      expectPlan(message, "h2h_pair", ["owner_identity", "h2h", "playoffs"], {
        narrativeAllowed: false,
      });
    }
  });

  it("plans a non-title career dossier separately from ring counts", () => {
    expectPlan("Tell me about Rod's career", "owner_career", [
      "owner_identity",
      "championships",
      "matchup_history",
      "playoffs",
      "owner_dossier",
      "timeline",
    ]);
  });

  it("plans matchup gallery for show-me-games asks (RFSN-053D)", () => {
    expectPlan("Show me all my No Mercy wins.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me every game I beat Bruce.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me every championship game.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me every playoff game.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me my closest wins.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me my closest losses.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me every one-point game.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me every game over 200 points.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me every game under 100 points.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me my biggest wins.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me my biggest losses.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me all games against LOZELL.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me Rod vs Bruce.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show Rod vs Bruce", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me every game from 2018.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
    expectPlan("Show me my playoff losses.", "matchup_gallery", ["owner_identity", "matchup_history"], {
      narrativeAllowed: false,
    });
  });

  it("keeps leaderboards and singular facts as text, not gallery (RFSN-053D)", () => {
    expectPlan("Who has the most championships?", "championship_leaderboard", ["championships"], {
      narrativeAllowed: false,
    });
    expectPlan("Who reaches the most?", "draft_intelligence", ["owner_identity", "draft_history"], {
      narrativeAllowed: false,
    });
    expect(plan("Who has the best record?").intent).not.toBe("matchup_gallery");
    expectPlan("Who has the most one-point losses?", "matchup_margins", ["owner_identity", "matchup_margins"], {
      narrativeAllowed: false,
    });
    expect(plan("Who has the most blowouts?").intent).not.toBe("matchup_gallery");
    expectPlan("Who drafts QBs early?", "draft_intelligence", ["owner_identity", "draft_history"], {
      narrativeAllowed: false,
    });
    expectPlan("What's my biggest win?", "matchup_margins", ["owner_identity", "matchup_margins"], {
      narrativeAllowed: false,
    });
    expectPlan("Rod vs Bruce", "h2h_pair", ["owner_identity", "h2h", "playoffs"], {
      narrativeAllowed: false,
    });
  });

  it("does not invoke an LLM and stays pure", () => {
    const p = plan("Rod vs Bruce");
    expect(p.intent).toBe("h2h_pair");
    expect(p.deterministicFirst).toBe(true);
    expect(p.narrativeAllowed).toBe(false);
    expect(p.fallbackToAdvisorContext).toBe(false);
  });
});
