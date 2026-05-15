/**
 * tradeHistoryRouter tests
 * Covers the buildTradesForSeason helper logic via the list endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB + memCache ───────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getCachedView: vi.fn(),
  getAllCachedSeasons: vi.fn().mockResolvedValue([2025]),
}));

vi.mock("./memCache", () => ({
  memCache: vi.fn((key: string, ttl: number, fn: () => unknown) => fn()),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      teamAGrade: "WIN", teamBGrade: "LOSS",
      teamAScore: 8, teamBScore: 3,
      summary: "Lopsided deal.",
      teamAAnalysis: "Got great value.",
      teamBAnalysis: "Gave up too much.",
      verdict: "Team A won clearly",
      keyFactor: "Player value disparity",
    }) } }],
  }),
}));

// ─── Mock ESPN data ───────────────────────────────────────────────────────────

const mockEspnData = {
  seasonId: 2025,
  teams: [
    {
      id: 1,
      location: "Team", nickname: "Alpha", abbrev: "TA",
      owners: ["owner1"],
      record: { overall: { wins: 9, losses: 5, ties: 0, percentage: 0.643, pointsFor: 1921, pointsAgainst: 1693 } },
      rankFinal: 1, playoffSeed: 1,
    },
    {
      id: 2,
      location: "Team", nickname: "Beta", abbrev: "TB",
      owners: ["owner2"],
      record: { overall: { wins: 7, losses: 7, ties: 0, percentage: 0.5, pointsFor: 1800, pointsAgainst: 1850 } },
      rankFinal: 5, playoffSeed: 5,
    },
  ],
  members: [
    { id: "owner1", firstName: "Alice", lastName: "Smith" },
    { id: "owner2", firstName: "Bob", lastName: "Jones" },
  ],
  transactions: [
    {
      id: "tx-001",
      type: "TRADE",
      status: "EXECUTED",
      proposedDate: 1696118400000, // 2023-10-01
      teamId: 1,
      items: [
        { type: "ADD", playerId: 101, fromTeamId: 2, toTeamId: 1, player: { id: 101, fullName: "Justin Jefferson" } },
        { type: "DROP", playerId: 201, fromTeamId: 1, toTeamId: 2, player: { id: 201, fullName: "Davante Adams" } },
      ],
    },
    {
      id: "tx-001",
      type: "TRADE",
      status: "EXECUTED",
      proposedDate: 1696118400000,
      teamId: 2,
      items: [
        { type: "DROP", playerId: 101, fromTeamId: 2, toTeamId: 1, player: { id: 101, fullName: "Justin Jefferson" } },
        { type: "ADD", playerId: 201, fromTeamId: 1, toTeamId: 2, player: { id: 201, fullName: "Davante Adams" } },
      ],
    },
    // Waiver add — should be filtered out
    {
      id: "tx-002",
      type: "WAIVER",
      status: "EXECUTED",
      proposedDate: 1696118400000,
      teamId: 1,
      items: [
        { type: "ADD", playerId: 301, fromTeamId: 0, toTeamId: 1, player: { id: 301, fullName: "Waiver Player" } },
      ],
    },
  ],
  schedule: [],
  players: [],
  draftDetail: { picks: [] },
  settings: { name: "Test League", size: 2, scoringSettings: {} },
  status: { currentMatchupPeriod: 1, latestScoringPeriod: 1, isActive: true },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

import { getCachedView } from "./db";

describe("tradeHistoryRouter", () => {
  beforeEach(() => {
    vi.mocked(getCachedView).mockResolvedValue({
      id: 1,
      season: 2025,
      viewName: "combined",
      leagueConnectionId: null,
      payload: mockEspnData as unknown as Record<string, unknown>,
      fetchedAt: new Date(),
    });
  });

  it("filters only TRADE type transactions", async () => {
    const { buildTradesForSeason } = await import("./tradeHistoryRouter");
    const trades = buildTradesForSeason(2025, mockEspnData as unknown as Record<string, unknown>);
    expect(trades.every(t => t.transactionId !== undefined)).toBe(true);
    // Should have 1 trade (tx-001), not the waiver (tx-002)
    expect(trades.length).toBe(1);
  });

  it("correctly identifies players sent and received", async () => {
    const { buildTradesForSeason } = await import("./tradeHistoryRouter");
    const trades = buildTradesForSeason(2025, mockEspnData as unknown as Record<string, unknown>);
    const trade = trades[0];
    // Team 1 (teamA) received Justin Jefferson, sent Davante Adams
    const teamWithJJ = [trade.teamA, trade.teamB].find(s => s.playersReceived.includes("Justin Jefferson"));
    const teamWithDA = [trade.teamA, trade.teamB].find(s => s.playersReceived.includes("Davante Adams"));
    expect(teamWithJJ).toBeDefined();
    expect(teamWithDA).toBeDefined();
    expect(teamWithJJ?.teamId).not.toBe(teamWithDA?.teamId);
  });

  it("groups duplicate transaction rows by transactionId", async () => {
    const { buildTradesForSeason } = await import("./tradeHistoryRouter");
    const trades = buildTradesForSeason(2025, mockEspnData as unknown as Record<string, unknown>);
    // tx-001 appears twice in the raw data but should be one trade
    expect(trades.length).toBe(1);
    expect(trades[0].transactionId).toBe("tx-001");
  });

  it("resolves owner names from team data", async () => {
    const { buildTradesForSeason } = await import("./tradeHistoryRouter");
    const trades = buildTradesForSeason(2025, mockEspnData as unknown as Record<string, unknown>);
    const trade = trades[0];
    const names = [trade.teamA.ownerName, trade.teamB.ownerName];
    // Both sides should have non-empty owner names
    expect(names.every(n => n && n.length > 0)).toBe(true);
  });

  it("formats the date label correctly", async () => {
    const { buildTradesForSeason } = await import("./tradeHistoryRouter");
    const trades = buildTradesForSeason(2025, mockEspnData as unknown as Record<string, unknown>);
    expect(trades[0].dateLabel).toMatch(/\w+ \d+, \d{4}/);
  });

  it("returns empty array when no trades exist", async () => {
    const dataWithNoTrades = { ...mockEspnData, transactions: [] };
    const { buildTradesForSeason } = await import("./tradeHistoryRouter");
    const trades = buildTradesForSeason(2025, dataWithNoTrades as unknown as Record<string, unknown>);
    expect(trades).toEqual([]);
  });

  it("deduplicates player names within each side", async () => {
    const dupData = {
      ...mockEspnData,
      transactions: [
        {
          id: "tx-dup",
          type: "TRADE",
          status: "EXECUTED",
          proposedDate: 1696118400000,
          teamId: 1,
          items: [
            { type: "ADD", playerId: 101, fromTeamId: 2, toTeamId: 1, player: { id: 101, fullName: "Justin Jefferson" } },
            { type: "ADD", playerId: 101, fromTeamId: 2, toTeamId: 1, player: { id: 101, fullName: "Justin Jefferson" } },
            { type: "DROP", playerId: 201, fromTeamId: 1, toTeamId: 2, player: { id: 201, fullName: "Davante Adams" } },
          ],
        },
      ],
    };
    const { buildTradesForSeason } = await import("./tradeHistoryRouter");
    const trades = buildTradesForSeason(2025, dupData as unknown as Record<string, unknown>);
    const jjSide = [trades[0].teamA, trades[0].teamB].find(s => s.playersReceived.includes("Justin Jefferson"));
    expect(jjSide?.playersReceived.filter(p => p === "Justin Jefferson").length).toBe(1);
  });
});
