import { beforeEach, describe, expect, it, vi } from "vitest";
import { memCache } from "./memCache";

const resolveActiveProfile = vi.fn();

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    resolveActiveProfile: (...args: Parameters<typeof actual.resolveActiveProfile>) =>
      resolveActiveProfile(...args),
  };
});

import { resolveCurrentOwner } from "./currentOwnerService";
import { resolveRodMemberId } from "./h2hContextBuilder";

beforeEach(() => {
  memCache.invalidateAll();
  resolveActiveProfile.mockReset();
});

describe("resolveCurrentOwner", () => {
  it("returns empty shape when user is missing", async () => {
    const r = await resolveCurrentOwner(null);
    expect(r).toMatchObject({
      ownerId: null,
      ownerKey: null,
      isSetupComplete: false,
    });
    expect(resolveActiveProfile).not.toHaveBeenCalled();
  });

  it("maps a complete active profile to ownerId (id: prefix stripped)", async () => {
    resolveActiveProfile.mockResolvedValue({
      clerkUserId: null,
      leagueId: "L1",
      leagueName: "Test League",
      selectedTeamId: 3,
      selectedOwnerKey: "id:abc-guid",
      selectedOwnerName: "Pat",
      selectedFranchiseName: "Team Awesome",
      selectedSeason: 2025,
      isSetupComplete: true,
    });
    const r = await resolveCurrentOwner({ id: 99 });
    expect(r.isSetupComplete).toBe(true);
    expect(r.ownerId).toBe("abc-guid");
    expect(r.ownerKey).toBe("id:abc-guid");
    expect(r.displayName).toBe("Pat");
    expect(r.leagueId).toBe("L1");
    expect(resolveActiveProfile).toHaveBeenCalledTimes(1);
    const r2 = await resolveCurrentOwner({ id: 99 });
    expect(r2.ownerId).toBe("abc-guid");
    expect(resolveActiveProfile).toHaveBeenCalledTimes(1);
  });

  it("returns null ownerId when setup incomplete", async () => {
    resolveActiveProfile.mockResolvedValue({
      clerkUserId: null,
      leagueId: "L9",
      leagueName: "X",
      selectedTeamId: null,
      selectedOwnerKey: "id:zzz",
      selectedOwnerName: "Sam",
      selectedFranchiseName: null,
      selectedSeason: null,
      isSetupComplete: false,
    });
    const r = await resolveCurrentOwner({ id: 1 });
    expect(r.isSetupComplete).toBe(false);
    expect(r.ownerId).toBeNull();
    expect(r.leagueId).toBe("L9");
  });
});

describe("resolveRodMemberId", () => {
  it("returns ownerId only when setup complete (thin wrapper)", async () => {
    resolveActiveProfile.mockResolvedValue({
      clerkUserId: null,
      leagueId: "L",
      leagueName: null,
      selectedTeamId: 1,
      selectedOwnerKey: "id:mid-1",
      selectedOwnerName: "Q",
      selectedFranchiseName: null,
      selectedSeason: null,
      isSetupComplete: true,
    });
    await expect(resolveRodMemberId(5)).resolves.toBe("mid-1");
  });

  it("returns null when not setup complete", async () => {
    resolveActiveProfile.mockResolvedValue({
      clerkUserId: null,
      leagueId: null,
      leagueName: null,
      selectedTeamId: null,
      selectedOwnerKey: null,
      selectedOwnerName: null,
      selectedFranchiseName: null,
      selectedSeason: null,
      isSetupComplete: false,
    });
    await expect(resolveRodMemberId(5)).resolves.toBeNull();
  });
});
