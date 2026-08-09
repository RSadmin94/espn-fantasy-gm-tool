import { describe, expect, it } from "vitest";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";
import { classifyEspnPlayoffTier } from "./matchupPlayoffTier";
import type { GalleryGameRecord } from "./matchupGalleryQuery";
import {
  isGalleryLeaderboardAsk,
  isMatchupGalleryAsk,
  isMatchupGalleryFollowUpAsk,
  MATCHUP_GALLERY_TOOL_NAME,
  selectMatchupGalleryTool,
  tryMatchupGalleryToolAnswer,
} from "./matchupGalleryTool";

const ALIASES: AdvisorOwnerAlias[] = [
  { memberId: "rod-id", displayName: "Rod Sellers", aliases: ["rod sellers", "rod"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
  { memberId: "lozell-id", displayName: "LOZELL", aliases: ["lozell"] },
];

let nextId = 1;
function g(
  partial: Partial<GalleryGameRecord> &
    Pick<
      GalleryGameRecord,
      "season" | "week" | "homeScore" | "awayScore" | "homePersonId" | "awayPersonId" | "winnerPersonId"
    >,
): GalleryGameRecord {
  const isPlayoff = partial.isPlayoff ?? false;
  const playoffTierType =
    partial.playoffTierType === undefined ? (isPlayoff ? "WINNERS_BRACKET" : "NONE") : partial.playoffTierType;
  const names: Record<string, string> = {
    "id:rod": "Rod Sellers",
    "id:bruce": "Bruce Edwards",
    "id:lozell": "LOZELL",
  };
  return {
    matchupId: partial.matchupId ?? nextId++,
    season: partial.season,
    week: partial.week,
    matchupPeriodId: partial.matchupPeriodId ?? partial.week,
    isPlayoff,
    playoffTierType,
    playoffKind: classifyEspnPlayoffTier(playoffTierType, isPlayoff),
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: partial.homeScore,
    awayScore: partial.awayScore,
    homePersonId: partial.homePersonId,
    awayPersonId: partial.awayPersonId,
    homePersonName: names[partial.homePersonId ?? ""] ?? null,
    awayPersonName: names[partial.awayPersonId ?? ""] ?? null,
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeLogoUrl: null,
    awayLogoUrl: null,
    winnerPersonId: partial.winnerPersonId,
    ...partial,
  };
}

function games(): GalleryGameRecord[] {
  nextId = 1;
  return [
    g({
      season: 2011,
      week: 1,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 180,
      awayScore: 120,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2018,
      week: 4,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 101,
      awayScore: 100,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2018,
      week: 10,
      homePersonId: "id:rod",
      awayPersonId: "id:lozell",
      homeScore: 210,
      awayScore: 90,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2019,
      week: 2,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 95,
      awayScore: 140,
      winnerPersonId: "id:bruce",
    }),
    g({
      season: 2020,
      week: 15,
      isPlayoff: true,
      playoffTierType: "WINNERS_BRACKET",
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 88,
      awayScore: 99,
      winnerPersonId: "id:bruce",
    }),
    g({
      season: 2023,
      week: 7,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 160,
      awayScore: 108,
      winnerPersonId: "id:rod",
    }),
  ];
}

const ctx = {
  currentOwnerName: "Rod Sellers",
  ownerAliases: ALIASES,
};

describe("RFSN-053D matchup gallery tool selector", () => {
  it("selects No Mercy wins for the current owner", () => {
    const hit = selectMatchupGalleryTool("Show me all my No Mercy wins.", ctx);
    expect(hit?.toolName).toBe(MATCHUP_GALLERY_TOOL_NAME);
    expect(hit?.preset).toBe("no_mercy");
    expect(hit?.query).toMatchObject({
      ownerName: "Rod Sellers",
      marginMin: 50,
      result: "win",
      noMercy: true,
    });
  });

  it("selects one-point, championship, playoffs, closest, biggest, scores, season, opponent, and H2H", () => {
    expect(selectMatchupGalleryTool("Show me every one-point game.", ctx)?.query.onePoint).toBe(true);
    expect(selectMatchupGalleryTool("Show me every championship game.", ctx)?.query.championshipGames).toBe(true);
    expect(selectMatchupGalleryTool("Show me every playoff game.", ctx)?.query.phase).toBe("playoffs");
    expect(selectMatchupGalleryTool("Show me my closest wins.", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      result: "win",
      sort: "closest",
    });
    expect(selectMatchupGalleryTool("Show me my closest losses.", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      result: "loss",
      sort: "closest",
    });
    expect(selectMatchupGalleryTool("Show me my biggest wins.", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      result: "win",
      sort: "margin_desc",
    });
    expect(selectMatchupGalleryTool("Show me my biggest losses.", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      result: "loss",
      sort: "margin_desc",
    });
    expect(selectMatchupGalleryTool("Show me every game over 200 points.", ctx)?.query.scoreMin).toBe(200);
    expect(selectMatchupGalleryTool("Show me every game under 100 points.", ctx)?.query.scoreMax).toBe(100);
    expect(selectMatchupGalleryTool("Show me every game from 2018.", ctx)?.query).toMatchObject({
      seasonFrom: 2018,
      seasonTo: 2018,
    });
    expect(selectMatchupGalleryTool("Show me all games against LOZELL.", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      opponentName: "LOZELL",
    });
    expect(selectMatchupGalleryTool("Show me every game I beat Bruce.", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      opponentName: "Bruce Edwards",
      result: "win",
    });
    expect(selectMatchupGalleryTool("Show Rod vs Bruce", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      opponentName: "Bruce Edwards",
    });
    expect(selectMatchupGalleryTool("Show me my playoff losses.", ctx)?.query).toMatchObject({
      ownerName: "Rod Sellers",
      phase: "playoffs",
      result: "loss",
    });
  });

  it("does not steal leaderboards or singular facts", () => {
    for (const q of [
      "Who has the most championships?",
      "Who reaches the most?",
      "Who has the best record?",
      "Who has the most one-point losses?",
      "Who has the most blowouts?",
      "Who drafts QBs early?",
      "What's my biggest win?",
      "Rod vs Bruce",
    ]) {
      expect(isMatchupGalleryAsk(q), q).toBe(false);
      expect(isGalleryLeaderboardAsk(q) || !isMatchupGalleryAsk(q), q).toBe(true);
      expect(selectMatchupGalleryTool(q, ctx), q).toBeNull();
    }
  });

  it("merges follow-up filters onto the prior gallery query", () => {
    const prior = selectMatchupGalleryTool("Show me all my No Mercy wins.", ctx)!.query;
    const follow = selectMatchupGalleryTool("Show only the playoff ones.", {
      ...ctx,
      lastIntent: "matchup_gallery",
      priorFilter: prior,
    });
    expect(isMatchupGalleryFollowUpAsk("Show only the playoff ones.")).toBe(true);
    expect(follow?.query).toMatchObject({
      ownerName: "Rod Sellers",
      noMercy: true,
      marginMin: 50,
      result: "win",
      phase: "playoffs",
    });

    const h2h = selectMatchupGalleryTool("Show Rod vs Bruce", ctx)!.query;
    const season = selectMatchupGalleryTool("Now only 2018.", {
      ...ctx,
      lastIntent: "matchup_gallery",
      priorFilter: h2h,
    });
    expect(season?.query).toMatchObject({
      ownerName: "Rod Sellers",
      opponentName: "Bruce Edwards",
      seasonFrom: 2018,
      seasonTo: 2018,
    });
  });
});

describe("RFSN-053D tryMatchupGalleryToolAnswer", () => {
  it("returns summary + visual without inventing games", async () => {
    const hit = await tryMatchupGalleryToolAnswer({
      leagueId: "457622",
      message: "Show me all my No Mercy wins.",
      currentOwnerName: "Rod Sellers",
      ownerAliases: ALIASES,
      loadGames: async () => games(),
    });
    expect(hit?.toolName).toBe(MATCHUP_GALLERY_TOOL_NAME);
    expect(hit?.visual.type).toBe("matchup_gallery");
    expect(hit?.visual.preset).toBe("no_mercy");
    expect(hit?.visual.filters).toMatchObject({
      owner: "Rod Sellers",
      marginMin: 50,
      winsOnly: true,
    });
    expect(hit?.visual.href).toMatch(/^\/league\/history\/matchups/);
    expect(hit?.answer.toLowerCase()).toMatch(/no mercy/);
    expect(hit?.visual.result.matchups.every((m) => m.margin >= 50 - 1e-9)).toBe(true);
    expect(hit?.visual.result.matchups.every((m) => m.winnerPersonId === "id:rod")).toBe(true);
  });

  it("returns honest empty championship visual when tier cannot be proven", async () => {
    const hit = await tryMatchupGalleryToolAnswer({
      leagueId: "457622",
      message: "Show me every championship game.",
      currentOwnerName: "Rod Sellers",
      ownerAliases: ALIASES,
      loadGames: async () => games().filter((g) => !g.isPlayoff),
    });
    expect(hit?.visual.type).toBe("matchup_gallery");
    expect(hit?.visual.result.empty).toBe(true);
    expect(hit?.visual.result.emptyReason).toBe("insufficient_playoff_tier");
    expect(hit?.visual.result.matchups).toEqual([]);
    expect(hit?.answer.toLowerCase()).not.toMatch(/invent|probably|likely title/);
  });
});
