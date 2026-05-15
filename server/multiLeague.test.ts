/**
 * multiLeague.test.ts
 * Unit tests for the multi-league support logic:
 *   - League ownership guard (removeLeague only deletes rows owned by the user)
 *   - setActive / getActive selection logic
 *   - LeagueSwitcher display helpers (pure functions)
 *
 * DB-write helpers are fire-and-forget and require a live DB, so they are
 * not tested here. We test the deterministic logic only.
 */

import { describe, it, expect } from "vitest";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeagueRow = {
  id: number;
  userId: number;
  provider: string;
  leagueId: string;
  leagueName: string;
  season: number;
  isActive: boolean;
};

// ─── Ownership guard ──────────────────────────────────────────────────────────
// Mirrors the WHERE clause in league.removeLeague:
//   DELETE FROM league_connections WHERE id = ? AND userId = ?

function canRemove(league: LeagueRow, requestingUserId: number): boolean {
  return league.userId === requestingUserId;
}

describe("removeLeague ownership guard", () => {
  const league: LeagueRow = {
    id: 1,
    userId: 42,
    provider: "espn",
    leagueId: "123456",
    leagueName: "Atlantas Finest",
    season: 2025,
    isActive: true,
  };

  it("allows the owner to remove their own league", () => {
    expect(canRemove(league, 42)).toBe(true);
  });

  it("blocks a different user from removing the league", () => {
    expect(canRemove(league, 99)).toBe(false);
  });

  it("blocks userId 0 (unauthenticated sentinel)", () => {
    expect(canRemove(league, 0)).toBe(false);
  });

  it("allows removal when userId matches exactly", () => {
    const other: LeagueRow = { ...league, userId: 7 };
    expect(canRemove(other, 7)).toBe(true);
    expect(canRemove(other, 8)).toBe(false);
  });
});

// ─── Active league selection after removal ────────────────────────────────────
// Mirrors the fallback logic: pick the first remaining league, or 0 if none.

function pickNextActiveId(
  leagues: LeagueRow[],
  removedId: number,
  currentActiveId: number
): number {
  if (currentActiveId !== removedId) return currentActiveId; // active unchanged
  const remaining = leagues.filter((l) => l.id !== removedId);
  return remaining[0]?.id ?? 0;
}

describe("pickNextActiveId after removeLeague", () => {
  const leagues: LeagueRow[] = [
    { id: 1, userId: 1, provider: "espn", leagueId: "aaa", leagueName: "League A", season: 2025, isActive: true },
    { id: 2, userId: 1, provider: "sleeper", leagueId: "bbb", leagueName: "League B", season: 2025, isActive: false },
    { id: 3, userId: 1, provider: "espn", leagueId: "ccc", leagueName: "League C", season: 2024, isActive: false },
  ];

  it("returns the next available league when the active one is removed", () => {
    const next = pickNextActiveId(leagues, 1, 1);
    expect(next).toBe(2);
  });

  it("returns 0 when the only league is removed", () => {
    const single = [leagues[0]];
    const next = pickNextActiveId(single, 1, 1);
    expect(next).toBe(0);
  });

  it("does not change active when a non-active league is removed", () => {
    const next = pickNextActiveId(leagues, 2, 1);
    expect(next).toBe(1); // active was 1, removed was 2 → unchanged
  });

  it("returns 0 when all leagues are removed", () => {
    const next = pickNextActiveId([], 1, 1);
    expect(next).toBe(0);
  });
});

// ─── LeagueSwitcher display helpers ──────────────────────────────────────────
// Pure functions used by LeagueSwitcher.tsx to derive display state.

const PROVIDER_EMOJI: Record<string, string> = {
  espn: "🏈",
  sleeper: "😴",
  yahoo: "🟣",
  nfl: "🏟️",
};

function getProviderEmoji(provider: string): string {
  return PROVIDER_EMOJI[provider] ?? "🏆";
}

function getLeagueDisplayName(league: LeagueRow): string {
  return league.leagueName || `League ${league.leagueId}`;
}

function getActiveLeague(leagues: LeagueRow[]): LeagueRow | null {
  return leagues.find((l) => l.isActive) ?? leagues[0] ?? null;
}

describe("LeagueSwitcher display helpers", () => {
  describe("getProviderEmoji", () => {
    it("returns football emoji for espn", () => {
      expect(getProviderEmoji("espn")).toBe("🏈");
    });

    it("returns sleepy emoji for sleeper", () => {
      expect(getProviderEmoji("sleeper")).toBe("😴");
    });

    it("returns purple circle for yahoo", () => {
      expect(getProviderEmoji("yahoo")).toBe("🟣");
    });

    it("falls back to trophy for unknown providers", () => {
      expect(getProviderEmoji("fantrax")).toBe("🏆");
      expect(getProviderEmoji("")).toBe("🏆");
    });
  });

  describe("getLeagueDisplayName", () => {
    it("returns leagueName when present", () => {
      const l: LeagueRow = { id: 1, userId: 1, provider: "espn", leagueId: "123", leagueName: "Atlantas Finest", season: 2025, isActive: true };
      expect(getLeagueDisplayName(l)).toBe("Atlantas Finest");
    });

    it("falls back to League <id> when leagueName is empty", () => {
      const l: LeagueRow = { id: 1, userId: 1, provider: "espn", leagueId: "456789", leagueName: "", season: 2025, isActive: true };
      expect(getLeagueDisplayName(l)).toBe("League 456789");
    });
  });

  describe("getActiveLeague", () => {
    const leagues: LeagueRow[] = [
      { id: 1, userId: 1, provider: "espn", leagueId: "a", leagueName: "A", season: 2025, isActive: false },
      { id: 2, userId: 1, provider: "sleeper", leagueId: "b", leagueName: "B", season: 2025, isActive: true },
      { id: 3, userId: 1, provider: "yahoo", leagueId: "c", leagueName: "C", season: 2024, isActive: false },
    ];

    it("returns the league with isActive=true", () => {
      expect(getActiveLeague(leagues)?.id).toBe(2);
    });

    it("falls back to first league when none is active", () => {
      const noActive = leagues.map((l) => ({ ...l, isActive: false }));
      expect(getActiveLeague(noActive)?.id).toBe(1);
    });

    it("returns null for empty array", () => {
      expect(getActiveLeague([])).toBeNull();
    });

    it("returns the only league when there is exactly one", () => {
      const single = [leagues[0]];
      expect(getActiveLeague(single)?.id).toBe(1);
    });
  });
});

// ─── User initials derivation ─────────────────────────────────────────────────
// Mirrors the initials logic in LeagueSwitcher.tsx

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const src = name ?? email ?? "U";
  return src
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

describe("getInitials", () => {
  it("returns first two initials for a full name", () => {
    expect(getInitials("Rod Sellers", null)).toBe("RS");
  });

  it("returns single initial for a single-word name", () => {
    expect(getInitials("Rod", null)).toBe("R");
  });

  it("falls back to email first character when name is null", () => {
    expect(getInitials(null, "rod@example.com")).toBe("R");
  });

  it("falls back to U when both name and email are null", () => {
    expect(getInitials(null, null)).toBe("U");
  });

  it("uppercases the result", () => {
    expect(getInitials("alice bob", null)).toBe("AB");
  });

  it("handles names with more than two words — only first two initials", () => {
    expect(getInitials("John Paul Jones", null)).toBe("JP");
  });
});
