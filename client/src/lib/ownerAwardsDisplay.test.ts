import { describe, expect, it } from "vitest";
import {
  countAwardsForOwner,
  formatOwnerAwardStat,
  ownerAwardHowto,
  sortOwnerAwardsForDisplay,
  OWNER_AWARD_ORDER,
} from "./ownerAwardsDisplay";

describe("ownerAwardsDisplay", () => {
  it("formats stats consistently per award", () => {
    expect(formatOwnerAwardStat("Best Drafter", 12)).toBe("12 early RB/WR");
    expect(formatOwnerAwardStat("Worst Drafter", 3)).toBe("3 early RB/WR");
    expect(formatOwnerAwardStat("Keeper King", "22.5%")).toBe("22.5% keepers");
    expect(formatOwnerAwardStat("Transaction Addict", 148)).toBe("148 acquisitions");
    expect(formatOwnerAwardStat("Trade Shark", 24)).toBe("24 trades");
    expect(formatOwnerAwardStat("Regular Season Bully", "62.5%")).toBe("62.5% win rate");
    expect(formatOwnerAwardStat("Playoff Merchant", "2 RU · 1 3rd")).toBe("2 RU · 1 3rd");
    expect(formatOwnerAwardStat("Rivalry Killer", "45-30-2")).toBe("45-30-2 H2H");
    expect(formatOwnerAwardStat("One-Year Wonder", "71.4%")).toBe("71.4% win rate");
    expect(formatOwnerAwardStat("Graveyard Legend", 1452.5)).toBe("1452.5 PF");
    expect(formatOwnerAwardStat("Best Drafter", null)).toBe("—");
  });

  it("sorts awards in canonical order", () => {
    const shuffled = [
      { awardName: "Graveyard Legend" },
      { awardName: "Best Drafter" },
      { awardName: "Trade Shark" },
    ];
    expect(sortOwnerAwardsForDisplay(shuffled).map((a) => a.awardName)).toEqual([
      "Best Drafter",
      "Trade Shark",
      "Graveyard Legend",
    ]);
    expect(OWNER_AWARD_ORDER).toHaveLength(10);
  });

  it("counts awards by ownerKey preferentially", () => {
    const awards = [
      { awardName: "Best Drafter", ownerKey: "guid:a", ownerName: "Alice" },
      { awardName: "Trade Shark", ownerKey: "guid:b", ownerName: "Bob" },
      { awardName: "Keeper King", ownerKey: "guid:a", ownerName: "Alice" },
    ];
    expect(countAwardsForOwner(awards, "guid:a", "Alice")).toBe(2);
    expect(countAwardsForOwner(awards, "guid:b", "Wrong Name")).toBe(1);
    expect(countAwardsForOwner(awards, "", "Alice")).toBe(2);
  });

  it("provides howto text for every known award", () => {
    for (const name of OWNER_AWARD_ORDER) {
      expect(ownerAwardHowto(name).length).toBeGreaterThan(20);
    }
  });
});
