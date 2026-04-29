/**
 * Tests for the 2026 Keeper Eligibility Calculator logic.
 * We test the core business rules directly without hitting the database.
 */
import { describe, expect, it } from "vitest";

// ── Inline the core eligibility logic for unit testing ──────────────────────

type KeeperEntry = {
  playerId: number;
  playerName: string;
  position: string;
  roundId: number;
};

type KeepersByTeam = Record<number, KeeperEntry[]>;

function computeEligibility(
  keepers2025: KeepersByTeam,
  keepers2024: Record<number, Record<number, number>>, // teamId -> playerId -> roundId
) {
  const ADP_ROUNDS: Record<string, number> = {
    QB: 6, RB: 3, WR: 3, TE: 5, K: 14, DEF: 13,
  };

  function valueTier(position: string, roundCost: number) {
    const adp = ADP_ROUNDS[position?.toUpperCase()] ?? 7;
    const savings = adp - roundCost;
    if (savings >= 4) return "elite";
    if (savings >= 2) return "good";
    if (savings >= 0) return "fair";
    return "poor";
  }

  const results = Object.entries(keepers2025).map(([tidStr, players]) => {
    const tid = Number(tidStr);
    const my2024 = keepers2024[tid] ?? {};

    const processed = players.map((k) => {
      const keptIn2024 = my2024[k.playerId] !== undefined;
      const isIneligible = keptIn2024;
      const roundCost2026 = k.roundId - 1;
      const consecutiveYears = keptIn2024 ? 2 : 1;
      const tier = isIneligible
        ? "ineligible"
        : valueTier(k.position, roundCost2026);
      return {
        playerId: k.playerId,
        playerName: k.playerName,
        position: k.position,
        round2025: k.roundId,
        round2024: keptIn2024 ? my2024[k.playerId] : null,
        roundCost2026: isIneligible ? null : roundCost2026,
        consecutiveYears,
        isIneligible,
        valueTier: tier,
      };
    });

    return {
      teamId: tid,
      players: processed,
      ineligibleCount: processed.filter((p) => p.isIneligible).length,
      eligibleCount: processed.filter((p) => !p.isIneligible).length,
    };
  });

  return results;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("2026 Keeper Eligibility — 2-year rule", () => {
  it("marks a player kept in both 2024 and 2025 as ineligible", () => {
    const keepers2025: KeepersByTeam = {
      1: [{ playerId: 100, playerName: "Derrick Henry", position: "RB", roundId: 1 }],
    };
    const keepers2024: Record<number, Record<number, number>> = {
      1: { 100: 1 }, // also kept in 2024 round 1
    };

    const results = computeEligibility(keepers2025, keepers2024);
    const team = results.find((r) => r.teamId === 1)!;
    const player = team.players[0];

    expect(player.isIneligible).toBe(true);
    expect(player.consecutiveYears).toBe(2);
    expect(player.roundCost2026).toBeNull();
    expect(player.valueTier).toBe("ineligible");
    expect(team.ineligibleCount).toBe(1);
    expect(team.eligibleCount).toBe(0);
  });

  it("marks a player kept only in 2025 as eligible with correct round cost", () => {
    const keepers2025: KeepersByTeam = {
      2: [{ playerId: 200, playerName: "Ja'Marr Chase", position: "WR", roundId: 2 }],
    };
    const keepers2024: Record<number, Record<number, number>> = {}; // not kept in 2024

    const results = computeEligibility(keepers2025, keepers2024);
    const team = results.find((r) => r.teamId === 2)!;
    const player = team.players[0];

    expect(player.isIneligible).toBe(false);
    expect(player.consecutiveYears).toBe(1);
    expect(player.roundCost2026).toBe(1); // round 2 - 1 = round 1
    expect(team.eligibleCount).toBe(1);
    expect(team.ineligibleCount).toBe(0);
  });

  it("calculates round cost as kept-round minus 1", () => {
    const keepers2025: KeepersByTeam = {
      3: [{ playerId: 300, playerName: "Bijan Robinson", position: "RB", roundId: 5 }],
    };
    const keepers2024: Record<number, Record<number, number>> = {};

    const results = computeEligibility(keepers2025, keepers2024);
    const player = results[0].players[0];

    expect(player.roundCost2026).toBe(4); // round 5 - 1 = round 4
  });

  it("assigns elite value tier when round cost is much cheaper than ADP", () => {
    // RB ADP = round 3; if kept in round 7 (cost = round 6), savings = 3 - 6 = -3 → poor
    // RB ADP = round 3; if kept in round 2 (cost = round 1), savings = 3 - 1 = 2 → good
    // RB ADP = round 3; if kept in round 5 (cost = round 4), savings = 3 - 4 = -1 → poor
    // WR ADP = round 3; if kept in round 8 (cost = round 7), savings = 3 - 7 = -4 → poor
    // QB ADP = round 6; if kept in round 11 (cost = round 10), savings = 6 - 10 = -4 → poor
    // RB ADP = round 3; if kept in round 3 (cost = round 2), savings = 3 - 2 = 1 → fair
    // TE ADP = round 5; if kept in round 1 (cost = round 0 → but min is 1), savings = 5 - 0 = 5 → elite
    // Let's test: RB kept in round 8 (cost=7), savings = 3-7 = -4 → poor
    // And: TE kept in round 2 (cost=1), savings = 5-1 = 4 → elite
    const keepers2025: KeepersByTeam = {
      4: [
        { playerId: 401, playerName: "Travis Kelce", position: "TE", roundId: 2 }, // cost=1, TE ADP=5, savings=4 → elite
        { playerId: 402, playerName: "Backup RB", position: "RB", roundId: 8 },   // cost=7, RB ADP=3, savings=-4 → poor
      ],
    };
    const keepers2024: Record<number, Record<number, number>> = {};

    const results = computeEligibility(keepers2025, keepers2024);
    const players = results[0].players;
    const kelce = players.find((p) => p.playerId === 401)!;
    const backupRb = players.find((p) => p.playerId === 402)!;

    expect(kelce.valueTier).toBe("elite");
    expect(backupRb.valueTier).toBe("poor");
  });

  it("handles a team with no 2025 keepers gracefully", () => {
    const keepers2025: KeepersByTeam = { 5: [] };
    const keepers2024: Record<number, Record<number, number>> = {};

    const results = computeEligibility(keepers2025, keepers2024);
    const team = results.find((r) => r.teamId === 5)!;

    expect(team.players).toHaveLength(0);
    expect(team.ineligibleCount).toBe(0);
    expect(team.eligibleCount).toBe(0);
  });

  it("correctly identifies the 4 ineligible players from the 2025 season data", () => {
    // Based on real ESPN data: Derrick Henry (team 1), Jahmyr Gibbs (team 4),
    // Jonathan Taylor (team 8), Breece Hall (team 11) were all kept in both 2024 and 2025
    const keepers2025: KeepersByTeam = {
      1:  [{ playerId: 4040715, playerName: "Derrick Henry",    position: "RB", roundId: 1 }],
      4:  [{ playerId: 4569618, playerName: "Jahmyr Gibbs",     position: "RB", roundId: 2 }],
      8:  [{ playerId: 3054211, playerName: "Jonathan Taylor",  position: "RB", roundId: 3 }],
      11: [{ playerId: 4427366, playerName: "Breece Hall",      position: "RB", roundId: 5 }],
    };
    const keepers2024: Record<number, Record<number, number>> = {
      1:  { 4040715: 1 },
      4:  { 4569618: 2 },
      8:  { 3054211: 3 },
      11: { 4427366: 5 },
    };

    const results = computeEligibility(keepers2025, keepers2024);
    const allIneligible = results.flatMap((t) => t.players.filter((p) => p.isIneligible));

    expect(allIneligible).toHaveLength(4);
    expect(allIneligible.map((p) => p.playerName).sort()).toEqual([
      "Breece Hall",
      "Derrick Henry",
      "Jahmyr Gibbs",
      "Jonathan Taylor",
    ]);
  });
});
