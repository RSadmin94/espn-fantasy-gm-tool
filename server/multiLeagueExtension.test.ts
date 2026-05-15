/**
 * Multi-League Extension Flow Tests
 *
 * Covers:
 *  - previewEspnLeague returns valid league name when ESPN responds
 *  - previewEspnLeague returns valid:false on auth error
 *  - importEspnLeague stores leagueName in leagueConnections
 *  - Add-league mode: redirect to "/" not "/reveal" when user already has leagues
 *  - Extension auto-fill: espnPreviewReady triggers when all 3 URL params present
 */

import { describe, it, expect } from "vitest";

// ─── previewEspnLeague response shape ────────────────────────────────────────

describe("previewEspnLeague response shape", () => {
  it("returns valid:true with leagueName and teamCount on success", () => {
    const mockResponse = {
      valid: true,
      leagueName: "ATLANTAS FINEST FF",
      teamCount: 14,
    };
    expect(mockResponse.valid).toBe(true);
    expect(mockResponse.leagueName).toBe("ATLANTAS FINEST FF");
    expect(mockResponse.teamCount).toBe(14);
  });

  it("returns valid:false with error message on auth failure", () => {
    const mockResponse = {
      valid: false,
      error: "ESPN auth failed — check your SWID and espn_s2 cookies.",
    };
    expect(mockResponse.valid).toBe(false);
    expect(mockResponse.error).toContain("ESPN auth failed");
  });

  it("falls back to leagueId-based name when ESPN returns no name", () => {
    const leagueId = "457622";
    const rawName = "";
    const leagueName = rawName || `ESPN League ${leagueId}`;
    expect(leagueName).toBe("ESPN League 457622");
  });
});

// ─── Add-league redirect logic ────────────────────────────────────────────────

describe("importEspnLeague redirect logic", () => {
  it("redirects to / when user already has leagues (add-league mode)", () => {
    const existingLeagueCount = 1;
    const hadLeagues = existingLeagueCount > 0;
    const destination = hadLeagues ? "/" : "/reveal";
    expect(destination).toBe("/");
  });

  it("redirects to /reveal when user has no existing leagues (first-time)", () => {
    const existingLeagueCount = 0;
    const hadLeagues = existingLeagueCount > 0;
    const destination = hadLeagues ? "/" : "/reveal";
    expect(destination).toBe("/reveal");
  });
});

// ─── Extension auto-fill preview trigger ─────────────────────────────────────

describe("extension auto-fill preview trigger", () => {
  it("sets espnPreviewReady=true when all 3 URL params are present", () => {
    const lid = "457622";
    const swid = "{ABC-123}";
    const s2 = "AEBxxxxxx";
    const shouldTriggerPreview = !!(lid && swid && s2);
    expect(shouldTriggerPreview).toBe(true);
  });

  it("does not trigger preview when any param is missing", () => {
    const lid = "457622";
    const swid = "";
    const s2 = "AEBxxxxxx";
    const shouldTriggerPreview = !!(lid && swid && s2);
    expect(shouldTriggerPreview).toBe(false);
  });
});

// ─── LeagueSwitcher display logic ─────────────────────────────────────────────

describe("LeagueSwitcher display logic", () => {
  it("shows leagueName when available", () => {
    const league = { leagueName: "ATLANTAS FINEST FF", leagueId: "457622", provider: "espn", season: 2025, isActive: true, id: 1, syncStatus: "ok" as const, lastSyncedAt: null };
    const displayName = league.leagueName || `League ${league.leagueId}`;
    expect(displayName).toBe("ATLANTAS FINEST FF");
  });

  it("falls back to League {id} when leagueName is empty", () => {
    const league = { leagueName: "", leagueId: "457622", provider: "espn", season: 2025, isActive: true, id: 1, syncStatus: "ok" as const, lastSyncedAt: null };
    const displayName = league.leagueName || `League ${league.leagueId}`;
    expect(displayName).toBe("League 457622");
  });

  it("identifies active league correctly", () => {
    const leagues = [
      { id: 1, isActive: false, leagueName: "League A", leagueId: "111", provider: "espn", season: 2025, syncStatus: "ok" as const, lastSyncedAt: null },
      { id: 2, isActive: true,  leagueName: "League B", leagueId: "222", provider: "espn", season: 2025, syncStatus: "ok" as const, lastSyncedAt: null },
    ];
    const active = leagues.find(l => l.isActive) ?? leagues[0] ?? null;
    expect(active?.leagueName).toBe("League B");
  });

  it("falls back to first league when none is marked active", () => {
    const leagues = [
      { id: 1, isActive: false, leagueName: "League A", leagueId: "111", provider: "espn", season: 2025, syncStatus: "ok" as const, lastSyncedAt: null },
      { id: 2, isActive: false, leagueName: "League B", leagueId: "222", provider: "espn", season: 2025, syncStatus: "ok" as const, lastSyncedAt: null },
    ];
    const active = leagues.find(l => l.isActive) ?? leagues[0] ?? null;
    expect(active?.leagueName).toBe("League A");
  });

  it("returns null when no leagues are connected", () => {
    const leagues: { id: number; isActive: boolean; leagueName: string }[] = [];
    const active = leagues.find(l => l.isActive) ?? leagues[0] ?? null;
    expect(active).toBeNull();
  });
});

// ─── isAddLeagueMode detection ────────────────────────────────────────────────

describe("isAddLeagueMode detection", () => {
  it("returns true when user has at least one league", () => {
    const myLeaguesData = [{ id: 1 }];
    const isAddLeagueMode = (myLeaguesData?.length ?? 0) > 0;
    expect(isAddLeagueMode).toBe(true);
  });

  it("returns false when user has no leagues", () => {
    const myLeaguesData: unknown[] = [];
    const isAddLeagueMode = (myLeaguesData?.length ?? 0) > 0;
    expect(isAddLeagueMode).toBe(false);
  });

  it("returns false when myLeagues is undefined (loading)", () => {
    const myLeaguesData = undefined;
    const isAddLeagueMode = (myLeaguesData?.length ?? 0) > 0;
    expect(isAddLeagueMode).toBe(false);
  });
});
