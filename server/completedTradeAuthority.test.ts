import { describe, it, expect } from "vitest";
import {
  buildCompletedTradeIntelFromLegs,
  buildNotoriousTradesReport,
  buildOwnerTradeHistory,
  buildRivalryTradeLedger,
  type CompletedTradeIntel,
  type GmTradeLegRow,
} from "./completedTradeAuthority";

const TEAM_META = new Map<string, { ownerName: string; teamName: string; ownerKey: string | null }>([
  ["2026:11", { ownerName: "Rod Sellers", teamName: "Str8FrmHell", ownerKey: "id:rod" }],
  ["2026:23", { ownerName: "Sheldon deRoux", teamName: "DARE2BGR8", ownerKey: "id:sheldon" }],
  ["2026:5", { ownerName: "Team Five", teamName: "T5", ownerKey: "id:five" }],
  ["2026:1", { ownerName: "Team One", teamName: "T1", ownerKey: "id:one" }],
]);

const GEO = new Map([[2026, { teamCount: 14, roundCount: 20 }]]);
const EMPTY_PLAYERS = new Map([[2026, new Map()]]);

function pickLeg(
  partial: Partial<GmTradeLegRow> & { from: number; to: number; round: number; pick: number },
): GmTradeLegRow {
  return {
    season: 2026,
    transactionId: partial.transactionId ?? "trade-pick-1",
    relatedTransactionId: null,
    type: "TRADE_PROPOSAL",
    status: "EXECUTED",
    playerId: null,
    playerName: null,
    position: null,
    fromTeamId: partial.from,
    toTeamId: partial.to,
    itemType: "DRAFT_TRADE",
    round: partial.round,
    pickInRound: partial.pick,
    overallPickNumber: partial.round * 14 + partial.pick,
    pickSeason: 2026,
    legIndex: partial.legIndex ?? 1,
    proposedDate: 1782436667451,
    processedDate: 1782436667451,
    ...partial,
  };
}

function playerLeg(partial: {
  from: number;
  to: number;
  playerId: number;
  name: string;
  position?: string;
  transactionId?: string;
  legIndex?: number;
}): GmTradeLegRow {
  return {
    season: 2026,
    transactionId: partial.transactionId ?? "trade-player-1",
    relatedTransactionId: null,
    type: "TRADE_PROPOSAL",
    status: "EXECUTED",
    playerId: partial.playerId,
    playerName: partial.name,
    position: partial.position ?? "WR",
    fromTeamId: partial.from,
    toTeamId: partial.to,
    itemType: "ADD",
    round: null,
    pickInRound: null,
    overallPickNumber: null,
    pickSeason: null,
    legIndex: partial.legIndex ?? 1,
    proposedDate: 1700000000000,
    processedDate: 1700000000000,
  };
}

describe("completedTradeAuthority", () => {
  it("reconstructs pick-only trade with deterministic winner (Rod / Sheldon fixture)", () => {
    const legs: GmTradeLegRow[] = [
      pickLeg({ from: 11, to: 23, round: 1, pick: 11, legIndex: 1 }),
      pickLeg({ from: 23, to: 11, round: 2, pick: 9, legIndex: 2 }),
    ];
    const trade = buildCompletedTradeIntelFromLegs({
      clusterId: "trade-pick-1",
      legs,
      teamMeta: TEAM_META,
      geometryBySeason: GEO,
      playerValuesBySeason: EMPTY_PLAYERS,
    });
    expect(trade).not.toBeNull();
    expect(trade!.kind).toBe("pick_only");
    expect(trade!.sideA.teamId).toBe(11);
    expect(trade!.sideB.teamId).toBe(23);
    expect(trade!.sideA.ownerName).toBe("Rod Sellers");
    expect(trade!.sideB.ownerName).toBe("Sheldon deRoux");
    expect(trade!.winnerTeamId).not.toBeNull();
    expect(trade!.margin).toBeGreaterThan(0);
    expect(trade!.confidence).toBe("high");
    expect(trade!.receiptText).toContain("won the trade");
  });

  it("values player-only trades from roster composite map", () => {
    const players = new Map([
      [1234567, { playerId: 1234567, playerName: "CeeDee Lamb", position: "WR", avgPoints: 18, compositeValue: 250 }],
      [7654321, { playerId: 7654321, playerName: "Justin Jefferson", position: "WR", avgPoints: 17, compositeValue: 230 }],
    ]);
    const legs: GmTradeLegRow[] = [
      playerLeg({ from: 5, to: 1, playerId: 1234567, name: "CeeDee Lamb", legIndex: 1 }),
      playerLeg({ from: 1, to: 5, playerId: 7654321, name: "Justin Jefferson", legIndex: 2 }),
    ];
    const trade = buildCompletedTradeIntelFromLegs({
      clusterId: "trade-player-1",
      legs,
      teamMeta: TEAM_META,
      geometryBySeason: GEO,
      playerValuesBySeason: new Map([[2026, players]]),
    });
    expect(trade!.kind).toBe("player_only");
    expect(trade!.sideA.valueReceived).toBe(250);
    expect(trade!.sideB.valueReceived).toBe(230);
    expect(trade!.netValueA).toBe(20);
  });

  it("handles mixed player + pick trades", () => {
    const players = new Map([
      [4242557, { playerId: 4242557, playerName: "Test Player", position: "RB", avgPoints: 12, compositeValue: 140 }],
    ]);
    const legs: GmTradeLegRow[] = [
      pickLeg({ from: 5, to: 1, round: 1, pick: 7, transactionId: "mixed-1", legIndex: 1 }),
      playerLeg({ from: 1, to: 5, playerId: 4242557, name: "Test Player", transactionId: "mixed-1", legIndex: 2 }),
    ];
    const trade = buildCompletedTradeIntelFromLegs({
      clusterId: "mixed-1",
      legs,
      teamMeta: TEAM_META,
      geometryBySeason: GEO,
      playerValuesBySeason: new Map([[2026, players]]),
    });
    expect(trade!.kind).toBe("mixed");
    expect(trade!.sideA.assetsReceived.some((a) => a.kind === "pick")).toBe(true);
    expect(trade!.sideB.assetsReceived.some((a) => a.kind === "player")).toBe(true);
  });

  it("builds owner trade history without player-count proxy", () => {
    const legs: GmTradeLegRow[] = [
      pickLeg({ from: 11, to: 23, round: 1, pick: 11, legIndex: 1 }),
      pickLeg({ from: 23, to: 11, round: 2, pick: 9, legIndex: 2 }),
    ];
    const trade = buildCompletedTradeIntelFromLegs({
      clusterId: "t1",
      legs,
      teamMeta: TEAM_META,
      geometryBySeason: GEO,
      playerValuesBySeason: EMPTY_PLAYERS,
    })!;
    const hist = buildOwnerTradeHistory([trade], "id:rod");
    expect(hist.tradeCount).toBe(1);
    expect(hist.pickOnlyCount).toBe(1);
    expect(hist.wins + hist.losses + hist.ties).toBe(1);
  });

  it("builds rivalry ledger for a pair", () => {
    const legs: GmTradeLegRow[] = [
      pickLeg({ from: 11, to: 23, round: 1, pick: 11, legIndex: 1 }),
      pickLeg({ from: 23, to: 11, round: 2, pick: 9, legIndex: 2 }),
    ];
    const trade = buildCompletedTradeIntelFromLegs({
      clusterId: "t1",
      legs,
      teamMeta: TEAM_META,
      geometryBySeason: GEO,
      playerValuesBySeason: EMPTY_PLAYERS,
    })!;
    const ledger = buildRivalryTradeLedger([trade], "id:rod", "id:sheldon", "Rod Sellers", "Sheldon deRoux");
    expect(ledger.tradeCount).toBe(1);
    expect(ledger.biggestFleece).not.toBeNull();
  });

  it("builds notorious trades ranking deterministically", () => {
    const mk = (margin: number, kind: CompletedTradeIntel["kind"], id: string): CompletedTradeIntel => ({
      clusterId: id,
      tradeId: id,
      season: 2026,
      processedDate: 1,
      kind,
      sideA: {
        teamId: 11,
        ownerKey: "id:rod",
        ownerName: "Rod",
        teamName: "R",
        assetsReceived: [],
        valueReceived: 100 + margin,
      },
      sideB: {
        teamId: 23,
        ownerKey: "id:sheldon",
        ownerName: "Sheldon",
        teamName: "S",
        assetsReceived: [],
        valueReceived: 100,
      },
      winnerTeamId: 11,
      winnerOwnerKey: "id:rod",
      loserTeamId: 23,
      loserOwnerKey: "id:sheldon",
      margin,
      verdictLabel: margin > 200 ? "LOPSIDED" : "FAIR",
      confidence: "high",
      receiptText: "x",
      netValueA: margin,
    });
    const report = buildNotoriousTradesReport([
      mk(50, "pick_only", "a"),
      mk(300, "mixed", "b"),
      mk(120, "player_only", "c"),
    ]);
    expect(report.biggestValueGap?.clusterId).toBe("b");
    expect(report.biggestMixedTrade?.clusterId).toBe("b");
    expect(report.biggestPickOnlyGap?.clusterId).toBe("a");
    expect(report.rankedByMargin[0]!.margin).toBe(300);
  });
});
