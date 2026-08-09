import { describe, expect, it } from "vitest";
import type { GalleryMatchup } from "../../../server/matchupGalleryQuery";
import {
  activeGalleryPreset,
  applyGalleryPreset,
  galleryCardBadges,
  galleryEmptyCopy,
  galleryFilterChips,
  galleryFilterToQueryInput,
  matchupViewHref,
  noMercyPresetFilter,
  parseGallerySearchParams,
  serializeGallerySearchParams,
  visualFiltersToGalleryUi,
} from "./matchupGalleryUi";

function matchup(over: Partial<GalleryMatchup> = {}): GalleryMatchup {
  return {
    matchupId: 1,
    season: 2018,
    week: 16,
    matchupPeriodId: 16,
    phase: "regular",
    playoffKind: "none",
    isChampionshipGame: false,
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    homeDisplayName: "Rod Sellers",
    awayDisplayName: "Bruce Edwards",
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeLogoUrl: null,
    awayLogoUrl: null,
    homeScore: 160,
    awayScore: 108,
    margin: 52,
    winnerPersonId: "id:rod",
    winnerDisplayName: "Rod Sellers",
    gameType: "blowout",
    viewerHref: "/league/history/matchups/1",
    ...over,
  };
}

describe("RFSN-053C matchup gallery UI model", () => {
  it("builds the No Mercy preset with active owner, margin 50, and wins only", () => {
    const preset = noMercyPresetFilter("Rod Sellers");
    expect(preset.ownerName).toBe("Rod Sellers");
    expect(preset.marginMin).toBe(50);
    expect(preset.result).toBe("win");
    expect(preset.noMercy).toBe(true);
    const input = galleryFilterToQueryInput(preset);
    expect(input.noMercy).toBe(true);
    expect(input.marginMin).toBe(50);
    expect(input.result).toBe("win");
    expect(input.ownerName).toBe("Rod Sellers");
  });

  it("parses owner, opponent, phase, season, week, and championship from the URL", () => {
    const filter = parseGallerySearchParams(
      "ownerName=Rod+Sellers&opponentName=Bruce+Edwards&phase=playoffs&seasonFrom=2011&seasonTo=2018&week=14&championship=1",
    );
    expect(filter.ownerName).toBe("Rod Sellers");
    expect(filter.opponentName).toBe("Bruce Edwards");
    expect(filter.phase).toBe("playoffs");
    expect(filter.seasonFrom).toBe(2011);
    expect(filter.seasonTo).toBe(2018);
    expect(filter.week).toBe(14);
    expect(filter.championshipGames).toBe(true);
    const single = parseGallerySearchParams("season=2014");
    expect(single.season).toBe(2014);
    expect(single.seasonFrom).toBe(2014);
    expect(single.seasonTo).toBe(2014);
    expect(galleryFilterToQueryInput(single).seasonFrom).toBe(2014);
    expect(galleryFilterToQueryInput(single).seasonTo).toBe(2014);
  });

  it("applies No Mercy route preset on top of search params", () => {
    const filter = parseGallerySearchParams("ownerName=Rod+Sellers", "no-mercy");
    expect(filter.noMercy).toBe(true);
    expect(filter.marginMin).toBe(50);
    expect(filter.result).toBe("win");
    expect(filter.ownerName).toBe("Rod Sellers");
  });

  it("maps each empty reason to a distinct title — never a generic No results", () => {
    const reasons = [
      "missing_dataset",
      "unresolved_owner",
      "unresolved_opponent",
      "no_matching_games",
      "insufficient_playoff_tier",
    ] as const;
    const titles = reasons.map((r) => galleryEmptyCopy(r).title);
    expect(new Set(titles).size).toBe(5);
    for (const title of titles) {
      expect(title.toLowerCase()).not.toBe("no results");
      expect(title.toLowerCase()).not.toBe("no results.");
    }
    expect(galleryEmptyCopy("insufficient_playoff_tier").title).toMatch(/championship/i);
    expect(galleryEmptyCopy("unresolved_owner").title).toMatch(/owner/i);
    expect(galleryEmptyCopy("unresolved_opponent").title).toMatch(/opponent/i);
    expect(galleryEmptyCopy("missing_dataset").title).toMatch(/recorded matchups/i);
  });

  it("shows CHAMPIONSHIP badge only when the contract says isChampionshipGame", () => {
    expect(galleryCardBadges(matchup({ isChampionshipGame: true, phase: "playoffs", margin: 8, gameType: "close" }))).toContain(
      "CHAMPIONSHIP",
    );
    expect(
      galleryCardBadges(matchup({ isChampionshipGame: false, phase: "playoffs", margin: 8, gameType: "close" })),
    ).not.toContain("CHAMPIONSHIP");
  });

  it("shows ONE-POINT badge from returned margin, PLAYOFF from phase, NO MERCY from blowout/margin", () => {
    const onePoint = galleryCardBadges(
      matchup({ margin: 0.8, gameType: "nailbiter", isChampionshipGame: false, phase: "regular" }),
      { scoringPrecision: "two_decimals" },
    );
    expect(onePoint).toContain("ONE POINT");
    expect(onePoint).not.toContain("NO MERCY");
    expect(onePoint).not.toContain("CHAMPIONSHIP");

    const playoff = galleryCardBadges(
      matchup({ phase: "playoffs", margin: 12, gameType: "close", isChampionshipGame: false }),
    );
    expect(playoff).toContain("PLAYOFF");

    const mercy = galleryCardBadges(matchup({ margin: 52, gameType: "blowout", phase: "regular" }));
    expect(mercy).toContain("NO MERCY");
  });

  it("adds CLOSEST badge only when the active sort is closest", () => {
    const row = matchup({ margin: 0.4, gameType: "nailbiter", phase: "regular" });
    expect(galleryCardBadges(row)).not.toContain("CLOSEST");
    expect(galleryCardBadges(row, { sort: "closest" })).toContain("CLOSEST");
  });

  it("does not invent championship or playoff claims from margin alone", () => {
    const badges = galleryCardBadges(
      matchup({ isChampionshipGame: false, phase: "regular", margin: 60, gameType: "blowout" }),
    );
    expect(badges).toContain("NO MERCY");
    expect(badges).not.toContain("CHAMPIONSHIP");
    expect(badges).not.toContain("PLAYOFF");
  });

  it("serializes filters without fake all-time language", () => {
    const qs = serializeGallerySearchParams({
      ownerName: "Rod Sellers",
      opponentName: "Bruce Edwards",
      phase: "regular",
      seasonFrom: 2011,
      seasonTo: 2012,
      onePoint: true,
    });
    expect(qs).toContain("ownerName=Rod+Sellers");
    expect(qs).toContain("opponentName=Bruce+Edwards");
    expect(qs).toContain("phase=regular");
    expect(qs).toContain("seasonFrom=2011");
    expect(qs).toContain("onePoint=1");
    expect(serializeGallerySearchParams({ season: 2014, week: 3 })).toBe("season=2014&week=3");
    expect(qs).not.toMatch(/all-time/i);
    const chips = galleryFilterChips({
      ownerName: "Rod Sellers",
      opponentName: "Bruce Edwards",
      phase: "playoffs",
      seasonFrom: 2011,
      seasonTo: 2012,
    });
    expect(chips.map((c) => c.label).join(" ")).toMatch(/Rod Sellers/);
    expect(chips.map((c) => c.label).join(" ")).toMatch(/Bruce Edwards/);
    expect(chips.map((c) => c.label).join(" ")).toMatch(/Playoffs/);
    expect(chips.map((c) => c.label).join(" ")).toMatch(/2011–2012/);
  });

  it("maps quick presets onto the query contract without inventing filters", () => {
    expect(applyGalleryPreset("all")).toEqual({});
    expect(applyGalleryPreset("no-mercy", {}, "Rod Sellers")).toMatchObject({
      ownerName: "Rod Sellers",
      marginMin: 50,
      result: "win",
      noMercy: true,
    });
    expect(applyGalleryPreset("one-point")).toMatchObject({ onePoint: true });
    expect(applyGalleryPreset("closest")).toMatchObject({ sort: "closest" });
    expect(applyGalleryPreset("championship")).toMatchObject({ championshipGames: true });
    expect(applyGalleryPreset("playoffs")).toMatchObject({ phase: "playoffs" });
    expect(applyGalleryPreset("highest")).toMatchObject({ sort: "highest_score" });
    expect(applyGalleryPreset("lowest")).toMatchObject({ sort: "lowest_score" });
    expect(applyGalleryPreset("blowouts")).toMatchObject({ sort: "margin_desc" });
    expect(activeGalleryPreset({})).toBe("all");
    expect(activeGalleryPreset({ noMercy: true, marginMin: 50, result: "win" })).toBe("no-mercy");
    expect(activeGalleryPreset({ championshipGames: true })).toBe("championship");
  });

  it("parses and serializes Story Collection ids for routing", () => {
    const parsed = parseGallerySearchParams("collection=heartbreak&ownerName=Rod+Sellers");
    expect(parsed.collection).toBe("heartbreak");
    expect(parsed.ownerName).toBe("Rod Sellers");
    const qs = serializeGallerySearchParams({ collection: "cashier", scoreMin: 150, sort: "highest_score" });
    expect(qs).toContain("collection=cashier");
    expect(qs).toContain("scoreMin=150");
    expect(matchupViewHref(matchup(), { collection: "no-mercy" })).toContain("collection=no-mercy");
  });

  it("RFSN-053D maps Advisor visual filters onto GalleryUiFilter + Open Full Gallery href", () => {
    const ui = visualFiltersToGalleryUi({
      owner: "Rod Sellers",
      marginMin: 50,
      winsOnly: true,
      noMercy: true,
    });
    expect(ui).toMatchObject({
      ownerName: "Rod Sellers",
      marginMin: 50,
      result: "win",
      noMercy: true,
    });
    const href = `/league/history/matchups?${serializeGallerySearchParams(ui)}`;
    expect(href).toContain("/league/history/matchups?");
    expect(href).toContain("ownerName=Rod+Sellers");
    expect(href).toContain("noMercy=1");
    expect(href).toContain("marginMin=50");
    expect(href).toContain("result=win");
  });
});
