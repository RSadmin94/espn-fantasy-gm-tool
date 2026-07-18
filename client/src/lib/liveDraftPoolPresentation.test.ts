/**
 * RFSN-016 — Live Draft IDP presentation tests.
 * RFSN-017B — Available-pool ADP ordering regressions.
 */
import { describe, expect, it } from "vitest";
import {
  buildLiveDraftPosTabs,
  compareLiveDraftAvailableRows,
  defaultLiveDraftPosFilter,
  matchesLiveDraftPosFilter,
  orderLiveDraftAvailablePool,
} from "./liveDraftPoolPresentation";

describe("RFSN-016 liveDraftPoolPresentation", () => {
  it("IDP tabs: OFFENSE + DP before ALL; DP remains available", () => {
    expect(buildLiveDraftPosTabs({ hasDef: false, hasDp: true })).toEqual([
      "OFFENSE",
      "DP",
      "ALL",
      "QB",
      "RB",
      "WR",
      "TE",
      "K",
    ]);
    expect(defaultLiveDraftPosFilter(true)).toBe("OFFENSE");
  });

  it("non-IDP tabs: ALL first, no OFFENSE/DP", () => {
    expect(buildLiveDraftPosTabs({ hasDef: true, hasDp: false })).toEqual([
      "ALL",
      "QB",
      "RB",
      "WR",
      "TE",
      "K",
      "DEF",
    ]);
    expect(defaultLiveDraftPosFilter(false)).toBe("ALL");
  });

  it("OFFENSE filter excludes DP; ALL includes DP", () => {
    expect(matchesLiveDraftPosFilter("RB", "OFFENSE")).toBe(true);
    expect(matchesLiveDraftPosFilter("DP", "OFFENSE")).toBe(false);
    expect(matchesLiveDraftPosFilter("DP", "ALL")).toBe(true);
    expect(matchesLiveDraftPosFilter("DP", "DP")).toBe(true);
  });

  it("All Players sort is pure ADP (offense-first only for OFFENSE view)", () => {
    const rows = [
      { name: "LB Star", position: "DP", adp: 12 },
      { name: "WR Ace", position: "WR", adp: 40 },
      { name: "RB One", position: "RB", adp: 5 },
      { name: "CB Two", position: "DP", adp: 8 },
    ];
    const allSorted = [...rows].sort((a, b) =>
      compareLiveDraftAvailableRows(a, b, "adp", { prioritizeOffenseInAll: false }),
    );
    expect(allSorted.map((r) => r.name)).toEqual(["RB One", "CB Two", "LB Star", "WR Ace"]);

    const offenseSorted = [...rows]
      .filter((r) => r.position !== "DP")
      .sort((a, b) =>
        compareLiveDraftAvailableRows(a, b, "adp", { prioritizeOffenseInAll: true }),
      );
    expect(offenseSorted.map((r) => r.name)).toEqual(["RB One", "WR Ace"]);
  });
});

describe("RFSN-017B Live Draft availablePool ADP ordering", () => {
  it("Test 1 — synthetic/fallback ADP cannot outrank real ADP", () => {
    const rows = [
      { name: "Aaron Rodgers", position: "QB", adp: 169, rank: 1, marketValue: 40 },
      { name: "Shedeur Sanders", position: "QB", adp: 250, rank: 2, marketValue: 35 },
      { name: "Josh Allen", position: "QB", adp: 23, rank: 40, marketValue: 90 },
      { name: "Lamar Jackson", position: "QB", adp: 28, rank: 41, marketValue: 88 },
    ];
    const sorted = [...rows].sort((a, b) => compareLiveDraftAvailableRows(a, b, "adp"));
    expect(sorted[0]!.name).toBe("Josh Allen");
    expect(sorted.map((r) => r.name).slice(0, 2)).toEqual(["Josh Allen", "Lamar Jackson"]);
    expect(sorted[sorted.length - 1]!.name).toBe("Shedeur Sanders");
  });

  it("Test 2 — null ADP does not beat real ADP (rank must not fake ADP)", () => {
    const rows = [
      { name: "Player A", position: "QB", adp: null, rank: 1, marketValue: 99 },
      { name: "Player B", position: "QB", adp: 75, rank: 50, marketValue: 40 },
    ];
    const sorted = [...rows].sort((a, b) => compareLiveDraftAvailableRows(a, b, "adp"));
    expect(sorted.map((r) => r.name)).toEqual(["Player B", "Player A"]);
  });

  it("Test 3 — live consumption preserved; next real-ADP QB surfaces", () => {
    const eligible = [
      { name: "Josh Allen", position: "QB", adp: 23, rank: 1, marketValue: 90 },
      { name: "Lamar Jackson", position: "QB", adp: 28, rank: 2, marketValue: 88 },
      { name: "Aaron Rodgers", position: "QB", adp: 250, rank: 3, marketValue: 40 },
    ];
    const available = orderLiveDraftAvailablePool(eligible, new Set(["Josh Allen"]), "adp");
    expect(available.map((r) => r.name)).toEqual(["Lamar Jackson", "Aaron Rodgers"]);
    expect(available[0]!.name).toBe("Lamar Jackson");
  });
});
