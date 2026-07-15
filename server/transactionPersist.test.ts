import { describe, it, expect } from "vitest";
import { normalizeTransactions } from "./espnService";
import {
  mapNormalizedLegToPersist,
  tradeAssetsFromGmLegs,
  isDraftPickLeg,
  tradeClusterKeyFromLeg,
  formatTradeLegAssetLabel,
  formatCompletedTradePlayersLine,
} from "./transactionPersist";

const mockPickOnlyPayload = {
  seasonId: 2026,
  transactions: [
    {
      id: "pick-trade-001",
      type: "TRADE_PROPOSAL",
      status: "EXECUTED",
      proposedDate: 1782436667451,
      teamId: 11,
      items: [
        {
          fromTeamId: 11,
          toTeamId: 23,
          type: "DRAFT_TRADE",
          playerId: 0,
          overallPickNumber: 7,
          round: 1,
          pickInRound: 7,
          player: {},
        },
        {
          fromTeamId: 23,
          toTeamId: 11,
          type: "DRAFT_TRADE",
          playerId: 0,
          overallPickNumber: 39,
          round: 3,
          pickInRound: 11,
          player: {},
        },
      ],
    },
  ],
};

const mockPlayerTradePayload = {
  seasonId: 2025,
  transactions: [
    {
      id: "legacy-trade-001",
      type: "TRADE",
      status: "EXECUTED",
      proposedDate: 1700000000000,
      teamId: 2,
      items: [
        {
          fromTeamId: 2,
          toTeamId: 8,
          type: "ADD",
          playerId: 1234567,
          player: { id: 1234567, fullName: "Patrick Mahomes", defaultPositionId: 1 },
        },
        {
          fromTeamId: 8,
          toTeamId: 2,
          type: "ADD",
          playerId: 7654321,
          player: { id: 7654321, fullName: "Justin Jefferson", defaultPositionId: 3 },
        },
      ],
    },
  ],
};

const mockMixedPayload = {
  seasonId: 2026,
  transactions: [
    {
      id: "mixed-trade-001",
      type: "TRADE_PROPOSAL",
      status: "EXECUTED",
      executionType: "EXECUTE",
      proposedDate: 1780000000000,
      teamId: 5,
      items: [
        {
          fromTeamId: 5,
          toTeamId: 1,
          type: "DRAFT_TRADE",
          playerId: 0,
          overallPickNumber: 7,
          round: 1,
          pickInRound: 7,
          player: {},
        },
        {
          fromTeamId: 1,
          toTeamId: 5,
          type: "ADD",
          playerId: 4242557,
          player: { id: 4242557, fullName: "Test Player", defaultPositionId: 2 },
        },
      ],
    },
  ],
};

describe("transactionPersist", () => {
  it("persists pick leg metadata from normalizeTransactions", () => {
    const rows = normalizeTransactions(mockPickOnlyPayload as Record<string, unknown>) as Record<string, unknown>[];
    const pickRows = rows.filter((r) => r.itemType === "DRAFT_TRADE");
    expect(pickRows).toHaveLength(2);

    const leg = mapNormalizedLegToPersist({
      leagueId: "457622",
      season: 2026,
      legIndex: 1,
      row: pickRows[0]!,
      rawTransaction: "{}",
    });

    expect(leg.itemType).toBe("DRAFT_TRADE");
    expect(leg.round).toBe(1);
    expect(leg.pickInRound).toBe(7);
    expect(leg.overallPickNumber).toBe(7);
    expect(leg.pickSeason).toBe(2026);
    expect(leg.fromTeamId).toBe(11);
    expect(leg.toTeamId).toBe(23);
    expect(leg.playerId).toBeNull();
    expect(isDraftPickLeg(leg)).toBe(true);
  });

  it("persists player name, id, and position for player trades", () => {
    const rows = normalizeTransactions(mockPlayerTradePayload as Record<string, unknown>) as Record<string, unknown>[];
    const playerRows = rows.filter((r) => r.playerId);
    expect(playerRows).toHaveLength(2);

    const leg = mapNormalizedLegToPersist({
      leagueId: "457622",
      season: 2025,
      legIndex: 1,
      row: playerRows[0]!,
      rawTransaction: "{}",
    });

    expect(leg.playerId).toBe(1234567);
    expect(leg.playerName).toBe("Patrick Mahomes");
    expect(leg.position).toBe("QB");
    expect(leg.itemType).toBe("ADD");
    expect(isDraftPickLeg(leg)).toBe(false);
  });

  it("reconstructs mixed trade assets from gm legs without cache", () => {
    const rows = normalizeTransactions(mockMixedPayload as Record<string, unknown>) as Record<string, unknown>[];
    const legs = rows.map((r, i) =>
      mapNormalizedLegToPersist({
        leagueId: "457622",
        season: 2026,
        legIndex: i + 1,
        row: r,
        rawTransaction: "{}",
      }),
    );
    const assets = tradeAssetsFromGmLegs(legs);
    expect(assets).toHaveLength(2);
    expect(assets.some((a) => a.playerName === "Test Player")).toBe(true);
    expect(assets.some((a) => a.itemType === "DRAFT_TRADE")).toBe(true);
  });

  it("preserves trade cluster key for uphold/accept parents", () => {
    expect(
      tradeClusterKeyFromLeg({
        type: "TRADE_ACCEPT",
        transactionId: "accept-1",
        relatedTransactionId: "proposal-1",
      }),
    ).toBe("proposal-1");
    expect(
      tradeClusterKeyFromLeg({
        type: "TRADE_PROPOSAL",
        transactionId: "proposal-1",
        relatedTransactionId: null,
      }),
    ).toBe("proposal-1");
  });

  it("formats pick and player labels for dashboard display", () => {
    expect(
      formatTradeLegAssetLabel(
        {
          fromTeamId: 11,
          toTeamId: 23,
          playerId: null,
          playerName: null,
          position: null,
          itemType: "DRAFT_TRADE",
          round: 2,
          pickInRound: 9,
          overallPickNumber: 23,
          pickSeason: 2026,
        },
        2026,
      ),
    ).toBe("2026 2nd Round Pick R2.09");

    expect(
      formatTradeLegAssetLabel(
        {
          fromTeamId: 8,
          toTeamId: 2,
          playerId: 1234567,
          playerName: "CeeDee Lamb",
          position: "WR",
          itemType: "ADD",
          overallPickNumber: null,
          round: null,
          pickInRound: null,
          pickSeason: null,
        },
        2025,
      ),
    ).toBe("CeeDee Lamb (WR)");
  });

  it("builds per-side received lines for mixed trades", () => {
    const line = formatCompletedTradePlayersLine({
      season: 2026,
      ownerNameByTeam: new Map([
        ["2026:11", "Rod"],
        ["2026:23", "Marlon"],
      ]),
      assets: [
        {
          fromTeamId: 11,
          toTeamId: 23,
          playerId: null,
          playerName: null,
          position: null,
          itemType: "DRAFT_TRADE",
          round: 1,
          pickInRound: 11,
          overallPickNumber: 11,
          pickSeason: 2026,
        },
        {
          fromTeamId: 23,
          toTeamId: 11,
          playerId: null,
          playerName: null,
          position: null,
          itemType: "DRAFT_TRADE",
          round: 2,
          pickInRound: 9,
          overallPickNumber: 23,
          pickSeason: 2026,
        },
      ],
    });
    expect(line).toContain("Rod received:");
    expect(line).toContain("Marlon received:");
    expect(line).toContain("R1.11");
    expect(line).toContain("R2.09");
  });
});
