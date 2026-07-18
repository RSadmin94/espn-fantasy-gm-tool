/**
 * RFSN-016 — Live Draft IDP presentation tests.
 */
import { describe, expect, it } from "vitest";
import {
  buildLiveDraftPosTabs,
  compareLiveDraftAvailableRows,
  defaultLiveDraftPosFilter,
  matchesLiveDraftPosFilter,
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
