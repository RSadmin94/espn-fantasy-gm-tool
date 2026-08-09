import { describe, expect, it } from "vitest";
import { STORY_COLLECTION_IDS } from "./matchupStoryCollections";
import {
  SHARE_CARD_LAYOUTS,
  SHARE_CARD_THEME_IDS,
  SHARE_CARD_THEMES,
  collectionToShareCard,
  inferShareCardTheme,
  matchupToShareCard,
  recordToShareCard,
  shareBadgesFromMatchup,
  withShareCardPresentation,
  type ShareMatchupInput,
} from "./historicalShareCard";

function matchup(over: Partial<ShareMatchupInput> = {}): ShareMatchupInput {
  return {
    matchupId: 11,
    season: 2011,
    week: 1,
    phase: "regular",
    isChampionshipGame: false,
    homeDisplayName: "Rod Sellers",
    awayDisplayName: "Bruce Edwards",
    homeScore: 180,
    awayScore: 120,
    margin: 60,
    winnerPersonId: "id:rod",
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    winnerDisplayName: "Rod Sellers",
    homeLogoUrl: null,
    awayLogoUrl: null,
    gameType: "blowout",
    viewerHref: "/league/history/matchups/11",
    ...over,
  };
}

describe("RFSN-053F ShareCardModel", () => {
  it("covers every collection theme as config, not components", () => {
    for (const id of STORY_COLLECTION_IDS) {
      expect(SHARE_CARD_THEME_IDS).toContain(id);
      expect(SHARE_CARD_THEMES[id].treatment).toBeTruthy();
      expect(SHARE_CARD_THEMES[id].background).toMatch(/^#/);
    }
    expect(SHARE_CARD_LAYOUTS).toEqual(["landscape", "portrait", "square"]);
  });

  it("builds a matchup model with winner/loser, badges, and provenance", () => {
    const model = matchupToShareCard(matchup(), {
      collectionId: "no-mercy",
      leagueName: "ATLANTAS FINEST FF",
    });
    expect(model.type).toBe("matchup");
    expect(model.theme).toBe("no-mercy");
    expect(model.layout).toBe("landscape");
    expect(model.league).toEqual({ name: "ATLANTAS FINEST FF", season: 2011 });
    expect(model.matchup?.winner.name).toBe("Rod Sellers");
    expect(model.matchup?.loser.name).toBe("Bruce Edwards");
    expect(model.matchup?.winner.score).toBe(180);
    expect(model.matchup?.margin).toBe(60);
    expect(model.badges).toContain("NO MERCY");
    expect(model.provenance).toContain("queryMatchupGallery");
    expect(model.provenance).toContain("matchupId:11");
    expect(model.provenance).toContain("storyCollection:no-mercy");
    expect(model.href).toContain("/league/history/matchups/11");
  });

  it("builds a collection model for every story collection", () => {
    for (const id of STORY_COLLECTION_IDS) {
      const model = collectionToShareCard(id, { count: 22, leagueName: "ATLANTAS FINEST FF" });
      expect(model.type).toBe("collection");
      expect(model.theme).toBe(id);
      expect(model.collection?.id).toBe(id);
      expect(model.collection?.count).toBe(22);
      expect(model.provenance).toContain(`storyCollection:${id}`);
      expect(model.href).toBe(`/league/history/matchups/c/${id}`);
    }
  });

  it("builds a record model without inventing copy", () => {
    const model = recordToShareCard({
      title: "Largest blowout",
      label: "Largest Margin",
      value: "88.4 pt",
      owner: "Rod Sellers def. Bruce Edwards",
      season: 2014,
      week: 2,
      badges: ["LEAGUE RECORD", "LARGEST MARGIN", "NO MERCY"],
      theme: "no-mercy",
      provenance: ["largestBlowout"],
    });
    expect(model.type).toBe("record");
    expect(model.theme).toBe("no-mercy");
    expect(model.record?.label).toBe("Largest Margin");
    expect(model.record?.value).toBe("88.4 pt");
    expect(model.record?.owner).toBe("Rod Sellers def. Bruce Edwards");
    expect(model.badges).toEqual(["LEAGUE RECORD", "LARGEST MARGIN", "NO MERCY"]);
    expect(model.provenance).toContain("leagueRecords");
    expect(model.provenance).toContain("largestBlowout");
  });

  it("infers themes from deterministic badges when no collection is named", () => {
    expect(inferShareCardTheme({ type: "matchup", badges: ["ONE POINT"] })).toBe("heartbreak");
    expect(inferShareCardTheme({ type: "matchup", badges: ["CHAMPIONSHIP"] })).toBe("championship");
    expect(inferShareCardTheme({ type: "matchup", badges: ["CLOSEST"] })).toBe("closest-calls");
    expect(inferShareCardTheme({ type: "record", badges: ["LEAGUE RECORD"] })).toBe("neutral");
  });

  it("championship badge is only added when isChampionshipGame is true", () => {
    expect(shareBadgesFromMatchup({ phase: "playoffs", isChampionshipGame: false, margin: 8, gameType: "close" })).toEqual([
      "PLAYOFF",
    ]);
    expect(shareBadgesFromMatchup({ phase: "playoffs", isChampionshipGame: true, margin: 8, gameType: "close" })).toEqual([
      "CHAMPIONSHIP",
      "PLAYOFF",
    ]);
  });

  it("withShareCardPresentation overrides theme/layout without mutating facts", () => {
    const base = matchupToShareCard(matchup(), { collectionId: "no-mercy" });
    const next = withShareCardPresentation(base, { theme: "heartbreak", layout: "square" });
    expect(next.theme).toBe("heartbreak");
    expect(next.layout).toBe("square");
    expect(next.matchup?.margin).toBe(base.matchup?.margin);
    expect(next.badges).toEqual(base.badges);
    expect(base.theme).toBe("no-mercy");
    expect(base.layout).toBe("landscape");
  });

  it("blood rival collection keeps owner/opponent on the model", () => {
    const model = collectionToShareCard("blood-rival", {
      ownerName: "Rod Sellers",
      opponentName: "Bruce Edwards",
      count: 19,
    });
    expect(model.collection?.ownerName).toBe("Rod Sellers");
    expect(model.collection?.opponentName).toBe("Bruce Edwards");
    expect(model.theme).toBe("blood-rival");
  });
});
