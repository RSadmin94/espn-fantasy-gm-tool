/**
 * server/espnTrade2026.test.ts
 *
 * Regression tests for 2026+ ESPN trade transaction format.
 *
 * In 2026, ESPN changed the accepted-trade format:
 *   Legacy (2017-2025): type=TRADE, status=EXECUTED, items=[...]
 *   2026+: type=TRADE_UPHOLD or TRADE_ACCEPT, status=EXECUTED, no items,
 *          relatedTransactionId → links to a TRADE_PROPOSAL with items
 *
 * These tests verify:
 *   1. normalizeTransactions passes relatedTransactionId through
 *   2. TRADE_UPHOLD/TRADE_ACCEPT rows are included in normalized output
 *   3. TRADE_PROPOSAL items are preserved in normalized output
 *   4. Legacy TRADE format still works (backward compatibility)
 */

import { describe, it, expect } from "vitest";
import { normalizeTransactions } from "./espnService";

// ── Mock 2026-style payload ───────────────────────────────────────────────────

const mock2026Payload = {
  seasonId: 2026,
  transactions: [
    // The TRADE_UPHOLD record — no items, links to proposal
    {
      id: "c1986f18-e750-4b7c-b18d-3e92db4da059",
      type: "TRADE_UPHOLD",
      status: "EXECUTED",
      proposedDate: 1778814507468,
      teamId: 1,
      relatedTransactionId: "d3731d04-107d-415a-8c25-f5530b88dddf",
      items: [],
    },
    // The TRADE_ACCEPT record — no items, links to same proposal
    {
      id: "acc11111-0000-0000-0000-000000000001",
      type: "TRADE_ACCEPT",
      status: null,
      proposedDate: 1778814507000,
      teamId: 5,
      relatedTransactionId: "d3731d04-107d-415a-8c25-f5530b88dddf",
      items: [],
    },
    // The TRADE_PROPOSAL record — has items (the actual players/picks)
    {
      id: "d3731d04-107d-415a-8c25-f5530b88dddf",
      type: "TRADE_PROPOSAL",
      status: "PENDING",
      proposedDate: 1778800000000,
      teamId: 5,
      relatedTransactionId: null,
      items: [
        {
          fromTeamId: 5,
          toTeamId: 1,
          type: "DRAFT_TRADE",
          playerId: 0,
          overallPickNumber: 7,
          player: {},
        },
        {
          fromTeamId: 1,
          toTeamId: 5,
          type: "DRAFT_TRADE",
          playerId: 0,
          overallPickNumber: 39,
          player: {},
        },
      ],
    },
    // A CANCELED TRADE_PROPOSAL — should still be included
    {
      id: "canceled-proposal-001",
      type: "TRADE_PROPOSAL",
      status: "CANCELED",
      proposedDate: 1778700000000,
      teamId: 3,
      relatedTransactionId: "some-uphold-id",
      items: [
        {
          fromTeamId: 3,
          toTeamId: 7,
          type: "DRAFT_TRADE",
          playerId: 0,
          overallPickNumber: 15,
          player: {},
        },
      ],
    },
    // A ROSTER move — should pass through unchanged
    {
      id: "roster-001",
      type: "ROSTER",
      status: "EXECUTED",
      proposedDate: 1777252202301,
      teamId: 4,
      items: [
        {
          fromTeamId: 4,
          toTeamId: 0,
          type: "DROP",
          playerId: 4242557,
          player: { id: 4242557, fullName: "Test Player" },
        },
      ],
    },
  ],
};

// ── Mock legacy 2025-style payload ────────────────────────────────────────────

const mockLegacyPayload = {
  seasonId: 2025,
  transactions: [
    // Legacy TRADE record — has items directly
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
          player: { id: 1234567, fullName: "Patrick Mahomes" },
        },
        {
          fromTeamId: 8,
          toTeamId: 2,
          type: "ADD",
          playerId: 7654321,
          player: { id: 7654321, fullName: "Justin Jefferson" },
        },
      ],
    },
    // Legacy WAIVER add
    {
      id: "waiver-001",
      type: "WAIVER",
      status: "EXECUTED",
      proposedDate: 1700100000000,
      teamId: 3,
      items: [
        {
          fromTeamId: 0,
          toTeamId: 3,
          type: "ADD",
          playerId: 9999999,
          player: { id: 9999999, fullName: "Waiver Player" },
        },
      ],
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("normalizeTransactions — 2026 TRADE_UPHOLD/TRADE_ACCEPT format", () => {
  it("includes TRADE_UPHOLD row with relatedTransactionId", () => {
    const rows = normalizeTransactions(mock2026Payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const upholdRow = rows.find(r => r.type === "TRADE_UPHOLD");
    expect(upholdRow).toBeDefined();
    expect(upholdRow!.relatedTransactionId).toBe("d3731d04-107d-415a-8c25-f5530b88dddf");
    expect(upholdRow!.teamId).toBe(1);
    expect(upholdRow!.status).toBe("EXECUTED");
  });

  it("includes TRADE_ACCEPT row with relatedTransactionId", () => {
    const rows = normalizeTransactions(mock2026Payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const acceptRow = rows.find(r => r.type === "TRADE_ACCEPT");
    expect(acceptRow).toBeDefined();
    expect(acceptRow!.relatedTransactionId).toBe("d3731d04-107d-415a-8c25-f5530b88dddf");
    expect(acceptRow!.teamId).toBe(5);
  });

  it("includes TRADE_PROPOSAL item rows with relatedTransactionId", () => {
    const rows = normalizeTransactions(mock2026Payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const proposalRows = rows.filter(r => r.type === "TRADE_PROPOSAL" && r.transactionId === "d3731d04-107d-415a-8c25-f5530b88dddf");
    // 2 items in the proposal
    expect(proposalRows).toHaveLength(2);
    // relatedTransactionId should be null for the proposal itself
    for (const row of proposalRows) {
      expect(row.relatedTransactionId).toBeNull();
    }
  });

  it("TRADE_UPHOLD row has null playerId (no items)", () => {
    const rows = normalizeTransactions(mock2026Payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const upholdRow = rows.find(r => r.type === "TRADE_UPHOLD");
    expect(upholdRow!.playerId).toBeNull();
    expect(upholdRow!.playerName).toBeNull();
  });

  it("ROSTER move rows do not have relatedTransactionId set", () => {
    const rows = normalizeTransactions(mock2026Payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const rosterRow = rows.find(r => r.type === "ROSTER");
    expect(rosterRow).toBeDefined();
    // relatedTransactionId should be null (not present in ROSTER transactions)
    expect(rosterRow!.relatedTransactionId).toBeNull();
  });

  it("season is correctly set on all rows", () => {
    const rows = normalizeTransactions(mock2026Payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect(row.season).toBe(2026);
    }
  });
});

describe("normalizeTransactions — legacy 2025 TRADE format (backward compatibility)", () => {
  it("legacy TRADE rows are included with correct type and items", () => {
    const rows = normalizeTransactions(mockLegacyPayload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const tradeRows = rows.filter(r => r.type === "TRADE");
    // 2 items in the trade
    expect(tradeRows).toHaveLength(2);
    expect(tradeRows[0].playerName).toBe("Patrick Mahomes");
    expect(tradeRows[1].playerName).toBe("Justin Jefferson");
  });

  it("legacy TRADE rows have null relatedTransactionId", () => {
    const rows = normalizeTransactions(mockLegacyPayload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const tradeRows = rows.filter(r => r.type === "TRADE");
    for (const row of tradeRows) {
      expect(row.relatedTransactionId).toBeNull();
    }
  });

  it("legacy WAIVER rows are included", () => {
    const rows = normalizeTransactions(mockLegacyPayload as Record<string, unknown>) as Array<Record<string, unknown>>;
    const waiverRows = rows.filter(r => r.type === "WAIVER");
    expect(waiverRows).toHaveLength(1);
    expect(waiverRows[0].playerName).toBe("Waiver Player");
  });

  it("season is correctly set on legacy rows", () => {
    const rows = normalizeTransactions(mockLegacyPayload as Record<string, unknown>) as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect(row.season).toBe(2025);
    }
  });
});

describe("normalizeTransactions — edge cases", () => {
  it("handles empty transactions array", () => {
    const rows = normalizeTransactions({ seasonId: 2026, transactions: [] } as Record<string, unknown>);
    expect(rows).toHaveLength(0);
  });

  it("handles transaction with no items array (undefined)", () => {
    const payload = {
      seasonId: 2026,
      transactions: [
        {
          id: "no-items-tx",
          type: "TRADE_UPHOLD",
          status: "EXECUTED",
          proposedDate: 1778814507468,
          teamId: 1,
          relatedTransactionId: "some-proposal-id",
          // no items field
        },
      ],
    };
    const rows = normalizeTransactions(payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("TRADE_UPHOLD");
    expect(rows[0].relatedTransactionId).toBe("some-proposal-id");
  });
});
