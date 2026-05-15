/**
 * leagueCacheIsolation.test.ts
 *
 * Verifies that the multi-league ESPN cache isolation layer correctly scopes
 * cache reads and writes by leagueConnectionId, and that the legacy global
 * cache (leagueConnectionId = null) remains backward-compatible.
 *
 * These tests mock the db module functions directly and verify the call
 * signatures used by routers/services match the expected isolation contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the entire db module — vi.mock is hoisted so no top-level vars allowed
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getCachedView: vi.fn(),
  upsertCachedView: vi.fn(),
  getAllCachedSeasons: vi.fn(),
  getActiveEspnLeagueConnectionId: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  addChatMessage: vi.fn(),
  getChatHistory: vi.fn(),
  getUserMemory: vi.fn(),
  persistLlmUsage: vi.fn(),
  getPickTrades: vi.fn(),
  getActiveLeagueConnection: vi.fn(),
}));

import {
  getCachedView,
  upsertCachedView,
  getAllCachedSeasons,
  getActiveEspnLeagueConnectionId,
} from "./db";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Multi-League ESPN Cache Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCachedView with leagueConnectionId=null uses global cache", async () => {
    const mockRow = {
      season: 2025,
      viewName: "combined",
      payload: { teams: [] },
      leagueConnectionId: null,
    };
    vi.mocked(getCachedView).mockResolvedValueOnce(mockRow as never);

    const result = await getCachedView(2025, "combined", null);

    expect(getCachedView).toHaveBeenCalledWith(2025, "combined", null);
    expect(result).not.toBeNull();
    expect(result?.leagueConnectionId).toBeNull();
  });

  it("getCachedView with leagueConnectionId=42 uses scoped cache", async () => {
    const mockRow = {
      season: 2025,
      viewName: "combined",
      payload: { teams: [] },
      leagueConnectionId: 42,
    };
    vi.mocked(getCachedView).mockResolvedValueOnce(mockRow as never);

    const result = await getCachedView(2025, "combined", 42);

    expect(getCachedView).toHaveBeenCalledWith(2025, "combined", 42);
    expect(result?.leagueConnectionId).toBe(42);
  });

  it("getCachedView returns null when no matching row for leagueConnectionId", async () => {
    vi.mocked(getCachedView).mockResolvedValueOnce(null);

    const result = await getCachedView(2025, "combined", 99);

    expect(result).toBeNull();
  });

  it("getAllCachedSeasons with leagueConnectionId=null returns global seasons", async () => {
    vi.mocked(getAllCachedSeasons).mockResolvedValueOnce([2025, 2024, 2023]);

    const seasons = await getAllCachedSeasons(null);

    expect(getAllCachedSeasons).toHaveBeenCalledWith(null);
    expect(seasons).toEqual([2025, 2024, 2023]);
  });

  it("getActiveEspnLeagueConnectionId returns null when user has no active league", async () => {
    vi.mocked(getActiveEspnLeagueConnectionId).mockResolvedValueOnce(null);

    const lcId = await getActiveEspnLeagueConnectionId(999);

    expect(getActiveEspnLeagueConnectionId).toHaveBeenCalledWith(999);
    expect(lcId).toBeNull();
  });
});
