import { describe, expect, it } from "vitest";
import { buildQbTimingReport, formatQbTimingReportText } from "./qbTimingReport";
import type { HistoricalProfileBundle } from "./draftValidationHistory";
import type { MockDraftInputs } from "./draftWarRoomRouter";

function minimalHistorical(): HistoricalProfileBundle {
  return {
    leagueId: "457622",
    league: {
      offensePickCount: 100,
      positionDistribution: {},
      positionDistributionByRound: {},
      avgRoundByPosition: {},
      avgFirstQbRound: 4,
      avgFirstTeRound: 6,
      avgFirstRbRound: 1,
      avgFirstWrRound: 1,
      avgFirstDpRound: 7,
      rbWrBalance: 0.5,
    },
    owners: [
      {
        ownerKey: "lozell styles",
        ownerName: "LOZELL STYLES",
        offensePickCount: 20,
        positionDistribution: {},
        avgRoundByPosition: {},
        avgFirstQbRound: 5,
        avgFirstTeRound: 7,
        rbWrBalance: 0.5,
      },
    ],
  };
}

describe("qbTimingReport", () => {
  it("computes owner round gap from hist vs sim", () => {
    const mockInputs = {
      allPicks: [{ overallPick: 1, roundId: 1, roundPick: 1, teamId: 1 }],
      rosterNeeds: [{ teamId: 1, teamName: "T1", ownerName: "LOZELL STYLES", needs: [] }],
      keeperPredictions: [],
      tradedPicks: [],
      playerPool: [{ name: "Josh Allen", position: "QB", projectedPoints: 300, espnId: "1", adp: 1, marketValue: 90 }],
      dpTiming: null,
      ownerDnaContext: null,
      registryPlayerCount: 1,
    } as MockDraftInputs;

    const report = buildQbTimingReport({
      leagueId: "457622",
      season: 2026,
      leagueQbProfile: null,
      historical: minimalHistorical(),
      mockInputs,
      ownerHistoricalQb: new Map([
        ["lozell styles", { ownerName: "LOZELL STYLES", firstQbRounds: [5, 6] }],
      ]),
      watchlistOwnerKeys: ["LOZELL STYLES"],
    });

    const lozell = report.owners.find((o) => o.ownerKey === "lozell styles");
    expect(lozell?.historicalFirstQbRound).toBe(5.5);
    expect(lozell?.simulatedFirstQbRound).toBe(1);
    expect(lozell?.roundGap).toBeLessThan(0);
    expect(report.watchlist.length).toBeGreaterThan(0);
    expect(formatQbTimingReportText(report)).toContain("LOZELL STYLES");
  });
});
