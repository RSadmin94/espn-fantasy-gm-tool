/**
 * Tests for championshipHistoryBuilder.ts
 * Covers: buildTrophySummary, buildTrophyPromptBlock, buildLeagueTrophyLeaderboard
 */
import { describe, it, expect } from "vitest";
import {
  buildTrophySummary,
  buildTrophyPromptBlock,
  buildLeagueTrophyLeaderboard,
  type OwnerTrophyRecord,
} from "./championshipHistoryBuilder";

function makeRecord(overrides: Partial<OwnerTrophyRecord> = {}): OwnerTrophyRecord {
  return {
    memberId: "m1",
    name: "Rod Sellers",
    championships: 0,
    championshipYears: [],
    runnerUps: 0,
    runnerUpYears: [],
    thirdPlaceFinishes: 0,
    thirdPlaceYears: [],
    finalsAppearances: 0,
    totalTrophies: 0,
    lastTitle: null,
    yearsSinceTitle: null,
    longestDrought: 0,
    prestige: "hungry",
    ...overrides,
  };
}

describe("buildTrophySummary", () => {
  it("returns 'never won' message when no trophies", () => {
    const rec = makeRecord();
    const result = buildTrophySummary(rec);
    expect(result).toContain("never won a championship");
  });

  it("includes championship year(s) in summary", () => {
    const rec = makeRecord({
      championships: 2,
      championshipYears: [2018, 2022],
      finalsAppearances: 2,
      totalTrophies: 2,
      lastTitle: 2022,
      yearsSinceTitle: 3,
      prestige: "contender",
    });
    const result = buildTrophySummary(rec);
    expect(result).toContain("2 championships");
    expect(result).toContain("2018, 2022");
    expect(result).toContain("Last title: 2022");
  });

  it("includes runner-up years when present", () => {
    const rec = makeRecord({
      championships: 1,
      championshipYears: [2019],
      runnerUps: 2,
      runnerUpYears: [2021, 2023],
      finalsAppearances: 3,
      totalTrophies: 3,
      lastTitle: 2019,
      yearsSinceTitle: 6,
      prestige: "finalist",
    });
    const result = buildTrophySummary(rec);
    expect(result).toContain("1 championship");
    expect(result).toContain("2 runner-up");
    expect(result).toContain("2021, 2023");
  });

  it("handles single championship with correct grammar", () => {
    const rec = makeRecord({
      championships: 1,
      championshipYears: [2020],
      finalsAppearances: 1,
      totalTrophies: 1,
      lastTitle: 2020,
      yearsSinceTitle: 5,
      prestige: "finalist",
    });
    const result = buildTrophySummary(rec);
    expect(result).toContain("1 championship");
    expect(result).not.toContain("2 championship");
  });
});

describe("buildTrophyPromptBlock", () => {
  it("includes prestige label for dynasty", () => {
    const rec = makeRecord({
      championships: 3,
      championshipYears: [2012, 2013, 2018],
      finalsAppearances: 3,
      totalTrophies: 3,
      lastTitle: 2018,
      yearsSinceTitle: 7,
      prestige: "dynasty",
    });
    const block = buildTrophyPromptBlock(rec);
    expect(block).toContain("DYNASTY");
    expect(block).toContain("2012, 2013, 2018");
  });

  it("includes near-miss note for multiple runner-ups with no title", () => {
    const rec = makeRecord({
      championships: 0,
      runnerUps: 2,
      runnerUpYears: [2019, 2021],
      finalsAppearances: 2,
      totalTrophies: 2,
      prestige: "finalist",
    });
    const block = buildTrophyPromptBlock(rec);
    expect(block).toContain("near-misses");
    expect(block).toContain("2019, 2021");
  });

  it("shows 'never won' for owner with no trophies", () => {
    const rec = makeRecord({ prestige: "hungry" });
    const block = buildTrophyPromptBlock(rec);
    expect(block).toContain("never won");
  });

  it("uses custom label when provided", () => {
    const rec = makeRecord({ championships: 1, championshipYears: [2020], lastTitle: 2020, yearsSinceTitle: 5, prestige: "finalist", finalsAppearances: 1, totalTrophies: 1 });
    const block = buildTrophyPromptBlock(rec, "Christian Edmondson Trophy History");
    expect(block).toContain("Christian Edmondson Trophy History");
  });
});

describe("buildLeagueTrophyLeaderboard", () => {
  it("returns empty string when no champions or runner-ups", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Owner A" })],
    ]);
    expect(buildLeagueTrophyLeaderboard(map)).toBe("");
  });

  it("sorts by championships desc", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Owner A", championships: 1, championshipYears: [2020], finalsAppearances: 1, totalTrophies: 1, lastTitle: 2020, yearsSinceTitle: 5, prestige: "finalist" })],
      ["m2", makeRecord({ memberId: "m2", name: "Owner B", championships: 3, championshipYears: [2012, 2013, 2018], finalsAppearances: 3, totalTrophies: 3, lastTitle: 2018, yearsSinceTitle: 7, prestige: "dynasty" })],
    ]);
    const result = buildLeagueTrophyLeaderboard(map);
    const posA = result.indexOf("Owner A");
    const posB = result.indexOf("Owner B");
    expect(posB).toBeLessThan(posA); // Owner B (3 titles) should appear before Owner A (1 title)
  });

  it("includes DYNASTY callout for 3+ title owners", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Christian Edmondson", championships: 3, championshipYears: [2012, 2013, 2018], finalsAppearances: 3, totalTrophies: 3, lastTitle: 2018, yearsSinceTitle: 7, prestige: "dynasty" })],
    ]);
    const result = buildLeagueTrophyLeaderboard(map);
    expect(result).toContain("DYNASTY");
    expect(result).toContain("Christian Edmondson");
    expect(result).toContain("2012, 2013, 2018");
  });

  it("includes NEAR-MISSES callout for 0 titles but 2+ runner-ups", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Sad Owner", championships: 0, runnerUps: 2, runnerUpYears: [2019, 2021], finalsAppearances: 2, totalTrophies: 2, prestige: "finalist" })],
    ]);
    const result = buildLeagueTrophyLeaderboard(map);
    expect(result).toContain("NEAR-MISSES");
    expect(result).toContain("Sad Owner");
  });
});
