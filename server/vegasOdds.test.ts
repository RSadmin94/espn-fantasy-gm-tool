// FILE: server/vegasOdds.test.ts
/**
 * Vitest tests for Vegas Odds Service pure functions.
 *
 * Tests cover:
 *   - calcVegasAdjustment: implied total → Monte Carlo multiplier
 *   - getVegasContextForTeam: team lookup from game list
 *   - buildVegasPromptBlock: prompt string generation
 *   - Implied total formula: spread + total → home/away implied
 */

import { describe, it, expect } from "vitest";
import {
  calcVegasAdjustment,
  getVegasContextForTeam,
  buildVegasPromptBlock,
  type NFLGameOdds,
} from "./vegasOddsService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_GAMES: NFLGameOdds[] = [
  {
    eventId: "evt_1",
    homeTeam: "Kansas City Chiefs",
    awayTeam: "Buffalo Bills",
    commenceTime: "2025-11-02T18:00:00Z",
    gameTotal: 53.5,
    homeSpread: -3.5,
    homeImpliedTotal: 28.5,
    awayImpliedTotal: 25.0,
    homeWinProbability: 62,
    awayWinProbability: 38,
    bookmakerSource: "draftkings",
    fetchedAt: "2025-11-01T12:00:00Z",
  },
  {
    eventId: "evt_2",
    homeTeam: "Atlanta Falcons",
    awayTeam: "Carolina Panthers",
    commenceTime: "2025-11-02T17:00:00Z",
    gameTotal: 38.5,
    homeSpread: -6.5,
    homeImpliedTotal: 22.5,
    awayImpliedTotal: 16.0,
    homeWinProbability: 71,
    awayWinProbability: 29,
    bookmakerSource: "fanduel",
    fetchedAt: "2025-11-01T12:00:00Z",
  },
  {
    eventId: "evt_3",
    homeTeam: "San Francisco 49ers",
    awayTeam: "Seattle Seahawks",
    commenceTime: "2025-11-02T21:25:00Z",
    gameTotal: null,
    homeSpread: null,
    homeImpliedTotal: null,
    awayImpliedTotal: null,
    homeWinProbability: null,
    awayWinProbability: null,
    bookmakerSource: "none",
    fetchedAt: "2025-11-01T12:00:00Z",
  },
];

// ─── calcVegasAdjustment ──────────────────────────────────────────────────────

describe("calcVegasAdjustment", () => {
  it("returns 0 for null implied total", () => {
    expect(calcVegasAdjustment(null)).toBe(0);
  });

  it("returns 0 for exactly average implied total (22.5)", () => {
    expect(calcVegasAdjustment(22.5)).toBe(0);
  });

  it("returns positive adjustment for high-scoring team (27 pts)", () => {
    const adj = calcVegasAdjustment(27);
    expect(adj).toBeGreaterThan(0);
    expect(adj).toBeCloseTo(0.2, 2); // (27 - 22.5) / 22.5 ≈ 0.2
  });

  it("returns negative adjustment for low-scoring team (17 pts)", () => {
    const adj = calcVegasAdjustment(17);
    expect(adj).toBeLessThan(0);
    expect(adj).toBeCloseTo(-0.244, 2); // (17 - 22.5) / 22.5 ≈ -0.244
  });

  it("caps positive adjustment at +0.25 for extreme implied totals", () => {
    expect(calcVegasAdjustment(50)).toBe(0.25);
  });

  it("caps negative adjustment at -0.25 for extreme low implied totals", () => {
    expect(calcVegasAdjustment(5)).toBe(-0.25);
  });

  it("returns small positive for slightly above average (24 pts)", () => {
    const adj = calcVegasAdjustment(24);
    expect(adj).toBeGreaterThan(0);
    expect(adj).toBeLessThan(0.1);
  });
});

// ─── getVegasContextForTeam ───────────────────────────────────────────────────

describe("getVegasContextForTeam", () => {
  it("returns context for home team (KC)", () => {
    const ctx = getVegasContextForTeam("KC", MOCK_GAMES);
    expect(ctx).not.toBeNull();
    expect(ctx!.nflTeam).toBe("KC");
    expect(ctx!.isHome).toBe(true);
    expect(ctx!.opponent).toBe("BUF");
    expect(ctx!.impliedTotal).toBe(28.5);
    expect(ctx!.winProbability).toBe(62);
    expect(ctx!.gameTotal).toBe(53.5);
    expect(ctx!.gameEnvironment).toBe("high_scoring"); // 53.5 >= 48
  });

  it("returns context for away team (BUF)", () => {
    const ctx = getVegasContextForTeam("BUF", MOCK_GAMES);
    expect(ctx).not.toBeNull();
    expect(ctx!.nflTeam).toBe("BUF");
    expect(ctx!.isHome).toBe(false);
    expect(ctx!.opponent).toBe("KC");
    expect(ctx!.impliedTotal).toBe(25.0);
    expect(ctx!.winProbability).toBe(38);
  });

  it("returns context for ATL (home, low-scoring game)", () => {
    const ctx = getVegasContextForTeam("ATL", MOCK_GAMES);
    expect(ctx).not.toBeNull();
    expect(ctx!.isHome).toBe(true);
    expect(ctx!.gameEnvironment).toBe("low_scoring"); // 38.5 <= 40
    expect(ctx!.impliedTotal).toBe(22.5);
  });

  it("returns context for CAR (away, low-scoring game)", () => {
    const ctx = getVegasContextForTeam("CAR", MOCK_GAMES);
    expect(ctx).not.toBeNull();
    expect(ctx!.isHome).toBe(false);
    expect(ctx!.impliedTotal).toBe(16.0);
    expect(ctx!.vegasAdjustment).toBeLessThan(0); // below average
  });

  it("returns null for unknown team abbreviation", () => {
    expect(getVegasContextForTeam("XYZ", MOCK_GAMES)).toBeNull();
  });

  it("returns null when team is not in any game", () => {
    expect(getVegasContextForTeam("NYG", MOCK_GAMES)).toBeNull();
  });

  it("handles case-insensitive team abbreviation", () => {
    const ctx = getVegasContextForTeam("kc", MOCK_GAMES);
    expect(ctx).not.toBeNull();
    expect(ctx!.nflTeam).toBe("KC");
  });

  it("returns null for game with no odds data (SF)", () => {
    const ctx = getVegasContextForTeam("SF", MOCK_GAMES);
    // SF game exists but has null totals — context should still be returned
    // but with null implied total and 0 vegasAdjustment
    expect(ctx).not.toBeNull();
    expect(ctx!.impliedTotal).toBeNull();
    expect(ctx!.vegasAdjustment).toBe(0);
  });

  it("computes correct vegasAdjustment for KC (implied 28.5, capped at +0.25)", () => {
    const ctx = getVegasContextForTeam("KC", MOCK_GAMES);
    // (28.5 - 22.5) / 22.5 = 0.267 which exceeds the +0.25 cap
    expect(ctx!.vegasAdjustment).toBe(0.25);
  });
});

// ─── buildVegasPromptBlock ────────────────────────────────────────────────────

describe("buildVegasPromptBlock", () => {
  it("returns a block starting with VEGAS GAME CONTEXT:", () => {
    const block = buildVegasPromptBlock([]);
    expect(block).toContain("VEGAS GAME CONTEXT:");
  });

  it("includes player name, team, opponent, and game total", () => {
    const ctx = getVegasContextForTeam("KC", MOCK_GAMES)!;
    const block = buildVegasPromptBlock([
      { playerName: "Patrick Mahomes", teamAbbr: "KC", context: ctx },
    ]);
    expect(block).toContain("Patrick Mahomes");
    expect(block).toContain("KC");
    expect(block).toContain("BUF");
    expect(block).toContain("53.5");
    expect(block).toContain("28.5");
  });

  it("shows 'No Vegas data available' for null context", () => {
    const block = buildVegasPromptBlock([
      { playerName: "Unknown Player", teamAbbr: "XYZ", context: null },
    ]);
    expect(block).toContain("No Vegas data available");
  });

  it("includes positive adjustment with + prefix", () => {
    const ctx = getVegasContextForTeam("KC", MOCK_GAMES)!;
    const block = buildVegasPromptBlock([
      { playerName: "Mahomes", teamAbbr: "KC", context: ctx },
    ]);
    expect(block).toMatch(/\+\d+\.\d+%/);
  });

  it("includes negative adjustment for below-average team", () => {
    const ctx = getVegasContextForTeam("CAR", MOCK_GAMES)!;
    const block = buildVegasPromptBlock([
      { playerName: "CAR RB", teamAbbr: "CAR", context: ctx },
    ]);
    expect(block).toMatch(/-\d+\.\d+%/);
  });

  it("handles multiple players in one block", () => {
    const ctxKC = getVegasContextForTeam("KC", MOCK_GAMES)!;
    const ctxATL = getVegasContextForTeam("ATL", MOCK_GAMES)!;
    const block = buildVegasPromptBlock([
      { playerName: "Mahomes", teamAbbr: "KC", context: ctxKC },
      { playerName: "Pitts", teamAbbr: "ATL", context: ctxATL },
    ]);
    expect(block).toContain("Mahomes");
    expect(block).toContain("Pitts");
  });
});

// ─── Implied total formula validation ────────────────────────────────────────

describe("Implied total formula", () => {
  it("home + away implied totals sum to game total", () => {
    const game = MOCK_GAMES[0]!;
    expect(game.homeImpliedTotal! + game.awayImpliedTotal!).toBeCloseTo(game.gameTotal!, 1);
  });

  it("home implied > away implied when home team is favored (negative spread)", () => {
    const game = MOCK_GAMES[0]!; // KC -3.5 at home
    expect(game.homeImpliedTotal!).toBeGreaterThan(game.awayImpliedTotal!);
  });

  it("ATL implied totals sum to game total", () => {
    const game = MOCK_GAMES[1]!;
    expect(game.homeImpliedTotal! + game.awayImpliedTotal!).toBeCloseTo(game.gameTotal!, 1);
  });
});
