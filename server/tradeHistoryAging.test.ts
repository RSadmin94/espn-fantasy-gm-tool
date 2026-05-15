/**
 * tradeHistoryAging.test.ts
 *
 * Tests for the trade aging evaluation helpers in tradeHistoryRouter.ts.
 * We test the pure helper logic (buildPlayerStatsMap, computeAgeEval) by
 * importing the exported buildTradesForSeason and constructing mock data.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildTradesForSeason } from "./tradeHistoryRouter";

// ─── Mock LLM so tests don't make real API calls ──────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          verdict: "Team A is winning this trade",
          narrative: "The trade has aged well for Team A due to strong performances.",
          teamANarrative: "Players received by Team A have scored consistently.",
          teamBNarrative: "Players received by Team B have underperformed.",
          keyFactor: "Injury to Team B's key acquisition",
        }),
      },
    }],
  }),
}));

// ─── Mock fantasyDataService so tests don't scrape PFR ───────────────────────
vi.mock("./fantasyDataService", () => ({
  getPFRStats: vi.fn().mockResolvedValue(null),
}));

// ─── Mock db so tests don't need a real database ─────────────────────────────
vi.mock("./db", () => ({
  getCachedView: vi.fn().mockResolvedValue(null),
  getAllCachedSeasons: vi.fn().mockResolvedValue([2024]),
}));

// ─── Mock memCache to pass through immediately ────────────────────────────────
vi.mock("./memCache", () => ({
  memCache: vi.fn().mockImplementation((_key: string, _ttl: number, fn: () => unknown) => fn()),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a raw ESPN transaction object as it comes from the ESPN API.
 * normalizeTransactions reads tx.id, tx.type, tx.proposedDate, tx.items[]
 * where each item has item.player.fullName, item.fromTeamId, item.toTeamId.
 */
function makeTransaction(txId: string, fromTeamId: number, toTeamId: number, playerName: string, proposedDate?: number) {
  return {
    id: txId,
    type: "TRADE",
    status: "EXECUTED",
    proposedDate: proposedDate ?? Date.now(),
    teamId: fromTeamId,
    items: [
      {
        fromTeamId,
        toTeamId,
        player: { fullName: playerName, id: Math.random() },
        type: "TRADED",
      },
    ],
  };
}

function makeSeasonData(transactions: unknown[], teams: unknown[] = []) {
  return {
    seasonId: 2024,
    transactions,
    teams: teams.length > 0 ? teams : [
      {
        id: 1,
        location: "Team",
        nickname: "Alpha",
        owners: [{ displayName: "Owner A" }],
        roster: { entries: [] },
      },
      {
        id: 2,
        location: "Team",
        nickname: "Beta",
        owners: [{ displayName: "Owner B" }],
        roster: { entries: [] },
      },
    ],
    status: { latestScoringPeriod: 8 },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildTradesForSeason", () => {
  it("returns empty array when there are no transactions", () => {
    const data = makeSeasonData([]);
    const result = buildTradesForSeason(2024, data as Record<string, unknown>);
    expect(result).toEqual([]);
  });

  it("returns empty array when transactions are not TRADE type", () => {
    // Use raw ESPN shape with non-TRADE type
    const data = makeSeasonData([
      { id: "tx-w1", type: "WAIVER", status: "EXECUTED", proposedDate: Date.now(), teamId: 1, items: [] },
      { id: "tx-fa1", type: "FREE_AGENT", status: "EXECUTED", proposedDate: Date.now(), teamId: 2, items: [] },
    ]);
    const result = buildTradesForSeason(2024, data as Record<string, unknown>);
    expect(result).toEqual([]);
  });

  it("groups two TRADE rows with the same transactionId into one trade", () => {
    // Two items in the same transaction (ESPN sends one tx object with multiple items)
    const data = makeSeasonData([
      {
        id: "tx-001",
        type: "TRADE",
        status: "EXECUTED",
        proposedDate: Date.now(),
        teamId: 1,
        items: [
          { fromTeamId: 1, toTeamId: 2, player: { fullName: "Patrick Mahomes", id: 1 }, type: "TRADED" },
          { fromTeamId: 2, toTeamId: 1, player: { fullName: "Tyreek Hill", id: 2 }, type: "TRADED" },
        ],
      },
    ]);
    const result = buildTradesForSeason(2024, data as Record<string, unknown>);
    expect(result).toHaveLength(1);
    const trade = result[0];
    expect(trade.transactionId).toBe("tx-001");
    expect(trade.season).toBe(2024);
  });

  it("correctly assigns players sent and received for each team", () => {
    // Team 1 sends Mahomes (fromTeamId=1, toTeamId=2) → Team 2 receives Mahomes
    // Team 2 sends Hill (fromTeamId=2, toTeamId=1) → Team 1 receives Hill
    const data = makeSeasonData([
      {
        id: "tx-002",
        type: "TRADE",
        status: "EXECUTED",
        proposedDate: Date.now(),
        teamId: 1,
        items: [
          { fromTeamId: 1, toTeamId: 2, player: { fullName: "Patrick Mahomes", id: 1 }, type: "TRADED" },
          { fromTeamId: 2, toTeamId: 1, player: { fullName: "Tyreek Hill", id: 2 }, type: "TRADED" },
        ],
      },
    ]);
    const result = buildTradesForSeason(2024, data as Record<string, unknown>);
    expect(result).toHaveLength(1);
    const trade = result[0];
    const teamA = trade.teamA;
    const teamB = trade.teamB;
    const allSent = [...teamA.playersSent, ...teamB.playersSent];
    const allReceived = [...teamA.playersReceived, ...teamB.playersReceived];
    expect(allSent).toContain("Patrick Mahomes");
    expect(allSent).toContain("Tyreek Hill");
    expect(allReceived).toContain("Patrick Mahomes");
    expect(allReceived).toContain("Tyreek Hill");
  });

  it("handles multiple separate trades in the same season", () => {
    const data = makeSeasonData([
      {
        id: "tx-A",
        type: "TRADE",
        status: "EXECUTED",
        proposedDate: Date.now(),
        teamId: 1,
        items: [
          { fromTeamId: 1, toTeamId: 2, player: { fullName: "Player 1", id: 1 }, type: "TRADED" },
          { fromTeamId: 2, toTeamId: 1, player: { fullName: "Player 2", id: 2 }, type: "TRADED" },
        ],
      },
      {
        id: "tx-B",
        type: "TRADE",
        status: "EXECUTED",
        proposedDate: Date.now(),
        teamId: 3,
        items: [
          { fromTeamId: 3, toTeamId: 4, player: { fullName: "Player 3", id: 3 }, type: "TRADED" },
          { fromTeamId: 4, toTeamId: 3, player: { fullName: "Player 4", id: 4 }, type: "TRADED" },
        ],
      },
    ]);
    const result = buildTradesForSeason(2024, data as Record<string, unknown>);
    expect(result).toHaveLength(2);
    const ids = result.map(t => t.transactionId);
    expect(ids).toContain("tx-A");
    expect(ids).toContain("tx-B");
  });

  it("returns trades sorted newest first", () => {
    const now = Date.now();
    const data = makeSeasonData([
      {
        id: "tx-old",
        type: "TRADE",
        status: "EXECUTED",
        proposedDate: now - 1_000_000,
        teamId: 1,
        items: [
          { fromTeamId: 1, toTeamId: 2, player: { fullName: "Old Player", id: 1 }, type: "TRADED" },
          { fromTeamId: 2, toTeamId: 1, player: { fullName: "Old Return", id: 2 }, type: "TRADED" },
        ],
      },
      {
        id: "tx-new",
        type: "TRADE",
        status: "EXECUTED",
        proposedDate: now,
        teamId: 1,
        items: [
          { fromTeamId: 1, toTeamId: 2, player: { fullName: "New Player", id: 3 }, type: "TRADED" },
          { fromTeamId: 2, toTeamId: 1, player: { fullName: "New Return", id: 4 }, type: "TRADED" },
        ],
      },
    ]);
    const result = buildTradesForSeason(2024, data as Record<string, unknown>);
    expect(result[0].transactionId).toBe("tx-new");
    expect(result[1].transactionId).toBe("tx-old");
  });

  it("includes a human-readable dateLabel", () => {
    const ts = new Date("2024-09-15").getTime();
    const data = makeSeasonData([
      {
        id: "tx-date",
        type: "TRADE",
        status: "EXECUTED",
        proposedDate: ts,
        teamId: 1,
        items: [
          { fromTeamId: 1, toTeamId: 2, player: { fullName: "P1", id: 1 }, type: "TRADED" },
          { fromTeamId: 2, toTeamId: 1, player: { fullName: "P2", id: 2 }, type: "TRADED" },
        ],
      },
    ]);
    const result = buildTradesForSeason(2024, data as Record<string, unknown>);
    expect(result).toHaveLength(1);
    expect(result[0].dateLabel).toBeTruthy();
    expect(typeof result[0].dateLabel).toBe("string");
  });
});
