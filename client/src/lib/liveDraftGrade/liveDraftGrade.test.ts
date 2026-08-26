import { describe, expect, it } from "vitest";
import { computeLeagueGrades } from "./computeLeagueGrades";
import { createGradeConfig, DEFAULT_GRADE_CONFIG } from "./gradeConfig";
import { buildFormatProfile } from "./formatProfile";
import { scorePickOpportunityCost, opportunityUrgency } from "./opportunityCost";
import { scorePickValue } from "./pillars";
import { interpolateWeights } from "./weights";
import type { GradePick } from "./types";

const oneQbProfile = buildFormatProfile({
  leagueId: "test",
  lineupReqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 0, DP: 0 },
  softCap: { QB: 2, RB: 5, WR: 6, TE: 2, K: 1 },
  hardCap: { QB: 3, RB: 6, WR: 7, TE: 2, K: 1, DEF: 0, DP: 0 },
  superflexSlots: 0,
});

const sfProfile = buildFormatProfile({
  leagueId: "sf",
  lineupReqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1 },
  softCap: { QB: 3, RB: 5, WR: 6, TE: 2, K: 1 },
  hardCap: { QB: 4, RB: 6, WR: 7, TE: 2, K: 1 },
  superflexSlots: 1,
});

describe("GradeConfig", () => {
  it("exposes every tuning constant in one object", () => {
    expect(DEFAULT_GRADE_CONFIG.opportunityCost.maxPerPick).toBe(18);
    expect(DEFAULT_GRADE_CONFIG.opportunityCost.teamCap).toBe(35);
    expect(DEFAULT_GRADE_CONFIG.lineup.starterWeight).toBe(0.72);
    expect(DEFAULT_GRADE_CONFIG.smoothing.emaPrevWeight).toBe(0.6);
    expect(DEFAULT_GRADE_CONFIG.floors.activateProgress).toBe(0.7);
  });

  it("createGradeConfig merges overrides", () => {
    const cfg = createGradeConfig({ opportunityCost: { maxPerPick: 12 } });
    expect(cfg.opportunityCost.maxPerPick).toBe(12);
    expect(cfg.opportunityCost.teamCap).toBe(35);
  });
});

describe("AC — Pick Value", () => {
  const cfg = createGradeConfig();
  it("AC-P1: Δ=+25 → 100; Δ=-25 → 0; Δ=0 → 50", () => {
    expect(scorePickValue([{ pickNumber: 50, adp: 25, position: "WR" }], cfg).pickValue).toBe(100);
    expect(scorePickValue([{ pickNumber: 25, adp: 50, position: "WR" }], cfg).pickValue).toBe(0);
    expect(scorePickValue([{ pickNumber: 40, adp: 40, position: "WR" }], cfg).pickValue).toBe(50);
  });
  it("AC-P2: no ADP → emptyDefault", () => {
    expect(scorePickValue([{ pickNumber: 1, position: "RB" }], cfg).pickValue).toBe(50);
  });
});

describe("AC — Phases & weights", () => {
  const cfg = createGradeConfig();
  it("AC-W1 anchors", () => {
    expect(interpolateWeights(0, cfg)).toMatchObject({ value: 55, talent: 30, construction: 10, lineup: 5 });
    expect(interpolateWeights(0.25, cfg)).toMatchObject({ value: 30, talent: 25, construction: 30, lineup: 15 });
    expect(interpolateWeights(0.75, cfg)).toMatchObject({ value: 10, talent: 15, construction: 40, lineup: 35 });
  });
  it("AC-W2 midpoint early→mid", () => {
    const w = interpolateWeights(0.125, cfg);
    expect(w.value).toBeCloseTo(42.5, 5);
    expect(w.talent).toBeCloseTo(27.5, 5);
    expect(w.construction).toBeCloseTo(20, 5);
    expect(w.lineup).toBeCloseTo(10, 5);
    expect(w.value + w.talent + w.construction + w.lineup).toBeCloseTo(100, 5);
  });
});

describe("AC — Opportunity Cost", () => {
  const cfg = createGradeConfig();
  it("AC-O1: fill top need → OC 0", () => {
    const oc = scorePickOpportunityCost({
      pick: { pickNumber: 20, position: "WR", name: "A" },
      countsBefore: { QB: 1, RB: 2, WR: 1, TE: 1, FLEX: 0, K: 0, DEF: 0, DP: 0 },
      profile: oneQbProfile,
      progress: 0.4,
      cfg,
      startersAlreadyFilled: false,
    });
    expect(oc).toBe(0);
  });

  it("AC-O2: 1QB QB3 vs WR2 open hits maxPerPick at mid urgency", () => {
    const progress = 0.42;
    const urgency = opportunityUrgency(progress, cfg);
    expect(urgency).toBeGreaterThan(0.6);
    const oc = scorePickOpportunityCost({
      pick: { pickNumber: 42, position: "QB", name: "QB3" },
      countsBefore: { QB: 2, RB: 2, WR: 1, TE: 1, FLEX: 0, K: 0, DEF: 0, DP: 0 },
      profile: oneQbProfile,
      progress,
      cfg,
      startersAlreadyFilled: false,
    });
    expect(oc).toBe(cfg.opportunityCost.maxPerPick);
  });

  it("AC-O3: Superflex with SF unfilled → QB OC 0", () => {
    const oc = scorePickOpportunityCost({
      pick: { pickNumber: 15, position: "QB" },
      countsBefore: { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 0, K: 0, DEF: 0, DP: 0 },
      profile: sfProfile,
      progress: 0.2,
      cfg,
      startersAlreadyFilled: false,
    });
    expect(oc).toBe(0);
  });
});

describe("AC — FormatProfile", () => {
  it("AC-F1: superflexSlots → qbMode superflex", () => {
    expect(sfProfile.qbMode).toBe("superflex");
  });
  it("AC-F2: two QB starters → two_qb", () => {
    const p = buildFormatProfile({
      lineupReqs: { QB: 2, RB: 2, WR: 2, TE: 1, FLEX: 1 },
      hardCap: { QB: 4 },
      softCap: { QB: 3 },
      superflexSlots: 0,
    });
    expect(p.qbMode).toBe("two_qb");
  });
});

describe("computeLeagueGrades — persist + reasons", () => {
  it("persists component scores and emits change reasons", () => {
    const teams = new Map<number, GradePick[]>();
    const mk = (tid: number, picks: GradePick[]) => teams.set(tid, picks);

    // Team 1: balanced
    mk(1, [
      { pickNumber: 1, position: "RB", adp: 3, marketValue: 90 },
      { pickNumber: 24, position: "WR", adp: 22, marketValue: 80 },
      { pickNumber: 25, position: "WR", adp: 30, marketValue: 75 },
      { pickNumber: 48, position: "RB", adp: 45, marketValue: 70 },
    ]);
    // Team 2: QB heavy
    mk(2, [
      { pickNumber: 2, position: "QB", adp: 15, marketValue: 85 },
      { pickNumber: 23, position: "QB", adp: 40, marketValue: 70 },
      { pickNumber: 26, position: "RB", adp: 28, marketValue: 72 },
      { pickNumber: 47, position: "QB", adp: 60, marketValue: 65 },
    ]);
    // Fill other teams so peer curve has mass
    for (let tid = 3; tid <= 8; tid++) {
      mk(tid, [
        { pickNumber: tid, position: "RB", adp: tid + 5, marketValue: 70 },
        { pickNumber: 20 + tid, position: "WR", adp: 25 + tid, marketValue: 68 },
        { pickNumber: 40 + tid, position: "TE", adp: 50 + tid, marketValue: 60 },
      ]);
    }

    const first = computeLeagueGrades({
      rostersByTeam: teams,
      profile: oneQbProfile,
      lastLockedOverallPick: 26,
      totalNonKeeperPicks: 140,
    });
    const t2a = first.byTeam.get(2)!;
    expect(t2a.pickValue).toBeGreaterThan(0);
    expect(t2a.talent).toBeGreaterThan(0);
    expect(t2a.construction).toBeLessThan(100);
    expect(first.historyByTeam.get(2)?.length).toBeGreaterThanOrEqual(1);

    // Advance: team 2 takes another QB while WR open
    teams.set(2, [
      ...teams.get(2)!,
      { pickNumber: 50, position: "QB", adp: 80, marketValue: 55 },
    ]);
    const second = computeLeagueGrades({
      rostersByTeam: teams,
      profile: oneQbProfile,
      lastLockedOverallPick: 50,
      totalNonKeeperPicks: 140,
      previous: first,
    });
    const t2b = second.byTeam.get(2)!;
    expect(t2b.lastPickOc).toBeGreaterThan(0);
    expect(t2b.opportunityCost).toBeGreaterThanOrEqual(t2a.opportunityCost);
    expect(second.historyByTeam.get(2)!.length).toBeGreaterThanOrEqual(2);
    expect(t2b.lastChange?.reasons.length).toBeGreaterThan(0);
    expect(
      t2b.lastChange?.reasons.some(
        (r) => /QB|quarterback|Opportunity Cost|Construction|need/i.test(r),
      ),
    ).toBe(true);
  });

  it("AC-E3: strong ADP value with bad OC can lower smoothed score", () => {
    const balanced = new Map<number, GradePick[]>();
    for (let tid = 1; tid <= 6; tid++) {
      balanced.set(tid, [
        { pickNumber: tid, position: "RB", adp: tid + 2, marketValue: 80 },
        { pickNumber: 12 + tid, position: "WR", adp:14 + tid, marketValue: 75 },
        { pickNumber: 24 + tid, position: "WR", adp: 30 + tid, marketValue: 70 },
      ]);
    }
    const before = computeLeagueGrades({
      rostersByTeam: balanced,
      profile: oneQbProfile,
      lastLockedOverallPick: 30,
      totalNonKeeperPicks: 120,
    });
    // Team 1: add steal QB3 while WR/FLEX still needed
    balanced.set(1, [
      ...balanced.get(1)!,
      { pickNumber: 31, position: "QB", adp: 55, marketValue: 78 },
      { pickNumber: 5, position: "QB", adp: 20, marketValue: 88 },
      { pickNumber: 18, position: "QB", adp: 35, marketValue: 80 },
    ]);
    // Fix chronological: rebuild team 1 as QB stack with a steal later
    balanced.set(1, [
      { pickNumber: 1, position: "QB", adp: 12, marketValue: 90 },
      { pickNumber: 13, position: "QB", adp: 30, marketValue: 80 },
      { pickNumber: 25, position: "RB", adp: 28, marketValue: 75 },
      { pickNumber: 37, position: "QB", adp: 60, marketValue: 70 }, // +23 ADP steal but 3rd QB
    ]);
    const after = computeLeagueGrades({
      rostersByTeam: balanced,
      profile: oneQbProfile,
      lastLockedOverallPick: 37,
      totalNonKeeperPicks: 120,
      previous: before,
    });
    const snap = after.byTeam.get(1)!;
    // Late QB “steal” helps average ADP math less than OC+construction hurt management score
    expect(snap.opportunityCost).toBeGreaterThan(10);
    expect(snap.construction).toBeLessThan(90);
    expect(snap.rawScore - snap.opportunityCost).toBeLessThan(snap.rawScore);
  });
});
