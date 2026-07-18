/**
 * RFSN-014 — league format pool eligibility.
 * Bug under test: DP appears when the league does not allow it — not "DP should never appear."
 */
import { describe, expect, it } from "vitest";
import {
  draftPoolExtraPositionTabs,
  draftPoolPositionAllowList,
  isDraftPoolPositionEligible,
  PRIMARY_IDP_LINEUP_REQS,
  resolveLeagueLineupReqsForDraftPool,
  STANDARD_NON_IDP_LINEUP_REQS,
} from "./draftLeagueFormatPool";

describe("RFSN-014 draftLeagueFormatPool", () => {
  it("standard league (QB/RB/WR/TE/K/DEF): All Players allow-list; DP tab hidden", () => {
    const reqs = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
    const allow = draftPoolPositionAllowList(reqs);
    expect([...allow].sort()).toEqual(["DEF", "DST", "K", "QB", "RB", "TE", "WR"].sort());
    expect(allow.has("DP")).toBe(false);
    for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"]) {
      expect(isDraftPoolPositionEligible(pos, reqs)).toBe(true);
    }
    expect(isDraftPoolPositionEligible("DP", reqs)).toBe(false);
    expect(isDraftPoolPositionEligible("LB", reqs)).toBe(false);
    expect(isDraftPoolPositionEligible("DL", reqs)).toBe(false);
    expect(isDraftPoolPositionEligible("DB", reqs)).toBe(false);
    expect(draftPoolExtraPositionTabs(reqs)).toEqual({ showDef: true, showDp: false });
  });

  it("IDP league (DP slot): defensive players eligible; DP tab visible", () => {
    const reqs = { QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1, DP: 1 };
    expect(isDraftPoolPositionEligible("DP", reqs)).toBe(true);
    expect(isDraftPoolPositionEligible("DEF", reqs)).toBe(false);
    expect(draftPoolPositionAllowList(reqs).has("DP")).toBe(true);
    expect(draftPoolExtraPositionTabs(reqs)).toEqual({ showDef: false, showDp: true });
  });

  it("primary league 457622 is IDP — DP in All Players is correct for that league", () => {
    const reqs = resolveLeagueLineupReqsForDraftPool({ leagueId: "457622" });
    expect(reqs).toEqual(PRIMARY_IDP_LINEUP_REQS);
    expect(reqs.DP).toBe(1);
    expect(draftPoolPositionAllowList(reqs).has("DP")).toBe(true);
    expect(draftPoolExtraPositionTabs(reqs).showDp).toBe(true);
  });

  it("unknown league (no roster metadata): standard fantasy pool, no DP", () => {
    const reqs = resolveLeagueLineupReqsForDraftPool({
      leagueId: "999999",
      lineupSlotCounts: null,
    });
    expect(reqs).toEqual(STANDARD_NON_IDP_LINEUP_REQS);
    expect(reqs.DP).toBeUndefined();
    expect(draftPoolPositionAllowList(reqs).has("DP")).toBe(false);
    expect(draftPoolExtraPositionTabs(reqs)).toEqual({ showDef: true, showDp: false });
  });

  it("parsed team-D/ST slots: DEF yes, DP no", () => {
    const reqs = resolveLeagueLineupReqsForDraftPool({
      leagueId: "111",
      lineupSlotCounts: {
        "0": 1,
        "2": 2,
        "4": 2,
        "6": 1,
        "16": 1, // DST
        "17": 1, // K
        "23": 1,
      },
    });
    expect(reqs.DEF).toBe(1);
    expect(reqs.DP).toBeUndefined();
    expect(draftPoolExtraPositionTabs(reqs).showDp).toBe(false);
  });

  it("parsed IDP slot 15: DP yes", () => {
    const reqs = resolveLeagueLineupReqsForDraftPool({
      leagueId: "222",
      lineupSlotCounts: {
        "0": 1,
        "2": 1,
        "4": 2,
        "6": 1,
        "15": 1, // DP / IDP
        "17": 1,
        "23": 2,
      },
    });
    expect(reqs.DP).toBe(1);
    expect(reqs.DEF).toBeUndefined();
    expect(draftPoolExtraPositionTabs(reqs).showDp).toBe(true);
  });
});
