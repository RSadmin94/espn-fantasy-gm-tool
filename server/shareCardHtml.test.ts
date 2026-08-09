import { describe, expect, it } from "vitest";
import { STORY_COLLECTION_IDS } from "@shared/matchupStoryCollections";
import {
  SHARE_CARD_LAYOUTS,
  collectionToShareCard,
  matchupToShareCard,
  recordToShareCard,
  withShareCardPresentation,
  type ShareMatchupInput,
} from "@shared/historicalShareCard";
import { buildShareCardExportHtml } from "./shareCardHtml";

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

describe("RFSN-053G ShareCardRenderer HTML", () => {
  it("SSRs matchup, collection, and record from ShareCardRenderer", () => {
    const matchupHtml = buildShareCardExportHtml(matchupToShareCard(matchup(), { collectionId: "no-mercy" }));
    const collectionHtml = buildShareCardExportHtml(collectionToShareCard("heartbreak", { count: 4 }));
    const recordHtml = buildShareCardExportHtml(
      recordToShareCard({
        title: "Hall of Fame",
        label: "Championships",
        value: "3",
        owner: "Rod Sellers",
        badges: ["CHAMPIONSHIP"],
        theme: "championship",
      }),
    );
    expect(matchupHtml).toContain('data-share-card-root');
    expect(matchupHtml).toContain('data-share-card-type="matchup"');
    expect(matchupHtml).toContain("Rod Sellers");
    expect(matchupHtml).toContain("NO MERCY");
    expect(collectionHtml).toContain('data-share-card-type="collection"');
    expect(collectionHtml).toContain("Heartbreak");
    expect(recordHtml).toContain('data-share-card-type="record"');
    expect(recordHtml).toContain("Championships");
    expect(matchupHtml).not.toMatch(/openai|anthropic|narrat/i);
  });

  it("keeps every collection theme and layout on the same root", () => {
    for (const id of STORY_COLLECTION_IDS) {
      const html = buildShareCardExportHtml(collectionToShareCard(id, { count: 1 }));
      expect(html).toContain(`data-share-card-theme="${id}"`);
    }
    const base = matchupToShareCard(matchup(), { collectionId: "cashier" });
    for (const layout of SHARE_CARD_LAYOUTS) {
      const html = buildShareCardExportHtml(withShareCardPresentation(base, { layout }));
      expect(html).toContain(`data-share-card-layout="${layout}"`);
    }
  });
});
