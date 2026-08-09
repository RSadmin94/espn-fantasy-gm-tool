import { describe, expect, it } from "vitest";
import {
  findNamedCareerRecord,
  medianNumber,
  qualifyAdvisorCareerRecords,
  type AdvisorCareerRecordRow,
} from "./advisorCareerQualification";

function row(
  name: string,
  games: number,
  seasons: number,
  wins: number,
  losses: number,
): AdvisorCareerRecordRow {
  return {
    ownerKey: `id:${name.toLowerCase().replace(/\s+/g, "-")}`,
    ownerName: name,
    wins,
    losses,
    ties: 0,
    games,
    winPct: games > 0 ? wins / games : 0,
    seasonsActive: seasons,
  };
}

describe("RFSN-052I career qualification", () => {
  it("uses league median games and a 2-season floor when median tenure ≥ 2", () => {
    const q = qualifyAdvisorCareerRecords([
      row("Reginald Sellers", 13, 1, 10, 3),
      row("Demetri Clark", 200, 15, 120, 80),
      row("Bruce Edwards", 200, 15, 70, 130),
      row("LOZELL STYLES", 180, 14, 95, 85),
      row("orlando howard", 13, 1, 3, 10),
    ]);
    expect(q.minSeasons).toBe(2);
    expect(q.minGames).toBe(180);
    expect(q.qualified.map((r) => r.ownerName)).toEqual([
      "Demetri Clark",
      "Bruce Edwards",
      "LOZELL STYLES",
    ]);
    expect(q.unqualified.map((r) => r.ownerName).sort()).toEqual([
      "Reginald Sellers",
      "orlando howard",
    ]);
    expect(q.candidates.find((c) => c.ownerName === "Reginald Sellers")?.qualified).toBe(false);
    expect(q.rule).toMatch(/league median/);
    expect(q.rule).toMatch(/Does not change Hall of Fame/);
  });

  it("in a one-season league, median ≈ full season and minSeasons is 1", () => {
    const q = qualifyAdvisorCareerRecords([
      row("Alpha", 13, 1, 10, 3),
      row("Beta", 13, 1, 4, 9),
      row("Gamma", 12, 1, 6, 6),
    ]);
    expect(q.minSeasons).toBe(1);
    expect(q.minGames).toBe(13);
    expect(q.qualified.map((r) => r.ownerName).sort()).toEqual(["Alpha", "Beta"]);
    expect(q.unqualified.map((r) => r.ownerName)).toEqual(["Gamma"]);
  });

  it("still returns a named owner below the leaderboard bar", () => {
    const rows = [
      row("Reginald Sellers", 13, 1, 10, 3),
      row("Demetri Clark", 200, 15, 120, 80),
    ];
    const hit = findNamedCareerRecord(rows, { displayName: "Reginald Sellers" });
    expect(hit?.wins).toBe(10);
    expect(hit?.losses).toBe(3);
    expect(hit?.games).toBe(13);
  });

  it("median of even counts averages the middle pair", () => {
    expect(medianNumber([10, 20, 30, 40])).toBe(25);
    expect(medianNumber([13])).toBe(13);
    expect(medianNumber([])).toBe(0);
  });
});
