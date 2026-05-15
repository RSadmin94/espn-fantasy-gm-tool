/**
 * reputationService.test.ts
 * ──────────────────────────
 * Sprint 4: Unit tests for the Reputation Service.
 * Tests cover:
 *  - detectReputationEventsForSeason: SILENT_ASSASSIN, CHAOS_AGENT,
 *    PANIC_SELLER, WAIVER_GRINDER, PLAYOFF_CHOKER
 *  - detectRevengeSeeker: cross-season H2H revenge detection
 *  - Severity levels
 */

import { describe, it, expect } from "vitest";
import {
  detectReputationEventsForSeason,
  detectRevengeSeeker,
  type ReputationSeasonData,
} from "./reputationService";

// ─── Base data factory ────────────────────────────────────────────────────────

function makeBaseData(overrides: Partial<ReputationSeasonData> = {}): ReputationSeasonData {
  return {
    season: 2024,
    teamMemberMap: { 1: "m1", 2: "m2", 3: "m3" },
    memberNameMap: { m1: "Alice Smith", m2: "Bob Jones", m3: "Carol Lee" },
    winsMap: { m1: 7, m2: 5, m3: 6 },
    lossesMap: { m1: 6, m2: 8, m3: 7 },
    txCountMap: { m1: 0, m2: 0, m3: 0 },
    tradeCountMap: { m1: 0, m2: 0, m3: 0 },
    waiverCountMap: { m1: 0, m2: 0, m3: 0 },
    madePlayoffsMap: { m1: false, m2: false, m3: false },
    wonFirstRoundMap: { m1: false, m2: false, m3: false },
    ...overrides,
  };
}

// ─── SILENT_ASSASSIN tests ────────────────────────────────────────────────────

describe("detectReputationEventsForSeason — SILENT_ASSASSIN", () => {
  it("fires for a team with 6+ wins and ≤ 3 transactions", () => {
    const data = makeBaseData({
      winsMap: { m1: 6, m2: 5, m3: 4 },
      lossesMap: { m1: 7, m2: 8, m3: 9 },
      txCountMap: { m1: 2, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const sa = events.filter((e) => e.eventType === "SILENT_ASSASSIN");
    expect(sa.length).toBeGreaterThanOrEqual(1);
    expect(sa[0].memberId).toBe("m1");
  });

  it("does NOT fire when transaction count exceeds 3", () => {
    const data = makeBaseData({
      winsMap: { m1: 8, m2: 5, m3: 4 },
      txCountMap: { m1: 4, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const sa = events.filter((e) => e.eventType === "SILENT_ASSASSIN" && e.memberId === "m1");
    expect(sa).toHaveLength(0);
  });

  it("assigns LEGENDARY severity for 9+ wins", () => {
    const data = makeBaseData({
      winsMap: { m1: 9, m2: 5, m3: 4 },
      lossesMap: { m1: 4, m2: 8, m3: 9 },
      txCountMap: { m1: 1, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const sa = events.find((e) => e.eventType === "SILENT_ASSASSIN" && e.memberId === "m1");
    expect(sa?.severity).toBe("LEGENDARY");
  });

  it("assigns DEFINING severity for 7-8 wins", () => {
    const data = makeBaseData({
      winsMap: { m1: 7, m2: 5, m3: 4 },
      lossesMap: { m1: 6, m2: 8, m3: 9 },
      txCountMap: { m1: 0, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const sa = events.find((e) => e.eventType === "SILENT_ASSASSIN" && e.memberId === "m1");
    expect(sa?.severity).toBe("DEFINING");
  });
});

// ─── CHAOS_AGENT tests ────────────────────────────────────────────────────────

describe("detectReputationEventsForSeason — CHAOS_AGENT", () => {
  it("fires for 5+ trades in a season", () => {
    const data = makeBaseData({
      tradeCountMap: { m1: 5, m2: 0, m3: 0 },
      txCountMap: { m1: 5, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const ca = events.filter((e) => e.eventType === "CHAOS_AGENT");
    expect(ca.length).toBeGreaterThanOrEqual(1);
    expect(ca[0].memberId).toBe("m1");
  });

  it("does NOT fire for fewer than 5 trades", () => {
    const data = makeBaseData({
      tradeCountMap: { m1: 4, m2: 0, m3: 0 },
      txCountMap: { m1: 4, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const ca = events.filter((e) => e.eventType === "CHAOS_AGENT");
    expect(ca).toHaveLength(0);
  });

  it("assigns LEGENDARY severity for 8+ trades", () => {
    const data = makeBaseData({
      tradeCountMap: { m1: 8, m2: 0, m3: 0 },
      txCountMap: { m1: 8, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const ca = events.find((e) => e.eventType === "CHAOS_AGENT" && e.memberId === "m1");
    expect(ca?.severity).toBe("LEGENDARY");
  });

  it("assigns DEFINING severity for 6-7 trades", () => {
    const data = makeBaseData({
      tradeCountMap: { m1: 6, m2: 0, m3: 0 },
      txCountMap: { m1: 6, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const ca = events.find((e) => e.eventType === "CHAOS_AGENT" && e.memberId === "m1");
    expect(ca?.severity).toBe("DEFINING");
  });
});

// ─── PANIC_SELLER tests ───────────────────────────────────────────────────────

describe("detectReputationEventsForSeason — PANIC_SELLER", () => {
  it("fires for 3+ trades while losses > wins", () => {
    const data = makeBaseData({
      winsMap: { m1: 3, m2: 5, m3: 4 },
      lossesMap: { m1: 10, m2: 8, m3: 9 },
      tradeCountMap: { m1: 3, m2: 0, m3: 0 },
      txCountMap: { m1: 3, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const ps = events.filter((e) => e.eventType === "PANIC_SELLER");
    expect(ps.length).toBeGreaterThanOrEqual(1);
    expect(ps[0].memberId).toBe("m1");
  });

  it("does NOT fire when wins >= losses", () => {
    const data = makeBaseData({
      winsMap: { m1: 8, m2: 5, m3: 4 },
      lossesMap: { m1: 5, m2: 8, m3: 9 },
      tradeCountMap: { m1: 4, m2: 0, m3: 0 },
      txCountMap: { m1: 4, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const ps = events.filter((e) => e.eventType === "PANIC_SELLER" && e.memberId === "m1");
    expect(ps).toHaveLength(0);
  });

  it("does NOT fire for fewer than 3 trades even when losing", () => {
    const data = makeBaseData({
      winsMap: { m1: 2, m2: 5, m3: 4 },
      lossesMap: { m1: 11, m2: 8, m3: 9 },
      tradeCountMap: { m1: 2, m2: 0, m3: 0 },
      txCountMap: { m1: 2, m2: 0, m3: 0 },
    });
    const events = detectReputationEventsForSeason(data);
    const ps = events.filter((e) => e.eventType === "PANIC_SELLER" && e.memberId === "m1");
    expect(ps).toHaveLength(0);
  });
});

// ─── WAIVER_GRINDER tests ─────────────────────────────────────────────────────

describe("detectReputationEventsForSeason — WAIVER_GRINDER", () => {
  it("fires for top-2 waiver pickup count with 5+ waivers", () => {
    const data = makeBaseData({
      waiverCountMap: { m1: 8, m2: 3, m3: 1 },
      txCountMap: { m1: 8, m2: 3, m3: 1 },
    });
    const events = detectReputationEventsForSeason(data);
    const wg = events.filter((e) => e.eventType === "WAIVER_GRINDER");
    expect(wg.length).toBeGreaterThanOrEqual(1);
    expect(wg.map((e) => e.memberId)).toContain("m1");
  });

  it("does NOT fire for fewer than 5 waivers even if top-2", () => {
    const data = makeBaseData({
      waiverCountMap: { m1: 4, m2: 2, m3: 1 },
      txCountMap: { m1: 4, m2: 2, m3: 1 },
    });
    const events = detectReputationEventsForSeason(data);
    const wg = events.filter((e) => e.eventType === "WAIVER_GRINDER");
    expect(wg).toHaveLength(0);
  });

  it("fires for both top-2 members when both have 5+ waivers", () => {
    const data = makeBaseData({
      waiverCountMap: { m1: 7, m2: 6, m3: 1 },
      txCountMap: { m1: 7, m2: 6, m3: 1 },
    });
    const events = detectReputationEventsForSeason(data);
    const wg = events.filter((e) => e.eventType === "WAIVER_GRINDER");
    expect(wg.length).toBe(2);
  });
});

// ─── PLAYOFF_CHOKER tests ─────────────────────────────────────────────────────

describe("detectReputationEventsForSeason — PLAYOFF_CHOKER", () => {
  it("fires for a team that made playoffs but lost in round 1", () => {
    const data = makeBaseData({
      madePlayoffsMap: { m1: true, m2: false, m3: false },
      wonFirstRoundMap: { m1: false, m2: false, m3: false },
    });
    const events = detectReputationEventsForSeason(data);
    const pc = events.filter((e) => e.eventType === "PLAYOFF_CHOKER");
    expect(pc.length).toBeGreaterThanOrEqual(1);
    expect(pc[0].memberId).toBe("m1");
  });

  it("does NOT fire for a team that won their first playoff game", () => {
    const data = makeBaseData({
      madePlayoffsMap: { m1: true, m2: false, m3: false },
      wonFirstRoundMap: { m1: true, m2: false, m3: false },
    });
    const events = detectReputationEventsForSeason(data);
    const pc = events.filter((e) => e.eventType === "PLAYOFF_CHOKER" && e.memberId === "m1");
    expect(pc).toHaveLength(0);
  });

  it("does NOT fire for a team that did not make playoffs", () => {
    const data = makeBaseData({
      madePlayoffsMap: { m1: false, m2: false, m3: false },
      wonFirstRoundMap: { m1: false, m2: false, m3: false },
    });
    const events = detectReputationEventsForSeason(data);
    const pc = events.filter((e) => e.eventType === "PLAYOFF_CHOKER");
    expect(pc).toHaveLength(0);
  });
});

// ─── detectRevengeSeeker tests ────────────────────────────────────────────────

describe("detectRevengeSeeker", () => {
  // detectRevengeSeeker takes a different shape: { season, matchups (normalizeMatchups format), teamMemberMap, memberNameMap }
  // normalizeMatchups uses homeTeamId/awayTeamId/homeTotalPoints/awayTotalPoints

  function makeRevMatchup(
    homeTeamId: number,
    awayTeamId: number,
    homeScore: number,
    awayScore: number
  ) {
    return { homeTeamId, awayTeamId, homeTotalPoints: homeScore, awayTotalPoints: awayScore };
  }

  it("fires when a manager beats their nemesis after 3+ consecutive losses", () => {
    const allSeasonData = [
      {
        season: 2021,
        matchups: [
          makeRevMatchup(2, 1, 120, 90),
          makeRevMatchup(2, 1, 115, 80),
        ] as ReturnType<typeof import("./reputationService")["detectRevengeSeeker"]> extends never ? never : Parameters<typeof import("./reputationService")["detectRevengeSeeker"]>[0][0]["matchups"],
        teamMemberMap: { 1: "m1", 2: "m2" } as Record<number, string>,
        memberNameMap: { m1: "Alice Smith", m2: "Bob Jones" },
      },
      {
        season: 2022,
        matchups: [
          makeRevMatchup(2, 1, 110, 95),
          makeRevMatchup(1, 2, 125, 100), // m1 finally beats m2
        ] as ReturnType<typeof import("./reputationService")["detectRevengeSeeker"]> extends never ? never : Parameters<typeof import("./reputationService")["detectRevengeSeeker"]>[0][0]["matchups"],
        teamMemberMap: { 1: "m1", 2: "m2" } as Record<number, string>,
        memberNameMap: { m1: "Alice Smith", m2: "Bob Jones" },
      },
    ];
    const events = detectRevengeSeeker(allSeasonData);
    const rs = events.filter((e) => e.eventType === "REVENGE_SEEKER");
    expect(rs.length).toBeGreaterThanOrEqual(1);
    expect(rs[0].memberId).toBe("m1");
  });

  it("does NOT fire when consecutive losses are fewer than 3", () => {
    const allSeasonData = [
      {
        season: 2023,
        matchups: [
          makeRevMatchup(2, 1, 110, 90),   // m1 loses
          makeRevMatchup(2, 1, 105, 95),   // m1 loses (only 2 consecutive)
          makeRevMatchup(1, 2, 120, 100),  // m1 wins — but only 2 prior losses
        ] as ReturnType<typeof import("./reputationService")["detectRevengeSeeker"]> extends never ? never : Parameters<typeof import("./reputationService")["detectRevengeSeeker"]>[0][0]["matchups"],
        teamMemberMap: { 1: "m1", 2: "m2" } as Record<number, string>,
        memberNameMap: { m1: "Alice Smith", m2: "Bob Jones" },
      },
    ];
    const events = detectRevengeSeeker(allSeasonData);
    const rs = events.filter((e) => e.eventType === "REVENGE_SEEKER");
    expect(rs).toHaveLength(0);
  });
});
