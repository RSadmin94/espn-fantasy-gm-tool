/**
 * rivalryService.test.ts
 * Unit tests for the rivalry score engine.
 */
import { describe, it, expect } from "vitest";

// ── Inline the pure scoring helpers so we don't need DB ──────────────────────

type HeatLabel = "Cold" | "Simmering" | "Heated" | "Burning" | "Inferno";

function heatLabel(score: number): HeatLabel {
  if (score >= 150) return "Inferno";
  if (score >= 100) return "Burning";
  if (score >= 60) return "Heated";
  if (score >= 30) return "Simmering";
  return "Cold";
}

interface ScoreInput {
  h2hLosses: number;
  playoffEliminations: number;
  closeLossCount: number;
  tradeVerdictLosses: number;
  recentLosses: number;
}

function computeScore(i: ScoreInput): number {
  return (
    i.h2hLosses * 10 +
    i.playoffEliminations * 40 +
    i.closeLossCount * 15 +
    i.tradeVerdictLosses * 12 +
    i.recentLosses * 8
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("heatLabel", () => {
  it("returns Cold for score < 30", () => {
    expect(heatLabel(0)).toBe("Cold");
    expect(heatLabel(29)).toBe("Cold");
  });

  it("returns Simmering for score 30–59", () => {
    expect(heatLabel(30)).toBe("Simmering");
    expect(heatLabel(59)).toBe("Simmering");
  });

  it("returns Heated for score 60–99", () => {
    expect(heatLabel(60)).toBe("Heated");
    expect(heatLabel(99)).toBe("Heated");
  });

  it("returns Burning for score 100–149", () => {
    expect(heatLabel(100)).toBe("Burning");
    expect(heatLabel(149)).toBe("Burning");
  });

  it("returns Inferno for score >= 150", () => {
    expect(heatLabel(150)).toBe("Inferno");
    expect(heatLabel(999)).toBe("Inferno");
  });
});

describe("computeScore", () => {
  it("returns 0 for a manager with no rivalry history", () => {
    expect(computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    })).toBe(0);
  });

  it("weights playoff eliminations heaviest (40 pts each)", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 2,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(80);
  });

  it("weights H2H losses at 10 pts each", () => {
    const score = computeScore({
      h2hLosses: 5,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(50);
  });

  it("weights close losses at 15 pts each", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 4,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(60);
  });

  it("weights trade verdict losses at 12 pts each", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 3,
      recentLosses: 0,
    });
    expect(score).toBe(36);
  });

  it("weights recent losses at 8 pts each", () => {
    const score = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 3,
    });
    expect(score).toBe(24);
  });

  it("combines all factors correctly for a high-rivalry opponent", () => {
    // 8 H2H losses (80) + 2 playoff elims (80) + 3 close losses (45) + 2 trade losses (24) + 2 recent (16) = 245
    const score = computeScore({
      h2hLosses: 8,
      playoffEliminations: 2,
      closeLossCount: 3,
      tradeVerdictLosses: 2,
      recentLosses: 2,
    });
    expect(score).toBe(245);
    expect(heatLabel(score)).toBe("Inferno");
  });

  it("produces Simmering for a mild rivalry", () => {
    // 3 H2H losses (30) = 30
    const score = computeScore({
      h2hLosses: 3,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(score).toBe(30);
    expect(heatLabel(score)).toBe("Simmering");
  });
});

describe("rivalry score ordering invariants", () => {
  it("a playoff elimination outweighs 3 regular H2H losses", () => {
    // 1 playoff elim = 40 pts; 3 H2H losses = 30 pts
    const withElim = computeScore({
      h2hLosses: 0,
      playoffEliminations: 1,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    const withH2H = computeScore({
      h2hLosses: 3,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(withElim).toBeGreaterThan(withH2H);
  });

  it("a playoff elimination equals 4 regular H2H losses (40 pts each)", () => {
    const withElim = computeScore({
      h2hLosses: 0,
      playoffEliminations: 1,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    const withH2H = computeScore({
      h2hLosses: 4,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(withElim).toBe(withH2H);
  });

  it("a close loss outweighs 1 regular H2H loss", () => {
    const withClose = computeScore({
      h2hLosses: 0,
      playoffEliminations: 0,
      closeLossCount: 1,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    const withH2H = computeScore({
      h2hLosses: 1,
      playoffEliminations: 0,
      closeLossCount: 0,
      tradeVerdictLosses: 0,
      recentLosses: 0,
    });
    expect(withClose).toBeGreaterThan(withH2H);
  });
});

// ── Rich H2H stat computation tests ──────────────────────────────────────────

// Inline the H2H stat accumulator logic (mirrors rivalryService.ts Acc)
interface H2HAcc {
  h2hWins: number;
  h2hLosses: number;
  totalRodPF: number;
  totalRivalPF: number;
  biggestRodWinMargin: number | null;
  biggestRodWinSeason: number | null;
  biggestRodLossMargin: number | null;
  biggestRodLossSeason: number | null;
  currentWinStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  seasonBreakdown: Array<{ season: number; rodWins: number; rodLosses: number }>;
}

function makeAcc(): H2HAcc {
  return {
    h2hWins: 0, h2hLosses: 0,
    totalRodPF: 0, totalRivalPF: 0,
    biggestRodWinMargin: null, biggestRodWinSeason: null,
    biggestRodLossMargin: null, biggestRodLossSeason: null,
    currentWinStreak: 0, longestWinStreak: 0, longestLossStreak: 0,
    seasonBreakdown: [],
  };
}

function applyMatchup(acc: H2HAcc, season: number, rodScore: number, rivalScore: number): void {
  const margin = Math.abs(rodScore - rivalScore);
  const rodWon = rodScore > rivalScore;
  acc.totalRodPF += rodScore;
  acc.totalRivalPF += rivalScore;
  let sb = acc.seasonBreakdown.find(s => s.season === season);
  if (!sb) { sb = { season, rodWins: 0, rodLosses: 0 }; acc.seasonBreakdown.push(sb); }
  if (rodWon) {
    acc.h2hWins++;
    sb.rodWins++;
    if (acc.biggestRodWinMargin === null || margin > acc.biggestRodWinMargin) {
      acc.biggestRodWinMargin = Math.round(margin * 10) / 10;
      acc.biggestRodWinSeason = season;
    }
    if (acc.currentWinStreak >= 0) acc.currentWinStreak++;
    else acc.currentWinStreak = 1;
    if (acc.currentWinStreak > acc.longestWinStreak) acc.longestWinStreak = acc.currentWinStreak;
  } else {
    acc.h2hLosses++;
    sb.rodLosses++;
    if (acc.biggestRodLossMargin === null || margin > acc.biggestRodLossMargin) {
      acc.biggestRodLossMargin = Math.round(margin * 10) / 10;
      acc.biggestRodLossSeason = season;
    }
    if (acc.currentWinStreak <= 0) acc.currentWinStreak--;
    else acc.currentWinStreak = -1;
    if (Math.abs(acc.currentWinStreak) > acc.longestLossStreak) acc.longestLossStreak = Math.abs(acc.currentWinStreak);
  }
}

describe("rich H2H stat accumulator", () => {
  it("computes correct avg PF after multiple matchups", () => {
    const acc = makeAcc();
    applyMatchup(acc, 2022, 120, 100); // Rod wins
    applyMatchup(acc, 2022, 80, 110);  // Rod loses
    applyMatchup(acc, 2023, 130, 90);  // Rod wins
    const totalGames = acc.h2hWins + acc.h2hLosses;
    const avgRodPF = Math.round((acc.totalRodPF / totalGames) * 10) / 10;
    const avgRivalPF = Math.round((acc.totalRivalPF / totalGames) * 10) / 10;
    expect(totalGames).toBe(3);
    expect(avgRodPF).toBeCloseTo(110.0, 1); // (120+80+130)/3
    expect(avgRivalPF).toBeCloseTo(100.0, 1); // (100+110+90)/3
  });

  it("tracks biggest Rod win correctly", () => {
    const acc = makeAcc();
    applyMatchup(acc, 2021, 150, 100); // +50 win
    applyMatchup(acc, 2022, 140, 80);  // +60 win — should be biggest
    applyMatchup(acc, 2023, 120, 110); // +10 win
    expect(acc.biggestRodWinMargin).toBe(60);
    expect(acc.biggestRodWinSeason).toBe(2022);
  });

  it("tracks biggest Rod loss correctly", () => {
    const acc = makeAcc();
    applyMatchup(acc, 2021, 90, 130);  // -40 loss
    applyMatchup(acc, 2022, 100, 160); // -60 loss — should be biggest
    applyMatchup(acc, 2023, 110, 120); // -10 loss
    expect(acc.biggestRodLossMargin).toBe(60);
    expect(acc.biggestRodLossSeason).toBe(2022);
  });

  it("tracks win streak correctly", () => {
    const acc = makeAcc();
    applyMatchup(acc, 2021, 100, 90);  // win
    applyMatchup(acc, 2022, 110, 95);  // win
    applyMatchup(acc, 2022, 120, 80);  // win — streak = 3
    applyMatchup(acc, 2023, 80, 110);  // loss — breaks streak
    expect(acc.longestWinStreak).toBe(3);
    expect(acc.currentWinStreak).toBe(-1); // currently on 1-game loss streak
  });

  it("tracks loss streak correctly", () => {
    const acc = makeAcc();
    applyMatchup(acc, 2021, 80, 110);  // loss
    applyMatchup(acc, 2022, 70, 120);  // loss
    applyMatchup(acc, 2022, 90, 130);  // loss — streak = 3
    applyMatchup(acc, 2023, 130, 80);  // win — breaks streak
    expect(acc.longestLossStreak).toBe(3);
    expect(acc.currentWinStreak).toBe(1); // currently on 1-game win streak
  });

  it("builds season breakdown correctly", () => {
    const acc = makeAcc();
    applyMatchup(acc, 2022, 120, 100); // 2022 win
    applyMatchup(acc, 2022, 80, 110);  // 2022 loss
    applyMatchup(acc, 2023, 130, 90);  // 2023 win
    const sorted = [...acc.seasonBreakdown].sort((a, b) => a.season - b.season);
    expect(sorted).toHaveLength(2);
    expect(sorted[0]).toEqual({ season: 2022, rodWins: 1, rodLosses: 1 });
    expect(sorted[1]).toEqual({ season: 2023, rodWins: 1, rodLosses: 0 });
  });
});
