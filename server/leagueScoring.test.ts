import { describe, it, expect } from "vitest";
import {
  calculateLeaguePoints,
  getScoringBreakdown,
  buildScoringDescription,
  type LeagueScoringSettings,
} from "./leagueScoringService";

// ── Fixtures ──────────────────────────────────────────────────────────────────
// ESPN stat IDs (from leagueScoringService.ts internal mapping):
//   4  = passing yards,  5  = passing TDs,  6  = interceptions
//   24 = rushing yards,  25 = rushing TDs
//   41 = receptions,     42 = receiving yards, 43 = receiving TDs
//   72 = fumbles lost

const halfPPRMap: Record<number, number> = {
  4:  0.04,   // passing yards  (1 pt / 25 yds)
  5:  4,      // passing TDs
  6:  -2,     // interceptions
  24: 0.1,    // rushing yards  (1 pt / 10 yds)
  25: 6,      // rushing TDs
  41: 0.5,    // receptions (half PPR)
  42: 0.1,    // receiving yards (1 pt / 10 yds)
  43: 6,      // receiving TDs
  72: -2,     // fumbles lost
};

const fullPPRMap: Record<number, number> = { ...halfPPRMap, 41: 1 };
const standardMap: Record<number, number> = { ...halfPPRMap, 41: 0 };

const halfPPRSettings: LeagueScoringSettings = {
  scoringType: "HALF_PPR",
  scoringDescription: "Half PPR (0.5 pt/rec), 4 pts/pass TD, 6 pts/rush TD, 6 pts/rec TD, 1 pt/25 pass yds, 1 pt/10 rush yds, 1 pt/10 rec yds",
  receptionPoints: 0.5,
  passingTDPoints: 4,
  rushingTDPoints: 6,
  receivingTDPoints: 6,
  passingYardsPerPoint: 25,
  rushingYardsPerPoint: 10,
  receivingYardsPerPoint: 10,
  interceptionPoints: -2,
  scoringItems: [],
  scoringMap: halfPPRMap,
  fetchedAt: new Date(),
};

const fullPPRSettings: LeagueScoringSettings = {
  ...halfPPRSettings,
  scoringType: "PPR",
  receptionPoints: 1,
  scoringMap: fullPPRMap,
};

const standardSettings: LeagueScoringSettings = {
  ...halfPPRSettings,
  scoringType: "STANDARD",
  receptionPoints: 0,
  scoringMap: standardMap,
};

// ── calculateLeaguePoints ─────────────────────────────────────────────────────

describe("calculateLeaguePoints", () => {
  it("scores a WR correctly in half PPR", () => {
    // 80 rec yds * 0.1 = 8, 1 rec TD * 6 = 6, 6 rec * 0.5 = 3 → 17
    const pts = calculateLeaguePoints(
      { receivingYards: 80, receivingTDs: 1, receptions: 6 },
      halfPPRMap
    );
    expect(pts).toBeCloseTo(17, 1);
  });

  it("scores a QB correctly", () => {
    // 300 pass yds * 0.04 = 12, 2 pass TDs * 4 = 8, 1 INT * -2 = -2 → 18
    const pts = calculateLeaguePoints(
      { passingYards: 300, passingTDs: 2, interceptions: 1 },
      halfPPRMap
    );
    expect(pts).toBeCloseTo(18, 1);
  });

  it("scores a RB correctly in half PPR", () => {
    // 100 rush yds * 0.1 = 10, 1 rush TD * 6 = 6, 4 rec * 0.5 = 2, 30 rec yds * 0.1 = 3 → 21
    const pts = calculateLeaguePoints(
      { rushingYards: 100, rushingTDs: 1, receptions: 4, receivingYards: 30 },
      halfPPRMap
    );
    expect(pts).toBeCloseTo(21, 1);
  });

  it("reception bonus differs between full PPR and half PPR", () => {
    const stats = { receptions: 10, receivingYards: 80 };
    const half = calculateLeaguePoints(stats, halfPPRMap);
    const full = calculateLeaguePoints(stats, fullPPRMap);
    // Full PPR gives 5 more points (10 receptions × 0.5 difference)
    expect(full - half).toBeCloseTo(5, 1);
  });

  it("standard scoring gives 0 for receptions alone", () => {
    const pts = calculateLeaguePoints({ receptions: 10 }, standardMap);
    expect(pts).toBe(0);
  });

  it("returns 0 for empty stats", () => {
    expect(calculateLeaguePoints({}, halfPPRMap)).toBe(0);
  });

  it("handles fumble lost penalty", () => {
    // 50 rush yds * 0.1 = 5, 1 fumble * -2 = -2 → 3
    const pts = calculateLeaguePoints({ rushingYards: 50, fumblesLost: 1 }, halfPPRMap);
    expect(pts).toBeCloseTo(3, 1);
  });
});

// ── getScoringBreakdown ───────────────────────────────────────────────────────

describe("getScoringBreakdown", () => {
  it("returns an array of breakdown rows", () => {
    const rows = getScoringBreakdown(halfPPRSettings);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("each row has stat, points, and category", () => {
    const rows = getScoringBreakdown(halfPPRSettings);
    for (const row of rows) {
      expect(row).toHaveProperty("stat");
      expect(row).toHaveProperty("points");
      expect(row).toHaveProperty("category");
    }
  });

  it("includes reception row with correct value", () => {
    const rows = getScoringBreakdown(halfPPRSettings);
    const recRow = rows.find((r) => r.stat.toLowerCase() === "reception");
    expect(recRow).toBeDefined();
    expect(recRow!.points).toContain("0.5");
  });

  it("includes passing TD row", () => {
    const rows = getScoringBreakdown(halfPPRSettings);
    const tdRow = rows.find((r) => r.stat.toLowerCase() === "passing td");
    expect(tdRow).toBeDefined();
    expect(tdRow!.points).toContain("4");
  });

  it("omits stats with 0 points (standard receptions)", () => {
    const rows = getScoringBreakdown(standardSettings);
    const recRow = rows.find((r) => r.stat.toLowerCase() === "reception");
    // Standard scoring has 0 for receptions, so it should be omitted
    expect(recRow).toBeUndefined();
  });
});

// ── buildScoringDescription ───────────────────────────────────────────────────

const halfPPRParams = {
  receptionPoints: 0.5,
  passingTDPoints: 4,
  rushingTDPoints: 6,
  receivingTDPoints: 6,
  interceptionPoints: -2,
  passYardsPerPt: 25,
  rushYardsPerPt: 10,
  recYardsPerPt: 10,
  scoringType: "HALF_PPR",
};

const fullPPRParams = { ...halfPPRParams, receptionPoints: 1, scoringType: "PPR" };
const standardParams = { ...halfPPRParams, receptionPoints: 0, scoringType: "STANDARD" };

describe("buildScoringDescription", () => {
  it("includes PPR label for half PPR", () => {
    const desc = buildScoringDescription(halfPPRParams);
    expect(desc.toLowerCase()).toContain("half ppr");
  });

  it("includes PPR label for full PPR", () => {
    const desc = buildScoringDescription(fullPPRParams);
    expect(desc.toLowerCase()).toContain("full ppr");
  });

  it("includes standard label when no reception points", () => {
    const desc = buildScoringDescription(standardParams);
    expect(desc.toLowerCase()).toContain("standard");
  });

  it("includes passing TD points", () => {
    const desc = buildScoringDescription(halfPPRParams);
    expect(desc).toContain("4");
  });

  it("returns a non-empty string", () => {
    expect(buildScoringDescription(halfPPRParams).length).toBeGreaterThan(10);
  });
});
