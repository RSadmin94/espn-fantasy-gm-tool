import { describe, expect, it } from "vitest";
import { STORY_COLLECTION_IDS } from "./matchupStoryCollections";
import {
  collectionToShareCard,
  matchupToShareCard,
  recordToShareCard,
  withShareCardPresentation,
  type ShareMatchupInput,
} from "./historicalShareCard";
import {
  SHARE_CARD_SCALES,
  parseShareCardModel,
  shareCardExportFilename,
  shareCardExportSize,
  shareCardVisualHashInput,
} from "./shareCardExport";

function matchup(): ShareMatchupInput {
  return {
    matchupId: 11,
    season: 2025,
    week: 12,
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
  };
}

describe("RFSN-053G export contract", () => {
  it("names matchup, collection, and record cards deterministically", () => {
    expect(shareCardExportFilename(matchupToShareCard(matchup(), { collectionId: "no-mercy" }))).toBe(
      "no-mercy-2025-week-12-rod-vs-bruce.png",
    );
    expect(
      shareCardExportFilename(
        collectionToShareCard("blood-rival", { ownerName: "Rod Sellers", opponentName: "Bruce Edwards", count: 19 }),
      ),
    ).toBe("blood-rival-rod-vs-bruce.png");
    expect(
      shareCardExportFilename(
        matchupToShareCard(
          { ...matchup(), season: 2018, week: 9, margin: 0.8, homeScore: 100.8, awayScore: 100, gameType: "nailbiter" },
          { collectionId: "heartbreak" },
        ),
      ),
    ).toBe("heartbreak-2018-week-9-rod-vs-bruce.png");
    expect(
      shareCardExportFilename(
        recordToShareCard({
          title: "Largest blowout",
          label: "Largest Margin",
          value: "88.4",
          theme: "cashier",
        }),
      ),
    ).toBe("cashier-largest-margin.png");
  });

  it("supports 1x 2x 4x pixel sizes for every layout", () => {
    expect(shareCardExportSize("landscape", 1)).toEqual({ width: 1920, height: 1080, scale: 1 });
    expect(shareCardExportSize("portrait", 2)).toEqual({ width: 2160, height: 3840, scale: 2 });
    expect(shareCardExportSize("square", 4)).toEqual({ width: 4320, height: 4320, scale: 4 });
    expect(SHARE_CARD_SCALES).toEqual([1, 2, 4]);
  });

  it("visual hash ignores href/provenance so repeat exports stay cacheable", () => {
    const a = matchupToShareCard(matchup(), { collectionId: "no-mercy", provenance: ["viewer"] });
    const b = matchupToShareCard(matchup(), { collectionId: "no-mercy", provenance: ["gallery"], href: "/other" });
    expect(shareCardVisualHashInput(a)).toEqual(shareCardVisualHashInput(b));
  });

  it("parses every collection theme model and rejects garbage", () => {
    for (const id of STORY_COLLECTION_IDS) {
      const model = collectionToShareCard(id, { count: 3 });
      expect(parseShareCardModel(model)?.theme).toBe(id);
      expect(parseShareCardModel(withShareCardPresentation(model, { layout: "square" }))?.layout).toBe("square");
    }
    expect(parseShareCardModel({ type: "matchup" })).toBeNull();
    expect(parseShareCardModel(null)).toBeNull();
  });
});
