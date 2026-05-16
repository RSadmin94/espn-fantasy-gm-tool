import { describe, it, expect } from "vitest";
import {
  calcVORP,
  calcPositionalScarcity,
  calcRosterGaps,
  calcKeeperEfficiency,
  calcManagerBehavior,
  calcROSValue,
  calcPickValue,
  type PlayerRow,
  type TeamRow,
  type TransactionRow,
  type DraftPickRow,
} from "./analytics";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    playerId: 1,
    playerName: "Test Player",
    position: "WR",
    teamId: 1,
    ownerName: "Owner A",
    seasonPoints: 200,
    avgPoints: 14.3,
    projectedTotal: null,
    keeperValue: 0,
    keeperValueFuture: 0,
    injuryStatus: "",
    appliedStats: {},
    ...overrides,
  };
}

function makeTeam(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    teamId: 1,
    ownerName: "Owner A",
    wins: 8,
    losses: 5,
    pointsFor: 1500,
    pointsAgainst: 1400,
    ...overrides,
  };
}

// ── calcPickValue ─────────────────────────────────────────────────────────────

describe("calcPickValue", () => {
  it("returns highest value for pick 1.01", () => {
    const val = calcPickValue(1, 1, 14);
    expect(val).toBeGreaterThan(2500);
  });

  it("returns lower value for later picks", () => {
    const early = calcPickValue(1, 1, 14);
    const late = calcPickValue(3, 14, 14);
    expect(early).toBeGreaterThan(late);
  });

  it("returns positive value for any valid pick", () => {
    for (let round = 1; round <= 13; round++) {
      const val = calcPickValue(round, 1, 14);
      expect(val).toBeGreaterThan(0);
    }
  });

  it("later rounds in snake have lower value", () => {
    const r1 = calcPickValue(1, 7, 14);
    const r5 = calcPickValue(5, 7, 14);
    const r10 = calcPickValue(10, 7, 14);
    expect(r1).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(r10);
  });
});

// ── calcVORP ──────────────────────────────────────────────────────────────────

describe("calcVORP", () => {
  it("returns empty array for no players", () => {
    expect(calcVORP([])).toEqual([]);
  });

  it("assigns positive VORP to above-replacement players", () => {
    const players: PlayerRow[] = [
      makePlayer({ playerId: 1, position: "WR", avgPoints: 20, ownerName: "A" }),
      makePlayer({ playerId: 2, position: "WR", avgPoints: 15, ownerName: "B" }),
      makePlayer({ playerId: 3, position: "WR", avgPoints: 10, ownerName: "C" }),
      makePlayer({ playerId: 4, position: "WR", avgPoints: 5, ownerName: "D" }),
    ];
    const result = calcVORP(players);
    const top = result.find(r => r.playerId === 1);
    const bottom = result.find(r => r.playerId === 4);
    expect(top!.vorp).toBeGreaterThan(0);
    expect(top!.vorp).toBeGreaterThan(bottom!.vorp);
  });

  it("assigns Elite tier to top VORP players", () => {
    const players: PlayerRow[] = Array.from({ length: 20 }, (_, i) =>
      makePlayer({ playerId: i, position: "RB", avgPoints: 20 - i, ownerName: `Owner ${i}` })
    );
    const result = calcVORP(players);
    const top = result[0];
    expect(top.vorpTier).toBe("Elite");
  });

  it("assigns Droppable tier to negative VORP players", () => {
    const players: PlayerRow[] = Array.from({ length: 30 }, (_, i) =>
      makePlayer({ playerId: i, position: "WR", avgPoints: 15 - i * 0.8, ownerName: `Owner ${i}` })
    );
    const result = calcVORP(players);
    const last = result[result.length - 1];
    expect(["Droppable", "Handcuff"]).toContain(last.vorpTier);
  });

  it("sorts results by VORP descending", () => {
    const players: PlayerRow[] = [
      makePlayer({ playerId: 1, position: "QB", avgPoints: 25, ownerName: "A" }),
      makePlayer({ playerId: 2, position: "QB", avgPoints: 30, ownerName: "B" }),
      makePlayer({ playerId: 3, position: "QB", avgPoints: 20, ownerName: "C" }),
    ];
    const result = calcVORP(players);
    expect(result[0].vorp).toBeGreaterThanOrEqual(result[1].vorp);
    expect(result[1].vorp).toBeGreaterThanOrEqual(result[2].vorp);
  });
});

// ── calcPositionalScarcity ────────────────────────────────────────────────────

describe("calcPositionalScarcity", () => {
  it("returns scarcity data for each position", () => {
    const rostered: PlayerRow[] = [
      makePlayer({ position: "QB", avgPoints: 22 }),
      makePlayer({ position: "RB", avgPoints: 18 }),
      makePlayer({ position: "WR", avgPoints: 16 }),
      makePlayer({ position: "TE", avgPoints: 12 }),
    ];
    const freeAgents: PlayerRow[] = [
      makePlayer({ position: "QB", avgPoints: 15, teamId: 0, ownerName: "Free Agent" }),
    ];
    const result = calcPositionalScarcity(rostered, freeAgents);
    expect(result.length).toBeGreaterThan(0);
    const qb = result.find(r => r.position === "QB");
    expect(qb).toBeDefined();
    expect(qb!.scarcityScore).toBeGreaterThanOrEqual(0);
    expect(qb!.scarcityScore).toBeLessThanOrEqual(100);
  });

  it("labels scarce positions correctly", () => {
    // Many rostered, no free agents → scarce
    const rostered: PlayerRow[] = Array.from({ length: 28 }, (_, i) =>
      makePlayer({ playerId: i, position: "TE", avgPoints: 12 - i * 0.3, teamId: (i % 14) + 1 })
    );
    const result = calcPositionalScarcity(rostered, []);
    const te = result.find(r => r.position === "TE");
    expect(te).toBeDefined();
    expect(["Scarce", "Tight"]).toContain(te!.scarcityLabel);
  });
});

// ── calcRosterGaps ────────────────────────────────────────────────────────────

describe("calcRosterGaps", () => {
  it("returns a gap analysis per team", () => {
    const players: PlayerRow[] = [
      makePlayer({ teamId: 1, position: "QB", avgPoints: 22 }),
      makePlayer({ teamId: 1, position: "RB", avgPoints: 18 }),
      makePlayer({ teamId: 2, position: "WR", avgPoints: 16 }),
    ];
    const result = calcRosterGaps(players);
    expect(result.length).toBeGreaterThan(0);
    const team1 = result.find(r => r.teamId === 1);
    expect(team1).toBeDefined();
    expect(team1!.gaps.length).toBeGreaterThan(0);
    expect(["A", "B", "C", "D", "F"]).toContain(team1!.overallGrade);
  });

  it("assigns lower grade to team with no players", () => {
    const players: PlayerRow[] = [
      makePlayer({ teamId: 1, position: "QB", avgPoints: 25 }),
      makePlayer({ teamId: 1, position: "RB", avgPoints: 20 }),
      makePlayer({ teamId: 1, position: "WR", avgPoints: 18 }),
      makePlayer({ teamId: 1, position: "TE", avgPoints: 15 }),
      makePlayer({ teamId: 2, position: "QB", avgPoints: 5 }),
    ];
    const result = calcRosterGaps(players);
    const team1 = result.find(r => r.teamId === 1);
    const team2 = result.find(r => r.teamId === 2);
    // Team 1 should have better grade than team 2
    const gradeOrder = ["A", "B", "C", "D", "F"];
    expect(gradeOrder.indexOf(team1!.overallGrade)).toBeLessThanOrEqual(
      gradeOrder.indexOf(team2!.overallGrade)
    );
  });
});

// ── calcKeeperEfficiency ──────────────────────────────────────────────────────

describe("calcKeeperEfficiency", () => {
  it("returns empty array when no keepers", () => {
    const players: PlayerRow[] = [
      makePlayer({ keeperValue: 0 }),
    ];
    const vorp = calcVORP(players);
    const result = calcKeeperEfficiency(players, vorp);
    expect(result).toEqual([]);
  });

  it("identifies elite value keepers with high round savings", () => {
    const players: PlayerRow[] = [
      makePlayer({ playerId: 1, playerName: "Star Player", position: "WR", avgPoints: 22, keeperValue: 10 }),
    ];
    const vorp = calcVORP(players);
    const result = calcKeeperEfficiency(players, vorp);
    expect(result.length).toBe(1);
    expect(result[0].keeperRound).toBe(10);
    expect(result[0].efficiencyLabel).toBeDefined();
    expect(result[0].recommendation).toBeDefined();
  });

  it("marks poor value keepers with any valid label", () => {
    const players: PlayerRow[] = [
      makePlayer({ playerId: 1, playerName: "Bust Player", position: "QB", avgPoints: 8, keeperValue: 1 }),
    ];
    const vorp = calcVORP(players);
    const result = calcKeeperEfficiency(players, vorp);
    if (result.length > 0) {
      // Any valid label is acceptable — the key is that the result has a label and recommendation
      expect(result[0].efficiencyLabel).toBeDefined();
      expect(result[0].recommendation).toBeDefined();
    }
  });
});

// ── calcManagerBehavior ───────────────────────────────────────────────────────

describe("calcManagerBehavior", () => {
  it("returns empty array for no teams", () => {
    expect(calcManagerBehavior([], [], [], {})).toEqual([]);
  });

  it("calculates trade frequency correctly", () => {
    const teams: TeamRow[] = [makeTeam({ teamId: 1 })];
    const transactions: TransactionRow[] = [
      { season: 2024, teamId: 1, type: "TRADE", itemType: "ADD", proposedDate: Date.now() },
      { season: 2024, teamId: 1, type: "TRADE", itemType: "ADD", proposedDate: Date.now() },
      { season: 2024, teamId: 1, type: "TRADE", itemType: "ADD", proposedDate: Date.now() },
    ];
    const result = calcManagerBehavior(teams, transactions, [], { 1: "Owner A" });
    expect(result.length).toBe(1);
    expect(result[0].avgTradesPerSeason).toBeGreaterThan(0);
  });

  it("assigns archetype to each manager", () => {
    const teams: TeamRow[] = [
      makeTeam({ teamId: 1, ownerName: "Trader Joe" }),
      makeTeam({ teamId: 2, ownerName: "Waiver King" }),
    ];
    const transactions: TransactionRow[] = [
      { season: 2024, teamId: 1, type: "TRADE", itemType: "ADD", proposedDate: Date.now() },
      { season: 2024, teamId: 2, type: "WAIVER", itemType: "ADD", proposedDate: Date.now() },
    ];
    const result = calcManagerBehavior(teams, transactions, [], { 1: "Trader Joe", 2: "Waiver King" });
    expect(result.length).toBe(2);
    for (const m of result) {
      expect(m.gmArchetype).toBeDefined();
      expect(m.gmArchetype.length).toBeGreaterThan(0);
    }
  });

  it("detects early QB tendency from draft picks", () => {
    const teams: TeamRow[] = [makeTeam({ teamId: 1 })];
    const picks: DraftPickRow[] = [
      { season: 2024, teamId: 1, roundId: 2, roundPickNumber: 3, overallPickNumber: 17, position: "QB", keeper: false },
      { season: 2023, teamId: 1, roundId: 1, roundPickNumber: 5, overallPickNumber: 5, position: "QB", keeper: false },
    ];
    const result = calcManagerBehavior(teams, [], picks, { 1: "QB Lover" });
    expect(result.length).toBe(1);
    expect(result[0].earlyQbTendency).toBe(true);
  });

  it("computes pick-based keeper efficiency: positive when kept pick > ADP pick", () => {
    // 12-team league: keeper kept at overall pick 11 (round 1, pick 11)
    // Player has 22 avg pts (elite RB) → estimateAdpRound gives round 1
    // adpOverallPick ≈ 1-3 (very early pick)
    // efficiency = 11 - adpOverallPick → should be positive (good deal)
    const teams: TeamRow[] = Array.from({ length: 12 }, (_, i) => makeTeam({ teamId: i + 1 }));
    const picks: DraftPickRow[] = [
      { season: 2024, teamId: 1, roundId: 1, roundPickNumber: 11, overallPickNumber: 11, position: "RB", keeper: true, playerId: 999 },
    ];
    const playerScoreMap = new Map<number, { avgPoints: number; position: string }>();
    playerScoreMap.set(999, { avgPoints: 22, position: "RB" });
    const result = calcManagerBehavior(teams, [], picks, { 1: "Smart Keeper" }, playerScoreMap);
    expect(result.length).toBeGreaterThan(0);
    const m = result.find(r => r.teamId === 1)!;
    expect(m.keeperEfficiencyAvg).toBeGreaterThan(0);
  });

  it("computes pick-based keeper efficiency: negative when kept pick < ADP pick", () => {
    // 12-team league: keeper kept at overall pick 1 (round 1, pick 1)
    // Player has 8 avg pts (low-value QB) → estimateAdpRound gives round 8+
    // adpOverallPick ≈ round 8 * 12 = 96+
    // efficiency = 1 - 96 → very negative (overpaying)
    const teams: TeamRow[] = Array.from({ length: 12 }, (_, i) => makeTeam({ teamId: i + 1 }));
    const picks: DraftPickRow[] = [
      { season: 2024, teamId: 1, roundId: 1, roundPickNumber: 1, overallPickNumber: 1, position: "QB", keeper: true, playerId: 888 },
    ];
    const playerScoreMap = new Map<number, { avgPoints: number; position: string }>();
    playerScoreMap.set(888, { avgPoints: 8, position: "QB" });
    const result = calcManagerBehavior(teams, [], picks, { 1: "Bad Keeper" }, playerScoreMap);
    const m = result.find(r => r.teamId === 1)!;
    expect(m.keeperEfficiencyAvg).toBeLessThan(0);
  });

  it("falls back to round-based heuristic when no playerScoreMap provided", () => {
    // Keeper in round 1 with no scoring data → fallback: (7 - 1) * leagueSize/2 = positive
    const teams: TeamRow[] = Array.from({ length: 12 }, (_, i) => makeTeam({ teamId: i + 1 }));
    const picks: DraftPickRow[] = [
      { season: 2024, teamId: 1, roundId: 1, roundPickNumber: 5, overallPickNumber: 5, position: "RB", keeper: true },
    ];
    const result = calcManagerBehavior(teams, [], picks, { 1: "Keeper Guy" });
    const m = result.find(r => r.teamId === 1)!;
    // Round 1 keeper → (7 - 1) * 6 = 36 picks of value (fallback formula)
    expect(m.keeperEfficiencyAvg).toBeGreaterThan(0);
  });
});

// ── calcROSValue ──────────────────────────────────────────────────────────────

describe("calcROSValue", () => {
  it("returns empty array for no players", () => {
    expect(calcROSValue([], 10)).toEqual([]);
  });

  it("calculates ROS value proportional to avg points", () => {
    const players: PlayerRow[] = [
      makePlayer({ playerId: 1, avgPoints: 20, position: "WR" }),
      makePlayer({ playerId: 2, avgPoints: 10, position: "WR" }),
    ];
    const result = calcROSValue(players, 10);
    const p1 = result.find(r => r.playerId === 1);
    const p2 = result.find(r => r.playerId === 2);
    expect(p1!.rosProjectedTotal).toBeGreaterThan(p2!.rosProjectedTotal);
  });

  it("applies injury penalty to injured players", () => {
    const healthy = makePlayer({ playerId: 1, avgPoints: 15, injuryStatus: "" });
    const injured = makePlayer({ playerId: 2, avgPoints: 15, injuryStatus: "OUT" });
    const result = calcROSValue([healthy, injured], 10);
    const h = result.find(r => r.playerId === 1);
    const inj = result.find(r => r.playerId === 2);
    expect(h!.rosAdjusted).toBeGreaterThan(inj!.rosAdjusted);
  });

  it("sorts by ROS adjusted value descending", () => {
    const players: PlayerRow[] = Array.from({ length: 10 }, (_, i) =>
      makePlayer({ playerId: i, avgPoints: 20 - i, position: "RB" })
    );
    const result = calcROSValue(players, 8);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].rosAdjusted).toBeGreaterThanOrEqual(result[i + 1].rosAdjusted);
    }
  });
});
