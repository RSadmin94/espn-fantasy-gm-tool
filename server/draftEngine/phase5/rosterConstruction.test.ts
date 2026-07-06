import { describe, expect, it } from "vitest";
import { league457622RosterRules } from "./leagueRosterRules";
import {
  addToRoster,
  assessRosterLegality,
  canFieldSkillLineup,
  emptyRosterCounts,
  isPositionBlocked,
  rosterSaturationPenalty,
} from "./rosterConstruction";
import type { SimPlayer } from "./weather";

const rules = league457622RosterRules();

describe("rosterConstruction", () => {
  it("blocks third TE at hard cap", () => {
    expect(isPositionBlocked("TE", 2, rules)).toBe(true);
    expect(isPositionBlocked("TE", 1, rules)).toBe(false);
  });

  it("applies sharp TE saturation after starter filled", () => {
    expect(rosterSaturationPenalty("TE", 0, rules)).toBe(0);
    expect(rosterSaturationPenalty("TE", 1, rules)).toBeLessThan(-3);
  });

  it("validates skill lineup minimums", () => {
    let r = emptyRosterCounts();
    expect(canFieldSkillLineup(r, rules).legal).toBe(false);
    r = { QB: 1, RB: 2, WR: 3, TE: 1 };
    expect(canFieldSkillLineup(r, rules).legal).toBe(true);
  });

  it("reports honest legality when K/DP not in pool", () => {
    const r = { QB: 1, RB: 2, WR: 3, TE: 1 };
    const report = assessRosterLegality({ roster: r, rules, poolHas: { K: false, DP: false } });
    expect(report.skillLineupLegal).toBe(true);
    expect(report.honestSummary).toContain("partial");
  });

  it("tracks roster counts through picks", () => {
    const player: SimPlayer = {
      playerName: "Test TE",
      position: "TE",
      playerKey: "test te",
      valueScore: 50,
      tier: "T3",
    };
    const next = addToRoster(emptyRosterCounts(), player);
    expect(next.TE).toBe(1);
  });
});
