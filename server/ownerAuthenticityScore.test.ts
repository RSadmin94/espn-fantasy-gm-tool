import { describe, expect, it } from "vitest";
import { computeOwnerAuthenticityReport } from "./ownerAuthenticityScore";
import { OFFENSE_DNA_POSITIONS, type OwnerDraftDnaContext } from "./ownerDraftDnaModel";

function ctxWithOwnerRound(round: number, pos: string, rate: number): OwnerDraftDnaContext {
  const roundMap = new Map<string, number>([[pos, rate]]);
  const roundPosRate = new Map([[round, roundMap]]);
  return {
    league: { roundPosRate, totalPicks: 100 },
    byOwnerKey: new Map([
      ["alice", {
        ownerKey: "alice",
        ownerName: "Alice",
        pickCount: 40,
        seasonCount: 4,
        confidence: "High",
        confidenceWeight: 0.85,
        roundPosRate,
      }],
    ]),
  };
}

describe("ownerAuthenticityScore", () => {
  it("scores DNA mock higher when picks match owner tendency", () => {
    const dnaCtx = ctxWithOwnerRound(3, "RB", 0.9);
    const baseline = [
      { pickNumber: 25, round: 3, ownerName: "Alice", player: "WR1", position: "WR", primaryFactor: null, isKeeperSlot: false },
    ];
    const dnaMock = [
      { pickNumber: 25, round: 3, ownerName: "Alice", player: "RB1", position: "RB", primaryFactor: "OWNER_DNA", isKeeperSlot: false },
    ];
    const top14 = Array.from({ length: 14 }, (_, i) => ({
      pickNumber: i + 1,
      round: 1,
      ownerName: "Bob",
      player: `P${i}`,
      position: "WR",
      primaryFactor: null,
      isKeeperSlot: false,
    }));

    const report = computeOwnerAuthenticityReport({
      mockPicks: [...top14, ...dnaMock],
      baselinePicks: [...top14, ...baseline],
      phase1Top14Baseline: top14,
      ownerDnaContext: dnaCtx,
    });

    expect(report.leagueScore).toBeGreaterThan(report.leagueBaselineScore);
    expect(report.leagueLift).toBeGreaterThan(0);
    expect(report.directDnaNudges).toBe(1);
    expect(OFFENSE_DNA_POSITIONS.has("RB")).toBe(true);
  });

  it("penalizes composite when Garrett/Warner slots drift", () => {
    const dnaCtx = ctxWithOwnerRound(6, "DP", 0.5);
    const rows = Array.from({ length: 80 }, (_, i) => ({
      pickNumber: i + 1,
      round: Math.ceil((i + 1) / 14),
      ownerName: "Bob",
      player: i === 50 ? "Myles Garrett" : i === 52 ? "Fred Warner" : `P${i}`,
      position: i === 50 || i === 52 ? "DP" : "WR",
      primaryFactor: null,
      isKeeperSlot: false,
    }));
    const reportOk = computeOwnerAuthenticityReport({
      mockPicks: rows.map((r) =>
        r.player === "Myles Garrett" ? { ...r, pickNumber: 75 } :
        r.player === "Fred Warner" ? { ...r, pickNumber: 78 } : r,
      ),
      baselinePicks: rows,
      phase1Top14Baseline: rows.slice(0, 14),
      ownerDnaContext: dnaCtx,
    });
    const reportDrift = computeOwnerAuthenticityReport({
      mockPicks: rows,
      baselinePicks: rows,
      phase1Top14Baseline: rows.slice(0, 14),
      ownerDnaContext: dnaCtx,
    });
    expect(reportDrift.garrettPick).toBe(51);
    expect(reportDrift.compositeObjective).toBeLessThan(reportOk.compositeObjective);
  });
});
