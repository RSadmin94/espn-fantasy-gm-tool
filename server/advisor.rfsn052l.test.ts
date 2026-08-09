/**
 * RFSN-052L — Clear starts a brand-new Advisor conversation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllAdvisorConversationContext,
  getAdvisorConversationContext,
  setAdvisorConversationContext,
} from "./advisorConversationContext";
import { resetAdvisorConversationSession } from "./advisorSessionReset";
import { runAdvisorEvidencePath } from "./advisorEvidenceExecutor";
import { buildAdvisorEvidencePackage, type AdvisorEvidenceSources } from "./advisorEvidencePackage";
import { planAdvisorEvidenceFromMessage } from "./advisorEvidencePlanner";
import { selectMatchupMarginTool } from "./matchupMarginTool";
import type { AdvisorQuestionScope } from "./advisorScopeResolver";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    clearChatHistory: vi.fn().mockResolvedValue(undefined),
  };
});

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

function sources(over: Partial<AdvisorEvidenceSources> = {}): AdvisorEvidenceSources {
  return {
    championships: {
      titleCounts: [
        { displayName: "Demetri Clark", titles: 3, seasons: [2014, 2017, 2024] },
        { displayName: "LOZELL STYLES", titles: 3, seasons: [2009, 2011, 2021] },
      ],
      coverageStartSeason: 2009,
      coverageEndSeason: 2025,
    },
    h2h: {
      personA: "id:demetri",
      personB: "id:lozell",
      displayA: "Demetri Clark",
      displayB: "LOZELL STYLES",
      meetings: [
        { season: 2010, week: 3, isPlayoff: false, winner: "A" as const, scoreA: 110, scoreB: 100 },
      ],
    },
    ...over,
  };
}

describe("RFSN-052L Advisor Clear session reset", () => {
  beforeEach(() => {
    clearAllAdvisorConversationContext();
  });

  it("resetAdvisorConversationSession deletes planner context and chat history", async () => {
    const { clearChatHistory } = await import("./db");
    setAdvisorConversationContext(9, "457622", {
      lastResolvedOwners: [
        { displayName: "Demetri Clark", memberId: "demetri-id" },
        { displayName: "LOZELL STYLES", memberId: "lozell-id" },
      ],
      lastIntent: "championship_leaderboard",
      lastScope: LEAGUE_HISTORY,
      lastLeagueId: "457622",
    });
    await resetAdvisorConversationSession(9, "457622");
    expect(getAdvisorConversationContext(9, "457622")).toBeNull();
    expect(vi.mocked(clearChatHistory)).toHaveBeenCalledWith(9, "457622");
  });

  it("championships → clear → biggest win is a fresh matchup_margins ask", async () => {
    setAdvisorConversationContext(12, "457622", {
      lastResolvedOwners: [{ displayName: "LOZELL STYLES", memberId: "lozell-id" }],
      lastIntent: "championship_leaderboard",
      lastScope: LEAGUE_HISTORY,
      lastLeagueId: "457622",
    });
    await resetAdvisorConversationSession(12, "457622");

    expect(planAdvisorEvidenceFromMessage("Who has the biggest win?", {
      leagueId: "457622",
      ownerAliases: OWNERS,
      currentSeason: 2025,
    }).intent).toBe("matchup_margins");
    expect(selectMatchupMarginTool("Who has the biggest win?")?.query.metric).toBe("largest_margin");
    expect(selectMatchupMarginTool("Who has the biggest win?")?.query.ownerName).toBeUndefined();

    const after = await runAdvisorEvidencePath(
      {
        message: "Who has the biggest win?",
        leagueId: "457622",
        userId: 12,
        season: 2025,
        ownerAliases: OWNERS,
      },
      {
        assemblePackage: async (input) => {
          expect(input.owners).toEqual([]);
          expect(input.plan.intent).toBe("matchup_margins");
          return buildAdvisorEvidencePackage(input, sources());
        },
        getHistory: async () => [],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-should-not-run" }],
      },
    );
    expect(after.telemetry.intent).toBe("matchup_margins");
    expect(getAdvisorConversationContext(12, "457622")?.lastIntent).toBe("matchup_margins");
    expect(getAdvisorConversationContext(12, "457622")?.lastResolvedOwners ?? []).toEqual([]);
  });

  it("owner comparison → clear → follow-up pronoun does not reuse the pair", async () => {
    setAdvisorConversationContext(13, "457622", {
      lastResolvedOwners: [
        { displayName: "Demetri Clark", memberId: "demetri-id" },
        { displayName: "LOZELL STYLES", memberId: "lozell-id" },
      ],
      lastIntent: "h2h_pair",
      lastScope: LEAGUE_HISTORY,
      lastLeagueId: "457622",
    });
    await resetAdvisorConversationSession(13, "457622");

    await runAdvisorEvidencePath(
      {
        message: "Check their head-to-head stats.",
        leagueId: "457622",
        userId: 13,
        season: 2025,
        ownerAliases: OWNERS,
      },
      {
        assemblePackage: async (input) => {
          expect(input.owners.map((o) => o.displayName)).not.toEqual([
            "Demetri Clark",
            "LOZELL STYLES",
          ]);
          return buildAdvisorEvidencePackage(input, sources({ h2h: { ...sources().h2h!, meetings: [] } }));
        },
        getHistory: async () => [],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-ok" }],
      },
    );
    expect(getAdvisorConversationContext(13, "457622")?.lastResolvedOwners ?? []).not.toEqual([
      expect.objectContaining({ displayName: "Demetri Clark" }),
      expect.objectContaining({ displayName: "LOZELL STYLES" }),
    ]);
  });

  it("metric clarification → clear → different metric does not keep the prior metric", async () => {
    setAdvisorConversationContext(14, "457622", {
      lastResolvedOwners: [],
      lastIntent: "matchup_margins",
      lastScope: { ...LEAGUE_HISTORY, phase: "regular" },
      lastLeagueId: "457622",
    });
    await resetAdvisorConversationSession(14, "457622");
    expect(selectMatchupMarginTool("Who has the most one-point losses?")?.query.metric).toBe(
      "losses_by_margin",
    );
    expect(selectMatchupMarginTool("Who has the biggest win?")?.query.metric).toBe("largest_margin");
    expect(getAdvisorConversationContext(14, "457622")).toBeNull();
  });

  it("pronoun resolution → clear → named owner starts fresh", async () => {
    setAdvisorConversationContext(15, "457622", {
      lastResolvedOwners: [{ displayName: "LOZELL STYLES", memberId: "lozell-id" }],
      lastIntent: "owner_championships",
      lastScope: LEAGUE_HISTORY,
      lastLeagueId: "457622",
    });
    await resetAdvisorConversationSession(15, "457622");
    expect(getAdvisorConversationContext(15, "457622")).toBeNull();

    let pronounOwners: string[] = ["unset"];
    await runAdvisorEvidencePath(
      {
        message: "How many titles does he have?",
        leagueId: "457622",
        userId: 15,
        season: 2025,
        ownerAliases: OWNERS,
      },
      {
        assemblePackage: async (input) => {
          pronounOwners = input.owners.map((o) => o.displayName);
          throw new Error("stop-before-format");
        },
        getHistory: async () => [],
        buildFallbackMessages: async () => [{ role: "user", content: "llm-ok" }],
      },
    ).catch((err: Error) => {
      if (err.message !== "stop-before-format") throw err;
    });
    expect(pronounOwners).not.toContain("LOZELL STYLES");

    const namedPlan = planAdvisorEvidenceFromMessage("How many championships does Bruce Edwards have?", {
      leagueId: "457622",
      ownerAliases: OWNERS,
      currentSeason: 2025,
    });
    expect(namedPlan.intent).toBe("owner_championships");
  });
});
