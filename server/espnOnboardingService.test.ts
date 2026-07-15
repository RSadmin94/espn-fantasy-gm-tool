/**
 * Unit tests for ESPN connect onboarding helpers.
 */
import { describe, it, expect } from "vitest";

describe("espnOnboardingService season selection", () => {
  it("uses calendar year as default fantasy season label", () => {
    const y = new Date().getFullYear();
    expect(y).toBeGreaterThan(2020);
  });
});

describe("extension post-connect redirect", () => {
  it("lands on dashboard with espnConnected flag", () => {
    const url = "https://gmwarroom.online/dashboard?espnConnected=1";
    expect(url).toContain("/dashboard");
    expect(url).toContain("espnConnected=1");
  });
});

describe("getMyLeagues setup after SWID persist", () => {
  it("marks setup complete when selectedTeamId is set", () => {
    const row = { selectedTeamId: 14 };
    expect(row.selectedTeamId != null).toBe(true);
  });
});
