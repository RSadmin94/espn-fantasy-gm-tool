import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify({
      leagueName: "Test",
      season: 2025,
      provider: "yahoo",
      teamProfiles: [],
      leagueSummary: "ok",
    }) } }],
  })),
}));

vi.mock("./connectedLeagueLimits", () => ({
  assertCanConnectLeague: vi.fn(async () => undefined),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
  reconcileActiveLeague: vi.fn(async () => null),
  setActiveLeagueForUser: vi.fn(async () => undefined),
}));

vi.mock("./universalPersistence", () => ({
  persistUniversalLeague: vi.fn(),
}));

vi.mock("./providers/yahooAdapter", () => {
  class YahooAdapter {
    credentials = {
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 60_000,
    };
    constructor(_config: unknown, _onRefresh?: unknown) {}
    async fetchAndNormalize(leagueId: string, season: number) {
      return {
        settings: {
          leagueId,
          provider: "yahoo" as const,
          season,
          leagueName: "Yahoo Test League",
          teamCount: 2,
          scoringType: "ppr" as const,
          playoffTeamCount: 4,
          regularSeasonWeeks: 14,
          currentWeek: 1,
          isActive: true,
        },
        teams: [
          {
            teamId: "1",
            ownerName: "Alex",
            teamName: "Team A",
            wins: 1,
            losses: 0,
            ties: 0,
            pointsFor: 100,
            pointsAgainst: 90,
            winPct: 1,
            standingRank: 1,
          },
          {
            teamId: "2",
            ownerName: "Blake",
            teamName: "Team B",
            wins: 0,
            losses: 1,
            ties: 0,
            pointsFor: 90,
            pointsAgainst: 100,
            winPct: 0,
            standingRank: 2,
          },
        ],
        rosters: [],
        matchups: [],
        transactions: [],
        draftPicks: [],
      };
    }
  }
  return { YahooAdapter };
});

import { getDb } from "./db";
import { persistUniversalLeague } from "./universalPersistence";
import {
  runYahooLeagueImport,
  yahooDiscoveryCustomerError,
} from "./yahooLeagueImport";

describe("runYahooLeagueImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls persistUniversalLeague and returns gm_* persist counts", async () => {
    const insertValues = vi.fn().mockReturnValue({
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(getDb).mockResolvedValue({
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                credentials: {
                  accessToken: "access",
                  refreshToken: "refresh",
                  expiresAt: Date.now() + 60_000,
                },
              },
            ]),
          })),
        })),
      })),
    } as never);

    vi.mocked(persistUniversalLeague).mockResolvedValue({
      leagueId: "999",
      season: 2025,
      provider: "yahoo",
      dryRun: false,
      counts: {
        settings: { attempted: 1, persisted: 1 },
        teams: { attempted: 2, persisted: 2 },
        matchups: { attempted: 0, persisted: 0 },
        transactions: { attempted: 0, persisted: 0 },
        draftPicks: { attempted: 0, persisted: 0 },
        rosterEntries: { attempted: 0, persisted: 0 },
      },
      warnings: [],
      failures: [],
      teamsMissingOwnerId: [],
    });

    const result = await runYahooLeagueImport({
      userId: 42,
      leagueId: "999",
      leagueName: "Yahoo Test League",
      season: 2025,
    });

    expect(persistUniversalLeague).toHaveBeenCalledTimes(1);
    const [leagueArg] = vi.mocked(persistUniversalLeague).mock.calls[0];
    expect(leagueArg.settings.provider).toBe("yahoo");
    expect(leagueArg.settings.leagueId).toBe("999");
    expect(leagueArg.teams).toHaveLength(2);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.persist.counts.teams.persisted).toBe(2);
    expect(result.league.provider).toBe("yahoo");
    expect(result.teams).toHaveLength(2);
  });

  it("returns typed failure when pending Yahoo auth is missing", async () => {
    vi.mocked(getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    } as never);

    const result = await runYahooLeagueImport({
      userId: 42,
      leagueId: "999",
      season: 2025,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("no_pending_auth");
    expect(result.message).not.toMatch(/token/i);
    expect(persistUniversalLeague).not.toHaveBeenCalled();
  });
});

describe("yahooDiscoveryCustomerError", () => {
  it("never echoes token-looking provider errors", () => {
    expect(yahooDiscoveryCustomerError("invalid access_token xyz")).toMatch(/authorization/i);
    expect(yahooDiscoveryCustomerError("invalid access_token xyz")).not.toMatch(/xyz/);
  });
});
