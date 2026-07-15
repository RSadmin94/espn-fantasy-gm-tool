import { describe, expect, it } from "vitest";
import { traitConfidencePct } from "./traitConfidence";
import { mineLedgerEvidence } from "./evidenceMining";
import type { ChoiceRecord } from "../phase1/types";

function rec(partial: Partial<ChoiceRecord> & Pick<ChoiceRecord, "season" | "round" | "chosenPlayer">): ChoiceRecord {
  return {
    leagueId: "457622",
    roundPick: 1,
    overallPick: 1,
    chooserProfileKey: "test",
    chooserDisplayName: "Test",
    chooserRole: "active",
    availableSet: [],
    roomState: {
      picksSoFar: 0,
      teamCount: 12,
      positionCounts: {},
      recentBoardPositions: [],
      runInProgress: null,
      tierByPosition: { RB: { remaining: 10, drafted: 0 }, WR: { remaining: 10, drafted: 0 } },
    },
    ...partial,
  };
}

describe("traitConfidencePct", () => {
  it("rises with coefficient strength and evidence count", () => {
    const low = traitConfidencePct({
      coefficient: 0.1,
      evidenceCount: 5,
      totalChoices: 100,
      inverseTemperature: 1,
      avgChosenProbability: 0.07,
    });
    const high = traitConfidencePct({
      coefficient: 0.45,
      evidenceCount: 30,
      totalChoices: 100,
      inverseTemperature: 1.2,
      avgChosenProbability: 0.08,
    });
    expect(high).toBeGreaterThan(low);
  });

  it("scales down for shrinkage cold ownWeight", () => {
    const full = traitConfidencePct({
      coefficient: 0.4,
      evidenceCount: 20,
      totalChoices: 100,
      inverseTemperature: 1,
      avgChosenProbability: 0.07,
      ownWeight: 1,
    });
    const cold = traitConfidencePct({
      coefficient: 0.4,
      evidenceCount: 20,
      totalChoices: 100,
      inverseTemperature: 1,
      avgChosenProbability: 0.07,
      ownWeight: 0.07,
    });
    expect(cold).toBeLessThan(full);
  });
});

describe("mineLedgerEvidence", () => {
  it("counts early RB picks as evidence", () => {
    const records = [
      rec({ season: 2020, round: 1, chosenPlayer: { playerName: "A", position: "RB" } }),
      rec({ season: 2021, round: 2, chosenPlayer: { playerName: "B", position: "WR" } }),
    ];
    const e = mineLedgerEvidence(records);
    expect(e.earlyRb.count).toBe(1);
    expect(e.earlyWr.count).toBe(1);
    expect(e.allDraftedSeasons).toEqual([2020, 2021]);
  });
});
