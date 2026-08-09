import { describe, expect, it } from "vitest";
import {
  CASHIER_SCORE_MIN,
  STORY_COLLECTIONS,
  STORY_COLLECTION_IDS,
  STORY_NO_MERCY_MARGIN,
  compileStoryCollectionFilters,
  inferStoryCollection,
  isStoryCollectionId,
  storyCollectionHref,
  storyCollectionPath,
} from "./matchupStoryCollections";

describe("RFSN-053E story collection catalog", () => {
  it("exposes every initial collection with id, title, subtitle, description, badge, and theme", () => {
    expect(STORY_COLLECTIONS.map((c) => c.id)).toEqual([...STORY_COLLECTION_IDS]);
    for (const c of STORY_COLLECTIONS) {
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.subtitle.trim().length).toBeGreaterThan(0);
      expect(c.description.trim().length).toBeGreaterThan(0);
      expect(c.badge.trim().length).toBeGreaterThan(0);
      expect(c.theme.accent).toBeTruthy();
      expect(c.theme.icon).toBeTruthy();
    }
  });

  it("compiles each collection into queryMatchupGallery filters without extra math", () => {
    const ctx = { ownerName: "Rod Sellers", opponentName: "Bruce Edwards" };
    expect(compileStoryCollectionFilters("no-mercy", ctx)).toMatchObject({
      ownerName: "Rod Sellers",
      noMercy: true,
      marginMin: STORY_NO_MERCY_MARGIN,
      result: "win",
    });
    expect(compileStoryCollectionFilters("heartbreak", ctx)).toMatchObject({
      ownerName: "Rod Sellers",
      onePoint: true,
    });
    expect(compileStoryCollectionFilters("championship", ctx)).toMatchObject({
      championshipGames: true,
    });
    expect(compileStoryCollectionFilters("blood-rival", ctx)).toMatchObject({
      ownerName: "Rod Sellers",
      opponentName: "Bruce Edwards",
    });
    expect(compileStoryCollectionFilters("closest-calls", ctx)).toMatchObject({
      sort: "closest",
    });
    expect(compileStoryCollectionFilters("statement-wins", ctx)).toMatchObject({
      ownerName: "Rod Sellers",
      result: "win",
      sort: "highest_score",
    });
    expect(compileStoryCollectionFilters("biggest-collapses", ctx)).toMatchObject({
      ownerName: "Rod Sellers",
      result: "loss",
      sort: "margin_desc",
    });
    expect(compileStoryCollectionFilters("cashier", ctx)).toMatchObject({
      scoreMin: CASHIER_SCORE_MIN,
      sort: "highest_score",
    });
  });

  it("does not force No Mercy wins when no owner is named (win filter needs an owner)", () => {
    const leagueWide = compileStoryCollectionFilters("no-mercy", {});
    expect(leagueWide.noMercy).toBeUndefined();
    expect(leagueWide.result).toBeUndefined();
    expect(leagueWide.marginMin).toBe(STORY_NO_MERCY_MARGIN);
  });

  it("routes collection hrefs under /league/history/matchups/c/:id", () => {
    expect(storyCollectionPath("heartbreak")).toBe("/league/history/matchups/c/heartbreak");
    expect(storyCollectionHref("blood-rival", { ownerName: "Rod Sellers", opponentName: "Bruce Edwards" })).toBe(
      "/league/history/matchups/c/blood-rival?ownerName=Rod+Sellers&opponentName=Bruce+Edwards",
    );
    expect(isStoryCollectionId("cashier")).toBe(true);
    expect(isStoryCollectionId("nope")).toBe(false);
  });

  it("infers collection ids from compiled filters", () => {
    expect(inferStoryCollection({ noMercy: true, marginMin: 50, result: "win" })).toBe("no-mercy");
    expect(inferStoryCollection({ onePoint: true })).toBe("heartbreak");
    expect(inferStoryCollection({ championshipGames: true })).toBe("championship");
    expect(inferStoryCollection({ ownerName: "Rod", opponentName: "Bruce" })).toBe("blood-rival");
    expect(inferStoryCollection({ sort: "closest" })).toBe("closest-calls");
    expect(inferStoryCollection({ result: "win", sort: "highest_score" })).toBe("statement-wins");
    expect(inferStoryCollection({ result: "loss", sort: "margin_desc" })).toBe("biggest-collapses");
    expect(inferStoryCollection({ scoreMin: CASHIER_SCORE_MIN, sort: "highest_score" })).toBe("cashier");
  });
});
