import { describe, it, expect } from "vitest";
import {
  buildLeagueCapabilities,
  readKeeperSlotsPerTeamFromPayload,
  keepersEnabledFromSlots,
} from "./leagueCapabilities";

describe("leagueCapabilities", () => {
  it("reads keeper slots from draftSettings first", () => {
    const payload = {
      settings: {
        draftSettings: { keeperCount: 3 },
        keeperCount: 0,
      },
    } as unknown as Record<string, unknown>;
    expect(readKeeperSlotsPerTeamFromPayload(payload)).toBe(3);
    expect(buildLeagueCapabilities("L1", 2026, payload).keepers).toBe(true);
  });

  it("falls back to top-level keeperCount", () => {
    const payload = {
      settings: {
        draftSettings: {},
        keeperCount: 2,
      },
    } as unknown as Record<string, unknown>;
    expect(readKeeperSlotsPerTeamFromPayload(payload)).toBe(2);
  });

  it("treats 0 keepers as redraft", () => {
    const payload = {
      settings: { draftSettings: { keeperCount: 0 } },
    } as unknown as Record<string, unknown>;
    const c = buildLeagueCapabilities("L1", 2026, payload);
    expect(c.keepers).toBe(false);
    expect(keepersEnabledFromSlots(0)).toBe(false);
  });

  it("detects auction draft", () => {
    const payload = {
      settings: { draftSettings: { keeperCount: 0, orderType: "AUCTION" } },
    } as unknown as Record<string, unknown>;
    expect(buildLeagueCapabilities("L1", 2026, payload).auctionDraft).toBe(true);
  });
});
