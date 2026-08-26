import { describe, expect, it } from "vitest";
import {
  incompleteLeague,
  isConnectorCapableBrowser,
  nextAfterEspnConnected,
  nextAfterSleeperConnected,
  setupGateDestination,
  setupPhase,
  teamSetupPath,
} from "./onboardingSetup";

describe("setupPhase", () => {
  it("sends a brand-new authenticated user to provider chooser (NEW)", () => {
    expect(
      setupPhase({
        isAuthenticated: true,
        isDemo: false,
        connectedLeagueCount: 0,
        isSetupComplete: false,
      }),
    ).toBe("NEW");
  });

  it("sends a returning completed user through (SETUP_COMPLETE)", () => {
    expect(
      setupPhase({
        isAuthenticated: true,
        isDemo: false,
        connectedLeagueCount: 1,
        isSetupComplete: true,
      }),
    ).toBe("SETUP_COMPLETE");
  });

  it("asks only for team when a league is connected but identity is unresolved", () => {
    expect(
      setupPhase({
        isAuthenticated: true,
        isDemo: false,
        connectedLeagueCount: 1,
        isSetupComplete: false,
      }),
    ).toBe("TEAM_REQUIRED");
  });

  it("does not onboard demo or anonymous sessions", () => {
    expect(
      setupPhase({
        isAuthenticated: false,
        isDemo: false,
        connectedLeagueCount: 0,
        isSetupComplete: false,
      }),
    ).toBe("SETUP_COMPLETE");
    expect(
      setupPhase({
        isAuthenticated: true,
        isDemo: true,
        connectedLeagueCount: 0,
        isSetupComplete: false,
      }),
    ).toBe("SETUP_COMPLETE");
  });
});

describe("setupGateDestination", () => {
  it("routes a new user to the provider chooser, not Connected Leagues", () => {
    expect(
      setupGateDestination({ phase: "NEW", pathname: "/dashboard", incomplete: null }),
    ).toBe("/connect");
  });

  it("does not bounce a new user who is already on the chooser or a provider path", () => {
    expect(setupGateDestination({ phase: "NEW", pathname: "/connect", incomplete: null })).toBeNull();
    expect(
      setupGateDestination({ phase: "NEW", pathname: "/connect/espn", incomplete: null }),
    ).toBeNull();
  });

  it("does not send a completed user anywhere", () => {
    expect(
      setupGateDestination({ phase: "SETUP_COMPLETE", pathname: "/dashboard", incomplete: null }),
    ).toBeNull();
  });

  it("sends ESPN team-required users to team selection only", () => {
    expect(
      setupGateDestination({
        phase: "TEAM_REQUIRED",
        pathname: "/dashboard",
        incomplete: { provider: "espn", leagueId: "457622", selectedTeamId: null },
      }),
    ).toBe("/select-team/espn/457622");
  });

  it("sends Sleeper team-required users back to the Sleeper path, not Connected Leagues", () => {
    expect(
      setupGateDestination({
        phase: "TEAM_REQUIRED",
        pathname: "/dashboard",
        incomplete: { provider: "sleeper", leagueId: "123", selectedTeamId: null },
      }),
    ).toBe("/connect/sleeper");
  });
});

describe("nextAfterEspnConnected", () => {
  it("goes to dashboard when setup is already complete", () => {
    expect(nextAfterEspnConnected({ isSetupComplete: true, leagueId: "457622" })).toEqual({
      href: "/dashboard",
      label: "Go to dashboard",
    });
  });

  it("asks only for team when identity is unresolved", () => {
    expect(nextAfterEspnConnected({ isSetupComplete: false, leagueId: "457622" })).toEqual({
      href: "/select-team/espn/457622",
      label: "Select your team",
    });
  });
});

describe("nextAfterSleeperConnected", () => {
  it("goes to dashboard after a successful Sleeper team save", () => {
    expect(nextAfterSleeperConnected({ isSetupComplete: true }).href).toBe("/dashboard");
  });
});

describe("incompleteLeague", () => {
  it("picks the league that still needs a team", () => {
    const row = incompleteLeague([
      { provider: "espn", leagueId: "1", selectedTeamId: 4, isSetupComplete: true },
      { provider: "espn", leagueId: "2", selectedTeamId: null, isSetupComplete: false },
    ]);
    expect(row?.leagueId).toBe("2");
  });
});

describe("teamSetupPath", () => {
  it("uses the existing ESPN team-selection route", () => {
    expect(teamSetupPath({ provider: "espn", leagueId: "480452315" })).toBe(
      "/select-team/espn/480452315",
    );
  });
});

describe("isConnectorCapableBrowser", () => {
  it("allows desktop Chrome and Edge", () => {
    expect(
      isConnectorCapableBrowser(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe(true);
    expect(
      isConnectorCapableBrowser(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
      ),
    ).toBe(true);
  });

  it("rejects mobile Chrome and iOS", () => {
    expect(
      isConnectorCapableBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      isConnectorCapableBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
  });
});
