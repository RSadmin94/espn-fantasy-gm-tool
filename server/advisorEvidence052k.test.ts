/**
 * RFSN-052K — Matchup margin intent expansion.
 * Largest-win / blowout / combined-score routing must not fall through to one-point losses.
 */
import { describe, expect, it } from "vitest";
import {
  formatDeterministicAdvisorAnswer,
} from "./advisorEvidenceExecutor";
import {
  buildAdvisorEvidencePackage,
  type AdvisorEvidenceSources,
} from "./advisorEvidencePackage";
import { planAdvisorEvidenceFromMessage } from "./advisorEvidencePlanner";
import {
  computeMatchupMarginAnalytics,
  formatMatchupMarginAnswer,
  type MarginGameRecord,
} from "./matchupMarginAnalytics";
import {
  MATCHUP_MARGIN_TOOL_NAME,
  selectMatchupMarginTool,
  tryMatchupMarginToolAnswer,
} from "./matchupMarginTool";
import type { AdvisorQuestionScope } from "./advisorScopeResolver";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";

const LEAGUE_HISTORY: AdvisorQuestionScope = {
  scopeType: "league_history",
  startSeason: null,
  endSeason: null,
  phase: "regular",
  ownerNames: [],
  confidence: "medium",
  explicitSeasonRequested: false,
};

const OWNERS: AdvisorOwnerAlias[] = [
  { memberId: "graham-id", displayName: "Christian Graham", aliases: ["christian graham", "graham"] },
  { memberId: "rod-id", displayName: "Rod Sellers", aliases: ["rod sellers", "rod"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
];

function game(
  partial: Partial<MarginGameRecord> &
    Pick<
      MarginGameRecord,
      "season" | "homeScore" | "awayScore" | "homePersonId" | "awayPersonId" | "winnerPersonId"
    >,
): MarginGameRecord {
  return {
    week: 1,
    matchupPeriodId: 1,
    isPlayoff: false,
    homeTeamId: 1,
    awayTeamId: 2,
    homePersonName:
      partial.homePersonId === "id:graham"
        ? "Christian Graham"
        : partial.homePersonId === "id:rod"
          ? "Rod Sellers"
          : partial.homePersonId === "id:bruce"
            ? "Bruce Edwards"
            : "Home",
    awayPersonName:
      partial.awayPersonId === "id:graham"
        ? "Christian Graham"
        : partial.awayPersonId === "id:rod"
          ? "Rod Sellers"
          : partial.awayPersonId === "id:bruce"
            ? "Bruce Edwards"
            : "Away",
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    ...partial,
  };
}

const games: MarginGameRecord[] = [
  game({
    season: 2016,
    week: 2,
    homePersonId: "id:graham",
    awayPersonId: "id:bruce",
    homeScore: 178.4,
    awayScore: 100.0,
    winnerPersonId: "id:graham",
  }),
  game({
    season: 2018,
    week: 7,
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    homeScore: 164.1,
    awayScore: 90.0,
    winnerPersonId: "id:rod",
  }),
  game({
    season: 2020,
    week: 4,
    homePersonId: "id:bruce",
    awayPersonId: "id:rod",
    homeScore: 149.8,
    awayScore: 80.0,
    winnerPersonId: "id:bruce",
  }),
  game({
    season: 2019,
    week: 11,
    homePersonId: "id:graham",
    awayPersonId: "id:rod",
    homeScore: 155.2,
    awayScore: 150.1,
    winnerPersonId: "id:graham",
  }),
  game({
    season: 2021,
    week: 3,
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    homeScore: 88.0,
    awayScore: 70.0,
    winnerPersonId: "id:rod",
  }),
  game({
    season: 2022,
    week: 9,
    isPlayoff: true,
    homePersonId: "id:graham",
    awayPersonId: "id:bruce",
    homeScore: 190.0,
    awayScore: 100.0,
    winnerPersonId: "id:graham",
  }),
];

const MARGIN_PLAN = {
  intent: "matchup_margins" as const,
  authorities: ["owner_identity", "matchup_margins"] as const,
  deterministicFirst: true,
  narrativeAllowed: false,
  requiredEvidence: ["margin_query"],
  fallbackToAdvisorContext: false,
};

function sources(extra: Partial<AdvisorEvidenceSources> = {}): AdvisorEvidenceSources {
  return {
    leagueName: "ATLANTAS FINEST FF",
    provider: "espn",
    coverageStartSeason: 2010,
    coverageEndSeason: 2025,
    persons: [],
    ...extra,
  };
}

describe("RFSN-052K planner", () => {
  it("routes largest-margin phrasing to matchup_margins, not H2H or fallback", () => {
    for (const q of [
      "who has the largest margin of victory in a single game",
      "Who has the largest margin of victory?",
      "What was the largest margin of victory in league history?",
      "What's my biggest win?",
      "What's Rod's biggest win over Bruce?",
      "biggest blowout",
      "highest combined score",
      "largest upset",
    ]) {
      expect(
        planAdvisorEvidenceFromMessage(q, { ownerAliases: OWNERS, currentSeason: 2026 }).intent,
        q,
      ).toBe("matchup_margins");
    }
  });
});

describe("RFSN-052K analytics + format", () => {
  it("answers the screenshot single-game ask with the actual blowout, not one-point losses", async () => {
    const out = await tryMatchupMarginToolAnswer({
      leagueId: "457622",
      message: "who has the largest margin of victory in a single game",
      games,
    });
    expect(out?.toolName).toBe(MATCHUP_MARGIN_TOOL_NAME);
    expect(out?.query.metric).toBe("largest_margin");
    expect(out?.query.aggregation).toBe("single_game");
    expect(out?.answer).toMatch(/Christian Graham recorded the largest margin of victory/i);
    expect(out?.answer).toMatch(/78\.4/);
    expect(out?.answer).toMatch(/Bruce Edwards/);
    expect(out?.answer).toMatch(/Week 2 of the 2016/);
    expect(out?.answer).not.toMatch(/one-point/i);
  });

  it("leaderboard ranks max margin by owner", () => {
    const result = computeMatchupMarginAnalytics(games, {
      metric: "largest_margin",
      aggregation: "owner_max",
      phase: "regular",
      topN: 5,
    });
    expect(result.ownerMaxMargins.map((r) => r.displayName)).toEqual([
      "Christian Graham",
      "Rod Sellers",
      "Bruce Edwards",
    ]);
    expect(result.ownerMaxMargins[0]?.maxMargin).toBe(78.4);
    const answer = formatMatchupMarginAnswer(result);
    expect(answer).toMatch(/Largest single-game victory margins/i);
    expect(answer).toMatch(/1\. Christian Graham – 78\.4/);
    expect(answer).toMatch(/2\. Rod Sellers – 74\.1/);
  });

  it("personal biggest win filters to the resolved owner", async () => {
    const out = await tryMatchupMarginToolAnswer({
      leagueId: "457622",
      message: "What's my biggest win?",
      games,
      resolvedOwnerNames: ["Rod Sellers"],
    });
    expect(out?.query.ownerName).toBe("Rod Sellers");
    expect(out?.answer).toMatch(/Rod Sellers recorded their largest margin of victory/i);
    expect(out?.answer).toMatch(/74\.1/);
    expect(out?.answer).not.toMatch(/Christian Graham recorded the largest/i);
  });

  it("opponent filter uses Rod vs Bruce only", () => {
    const result = computeMatchupMarginAnalytics(games, {
      metric: "largest_margin",
      aggregation: "single_game",
      phase: "regular",
      ownerName: "Rod",
      opponentName: "Bruce",
    });
    expect(result.highlightGame?.winnerName).toBe("Rod Sellers");
    expect(result.highlightGame?.loserName).toBe("Bruce Edwards");
    expect(result.highlightGame?.margin).toBe(74.1);
    const answer = formatMatchupMarginAnswer(result);
    expect(answer).toMatch(/over Bruce Edwards/i);
    expect(answer).toMatch(/74\.1/);
  });

  it("defaults to regular season so playoff blowouts are excluded", () => {
    const result = computeMatchupMarginAnalytics(games, {
      metric: "largest_margin",
      aggregation: "single_game",
      phase: "regular",
    });
    expect(result.highlightGame?.season).toBe(2016);
    expect(result.highlightGame?.margin).toBe(78.4);
  });

  it("highest combined and lowest winning score use final scores only", () => {
    const high = computeMatchupMarginAnalytics(games, {
      metric: "highest_combined_score",
      phase: "regular",
    });
    expect(high.highlightGame?.combinedScore).toBe(305.3);
    expect(formatMatchupMarginAnswer(high)).toMatch(/Highest combined score/i);

    const lowWin = computeMatchupMarginAnalytics(games, {
      metric: "lowest_winning_score",
      phase: "regular",
    });
    expect(lowWin.highlightGame?.winnerScore).toBe(88);
    expect(formatMatchupMarginAnswer(lowWin)).toMatch(/Lowest winning score/i);
  });

  it("comeback, upset, and halftime stay unsupported with a named missing dataset", () => {
    for (const metric of ["largest_comeback", "largest_upset", "largest_halftime_deficit"] as const) {
      const result = computeMatchupMarginAnalytics(games, { metric, phase: "regular" });
      expect(result.unsupported, metric).toBe(true);
      expect(formatMatchupMarginAnswer(result), metric).toMatch(/Missing dataset/i);
    }
  });

  it("personal ask without a resolved owner names the missing identity", () => {
    const result = computeMatchupMarginAnalytics(games, {
      metric: "largest_margin",
      aggregation: "single_game",
      personalAsk: true,
      phase: "regular",
    });
    expect(result.unsupported).toBe(true);
    expect(formatMatchupMarginAnswer(result)).toMatch(/resolved owner identity/i);
  });
});

describe("RFSN-052K executor", () => {
  it("returns the formatted largest-margin answer deterministically", () => {
    const analytics = computeMatchupMarginAnalytics(games, {
      metric: "largest_margin",
      aggregation: "single_game",
      phase: "regular",
    });
    const pkg = buildAdvisorEvidencePackage(
      {
        message: "who has the largest margin of victory in a single game",
        leagueId: "457622",
        scope: LEAGUE_HISTORY,
        owners: [],
        plan: { ...MARGIN_PLAN, authorities: [...MARGIN_PLAN.authorities] },
      },
      sources({
        margins: analytics,
        marginsAnswer: formatMatchupMarginAnswer(analytics),
      }),
    );
    const out = formatDeterministicAdvisorAnswer(pkg);
    expect(out?.tool).toBe("query_matchup_margins");
    expect(out?.message).toMatch(/Christian Graham/);
    expect(out?.message).toMatch(/78\.4/);
    expect(out?.message).not.toMatch(/one-point/i);
  });
});
