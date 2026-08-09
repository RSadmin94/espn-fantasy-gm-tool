import { describe, expect, it } from "vitest";
import { classifyEspnPlayoffTier } from "./matchupPlayoffTier";
import type { GalleryGameRecord } from "./matchupGalleryQuery";
import { queryMatchupGallery } from "./matchupGalleryQuery";
import {
  compileStoryCollectionFilters,
  CASHIER_SCORE_MIN,
  type StoryCollectionId,
} from "@shared/matchupStoryCollections";
import { listStoryCollectionSummaries, queryStoryCollection, storyFiltersToGalleryFilter } from "./matchupStoryCollections";

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
      playoffTierType: null,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 88,
      awayScore: 99,
      winnerPersonId: "id:bruce",
    }),
  ];
}

const ctx = { ownerName: "Rod Sellers", opponentName: "Bruce Edwards" };

describe("RFSN-053E story collection counts", () => {
  it("matches queryMatchupGallery for every collection", () => {
    const rows = games();
    const ids: StoryCollectionId[] = [
      "no-mercy",
      "heartbreak",
      "championship",
      "blood-rival",
      "closest-calls",
      "statement-wins",
      "biggest-collapses",
      "cashier",
    ];
    for (const id of ids) {
      const compiled = compileStoryCollectionFilters(id, ctx);
      const viaCollection = queryStoryCollection(rows, id, ctx);
      const viaQuery = queryMatchupGallery(rows, storyFiltersToGalleryFilter(compiled));
      expect(viaCollection.total, id).toBe(viaQuery.total);
      expect(viaCollection.emptyReason, id).toBe(viaQuery.emptyReason);
      expect(
        viaCollection.matchups.map((m) => m.matchupId),
        id,
      ).toEqual(viaQuery.matchups.map((m) => m.matchupId));
    }
  });

  it("keeps championship honest when playoff tier cannot be proven", () => {
    const rows = games();
    const hit = queryStoryCollection(rows, "championship", {});
    expect(hit.empty).toBe(true);
    expect(hit.emptyReason).toBe("insufficient_playoff_tier");
    expect(hit.matchups).toEqual([]);
  });

  it("Blood Rival without an opponent stays empty instead of listing every owner game", () => {
    const hit = queryStoryCollection(games(), "blood-rival", { ownerName: "Rod Sellers" });
    expect(hit.emptyReason).toBe("unresolved_opponent");
    expect(hit.total).toBe(0);
    expect(hit.summary.toLowerCase()).toMatch(/opponent/);
  });

  it("lists all collections with counts from the same query", () => {
    const listed = listStoryCollectionSummaries(games(), ctx);
    expect(listed.map((c) => c.id)).toEqual([
      "no-mercy",
      "heartbreak",
      "championship",
      "blood-rival",
      "closest-calls",
      "statement-wins",
      "biggest-collapses",
      "cashier",
    ]);
    const noMercy = listed.find((c) => c.id === "no-mercy")!;
    expect(noMercy.count).toBeGreaterThan(0);
    expect(noMercy.filters.marginMin).toBe(50);
    const cashier = listed.find((c) => c.id === "cashier")!;
    expect(cashier.filters.scoreMin).toBe(CASHIER_SCORE_MIN);
    const champ = listed.find((c) => c.id === "championship")!;
    expect(champ.emptyReason).toBe("insufficient_playoff_tier");
    expect(champ.count).toBe(0);
  });
});
