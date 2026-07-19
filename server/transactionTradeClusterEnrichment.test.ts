import { describe, expect, it } from "vitest";
import type { GmTradeLegRow } from "./completedTradeAuthority";
import { enrichNormalizedTransactionsWithReconstruction } from "./transactionTradeClusterEnrichment";
import { tradeAssetsFromGmLegs, tradeClusterKeyFromLeg } from "./transactionPersist";

function pickLeg(partial: Partial<GmTradeLegRow> & Pick<GmTradeLegRow, "transactionId" | "type">): GmTradeLegRow {
  return {
    season: 2026,
    relatedTransactionId: null,
    status: "EXECUTED",
    playerId: null,
    playerName: null,
    position: null,
    fromTeamId: null,
    toTeamId: null,
    itemType: "DRAFT_TRADE",
    round: null,
    pickInRound: null,
    overallPickNumber: null,
    pickSeason: 2026,
    legIndex: 0,
    proposedDate: 1_700_000_000_000,
    processedDate: 1_700_000_100_000,
    ...partial,
  };
}

describe("transactionTradeClusterEnrichment — RFSN-029", () => {
  it("restores accepted pick-only trade from reconstruction when ESPN has header only", () => {
    const proposalId = "proposal-bruce-randy";
    const espnRows = [
      {
        season: 2026,
        transactionId: "uphold-001",
        type: "TRADE_UPHOLD",
        status: "EXECUTED",
        relatedTransactionId: proposalId,
        playerId: null,
        fromTeamId: null,
        toTeamId: null,
        processedDate: 1_700_000_100_000,
      },
    ];

    const reconstruction: GmTradeLegRow[] = [
      pickLeg({
        transactionId: "uphold-001",
        type: "TRADE_UPHOLD",
        relatedTransactionId: proposalId,
        status: "EXECUTED",
        legIndex: 0,
      }),
      pickLeg({
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        status: "EXECUTED",
        fromTeamId: 5,
        toTeamId: 11,
        round: 1,
        pickInRound: 14,
        overallPickNumber: 14,
        legIndex: 1,
      }),
      pickLeg({
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        status: "EXECUTED",
        fromTeamId: 11,
        toTeamId: 5,
        round: 3,
        pickInRound: 2,
        overallPickNumber: 30,
        legIndex: 2,
      }),
    ];

    const enriched = enrichNormalizedTransactionsWithReconstruction(espnRows, reconstruction, 2026);
    const assets = tradeAssetsFromGmLegs(
      enriched.map((r, i) => ({
        playerId: r.playerId as number | null,
        itemType: r.itemType as string | null,
        fromTeamId: r.fromTeamId as number | null,
        toTeamId: r.toTeamId as number | null,
        round: r.round as number | null,
        pickInRound: r.pickInRound as number | null,
        overallPickNumber: r.overallPickNumber as number | null,
        legIndex: i,
      })),
    );
    expect(assets.length).toBe(2);
    expect(assets.some((a) => a.round === 1 && a.pickInRound === 14)).toBe(true);
    expect(assets.some((a) => a.round === 3 && a.pickInRound === 2)).toBe(true);

    // Same cluster key as Transactions.tsx (uphold → related proposal id)
    const upholdKey = tradeClusterKeyFromLeg({
      type: "TRADE_UPHOLD",
      transactionId: "uphold-001",
      relatedTransactionId: proposalId,
    });
    const proposalLegs = enriched.filter((r) => r.type === "TRADE_PROPOSAL");
    expect(proposalLegs.length).toBe(2);
    for (const leg of proposalLegs) {
      expect(
        tradeClusterKeyFromLeg({
          type: String(leg.type),
          transactionId: String(leg.transactionId),
          relatedTransactionId: null,
        }),
      ).toBe(upholdKey);
    }
  });

  it("preserves existing player trade behavior (no duplicate inject)", () => {
    const proposalId = "player-trade-001";
    const espnRows = [
      {
        season: 2025,
        transactionId: "accept-1",
        type: "TRADE_ACCEPT",
        status: "EXECUTED",
        relatedTransactionId: proposalId,
      },
      {
        season: 2025,
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        status: "EXECUTED",
        playerId: 101,
        playerName: "A",
        fromTeamId: 1,
        toTeamId: 2,
        itemType: "ADD",
      },
      {
        season: 2025,
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        status: "EXECUTED",
        playerId: 202,
        playerName: "B",
        fromTeamId: 2,
        toTeamId: 1,
        itemType: "ADD",
      },
    ];

    const reconstruction: GmTradeLegRow[] = [
      pickLeg({
        season: 2025,
        transactionId: "accept-1",
        type: "TRADE_ACCEPT",
        relatedTransactionId: proposalId,
        itemType: null,
      }),
      pickLeg({
        season: 2025,
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        playerId: 101,
        playerName: "A",
        fromTeamId: 1,
        toTeamId: 2,
        itemType: "ADD",
        legIndex: 1,
      }),
      pickLeg({
        season: 2025,
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        playerId: 202,
        playerName: "B",
        fromTeamId: 2,
        toTeamId: 1,
        itemType: "ADD",
        legIndex: 2,
      }),
    ];

    const enriched = enrichNormalizedTransactionsWithReconstruction(espnRows, reconstruction, 2025);
    expect(enriched).toHaveLength(espnRows.length);
    expect(enriched.filter((r) => r._source === "completed_trade_reconstruction")).toHaveLength(0);
  });

  it("merges missing picks into a player+pick (mixed) trade once", () => {
    const proposalId = "mixed-001";
    const espnRows = [
      {
        season: 2026,
        transactionId: "uphold-m",
        type: "TRADE_UPHOLD",
        status: "EXECUTED",
        relatedTransactionId: proposalId,
      },
      {
        season: 2026,
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        status: "EXECUTED",
        playerId: 404,
        playerName: "Star RB",
        fromTeamId: 3,
        toTeamId: 7,
        itemType: "ADD",
      },
    ];

    const reconstruction: GmTradeLegRow[] = [
      pickLeg({
        transactionId: "uphold-m",
        type: "TRADE_UPHOLD",
        relatedTransactionId: proposalId,
        itemType: null,
      }),
      pickLeg({
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        playerId: 404,
        playerName: "Star RB",
        fromTeamId: 3,
        toTeamId: 7,
        itemType: "ADD",
        legIndex: 1,
      }),
      pickLeg({
        transactionId: proposalId,
        type: "TRADE_PROPOSAL",
        fromTeamId: 7,
        toTeamId: 3,
        round: 2,
        pickInRound: 5,
        overallPickNumber: 19,
        legIndex: 2,
      }),
    ];

    const enriched = enrichNormalizedTransactionsWithReconstruction(espnRows, reconstruction, 2026);
    const assets = tradeAssetsFromGmLegs(
      enriched.map((r, i) => ({
        playerId: r.playerId as number | null,
        playerName: r.playerName as string | null,
        itemType: r.itemType as string | null,
        fromTeamId: r.fromTeamId as number | null,
        toTeamId: r.toTeamId as number | null,
        round: r.round as number | null,
        pickInRound: r.pickInRound as number | null,
        overallPickNumber: r.overallPickNumber as number | null,
        legIndex: i,
      })),
    );
    expect(assets.filter((a) => a.playerId === 404)).toHaveLength(1);
    expect(assets.filter((a) => a.round === 2 && a.pickInRound === 5)).toHaveLength(1);
    expect(enriched.filter((r) => r._source === "completed_trade_reconstruction")).toHaveLength(1);
  });

  it("does not fabricate assets when reconstruction has none", () => {
    const espnRows = [
      {
        season: 2026,
        transactionId: "uphold-empty",
        type: "TRADE_UPHOLD",
        status: "EXECUTED",
        relatedTransactionId: "missing-proposal",
      },
    ];
    const reconstruction: GmTradeLegRow[] = [
      pickLeg({
        transactionId: "uphold-empty",
        type: "TRADE_UPHOLD",
        relatedTransactionId: "missing-proposal",
        itemType: null,
      }),
    ];
    const enriched = enrichNormalizedTransactionsWithReconstruction(espnRows, reconstruction, 2026);
    expect(enriched).toEqual(espnRows);
  });
});
