import { describe, expect, it } from "vitest";
import {
  OWNER_AWARD_CATEGORIES,
  OWNER_AWARD_META,
  OWNER_AWARD_RARITIES,
  getOwnerAwardMetaById,
  getOwnerAwardMetaByName,
  listOwnerAwardMeta,
} from "./ownerAwardMeta";
import {
  buildAwardCatalog,
  buildAwardDetail,
  buildOwnerAwardComparisonStats,
  buildOwnerEarnedAwards,
  filterAndSortCatalog,
} from "./ownerAwardGallery";

describe("ownerAwardMeta", () => {
  it("covers every V1 award with id, descriptions, rarity, and category", () => {
    expect(OWNER_AWARD_META).toHaveLength(10);
    const ids = new Set<string>();
    for (const m of OWNER_AWARD_META) {
      expect(m.id.length).toBeGreaterThan(0);
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
      expect(m.displayName).toBeTruthy();
      expect(m.awardName).toBeTruthy();
      expect(m.shortDescription.length).toBeGreaterThan(10);
      expect(m.longDescription.length).toBeGreaterThan(20);
      expect(m.howEarned.length).toBeGreaterThan(10);
      expect(m.eligibility.length).toBeGreaterThan(10);
      expect(OWNER_AWARD_RARITIES).toContain(m.rarity);
      expect(OWNER_AWARD_CATEGORIES).toContain(m.category);
      expect(m.icon).toBeTruthy();
      expect(m.displayOrder).toBeGreaterThan(0);
    }
    expect(listOwnerAwardMeta()).toHaveLength(10);
  });

  it("resolves by id and awardName", () => {
    expect(getOwnerAwardMetaById("best_drafter")?.awardName).toBe("Best Drafter");
    expect(getOwnerAwardMetaByName("Trade Shark")?.id).toBe("trade_shark");
    expect(getOwnerAwardMetaById("nope")).toBeNull();
  });
});

describe("ownerAwardGallery", () => {
  const awards = [
    { awardName: "Best Drafter", ownerKey: "guid:a", ownerName: "Alice", value: 12, reason: "Early board." },
    { awardName: "Trade Shark", ownerKey: "guid:a", ownerName: "Alice", value: 9, reason: "Deal maker." },
    { awardName: "Rivalry Killer", ownerKey: "guid:b", ownerName: "Bob", value: "10-2-0", reason: "H2H." },
  ];

  it("builds owner comparison stats without fabricating seasons", () => {
    const stats = buildOwnerAwardComparisonStats(awards, "guid:a", "Alice");
    expect(stats.totalAwards).toBe(2);
    expect(stats.uniqueAwards).toBe(2);
    expect(stats.epicCount).toBe(2);
    expect(stats.legendaryCount).toBe(0);
  });

  it("lists earned awards for an owner", () => {
    const earned = buildOwnerEarnedAwards(awards, "guid:a");
    expect(earned.map((e) => e.meta.id)).toEqual(["best_drafter", "trade_shark"]);
    expect(earned[0]!.timesEarned).toBe(1);
    expect(earned[0]!.seasonsEarned).toEqual([]);
    expect(earned[0]!.holdingNow).toBe(true);
  });

  it("builds catalog and detail from live rows", () => {
    const catalog = buildAwardCatalog(awards);
    expect(catalog).toHaveLength(10);
    const best = catalog.find((c) => c.meta.id === "best_drafter");
    expect(best?.currentHolderName).toBe("Alice");
    expect(best?.holdersCount).toBe(1);
    const detail = buildAwardDetail("best_drafter", awards);
    expect(detail?.meta.displayName).toBe("Best Drafter");
    expect(detail?.currentHolderName).toBe("Alice");
    expect(detail?.historicalWinners).toHaveLength(1);
    expect(detail?.seasonsEarned).toEqual([]);
  });

  it("filters and sorts the catalog", () => {
    const catalog = buildAwardCatalog(awards);
    const drafting = filterAndSortCatalog(catalog, { category: "Drafting", sort: "alphabetical" });
    expect(drafting.every((r) => r.meta.category === "Drafting")).toBe(true);
    expect(drafting.map((r) => r.meta.displayName)).toEqual(["Best Drafter", "Worst Drafter"]);
    const search = filterAndSortCatalog(catalog, { search: "alice" });
    expect(search.some((r) => r.meta.id === "best_drafter")).toBe(true);
    const rarest = filterAndSortCatalog(catalog, { sort: "rarest" });
    expect(rarest[0]!.meta.rarity).toBe("Legendary");
    const combined = filterAndSortCatalog(catalog, {
      category: "Drafting",
      rarity: "Epic",
      search: "early",
      sort: "catalog_order",
    });
    expect(combined.map((r) => r.meta.id)).toEqual(["best_drafter"]);
  });

  it("returns null detail for unknown award ids", () => {
    expect(buildAwardDetail("not_a_real_award", awards)).toBeNull();
  });

  it("skips unknown award names without crashing owner gallery stats", () => {
    const mixed = [
      ...awards,
      { awardName: "Mystery Badge", ownerKey: "guid:a", ownerName: "Alice", value: 1 },
    ];
    const stats = buildOwnerAwardComparisonStats(mixed, "guid:a");
    expect(stats.totalAwards).toBe(2);
    expect(stats.uniqueAwards).toBe(2);
    const earned = buildOwnerEarnedAwards(mixed, "guid:a");
    expect(earned.every((e) => e.meta.id)).toBe(true);
    expect(earned.some((e) => e.meta.awardName === "Mystery Badge")).toBe(false);
  });

  it("zero-award owners get empty earned lists and zero stats", () => {
    const stats = buildOwnerAwardComparisonStats(awards, "guid:z", "Zoe");
    expect(stats).toEqual({
      totalAwards: 0,
      uniqueAwards: 0,
      legendaryCount: 0,
      epicCount: 0,
      rareCount: 0,
      commonCount: 0,
    });
    expect(buildOwnerEarnedAwards(awards, "guid:z")).toEqual([]);
  });
});
