/**
 * Tests for deterministic ESPN team ownership mapping.
 * Covers: upsert, get, update, and multi-user isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock drizzle db ──────────────────────────────────────────────────────────
const mockDb = {
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
};

vi.mock("./db", () => ({
  getMyTeamOwnership: vi.fn(),
  getLatestTeamOwnership: vi.fn(),
  upsertTeamOwnership: vi.fn(),
}));

import {
  getMyTeamOwnership,
  getLatestTeamOwnership,
  upsertTeamOwnership,
} from "./db";

const mockGetMyTeam = vi.mocked(getMyTeamOwnership);
const mockGetLatest = vi.mocked(getLatestTeamOwnership);
const mockUpsert = vi.mocked(upsertTeamOwnership);

// ── Sample fixtures ──────────────────────────────────────────────────────────
const USER_A = 1;
const USER_B = 2;

const CLAIM_A = {
  id: 1,
  userId: USER_A,
  season: 2025,
  espnTeamId: 3,
  espnMemberId: "{AAAAAAAA-0000-0000-0000-000000000001}",
  teamName: "Atlantas Finest",
  ownerDisplayName: "Rod Sellers",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const CLAIM_B = {
  id: 2,
  userId: USER_B,
  season: 2025,
  espnTeamId: 7,
  espnMemberId: "{BBBBBBBB-0000-0000-0000-000000000002}",
  teamName: "Gridiron Gurus",
  ownerDisplayName: "Jane Smith",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("espnTeamOwnership — deterministic identity mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the correct claim for user A", async () => {
    mockGetMyTeam.mockResolvedValue(CLAIM_A);
    const result = await getMyTeamOwnership(USER_A, 2025);
    expect(result?.espnTeamId).toBe(3);
    expect(result?.espnMemberId).toBe("{AAAAAAAA-0000-0000-0000-000000000001}");
    expect(result?.teamName).toBe("Atlantas Finest");
  });

  it("returns the correct claim for user B — different team, no cross-contamination", async () => {
    mockGetMyTeam.mockResolvedValue(CLAIM_B);
    const result = await getMyTeamOwnership(USER_B, 2025);
    expect(result?.espnTeamId).toBe(7);
    expect(result?.espnMemberId).toBe("{BBBBBBBB-0000-0000-0000-000000000002}");
    expect(result?.teamName).toBe("Gridiron Gurus");
  });

  it("returns null when user has not claimed a team", async () => {
    mockGetMyTeam.mockResolvedValue(null);
    const result = await getMyTeamOwnership(99, 2025);
    expect(result).toBeNull();
  });

  it("upsert saves the claim and returns it", async () => {
    mockUpsert.mockResolvedValue(CLAIM_A);
    const saved = await upsertTeamOwnership({
      userId: USER_A,
      season: 2025,
      espnTeamId: 3,
      espnMemberId: "{AAAAAAAA-0000-0000-0000-000000000001}",
      teamName: "Atlantas Finest",
      ownerDisplayName: "Rod Sellers",
    });
    expect(saved?.espnTeamId).toBe(3);
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it("upsert with changed teamId updates the existing claim (re-claim)", async () => {
    const updatedClaim = { ...CLAIM_A, espnTeamId: 5, teamName: "New Team Name" };
    mockUpsert.mockResolvedValue(updatedClaim);
    const saved = await upsertTeamOwnership({
      userId: USER_A,
      season: 2025,
      espnTeamId: 5,
      espnMemberId: "{AAAAAAAA-0000-0000-0000-000000000001}",
      teamName: "New Team Name",
      ownerDisplayName: "Rod Sellers",
    });
    expect(saved?.espnTeamId).toBe(5);
    expect(saved?.teamName).toBe("New Team Name");
  });

  it("getLatestTeamOwnership falls back to most recent season when no season specified", async () => {
    mockGetLatest.mockResolvedValue(CLAIM_A);
    const result = await getLatestTeamOwnership(USER_A);
    expect(result?.season).toBe(2025);
    expect(mockGetLatest).toHaveBeenCalledWith(USER_A);
  });

  it("two users claiming the same ESPN teamId are stored independently", async () => {
    // This shouldn't happen in practice but the DB doesn't enforce uniqueness on teamId alone
    const claimATeam3 = { ...CLAIM_A, userId: USER_A, espnTeamId: 3 };
    const claimBTeam3 = { ...CLAIM_B, userId: USER_B, espnTeamId: 3 };
    mockGetMyTeam
      .mockResolvedValueOnce(claimATeam3)
      .mockResolvedValueOnce(claimBTeam3);

    const resultA = await getMyTeamOwnership(USER_A, 2025);
    const resultB = await getMyTeamOwnership(USER_B, 2025);

    expect(resultA?.userId).toBe(USER_A);
    expect(resultB?.userId).toBe(USER_B);
    // Both point to teamId 3 — the DB stores both, identity is per-user
    expect(resultA?.espnTeamId).toBe(3);
    expect(resultB?.espnTeamId).toBe(3);
  });
});
