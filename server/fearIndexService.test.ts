/**
 * fearIndexService.test.ts
 * ─────────────────────────
 * Sprint 4: Unit tests for the Fear Index service.
 * Tests cover:
 *  - assignHeatLabel: all 6 heat labels at boundary values
 *  - computeFearIndex: formula correctness, ranking, component weights
 */

import { describe, it, expect } from "vitest";
import { assignHeatLabel, computeFearIndex, type FearIndexInput } from "./fearIndexService";

// ─── assignHeatLabel tests ────────────────────────────────────────────────────

describe("assignHeatLabel", () => {
  it("returns UNTOUCHABLE for score >= 85", () => {
    expect(assignHeatLabel(85)).toBe("UNTOUCHABLE");
    expect(assignHeatLabel(100)).toBe("UNTOUCHABLE");
    expect(assignHeatLabel(90)).toBe("UNTOUCHABLE");
  });

  it("returns RISING THREAT for score 70-84", () => {
    expect(assignHeatLabel(70)).toBe("RISING THREAT");
    expect(assignHeatLabel(84)).toBe("RISING THREAT");
    expect(assignHeatLabel(77)).toBe("RISING THREAT");
  });

  it("returns DANGEROUS for score 55-69", () => {
    expect(assignHeatLabel(55)).toBe("DANGEROUS");
    expect(assignHeatLabel(69)).toBe("DANGEROUS");
    expect(assignHeatLabel(62)).toBe("DANGEROUS");
  });

  it("returns NEUTRAL for score 40-54", () => {
    expect(assignHeatLabel(40)).toBe("NEUTRAL");
    expect(assignHeatLabel(54)).toBe("NEUTRAL");
    expect(assignHeatLabel(47)).toBe("NEUTRAL");
  });

  it("returns DECLINING for score 25-39", () => {
    expect(assignHeatLabel(25)).toBe("DECLINING");
    expect(assignHeatLabel(39)).toBe("DECLINING");
    expect(assignHeatLabel(32)).toBe("DECLINING");
  });

  it("returns COLLAPSING for score < 25", () => {
    expect(assignHeatLabel(0)).toBe("COLLAPSING");
    expect(assignHeatLabel(24)).toBe("COLLAPSING");
    expect(assignHeatLabel(10)).toBe("COLLAPSING");
  });
});

// ─── computeFearIndex helpers ─────────────────────────────────────────────────

function makeTeam(teamId: number, wins = 5, losses = 5) {
  return {
    teamId,
    owners: `Owner ${teamId}`,
    wins,
    losses,
    ties: 0,
    pointsFor: 1200,
    pointsAgainst: 1100,
  };
}

function makeMatchup(
  homeTeamId: number,
  awayTeamId: number,
  homeScore: number,
  awayScore: number,
  week: number
) {
  // fearIndexService reads homeTeamId/awayTeamId/homeTotalPoints/awayTotalPoints
  return {
    matchupPeriodId: week,
    homeTeamId,
    awayTeamId,
    homeTotalPoints: homeScore,
    awayTotalPoints: awayScore,
  };
}

function makeBaseInput(overrides: Partial<FearIndexInput> = {}): FearIndexInput {
  const teams = [makeTeam(1), makeTeam(2), makeTeam(3)];
  return {
    season: 2025,
    week: 10,
    teams,
    matchups: [],
    transactions: [],
    ownerMap: { 1: "Alice", 2: "Bob", 3: "Carol" },
    memberIdMap: { 1: "m1", 2: "m2", 3: "m3" },
    rosterHealthMap: { 1: 50, 2: 50, 3: 50 },
    exploitabilityMap: { m1: 50, m2: 50, m3: 50 },
    ...overrides,
  };
}

// ─── computeFearIndex tests ───────────────────────────────────────────────────

describe("computeFearIndex", () => {
  it("returns one entry per team", () => {
    const input = makeBaseInput();
    const entries = computeFearIndex(input);
    expect(entries).toHaveLength(3);
  });

  it("assigns rank 1 to the highest-scoring team", () => {
    // Team 1 has 3-game win streak, others have no matchup history
    const matchups = [
      makeMatchup(1, 2, 120, 100, 8),
      makeMatchup(1, 3, 115, 90, 9),
      makeMatchup(1, 2, 130, 95, 10),
    ];
    const input = makeBaseInput({ matchups });
    const entries = computeFearIndex(input);
    const rank1 = entries.find((e) => e.rank === 1);
    expect(rank1?.teamId).toBe(1);
  });

  it("entries are sorted by fearScore descending", () => {
    const input = makeBaseInput({
      rosterHealthMap: { 1: 90, 2: 50, 3: 20 },
    });
    const entries = computeFearIndex(input);
    for (let i = 0; i < entries.length - 1; i++) {
      expect(entries[i].fearScore).toBeGreaterThanOrEqual(entries[i + 1].fearScore);
    }
  });

  it("assigns correct heatLabel based on fearScore", () => {
    const input = makeBaseInput({
      rosterHealthMap: { 1: 100, 2: 50, 3: 0 },
      exploitabilityMap: { m1: 0, m2: 50, m3: 100 },
    });
    const entries = computeFearIndex(input);
    for (const e of entries) {
      expect(e.heatLabel).toBe(
        e.fearScore >= 85 ? "UNTOUCHABLE" :
        e.fearScore >= 70 ? "RISING THREAT" :
        e.fearScore >= 55 ? "DANGEROUS" :
        e.fearScore >= 40 ? "NEUTRAL" :
        e.fearScore >= 25 ? "DECLINING" :
        "COLLAPSING"
      );
    }
  });

  it("high roster health increases fear score", () => {
    const lowHealth = makeBaseInput({ rosterHealthMap: { 1: 10, 2: 50, 3: 50 } });
    const highHealth = makeBaseInput({ rosterHealthMap: { 1: 90, 2: 50, 3: 50 } });
    const lowEntries = computeFearIndex(lowHealth);
    const highEntries = computeFearIndex(highHealth);
    const low1 = lowEntries.find((e) => e.teamId === 1)!;
    const high1 = highEntries.find((e) => e.teamId === 1)!;
    expect(high1.fearScore).toBeGreaterThan(low1.fearScore);
  });

  it("lower exploitability (higher inverse) increases fear score", () => {
    const highExploit = makeBaseInput({ exploitabilityMap: { m1: 90, m2: 50, m3: 50 } });
    const lowExploit = makeBaseInput({ exploitabilityMap: { m1: 10, m2: 50, m3: 50 } });
    const highEntries = computeFearIndex(highExploit);
    const lowEntries = computeFearIndex(lowExploit);
    const high1 = highEntries.find((e) => e.teamId === 1)!;
    const low1 = lowEntries.find((e) => e.teamId === 1)!;
    // Lower exploitability = higher exploitabilityInverse = higher fear
    expect(low1.fearScore).toBeGreaterThan(high1.fearScore);
  });

  it("win streak contributes positively to fear score", () => {
    // Team 1 has 6-game win streak (max capped contribution = 6*8=48)
    // vs team 1 with 0 streak — use same matchups for both so PF is equal
    const matchupsWithStreak = [
      makeMatchup(1, 2, 120, 100, 5),
      makeMatchup(1, 3, 115, 90, 6),
      makeMatchup(1, 2, 130, 95, 7),
      makeMatchup(1, 3, 125, 80, 8),
      makeMatchup(1, 2, 135, 100, 9),
      makeMatchup(1, 3, 140, 85, 10),
    ];
    const matchupsNoStreak = [
      makeMatchup(2, 1, 120, 100, 5), // team 1 loses all
      makeMatchup(3, 1, 115, 90, 6),
      makeMatchup(2, 1, 130, 95, 7),
      makeMatchup(3, 1, 125, 80, 8),
      makeMatchup(2, 1, 135, 100, 9),
      makeMatchup(3, 1, 140, 85, 10),
    ];
    const withStreak = makeBaseInput({ matchups: matchupsWithStreak });
    const withoutStreak = makeBaseInput({ matchups: matchupsNoStreak });
    const streakEntries = computeFearIndex(withStreak);
    const noStreakEntries = computeFearIndex(withoutStreak);
    const streak1 = streakEntries.find((e) => e.teamId === 1)!;
    const noStreak1 = noStreakEntries.find((e) => e.teamId === 1)!;
    expect(streak1.fearScore).toBeGreaterThan(noStreak1.fearScore);
  });

  it("trade aggression score is proportional to transaction count", () => {
    const manyTx = makeBaseInput({
      transactions: [
        { teamId: 1 }, { teamId: 1 }, { teamId: 1 }, { teamId: 1 }, { teamId: 1 },
        { teamId: 2 },
        { teamId: 3 },
      ],
    });
    const entries = computeFearIndex(manyTx);
    const e1 = entries.find((e) => e.teamId === 1)!;
    const e2 = entries.find((e) => e.teamId === 2)!;
    expect(e1.tradeAggressionScore).toBeGreaterThan(e2.tradeAggressionScore);
  });

  it("fearScore is capped at 100", () => {
    const maxInput = makeBaseInput({
      rosterHealthMap: { 1: 100, 2: 100, 3: 100 },
      exploitabilityMap: { m1: 0, m2: 0, m3: 0 },
      matchups: [
        makeMatchup(1, 2, 200, 50, 7),
        makeMatchup(1, 3, 200, 50, 8),
        makeMatchup(1, 2, 200, 50, 9),
        makeMatchup(1, 3, 200, 50, 10),
      ],
      transactions: Array.from({ length: 20 }, () => ({ teamId: 1 })),
    });
    const entries = computeFearIndex(maxInput);
    for (const e of entries) {
      expect(e.fearScore).toBeLessThanOrEqual(100);
    }
  });

  it("handles empty teams array", () => {
    const input = makeBaseInput({ teams: [] });
    const entries = computeFearIndex(input);
    expect(entries).toHaveLength(0);
  });

  it("stores raw win streak (can be negative for losing streak)", () => {
    // team 1 is away and loses in weeks 8 and 9 (currentWeek=10, so checks 9 then 8)
    const matchupsWithLoss = [
      makeMatchup(2, 1, 120, 80, 8),  // team 1 is away, loses in week 8
      makeMatchup(3, 1, 115, 70, 9),  // team 1 is away, loses in week 9
    ];
    const input = makeBaseInput({ matchups: matchupsWithLoss });
    const entries = computeFearIndex(input);
    const e1 = entries.find((e) => e.teamId === 1)!;
    // winStreak should be -2 (two consecutive losses: week 9 then week 8)
    expect(e1.winStreak).toBe(-2);
  });
});
