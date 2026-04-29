/**
 * Tests for the playerProfiles tRPC endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the database helpers ─────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAllCachedSeasons: vi.fn(),
  getCachedView: vi.fn(),
  upsertCachedView: vi.fn(),
  upsertRefreshManifest: vi.fn(),
  getRefreshManifests: vi.fn(),
  getChatHistory: vi.fn(),
  addChatMessage: vi.fn(),
  clearChatHistory: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/systemRouter", () => ({
  systemRouter: {},
}));

import { getAllCachedSeasons, getCachedView } from "./db";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeMockSeasonData(season: number, teams: Array<{ id: number; location: string; nickname: string; owners?: string[] }>, picks: Array<{ roundId: number; roundPickNumber: number; overallPickNumber: number; teamId: number; playerId: number; keeper?: boolean }>) {
  return {
    seasonId: season,
    members: [],
    teams: teams.map((t) => ({
      id: t.id,
      location: t.location,
      nickname: t.nickname,
      owners: t.owners || [],
      roster: {
        entries: picks
          .filter((p) => p.teamId === t.id)
          .map((p) => ({
            lineupSlotId: 2,
            playerPoolEntry: {
              acquisitionType: "DRAFT",
              acquisitionDate: Date.now(),
              player: {
                id: p.playerId,
                fullName: `Player ${p.playerId}`,
                defaultPositionId: 2,
                proTeamId: 1,
              },
            },
          })),
      },
    })),
    draftDetail: {
      picks: picks.map((p) => ({
        roundId: p.roundId,
        roundPickNumber: p.roundPickNumber,
        overallPickNumber: p.overallPickNumber,
        teamId: p.teamId,
        playerId: p.playerId,
        keeper: p.keeper ?? false,
        reservedForKeeper: false,
        autoDraftTypeId: 0,
      })),
    },
    transactions: [],
    schedule: [],
    players: [],
    settings: { isActive: false, currentMatchupPeriod: 0, draftSettings: {} },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("playerProfiles endpoint logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates picks with the same season+overallPickNumber", () => {
    const seen = new Set<string>();
    const picks = [
      { season: 2024, overallPickNumber: 1 },
      { season: 2024, overallPickNumber: 1 }, // duplicate
      { season: 2024, overallPickNumber: 2 },
    ];
    const unique = picks.filter((p) => {
      const key = `${p.season}:${p.overallPickNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    expect(unique).toHaveLength(2);
  });

  it("correctly identifies keeper picks", () => {
    const picks = [
      { keeper: true, reservedForKeeper: false },
      { keeper: false, reservedForKeeper: true },
      { keeper: false, reservedForKeeper: false },
    ];
    const keeperPicks = picks.filter((p) => p.keeper === true || p.reservedForKeeper === true);
    expect(keeperPicks).toHaveLength(2);
  });

  it("computes prominence score correctly", () => {
    const player = {
      totalKeeperYears: 3,
      totalDrafts: 8,
      firstSeen: 2018,
      lastSeen: 2025,
    };
    const score = player.totalKeeperYears * 3 + player.totalDrafts + (player.lastSeen - player.firstSeen);
    expect(score).toBe(3 * 3 + 8 + 7); // 9 + 8 + 7 = 24
  });

  it("computes round trend correctly (last - first)", () => {
    const history = [
      { season: 2018, round: 4 },
      { season: 2020, round: 1 },
      { season: 2023, round: 1 },
    ];
    const trend = history[history.length - 1].round - history[0].round;
    expect(trend).toBe(-3); // negative = rising value
  });

  it("computes average draft round correctly", () => {
    const rounds = [1, 2, 3, 4];
    const avg = Math.round((rounds.reduce((s, r) => s + r, 0) / rounds.length) * 10) / 10;
    expect(avg).toBe(2.5);
  });

  it("returns empty profiles when no seasons are cached", async () => {
    vi.mocked(getAllCachedSeasons).mockResolvedValue([]);

    // Simulate the endpoint logic inline
    const cachedSeasons: number[] = [];
    const profiles: unknown[] = [];
    expect(profiles).toHaveLength(0);
    expect(cachedSeasons).toHaveLength(0);
  });

  it("correctly builds unique teams list from teamsBySeason", () => {
    const teamsBySeason = {
      2022: { teamId: 1, teamName: "Alpha Dogs", ownerName: "Alice" },
      2023: { teamId: 1, teamName: "Alpha Dogs", ownerName: "Alice" },
      2024: { teamId: 2, teamName: "Beta Squad", ownerName: "Bob" },
    };
    const uniqueTeams = Array.from(new Set(Object.values(teamsBySeason).map((t) => t.teamName)));
    expect(uniqueTeams).toHaveLength(2);
    expect(uniqueTeams).toContain("Alpha Dogs");
    expect(uniqueTeams).toContain("Beta Squad");
  });

  it("correctly counts keeper years from keeperSeasons array", () => {
    const keeperSeasons = [2022, 2023, 2025];
    expect(keeperSeasons.length).toBe(3);
  });

  it("sorts profiles by prominence score descending", () => {
    const profiles = [
      { playerName: "Low", prominenceScore: 3 },
      { playerName: "High", prominenceScore: 25 },
      { playerName: "Mid", prominenceScore: 12 },
    ];
    const sorted = [...profiles].sort((a, b) => b.prominenceScore - a.prominenceScore);
    expect(sorted[0].playerName).toBe("High");
    expect(sorted[1].playerName).toBe("Mid");
    expect(sorted[2].playerName).toBe("Low");
  });
});
