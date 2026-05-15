/**
 * extensionConnect.test.ts
 *
 * Tests for the providers.connectViaExtension tRPC procedure.
 * Verifies: input validation, ESPN auth failure handling, successful
 * credential storage, trial activation, and response shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock ESPN service ────────────────────────────────────────────────────────

const mockFetchEspnViewsHardened = vi.fn();
const mockNormalizeSettings = vi.fn();
const mockNormalizeTeams = vi.fn();

vi.mock("./espnService", () => ({
  fetchEspnViewsHardened: (...args: unknown[]) => mockFetchEspnViewsHardened(...args),
  normalizeSettings: (...args: unknown[]) => mockNormalizeSettings(...args),
  normalizeTeams: (...args: unknown[]) => mockNormalizeTeams(...args),
}));

// ─── Mock crypto ──────────────────────────────────────────────────────────────

vi.mock("./_core/crypto", () => ({
  encryptCredentialsForDb: (creds: unknown) => JSON.stringify(creds),
}));

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
  }),
});
const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  }),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 42,
      name: "Test User",
      email: "test@example.com",
      role: "user",
      subscriptionStatus: "free",
      ...overrides,
    },
  };
}

function makeValidInput(overrides: Record<string, unknown> = {}) {
  return {
    leagueId: "158918",
    swid: "{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}",
    espnS2: "AEBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    season: 2025,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("providers.connectViaExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: ESPN auth succeeds
    mockFetchEspnViewsHardened.mockResolvedValue({
      merged: { settings: {}, teams: [] },
      authError: false,
    });
    mockNormalizeSettings.mockReturnValue({ leagueName: "Gridiron Gods" });
    mockNormalizeTeams.mockReturnValue(new Array(12).fill({}));

    // Default: user is on free plan, no trial yet
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { subscriptionStatus: "free", trialStartedAt: null },
          ]),
        }),
      }),
    });
  });

  it("calls fetchEspnViewsHardened with correct credentials", async () => {
    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);
    await caller.connectViaExtension(makeValidInput());

    expect(mockFetchEspnViewsHardened).toHaveBeenCalledWith(
      2025,
      ["mSettings", "mTeam"],
      expect.objectContaining({
        leagueId: "158918",
        swid: expect.stringContaining("AAAAAAAA"),
        espnS2: expect.stringContaining("AEB"),
      })
    );
  });

  it("throws a user-friendly error when ESPN auth fails", async () => {
    mockFetchEspnViewsHardened.mockRejectedValue(new Error("401 Unauthorized"));

    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);

    await expect(caller.connectViaExtension(makeValidInput())).rejects.toThrow(
      /ESPN auth failed/i
    );
  });

  it("throws when ESPN returns an authError flag", async () => {
    mockFetchEspnViewsHardened.mockResolvedValue({
      merged: {},
      authError: true,
    });

    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);

    await expect(caller.connectViaExtension(makeValidInput())).rejects.toThrow(
      /auth error/i
    );
  });

  it("persists encrypted credentials to leagueConnections", async () => {
    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);
    await caller.connectViaExtension(makeValidInput());

    expect(mockInsert).toHaveBeenCalled();
  });

  it("returns leagueName, teamCount, and source=extension on success", async () => {
    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);
    const result = await caller.connectViaExtension(makeValidInput());

    expect(result).toMatchObject({
      success: true,
      leagueName: "Gridiron Gods",
      teamCount: 12,
      leagueId: "158918",
      season: 2025,
      source: "extension",
    });
  });

  it("passes detectedTeamId through when provided", async () => {
    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);
    const result = await caller.connectViaExtension(
      makeValidInput({ teamId: 6 })
    );

    expect(result.detectedTeamId).toBe(6);
  });

  it("returns detectedTeamId=null when teamId is not provided", async () => {
    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);
    const result = await caller.connectViaExtension(makeValidInput());

    expect(result.detectedTeamId).toBeNull();
  });

  it("activates 7-day trial for free users on first connect", async () => {
    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);
    await caller.connectViaExtension(makeValidInput());

    expect(mockUpdate).toHaveBeenCalled();
  });

  it("does not activate trial if user already has a trial", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { subscriptionStatus: "trialing", trialStartedAt: new Date() },
          ]),
        }),
      }),
    });

    const { providerRouter } = await import("./providerRouter");
    const caller = providerRouter.createCaller(makeCtx() as never);
    await caller.connectViaExtension(makeValidInput());

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
