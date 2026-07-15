import { describe, expect, it } from "vitest";
import {
  evaluateCloseDecisionGate,
  evaluateOwnerDnaNudge,
  OFFENSE_DNA_POSITIONS,
  ownerDnaDecayMultiplier,
  OWNER_DNA_DECAY_MULTIPLIERS,
  type OwnerDraftDnaModel,
  type OwnerDraftDnaContext,
  type CloseDecisionResult,
} from "./ownerDraftDnaModel";

function emptyCtx(): OwnerDraftDnaContext {
  return { league: { roundPosRate: new Map(), totalPicks: 0 }, byOwnerKey: new Map() };
}

function modelWithRound(round: number, pos: string, rate: number): OwnerDraftDnaModel {
  const m = new Map<string, number>([[pos, rate]]);
  return {
    ownerKey: "test",
    ownerName: "Test Owner",
    pickCount: 50,
    seasonCount: 5,
    confidence: "High",
    confidenceWeight: 0.85,
    roundPosRate: new Map([[round, m]]),
  };
}

function closeDecisionFrom(undrafted: Array<{ name: string; position: string; adp: number | null; projectedPoints?: number; marketValue?: number | null }>): CloseDecisionResult {
  return evaluateCloseDecisionGate({
    undrafted,
    bpa: undrafted[0]!,
    reachSlots: 12,
    counts: {},
    cap: () => 3,
    teamNeeds: [],
  });
}

describe("ownerDraftDnaModel", () => {
  it("does not nudge when BPA position already matches top lean", () => {
    const undrafted = [
      { name: "WR1", position: "WR", adp: 10, projectedPoints: 200, marketValue: 80 },
      { name: "RB1", position: "RB", adp: 11, projectedPoints: 195, marketValue: 78 },
    ];
    const close = closeDecisionFrom(undrafted);
    const result = evaluateOwnerDnaNudge({
      ownerName: "Alice",
      ownerModel: modelWithRound(3, "WR", 0.9),
      dnaContext: emptyCtx(),
      round: 3,
      pickNum: 25,
      undrafted,
      bpa: undrafted[0]!,
      legacyPick: undrafted[0]!,
      closeDecision: close,
      decayMultiplier: 1,
      consecutiveAppliedNudges: 0,
      teamNeeds: [],
      reachSlots: 12,
      counts: {},
      cap: () => 3,
    });
    expect(result.applied).toBe(false);
    expect(result.positionProbabilities[0]?.position).toBe("WR");
  });

  it("nudges to owner-lean position on a close board", () => {
    const undrafted = [
      { name: "WR1", position: "WR", adp: 10, projectedPoints: 200, marketValue: 80 },
      { name: "RB1", position: "RB", adp: 12, projectedPoints: 198, marketValue: 79 },
      { name: "TE1", position: "TE", adp: 40, projectedPoints: 120, marketValue: 50 },
    ];
    const close = closeDecisionFrom(undrafted);
    expect(close.isClose).toBe(true);
    const result = evaluateOwnerDnaNudge({
      ownerName: "Bob",
      ownerModel: modelWithRound(4, "RB", 0.85),
      dnaContext: emptyCtx(),
      round: 4,
      pickNum: 40,
      undrafted,
      bpa: undrafted[0]!,
      legacyPick: undrafted[0]!,
      closeDecision: close,
      decayMultiplier: 1,
      consecutiveAppliedNudges: 0,
      teamNeeds: [],
      reachSlots: 12,
      counts: {},
      cap: () => 3,
    });
    expect(result.applied).toBe(true);
    expect(result.player?.name).toBe("RB1");
    expect(result.structuredSections.some((s) => s.title === "Decision")).toBe(true);
  });

  it("blocks nudge when target is more than 6 ADP slots behind BPA", () => {
    const undrafted = [
      { name: "WR1", position: "WR", adp: 1, projectedPoints: 200, marketValue: 90 },
      ...Array.from({ length: 6 }, (_, i) => ({
        name: `F${i}`, position: "WR", adp: 2 + i, projectedPoints: 180, marketValue: 70,
      })),
      { name: "RB1", position: "RB", adp: 20, projectedPoints: 150, marketValue: 60 },
    ];
    const close = closeDecisionFrom(undrafted);
    const result = evaluateOwnerDnaNudge({
      ownerName: "Carol",
      ownerModel: modelWithRound(5, "RB", 0.95),
      dnaContext: emptyCtx(),
      round: 5,
      pickNum: 50,
      undrafted,
      bpa: undrafted[0]!,
      legacyPick: undrafted[0]!,
      closeDecision: close,
      decayMultiplier: 1,
      consecutiveAppliedNudges: 0,
      teamNeeds: [],
      reachSlots: 12,
      counts: {},
      cap: () => 3,
    });
    expect(result.applied).toBe(false);
    expect(result.blockedReason).toMatch(/more than 6 slots behind BPA/);
  });

  it("close decision gate skips obvious BPA", () => {
    const undrafted = [
      { name: "RB1", position: "RB", adp: 1, projectedPoints: 250, marketValue: 95 },
      { name: "WR1", position: "WR", adp: 2, projectedPoints: 180, marketValue: 60 },
    ];
    const gate = evaluateCloseDecisionGate({
      undrafted,
      bpa: undrafted[0]!,
      reachSlots: 12,
      counts: {},
      cap: () => 3,
      teamNeeds: [],
    });
    expect(gate.isClose).toBe(false);
    expect(gate.scoreGap).toBeGreaterThanOrEqual(12);
  });

  it("decay multipliers follow consecutive nudge pattern", () => {
    expect(ownerDnaDecayMultiplier(0)).toBe(OWNER_DNA_DECAY_MULTIPLIERS[0]);
    expect(ownerDnaDecayMultiplier(1)).toBe(OWNER_DNA_DECAY_MULTIPLIERS[1]);
    expect(ownerDnaDecayMultiplier(2)).toBe(OWNER_DNA_DECAY_MULTIPLIERS[2]);
    expect(ownerDnaDecayMultiplier(5)).toBe(OWNER_DNA_DECAY_MULTIPLIERS[3]);
  });

  it("only considers offense positions", () => {
    expect(OFFENSE_DNA_POSITIONS.has("DP")).toBe(false);
    expect(OFFENSE_DNA_POSITIONS.has("QB")).toBe(true);
  });
});
