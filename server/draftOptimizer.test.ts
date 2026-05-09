// FILE: server/draftOptimizer.test.ts
import { describe, it, expect } from "vitest";
import { calcPickValue, calcROSValue, calcVORP, type PlayerRow } from "./analytics";

type TestPlayerRow = PlayerRow & { scheduleStrength?: string | number };

const makePlayer = (overrides: Partial<TestPlayerRow>): TestPlayerRow => ({
  playerId: overrides.playerId ?? 1,
  playerName: overrides.playerName ?? "Test Player",
  position: overrides.position ?? "RB",
  teamId: overrides.teamId ?? 1,
  ownerName: overrides.ownerName ?? "Test Owner",
  seasonPoints: overrides.seasonPoints ?? ((overrides.avgPoints ?? 10) * 8),
  avgPoints: overrides.avgPoints ?? 10,
  projectedTotal: overrides.projectedTotal ?? null,
  keeperValue: overrides.keeperValue ?? 0,
  keeperValueFuture: overrides.keeperValueFuture ?? 0,
  injuryStatus: overrides.injuryStatus ?? "ACTIVE",
  appliedStats: overrides.appliedStats ?? {},
  scheduleStrength: overrides.scheduleStrength,
});

describe("draft optimizer analytics", () => {
  it("calculates pick value with earlier picks worth more", () => {
    const firstOverall = calcPickValue(1, 1);
    const latePick = calcPickValue(14, 14);
    const roundTwoPick = calcPickValue(2, 1);

    expect(firstOverall).toBeGreaterThanOrEqual(2700);
    expect(firstOverall).toBeLessThanOrEqual(3000);
    expect(latePick).toBeLessThan(200);
    expect(firstOverall).toBeGreaterThan(roundTwoPick);
    expect(roundTwoPick).toBeGreaterThan(latePick);
  });

  it("assigns VORP tiers and positive VORP for above-replacement players", () => {
    const qbPlayers = Array.from({ length: 18 }, (_, index) => makePlayer({
      playerId: 100 + index,
      playerName: index === 0 ? "Elite QB" : `QB ${index}`,
      position: "QB",
      avgPoints: index === 0 ? 25 : Math.max(8, 18 - index),
    }));
    const rbPlayers = Array.from({ length: 34 }, (_, index) => makePlayer({
      playerId: 200 + index,
      playerName: index === 33 ? "Low RB" : `RB ${index}`,
      position: "RB",
      avgPoints: index === 33 ? 5 : Math.max(6, 18 - index * 0.3),
    }));

    const results = calcVORP([...qbPlayers, ...rbPlayers]);
    const eliteQb = results.find((player) => player.playerName === "Elite QB");
    const lowRb = results.find((player) => player.playerName === "Low RB");

    expect(eliteQb?.vorpTier === "Elite" || eliteQb?.vorpTier === "Starter").toBe(true);
    expect(eliteQb?.vorp ?? 0).toBeGreaterThan(0);
    expect(lowRb?.vorpTier === "Handcuff" || lowRb?.vorpTier === "Borderline" || lowRb?.vorpTier === "Droppable").toBe(true);
  });

  it("calculates ROS value from remaining weeks, scoring rate, and schedule strength", () => {
    const noWeeks = calcROSValue([makePlayer({ playerId: 1, avgPoints: 20 })], 0)[0];
    expect(noWeeks.rosAdjusted).toBe(0);

    const ros = calcROSValue([
      makePlayer({ playerId: 2, playerName: "High Scorer", avgPoints: 20 }),
      makePlayer({ playerId: 3, playerName: "Low Scorer", avgPoints: 8 }),
      makePlayer({ playerId: 4, playerName: "Easy Schedule", avgPoints: 12, scheduleStrength: "Easy" }),
      makePlayer({ playerId: 5, playerName: "Tough Schedule", avgPoints: 12, scheduleStrength: "Tough" }),
    ], 5);

    const highScorer = ros.find((player) => player.playerName === "High Scorer");
    const lowScorer = ros.find((player) => player.playerName === "Low Scorer");
    const easySchedule = ros.find((player) => player.playerName === "Easy Schedule");
    const toughSchedule = ros.find((player) => player.playerName === "Tough Schedule");

    expect(highScorer?.rosAdjusted ?? 0).toBeGreaterThan(lowScorer?.rosAdjusted ?? 0);
    expect(easySchedule?.rosAdjusted ?? 0).toBeGreaterThan(toughSchedule?.rosAdjusted ?? 0);
  });

  it("filters keeper-adjusted pool by removing kept player IDs", () => {
    const availablePool = [
      makePlayer({ playerId: 1, playerName: "Available 1" }),
      makePlayer({ playerId: 2, playerName: "Keeper" }),
      makePlayer({ playerId: 3, playerName: "Available 2" }),
    ];
    const keeperPlayerIds = new Set<number>([2]);
    const keeperAdjustedPool = availablePool.filter((player) => !keeperPlayerIds.has(player.playerId));

    expect(keeperAdjustedPool).toHaveLength(2);
    expect(keeperAdjustedPool.map((player) => player.playerId)).toEqual([1, 3]);
  });
});
