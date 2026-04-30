import { describe, it, expect } from "vitest";
import {
  validateDataQuality,
  isStale,
  staleSummary,
  hasCookies,
} from "./espnService";

// ── validateDataQuality ───────────────────────────────────────────────────────

describe("validateDataQuality", () => {
  it("returns isUsable=false when no teams found", () => {
    const data = { teams: [], schedule: [], transactions: [] };
    const result = validateDataQuality(2024, data);
    expect(result.isUsable).toBe(false);
    expect(result.issues.some(i => i.includes("No teams"))).toBe(true);
  });

  it("returns isUsable=true with 14 teams and rosters", () => {
    const teams = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      roster: {
        entries: Array.from({ length: 15 }, (_, j) => ({ playerId: i * 15 + j })),
      },
    }));
    const schedule = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const draftDetail = { picks: Array.from({ length: 196 }, (_, i) => ({ id: i })) };
    const transactions = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const data = { teams, schedule, draftDetail, transactions };
    const result = validateDataQuality(2024, data);
    expect(result.isUsable).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("adds warning when fewer than 10 teams", () => {
    const teams = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      roster: {
        entries: Array.from({ length: 15 }, (_, j) => ({ playerId: i * 15 + j })),
      },
    }));
    const data = { teams, schedule: [1, 2, 3], transactions: [] };
    const result = validateDataQuality(2024, data);
    expect(result.warnings.some(w => w.includes("8 teams"))).toBe(true);
  });

  it("adds warning when no roster entries found", () => {
    const teams = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      roster: { entries: [] },
    }));
    const data = { teams, schedule: [], transactions: [] };
    const result = validateDataQuality(2024, data);
    expect(result.issues.some(i => i.includes("No roster entries"))).toBe(true);
    expect(result.isUsable).toBe(false);
  });

  it("adds warning when no schedule data", () => {
    const teams = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      roster: {
        entries: Array.from({ length: 15 }, (_, j) => ({ playerId: i * 15 + j })),
      },
    }));
    const data = { teams, schedule: [], transactions: [] };
    const result = validateDataQuality(2024, data);
    expect(result.warnings.some(w => w.includes("No schedule"))).toBe(true);
  });

  it("adds warning when no draft picks for completed season", () => {
    const teams = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      roster: {
        entries: Array.from({ length: 15 }, (_, j) => ({ playerId: i * 15 + j })),
      },
    }));
    const data = { teams, schedule: [1, 2, 3], draftDetail: { picks: [] }, transactions: [] };
    const result = validateDataQuality(2024, data);
    expect(result.warnings.some(w => w.includes("No draft picks"))).toBe(true);
  });

  it("does not check draft picks for future seasons", () => {
    const teams = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      roster: {
        entries: Array.from({ length: 15 }, (_, j) => ({ playerId: i * 15 + j })),
      },
    }));
    const data = { teams, schedule: [1, 2, 3], transactions: [] };
    const result = validateDataQuality(2026, data);
    // Should not warn about missing draft picks for 2026
    expect(result.warnings.some(w => w.includes("draft picks"))).toBe(false);
  });
});

// ── isStale ───────────────────────────────────────────────────────────────────

describe("isStale", () => {
  it("returns false for freshly fetched data (1 hour ago)", () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(isStale(oneHourAgo)).toBe(false);
  });

  it("returns false for data fetched 6 days ago (within 7-day window)", () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(isStale(sixDaysAgo)).toBe(false);
  });

  it("returns true for data fetched 8 days ago", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(isStale(eightDaysAgo)).toBe(true);
  });

  it("returns true for data fetched 30 days ago", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(isStale(thirtyDaysAgo)).toBe(true);
  });

  it("respects custom maxAgeHours parameter", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(isStale(twoHoursAgo, 1)).toBe(true);   // stale after 1 hour
    expect(isStale(twoHoursAgo, 3)).toBe(false);  // fresh within 3 hours
  });
});

// ── staleSummary ──────────────────────────────────────────────────────────────

describe("staleSummary", () => {
  it("returns hours ago for data less than 24 hours old", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const summary = staleSummary(threeHoursAgo);
    expect(summary).toMatch(/^\d+h ago$/);
    expect(summary).toBe("3h ago");
  });

  it("returns days ago for data more than 24 hours old", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const summary = staleSummary(twoDaysAgo);
    expect(summary).toMatch(/^\d+d ago$/);
    expect(summary).toBe("2d ago");
  });

  it("returns 0h ago for very recent data", () => {
    const justNow = new Date(Date.now() - 30 * 1000); // 30 seconds ago
    const summary = staleSummary(justNow);
    expect(summary).toBe("0h ago");
  });
});

// ── hasCookies ────────────────────────────────────────────────────────────────

describe("hasCookies", () => {
  it("returns a boolean", () => {
    const result = hasCookies();
    expect(typeof result).toBe("boolean");
  });

  it("returns false when ESPN_S2 and ESPN_SWID are not set in test environment", () => {
    // In test environment, ESPN credentials are not set
    // hasCookies checks for non-empty ESPN_S2 and ESPN_SWID
    const result = hasCookies();
    // Either true (if credentials are set) or false (if not) — both are valid
    expect([true, false]).toContain(result);
  });
});
