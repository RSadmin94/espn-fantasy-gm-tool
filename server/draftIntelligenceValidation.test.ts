import { describe, expect, it } from "vitest";
import {
  buildDraftStabilityReport,
  buildDnaInfluenceReport,
  buildExplainabilityReport,
  buildOwnerAuthenticityDashboard,
  buildRegressionReport,
} from "./draftIntelligenceValidation";
import type { HistoricalProfileBundle } from "./draftValidationHistory";
import type { MockPickRow } from "./ownerAuthenticityScore";
import type { ValidationPickRow } from "./draftIntelligenceValidation";

// Re-export helper for test - it's not exported, use inline
function distSim(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let l1 = 0;
  for (const k of keys) l1 += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return Math.max(0, 1 - l1 / 2) * 100;
}

function mockHistorical(owner: string, dist: Record<string, number>): HistoricalProfileBundle {
  return {
    leagueId: "test",
    owners: [{
      ownerKey: owner.toLowerCase(),
      ownerName: owner,
      offensePickCount: 20,
      positionDistribution: dist,
      avgRoundByPosition: { RB: 3, WR: 4, QB: 8, TE: 10 },
      avgFirstQbRound: 8,
      avgFirstTeRound: 10,
      rbWrBalance: (dist.RB ?? 0) / ((dist.RB ?? 0) + (dist.WR ?? 0) || 1),
    }],
    league: {
      offensePickCount: 20,
      positionDistribution: dist,
      positionDistributionByRound: {},
      avgRoundByPosition: { RB: 3, WR: 4 },
      avgFirstQbRound: 8,
      avgFirstTeRound: 10,
      avgFirstRbRound: 2,
      avgFirstWrRound: 2,
      avgFirstDpRound: 12,
      rbWrBalance: 0.5,
    },
  };
}

describe("draftIntelligenceValidation", () => {
  it("scores identical distributions at 100%", () => {
    expect(distSim({ RB: 0.5, WR: 0.5 }, { RB: 0.5, WR: 0.5 })).toBe(100);
  });

  it("builds owner dashboard with high match when sim mirrors history", () => {
    const hist = mockHistorical("Alice", { RB: 0.6, WR: 0.4 });
    const simPicks: MockPickRow[] = [
      { pickNumber: 25, round: 3, ownerName: "Alice", player: "RB1", position: "RB", primaryFactor: null },
      { pickNumber: 30, round: 3, ownerName: "Alice", player: "RB2", position: "RB", primaryFactor: null },
      { pickNumber: 40, round: 4, ownerName: "Alice", player: "WR1", position: "WR", primaryFactor: null },
    ];
    const rows = buildOwnerAuthenticityDashboard({ historical: hist, simulatedPicks: simPicks });
    expect(rows[0]?.owner).toBe("Alice");
    expect(rows[0]!.positionMatchPct).toBeGreaterThan(80);
  });

  it("detects DNA direct nudges and cascaded diffs", () => {
    const baseline: MockPickRow[] = [
      { pickNumber: 1, round: 1, ownerName: "Bob", player: "A", position: "WR", primaryFactor: null },
      { pickNumber: 2, round: 1, ownerName: "Carol", player: "B", position: "RB", primaryFactor: null },
    ];
    const dna: MockPickRow[] = [
      { pickNumber: 1, round: 1, ownerName: "Bob", player: "C", position: "RB", primaryFactor: "OWNER_DNA" },
      { pickNumber: 2, round: 1, ownerName: "Carol", player: "B", position: "RB", primaryFactor: null },
    ];
    const full: ValidationPickRow[] = dna.map((p) => ({
      ...p,
      adp: 1,
      pickIntelligence: p.primaryFactor === "OWNER_DNA"
        ? { primaryFactor: "OWNER_DNA", factors: [], blockedOverrides: [], timingConfidence: null, plainEnglish: "Owner lean applied." }
        : null,
      reasoning: "",
    }));
    const report = buildDnaInfluenceReport({ dnaPicks: dna, baselinePicks: baseline, fullDnaPicks: full });
    expect(report.directNudges).toBe(1);
    expect(report.cascadedPickDiffs).toBeGreaterThanOrEqual(0);
  });

  it("flags missing explanations for non-BPA picks", () => {
    const picks: ValidationPickRow[] = [
      {
        pickNumber: 10, round: 2, ownerName: "X", player: "P1", position: "RB",
        primaryFactor: "ROSTER_NEED", isKeeperSlot: false, adp: 5,
        pickIntelligence: null, reasoning: "",
      },
    ];
    const report = buildExplainabilityReport(picks);
    expect(report.totalNonBpaPicks).toBe(1);
    expect(report.explainedPct).toBe(0);
    expect(report.missingExplanations.length).toBe(1);
  });

  it("computes stability across stochastic runs", () => {
    const run1: MockPickRow[] = [{ pickNumber: 50, round: 5, ownerName: "A", player: "P", position: "WR", primaryFactor: null }];
    const run2: MockPickRow[] = [{ pickNumber: 90, round: 8, ownerName: "A", player: "P", position: "WR", primaryFactor: null }];
    const report = buildDraftStabilityReport([run1, run2]);
    expect(report.mostVolatile[0]?.pickSpread).toBe(40);
    expect(report.flaggedVolatile.length).toBe(1);
  });

  it("builds regression summary vs production baseline", () => {
    const prod = [
      { pick: 75, round: 6, owner: "O", player: "Myles Garrett", pos: "DP", factor: null },
    ];
    const current: MockPickRow[] = [
      { pickNumber: 75, round: 6, ownerName: "O", player: "Myles Garrett", position: "DP", primaryFactor: null },
    ];
    const report = buildRegressionReport({ productionBaseline: prod, currentPicks: current });
    expect(report.changedPickCount).toBe(0);
    expect(report.garrett.current?.pick).toBe(75);
  });
});
