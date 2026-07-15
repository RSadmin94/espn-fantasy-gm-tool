import { describe, expect, it } from "vitest";
import {
  CROSS_PROVIDER_LEAGUE_ID_MESSAGE,
  MAX_CONNECTED_LEAGUES,
  connectedLeagueKey,
  hasCrossProviderLeagueIdConflict,
  isCountableConnectedLeague,
} from "./connectedLeagueLimits";

describe("connectedLeagueKey", () => {
  it("groups seasons under one provider+leagueId key", () => {
    expect(connectedLeagueKey("espn", "457622")).toBe("espn:457622");
    expect(connectedLeagueKey("sleeper", "abc")).toBe("sleeper:abc");
  });
});

describe("isCountableConnectedLeague", () => {
  it("ignores placeholder league ids", () => {
    expect(isCountableConnectedLeague("espn", "default")).toBe(false);
    expect(isCountableConnectedLeague("yahoo", "__pending__")).toBe(false);
    expect(isCountableConnectedLeague("espn", "457622")).toBe(true);
  });
});

describe("MAX_CONNECTED_LEAGUES", () => {
  it("is five distinct leagues", () => {
    expect(MAX_CONNECTED_LEAGUES).toBe(5);
  });
});

describe("limit math (pure)", () => {
  function canAdd(keys: string[], provider: string, leagueId: string): boolean {
    const key = connectedLeagueKey(provider, leagueId);
    if (keys.includes(key)) return true;
    return keys.length < MAX_CONNECTED_LEAGUES;
  }

  it("allows a fifth distinct league", () => {
    const keys = ["espn:1", "espn:2", "espn:3", "espn:4"];
    expect(canAdd(keys, "espn", "5")).toBe(true);
  });

  it("blocks a sixth distinct league", () => {
    const keys = ["espn:1", "espn:2", "espn:3", "espn:4", "espn:5"];
    expect(canAdd(keys, "espn", "6")).toBe(false);
  });

  it("allows reconnecting an existing league", () => {
    const keys = ["espn:1", "espn:2", "espn:3", "espn:4", "espn:5"];
    expect(canAdd(keys, "espn", "3")).toBe(true);
  });
});

describe("hasCrossProviderLeagueIdConflict", () => {
  const existing = [
    { provider: "espn", leagueId: "457622" },
    { provider: "espn", leagueId: "999" },
  ];

  it("detects Sleeper connect after ESPN with same leagueId", () => {
    expect(hasCrossProviderLeagueIdConflict(existing, "sleeper", "457622")).toBe(true);
  });

  it("detects ESPN connect after Sleeper with same leagueId", () => {
    const sleeperFirst = [{ provider: "sleeper", leagueId: "457622" }];
    expect(hasCrossProviderLeagueIdConflict(sleeperFirst, "espn", "457622")).toBe(true);
  });

  it("allows ESPN reconnect", () => {
    expect(hasCrossProviderLeagueIdConflict(existing, "espn", "457622")).toBe(false);
  });

  it("allows Sleeper reconnect", () => {
    const sleeperOnly = [{ provider: "sleeper", leagueId: "457622" }];
    expect(hasCrossProviderLeagueIdConflict(sleeperOnly, "sleeper", "457622")).toBe(false);
  });

  it("allows different league IDs across providers", () => {
    expect(hasCrossProviderLeagueIdConflict(existing, "sleeper", "111111")).toBe(false);
  });

  it("exports the user-facing collision message", () => {
    expect(CROSS_PROVIDER_LEAGUE_ID_MESSAGE).toContain("another fantasy provider");
    expect(CROSS_PROVIDER_LEAGUE_ID_MESSAGE).not.toContain("normalized");
  });
});
