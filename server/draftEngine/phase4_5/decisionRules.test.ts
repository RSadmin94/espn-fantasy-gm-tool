import { describe, expect, it } from "vitest";
import { buildOwnerDecisionProfile } from "./decisionRules";
import { mineLedgerEvidence } from "./evidenceMining";
import type { OwnerSoulProfile } from "../phase4/fitAllSouls";
import type { ChoiceRecord } from "../phase1/types";

function rec(partial: Partial<ChoiceRecord> & Pick<ChoiceRecord, "season" | "round" | "chosenPlayer">): ChoiceRecord {
  return {
    leagueId: "457622",
    roundPick: 1,
    overallPick: 1,
    chooserProfileKey: "tony",
    chooserDisplayName: "Tony Dorsey",
    chooserRole: "active",
    availableSet: [],
    roomState: {
      picksSoFar: 0,
      teamCount: 14,
      positionCounts: {},
      recentBoardPositions: [],
      runInProgress: null,
      tierByPosition: { RB: { remaining: 10, drafted: 0 }, WR: { remaining: 10, drafted: 0 } },
    },
    ...partial,
  };
}

function baseSoul(records: ChoiceRecord[], coefOverrides: Partial<OwnerSoulProfile["coefficients"]> = {}): OwnerSoulProfile {
  const coefficients = {
    need: 0.35,
    rbEarlyRound: 0.2,
    wrEarlyRound: 0.1,
    rbEarlyLegacyEra: 0.25,
    wrEarlyModernEra: 0.05,
    herdFomo: 0.1,
    contrarian: -0.05,
    comfortAnchor: 0.1,
    panic: 0.15,
    scarcityTierCliff: 0.1,
    value: 0.2,
    ...coefOverrides,
  };
  return {
    leagueId: "457622",
    profileOwnerKey: "tony",
    displayName: "Tony Dorsey",
    personalityFitTier: "shrinkage_cold",
    choiceEventCount: records.length,
    earlyRoundRbPct: 75,
    earlyRoundWrPct: 25,
    earlyRoundPickCount: 4,
    coefficients,
    deviationCoefficients: coefficients,
    distinctiveArchetype: "RB-Forward",
    distinctiveDrives: [],
    inverseTemperature: 1,
    avgChosenProbability: 0.07,
    rawFit: { coefficients, inverseTemperature: 1, avgChosenProbability: 0.07, logLikelihood: 0, choiceCount: records.length },
    clusterId: "c1",
    clusterLabel: "RB-Forward",
    shrinkage: { ownWeight: 0.13, clusterWeight: 0.57, leagueWeight: 0.3 },
    boardScopeNote: "partial board",
    records,
  };
}

describe("decisionRules presentation fixes", () => {
  it("populates seasons on board-value rule from all drafted seasons", () => {
    const records = [
      rec({ season: 2024, round: 1, chosenPlayer: { playerName: "A", position: "RB" } }),
      rec({ season: 2025, round: 2, chosenPlayer: { playerName: "B", position: "WR" } }),
    ];
    const profile = buildOwnerDecisionProfile(
      baseSoul(records, { value: 0.25, need: 0.1 }),
    );
    const valueRule = profile.rules.find((r) => r.ifThen.includes("position-normalized board value"));
    expect(valueRule).toBeDefined();
    expect(valueRule!.evidence.seasons).toEqual([2024, 2025]);
    expect(valueRule!.evidence.seasons.length).toBe(valueRule!.evidence.draftSeasons);
  });

  it("suppresses era-scoped rules with zero matching picks for thin-history owners", () => {
    const records = [
      rec({ season: 2024, round: 1, chosenPlayer: { playerName: "A", position: "RB" } }),
      rec({ season: 2025, round: 1, chosenPlayer: { playerName: "B", position: "RB" } }),
    ];
    const profile = buildOwnerDecisionProfile(
      baseSoul(records, { rbEarlyLegacyEra: 0.2, wrEarlyModernEra: 0.12 }),
    );
    expect(profile.rules.some((r) => r.ifThen.includes("pre-2023"))).toBe(false);
    expect(profile.exceptions.some((e) => e.unless.includes("legacy era"))).toBe(false);
  });

  it("marks only shrinkage_cold owners provisional", () => {
    const records = [rec({ season: 2024, round: 1, chosenPlayer: { playerName: "A", position: "RB" } })];
    const cold = buildOwnerDecisionProfile(baseSoul(records));
    expect(cold.provisionalNote).toBeDefined();
    expect(cold.overallStability).toBe("provisional");

    const full = buildOwnerDecisionProfile({
      ...baseSoul(records),
      personalityFitTier: "full",
      choiceEventCount: 180,
      shrinkage: undefined,
    });
    expect(full.provisionalNote).toBeUndefined();
    expect(full.overallStability).not.toBe("provisional");
  });
});

describe("mineLedgerEvidence allDraftedSeasons", () => {
  it("tracks every drafted season for board-wide attribution", () => {
    const records = [
      rec({ season: 2018, round: 3, chosenPlayer: { playerName: "A", position: "RB" } }),
      rec({ season: 2020, round: 5, chosenPlayer: { playerName: "B", position: "WR" } }),
    ];
    const e = mineLedgerEvidence(records);
    expect(e.allDraftedSeasons).toEqual([2018, 2020]);
    expect(e.draftSeasons).toBe(2);
  });
});
