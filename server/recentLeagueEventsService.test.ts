import { describe, it, expect } from "vitest";
import {
  formatCompletedTradePlayersLine,
  tradeAssetsFromGmLegs,
} from "./transactionPersist";

describe("recentLeagueEventsService trade enrichment", () => {
  it("falls back when legs lack metadata", () => {
    const assets = tradeAssetsFromGmLegs([
      {
        type: "TRADE_ACCEPT",
        transactionId: "x",
        status: "EXECUTED",
        playerId: null,
        playerName: null,
        fromTeamId: 11,
        toTeamId: 23,
        legIndex: 1,
      } as never,
    ]);
    expect(assets).toHaveLength(0);
    expect(
      formatCompletedTradePlayersLine({
        assets,
        season: 2026,
        ownerNameByTeam: new Map([["2026:23", "Marlon"]]),
      }),
    ).toBeNull();
  });

  it("dedupes duplicate accept + proposal legs", () => {
    const proposalLegs = [
      {
        type: "TRADE_PROPOSAL",
        playerId: null,
        playerName: null,
        position: null,
        itemType: "DRAFT_TRADE",
        fromTeamId: 11,
        toTeamId: 23,
        round: 1,
        pickInRound: 11,
        overallPickNumber: 11,
        pickSeason: 2026,
        legIndex: 1,
      },
      {
        type: "TRADE_PROPOSAL",
        playerId: null,
        playerName: null,
        position: null,
        itemType: "DRAFT_TRADE",
        fromTeamId: 23,
        toTeamId: 11,
        round: 2,
        pickInRound: 9,
        overallPickNumber: 23,
        pickSeason: 2026,
        legIndex: 2,
      },
    ];
    const assets = tradeAssetsFromGmLegs(proposalLegs);
    const line = formatCompletedTradePlayersLine({
      assets,
      season: 2026,
      ownerNameByTeam: new Map([
        ["2026:11", "Rod"],
        ["2026:23", "Marlon"],
      ]),
    });
    expect(line?.split("\n")).toHaveLength(2);
    expect(line).not.toContain("(see Transactions");
  });
});
