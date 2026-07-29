import { describe, expect, it } from "vitest";
import {
  buildAwardDnaSummary,
  buildAwardQuickStats,
  buildAwardsInProgress,
  buildMissingAwards,
  buildYourAwardsModel,
} from "./ownerAwardMyGm";
import { buildOwnerEarnedAwards } from "./ownerAwardGallery";

const awards = [
  {
    awardName: "Best Drafter",
    ownerKey: "guid:a",
    ownerName: "Alice",
    value: 43,
    reason: "Early board.",
  },
  {
    awardName: "Trade Shark",
    ownerKey: "guid:b",
    ownerName: "Bob",
    value: 12,
    reason: "Deals.",
  },
  {
    awardName: "Rivalry Killer",
    ownerKey: "guid:a",
    ownerName: "Alice",
    value: "126-85-0",
    reason: "H2H.",
  },
];

describe("ownerAwardMyGm", () => {
  it("builds trophy model with correct totals and no invented seasons", () => {
    const model = buildYourAwardsModel(awards, "guid:a", "Alice");
    expect(model.stats.totalAwards).toBe(2);
    expect(model.stats.uniqueAwards).toBe(2);
    expect(model.earned.map((e) => e.meta.id).sort()).toEqual(["best_drafter", "rivalry_killer"]);
    expect(model.earned.every((e) => e.seasonsEarned.length === 0)).toBe(true);
    expect(model.earned.every((e) => e.holdingNow)).toBe(true);
    expect(model.missing.every((m) => m.meta.id !== "best_drafter")).toBe(true);
    expect(model.missing.some((m) => m.meta.id === "trade_shark")).toBe(true);
    expect(model.quick.collected).toBe(2);
    expect(model.quick.catalogSize).toBe(10);
    expect(model.quick.completionPct).toBe(20);
    expect(model.quick.highestRarity).toBe("Legendary");
  });

  it("DNA lines come only from earned awards", () => {
    const earned = buildOwnerEarnedAwards(awards, "guid:a");
    const dna = buildAwardDnaSummary(earned);
    expect(dna.some((d) => /strongest drafters/i.test(d.text))).toBe(true);
    expect(dna.some((d) => /dominate rivalries/i.test(d.text))).toBe(true);
    expect(dna.every((d) => d.text.length > 10)).toBe(true);
  });

  it("empty owners get empty DNA and zero quick stats", () => {
    const model = buildYourAwardsModel(awards, "guid:z", "Zoe");
    expect(model.earned).toEqual([]);
    expect(model.dna).toEqual([]);
    expect(model.quick.collected).toBe(0);
    expect(model.quick.completionPct).toBe(0);
    expect(model.missing).toHaveLength(10);
  });

  it("never fabricates progress without comparable metrics", () => {
    const rows = buildAwardsInProgress(awards, "guid:a", "Alice", null);
    expect(rows.every((r) => r.kind === "coming_soon")).toBe(true);
    expect(rows.every((r) => r.label === "Progress tracking coming soon.")).toBe(true);
  });

  it("shows honest vs-holder progress when metrics exist", () => {
    const rows = buildAwardsInProgress(awards, "guid:a", "Alice", {
      totalTrades: 8,
      earlyRbWr: 40,
    });
    const trade = rows.find((r) => r.meta.id === "trade_shark");
    expect(trade?.kind).toBe("vs_holder");
    expect(trade?.current).toBe(8);
    expect(trade?.target).toBe(12);
    expect(trade?.label).toMatch(/8 of 12 trades/i);

    // Alice already holds Best Drafter — not in progress list
    expect(rows.some((r) => r.meta.id === "best_drafter")).toBe(false);

    // Owner already above holder mark but not holding → no fabricated chase
    const over = buildAwardsInProgress(awards, "guid:a", "Alice", {
      totalTrades: 99,
    });
    expect(over.find((r) => r.meta.id === "trade_shark")?.kind).toBe("coming_soon");

    // Playoff Merchant has no numeric owner metric
    const playoff = rows.find((r) => r.meta.id === "playoff_merchant");
    expect(playoff?.kind).toBe("coming_soon");
  });

  it("missing awards include current holder without inventing history", () => {
    const missing = buildMissingAwards(awards, "guid:a", "Alice", { totalTrades: 8 });
    const trade = missing.find((m) => m.meta.id === "trade_shark");
    expect(trade?.currentHolderName).toBe("Bob");
    expect(trade?.progress?.kind).toBe("vs_holder");
  });

  it("quick stats favorite category is deterministic", () => {
    const q = buildAwardQuickStats(awards, "guid:a", "Alice");
    expect(["Drafting", "Rivalries"]).toContain(q.favoriteCategory);
    expect(q.awardsRemaining).toBe(8);
  });
});
