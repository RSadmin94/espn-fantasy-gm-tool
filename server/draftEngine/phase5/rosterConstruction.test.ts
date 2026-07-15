import { describe, expect, it } from "vitest";
import { league457622RosterRules } from "./leagueRosterRules";
import {
  addToRoster,
  assessRosterLegality,
  augmentPoolWithRosterFillers,
  canFieldSkillLineup,
  emptyRosterCounts,
  inSlotCompletionWindow,
  isPositionBlocked,
  isPositionSaturatedForDraft,
  mustForceFillThisPick,
  rosterSaturationPenalty,
  unfilledRequiredSlots,
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

  it("forces DP fill in late completion window like K", () => {
    const roster = { QB: 1, RB: 2, WR: 3, TE: 1, K: 0, DP: 0 };
    const poolHas = { QB: true, K: true, DP: true };
    expect(unfilledRequiredSlots(roster, rules, poolHas)).toEqual(["K", "DP"]);
    expect(
      inSlotCompletionWindow({
        ownerPicksRemaining: 5,
        round: 10,
        totalRounds: 16,
        unfilled: ["K", "DP"],
      }),
    ).toBe(true);
    expect(
      mustForceFillThisPick({
        roster,
        rules,
        poolHas,
        ownerPicksRemaining: 5,
        round: 10,
        totalRounds: 16,
      }),
    ).toBe("DP");
    expect(
      mustForceFillThisPick({
        roster: { ...roster, DP: 1 },
        rules,
        poolHas,
        ownerPicksRemaining: 4,
        round: 11,
        totalRounds: 16,
      }),
    ).toBe("K");
  });

  it("does not force DP before completion window", () => {
    const roster = { QB: 1, RB: 2, WR: 2, TE: 1, DP: 0 };
    expect(
      mustForceFillThisPick({
        roster,
        rules,
        poolHas: { DP: true },
        ownerPicksRemaining: 10,
        round: 7,
        totalRounds: 16,
      }),
    ).toBeNull();
  });

  it("blocks second TE and second DP after starter slot filled", () => {
    expect(isPositionSaturatedForDraft("TE", 1, rules)).toBe(true);
    expect(isPositionSaturatedForDraft("DP", 1, rules)).toBe(true);
    expect(isPositionSaturatedForDraft("K", 1, rules)).toBe(true);
  });

  it("adds per-team K/DP filler copies so late rounds can complete", () => {
    const skill: SimPlayer[] = [
      { playerName: "Skill RB", position: "RB", playerKey: "skill rb", valueScore: 50, tier: "T3" },
    ];
    const { pool, poolHas } = augmentPoolWithRosterFillers({
      skillPool: skill,
      teamCount: 3,
      draftPicks: [
        { playerName: "Kicker A", position: "K", overallPick: 150, round: 13, roundPick: 1, season: 2025 },
        { playerName: "IDP One", position: "LB", overallPick: 151, round: 13, roundPick: 2, season: 2025 },
      ],
    });
    expect(poolHas.K).toBe(true);
    expect(poolHas.DP).toBe(true);
    expect(pool.filter((p) => p.position === "K").length).toBe(3);
    expect(pool.filter((p) => p.position === "DP").length).toBe(3);
  });
});
