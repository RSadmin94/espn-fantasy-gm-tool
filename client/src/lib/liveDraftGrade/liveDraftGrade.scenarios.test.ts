/**
 * Deterministic behavior gates for progressive live draft grading.
 */
import { describe, expect, it } from "vitest";
import { computeLeagueGrades } from "./computeLeagueGrades";
import { createGradeConfig } from "./gradeConfig";
import { buildFormatProfile } from "./formatProfile";
import { scoreCeiling } from "./floors";
import { countRoster } from "./rosterMath";
import type { FormatProfile, GradePick, LeagueGradeState, TeamGradeSnapshot } from "./types";

const TOTAL = 196; // 14 teams × 14 rounds

const oneQb = buildFormatProfile({
  leagueId: "1qb",
  lineupReqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 0, DP: 0 },
  softCap: { QB: 2, RB: 5, WR: 6, TE: 2, K: 1 },
  hardCap: { QB: 3, RB: 6, WR: 7, TE: 2, K: 1, DEF: 0, DP: 0 },
  superflexSlots: 0,
});

const superflex = buildFormatProfile({
  leagueId: "sf",
  lineupReqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1 },
  softCap: { QB: 3, RB: 5, WR: 6, TE: 2, K: 1 },
  hardCap: { QB: 4, RB: 6, WR: 7, TE: 2, K: 1 },
  superflexSlots: 1,
});

const twoQb = buildFormatProfile({
  leagueId: "2qb",
  lineupReqs: { QB: 2, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1 },
  softCap: { QB: 3, RB: 5, WR: 6, TE: 2, K: 1 },
  hardCap: { QB: 4, RB: 6, WR: 7, TE: 2, K: 1 },
  superflexSlots: 0,
});

function pick(
  pickNumber: number,
  position: string,
  opts: { adp?: number; mv?: number; name?: string } = {},
): GradePick {
  const adp = opts.adp ?? pickNumber;
  return {
    pickNumber,
    position,
    name: opts.name ?? `${position}-${pickNumber}`,
    adp,
    marketValue: opts.mv ?? 70,
  };
}

/** Build a filled "rest of league" so peer letters are meaningful. */
function peerTeams(
  exclude: number[],
  fill: (tid: number) => GradePick[],
): Map<number, GradePick[]> {
  const m = new Map<number, GradePick[]>();
  for (let tid = 1; tid <= 12; tid++) {
    if (exclude.includes(tid)) continue;
    m.set(tid, fill(tid));
  }
  return m;
}

function balancedRoster(seed: number): GradePick[] {
  // Complete skill starters (incl. FLEX) before first QB, then K before due.
  return [
    pick(seed, "RB", { adp: seed + 2, mv: 88 }),
    pick(seed + 12, "WR", { adp: seed + 14, mv: 84 }),
    pick(seed + 24, "WR", { adp: seed + 26, mv: 78 }),
    pick(seed + 36, "RB", { adp: seed + 38, mv: 74 }),
    pick(seed + 48, "TE", { adp: seed + 50, mv: 70 }),
    pick(seed + 60, "WR", { adp: seed + 62, mv: 68 }), // FLEX
    pick(seed + 72, "QB", { adp: seed + 70, mv: 72 }),
    pick(seed + 84, "RB", { adp: seed + 88, mv: 62 }),
    pick(seed + 96, "K", { adp: seed + 110, mv: 40 }),
    pick(seed + 108, "WR", { adp: seed + 115, mv: 55 }),
    pick(seed + 120, "TE", { adp: seed + 130, mv: 48 }),
  ];
}

function threeQbRoster(): GradePick[] {
  return [
    pick(3, "QB", { adp: 18, mv: 86, name: "QB1" }),
    pick(22, "QB", { adp: 40, mv: 78, name: "QB2" }),
    pick(27, "RB", { adp: 30, mv: 76, name: "RB1" }),
    pick(46, "QB", { adp: 70, mv: 68, name: "QB3" }), // WR2 still open
    pick(51, "WR", { adp: 48, mv: 72, name: "WR1" }),
    pick(70, "RB", { adp: 65, mv: 66, name: "RB2" }),
    pick(75, "WR", { adp: 80, mv: 60, name: "WR2" }),
    pick(94, "TE", { adp: 90, mv: 58, name: "TE1" }),
    pick(99, "WR", { adp: 105, mv: 52, name: "FLEX" }),
    pick(118, "K", { adp: 140, mv: 35, name: "K" }),
    pick(123, "RB", { adp: 125, mv: 48, name: "BN" }),
  ];
}

export type TimelineRow = {
  afterPick: number;
  pickLabel: string;
  pickValue: number;
  talent: number;
  construction: number;
  lineupDepth: number;
  opportunityCost: number;
  lastPickOc: number;
  floorCeiling: number;
  rawScore: number;
  smoothedScore: number;
  letter: string;
  reasons: string[];
};

function runTimeline(
  focusRosterSteps: GradePick[][],
  profile: FormatProfile,
  focusTeamId = 1,
): { rows: TimelineRow[]; final: TeamGradeSnapshot } {
  const cfg = createGradeConfig();
  let prev: LeagueGradeState | null = null;
  const rows: TimelineRow[] = [];

  for (const focus of focusRosterSteps) {
    const last = focus[focus.length - 1]!;
    const rosters = peerTeams([focusTeamId], (tid) =>
      balancedRoster(tid).filter((p) => p.pickNumber <= last.pickNumber),
    );
    rosters.set(focusTeamId, focus);

    const state = computeLeagueGrades({
      rostersByTeam: rosters,
      profile,
      lastLockedOverallPick: last.pickNumber,
      totalNonKeeperPicks: TOTAL,
      previous: prev,
      config: cfg,
    });
    prev = state;
    const snap = state.byTeam.get(focusTeamId)!;
    const counts = countRoster(focus, profile);
    const progress = last.pickNumber / TOTAL;
    const ceiling = scoreCeiling({ progress, counts, profile, cfg });

    rows.push({
      afterPick: last.pickNumber,
      pickLabel: `${last.position} ${last.name ?? ""}`.trim(),
      pickValue: snap.pickValue,
      talent: snap.talent,
      construction: snap.construction,
      lineupDepth: snap.lineupDepth,
      opportunityCost: snap.opportunityCost,
      lastPickOc: snap.lastPickOc,
      floorCeiling: ceiling,
      rawScore: snap.rawScore,
      smoothedScore: snap.smoothedScore,
      letter: snap.letter,
      reasons: snap.lastChange?.reasons ?? [],
    });
  }

  return { rows, final: prev!.byTeam.get(focusTeamId)! };
}

describe("behavior gates — progressive grading", () => {
  it("balanced 1QB roster can earn a strong late grade", () => {
    const steps = [1, 3, 5, 7, 9, 11].map((n) => balancedRoster(1).slice(0, n));
    const { final } = runTimeline(steps, oneQb);
    expect(final.scoredPickCount).toBeGreaterThanOrEqual(3);
    expect(final.opportunityCost).toBeLessThan(15);
    expect(final.construction).toBeGreaterThan(70);
    expect(["A", "B", "C"]).toContain(final.letter);
    expect(final.smoothedScore).toBeGreaterThan(55);
  });

  it("three-QB roster in 1QB league declines materially vs balanced peer", () => {
    // Compare at the QB3 cliff (4 picks) where OC divergence is clearest
    const qb = runTimeline([1, 2, 3, 4].map((n) => threeQbRoster().slice(0, n)), oneQb, 1);
    const bal = runTimeline([1, 2, 3, 4].map((n) => balancedRoster(1).slice(0, n)), oneQb, 1);
    expect(qb.final.opportunityCost).toBeGreaterThan(bal.final.opportunityCost);
    expect(qb.final.construction).toBeLessThan(bal.final.construction);
    expect(qb.final.smoothedScore).toBeLessThan(bal.final.smoothedScore - 5);
    const order = ["A", "B", "C", "D", "F", "—"];
    expect(order.indexOf(qb.final.letter)).toBeGreaterThan(order.indexOf(bal.final.letter));
  });

  it("three QBs are treated differently in superflex / 2QB vs 1QB", () => {
    const steps = [1, 2, 3, 4].map((n) => threeQbRoster().slice(0, n));
    const in1 = runTimeline(steps, oneQb).final;
    const inSf = runTimeline(steps, superflex).final;
    const in2 = runTimeline(steps, twoQb).final;
    expect(in1.opportunityCost).toBeGreaterThan(inSf.opportunityCost);
    expect(in1.opportunityCost).toBeGreaterThanOrEqual(in2.opportunityCost);
    expect(in1.construction).toBeLessThanOrEqual(inSf.construction);
  });

  it("QB depth while WR starter empty creates immediate OC reason", () => {
    const before = [
      pick(3, "QB", { adp: 18, mv: 86 }),
      pick(22, "QB", { adp: 40, mv: 78 }),
      pick(27, "RB", { adp: 30, mv: 76 }),
    ];
    const after = [...before, pick(46, "QB", { adp: 70, mv: 68, name: "QB3" })];
    const s0 = runTimeline([before], oneQb).final;
    const s1 = runTimeline([before, after], oneQb);
    const row = s1.rows[1]!;
    expect(row.lastPickOc).toBeGreaterThan(0);
    expect(row.opportunityCost).toBeGreaterThan(s0.opportunityCost);
    expect(row.reasons.join(" ")).toMatch(/WR|quarterback|QB|Opportunity Cost|need/i);
  });

  it("late incomplete-lineup floors activate at configured progress threshold", () => {
    const cfg = createGradeConfig();
    const incomplete: GradePick[] = [
      pick(10, "QB", { mv: 80 }),
      pick(30, "RB", { mv: 75 }),
      pick(50, "WR", { mv: 70 }),
      // missing WR2, TE, FLEX, K — late progress
      pick(130, "RB", { mv: 55 }),
    ];
    const counts = countRoster(incomplete, oneQb);
    const earlyCeil = scoreCeiling({
      progress: cfg.floors.activateProgress - 0.01,
      counts,
      profile: oneQb,
      cfg,
    });
    const lateCeil = scoreCeiling({
      progress: cfg.floors.activateProgress,
      counts,
      profile: oneQb,
      cfg,
    });
    expect(earlyCeil).toBe(100);
    expect(lateCeil).toBeLessThanOrEqual(cfg.floors.oneCoreVacancyCeiling);
  });

  it("high-value but poorly constructed roster cannot remain A/B late", () => {
    // Positive ADP deltas (steals) on QBs while starters stay empty
    const trash: GradePick[] = [
      pick(50, "QB", { adp: 25, mv: 90 }),
      pick(70, "QB", { adp: 40, mv: 85 }),
      pick(90, "QB", { adp: 55, mv: 80 }),
      pick(110, "RB", { adp: 80, mv: 75 }),
      pick(130, "WR", { adp: 100, mv: 70 }),
      pick(140, "K", { adp: 150, mv: 40 }),
      pick(150, "WR", { adp: 160, mv: 35 }),
    ];
    const steps = [3, 5, 7].map((n) => trash.slice(0, n));
    const { final } = runTimeline(steps, oneQb);
    expect(final.pickValue).toBeGreaterThan(55); // "good" ADP shopping
    expect(["C", "D", "F", "—"]).toContain(final.letter);
    expect(final.letter === "A" || final.letter === "B").toBe(false);
  });

  it("well-constructed roster with average ADP can still grade well", () => {
    const avg: GradePick[] = [
      pick(1, "RB", { adp: 1, mv: 92 }),
      pick(24, "WR", { adp: 24, mv: 82 }),
      pick(25, "WR", { adp: 25, mv: 80 }),
      pick(48, "RB", { adp: 48, mv: 74 }),
      pick(49, "TE", { adp: 49, mv: 70 }),
      pick(72, "WR", { adp: 72, mv: 66 }), // FLEX before QB
      pick(73, "QB", { adp: 73, mv: 68 }),
      pick(96, "RB", { adp: 96, mv: 60 }),
      pick(97, "K", { adp: 97, mv: 40 }),
      pick(120, "WR", { adp: 120, mv: 55 }),
    ];
    const { final } = runTimeline(
      [3, 6, 10].map((n) => avg.slice(0, n)),
      oneQb,
    );
    expect(Math.abs(final.avgDelta)).toBeLessThan(3);
    expect(final.opportunityCost).toBeLessThan(15);
    expect(["A", "B", "C"]).toContain(final.letter);
  });

  it("EMA smoothing prevents one pick from causing an unreasonable grade swing", () => {
    const cfg = createGradeConfig();
    const base = balancedRoster(2).slice(0, 5);
    const shock = [...base, pick(80, "QB", { adp: 40, mv: 50, name: "panic-QB" })];
    const t0 = runTimeline([base], oneQb);
    const t1 = computeLeagueGrades({
      rostersByTeam: (() => {
        const m = peerTeams([1], (tid) =>
          balancedRoster(tid).filter((p) => p.pickNumber <= 80),
        );
        m.set(1, shock);
        return m;
      })(),
      profile: oneQb,
      lastLockedOverallPick: 80,
      totalNonKeeperPicks: TOTAL,
      previous: {
        byTeam: new Map([[1, t0.final]]),
        historyByTeam: new Map([[1, [t0.final]]]),
        changes: [],
      },
      config: cfg,
    });
    const after = t1.byTeam.get(1)!;
    const instantOnly = after.rawScore - after.opportunityCost;
    // Smoothed must not teleport fully to the shocked instant in one step
    const jump = Math.abs(after.smoothedScore - t0.final.smoothedScore);
    const fullJump = Math.abs(instantOnly - t0.final.smoothedScore);
    expect(jump).toBeLessThanOrEqual(fullJump + 0.01);
    expect(jump).toBeLessThan(Math.max(18, fullJump * 0.85 + 1));
  });

  it("filling a need later allows a team to recover", () => {
    const damaged = [
      pick(3, "QB", { adp: 18, mv: 86 }),
      pick(22, "QB", { adp: 40, mv: 78 }),
      pick(27, "RB", { adp: 30, mv: 76 }),
      pick(46, "QB", { adp: 70, mv: 68 }),
    ];
    const recovering = [
      ...damaged,
      pick(51, "WR", { adp: 48, mv: 74 }),
      pick(70, "WR", { adp: 65, mv: 72 }),
      pick(75, "RB", { adp: 72, mv: 70 }),
      pick(94, "TE", { adp: 90, mv: 66 }),
      pick(99, "WR", { adp: 100, mv: 60 }),
    ];
    const mid = runTimeline([damaged.slice(0, 3), damaged], oneQb);
    const late = runTimeline(
      [damaged, recovering.slice(0, 6), recovering, recovering],
      oneQb,
    );
    expect(late.final.lineupDepth).toBeGreaterThan(mid.final.lineupDepth);
    expect(late.final.construction).toBeGreaterThan(mid.final.construction);
    // EMA recovery: smoothed rises across the repair arc even if still below peers
    const repairArc = runTimeline(
      [damaged, recovering.slice(0, 6), recovering],
      oneQb,
    );
    expect(repairArc.rows[2]!.smoothedScore).toBeGreaterThan(
      repairArc.rows[0]!.smoothedScore,
    );
  });
});

describe("three-QB 1QB pick-by-pick timeline", () => {
  it("emits complete grade timeline with pillars, OC, floors, scores, letter, reasons", () => {
    const roster = threeQbRoster();
    const steps = roster.map((_, i) => roster.slice(0, i + 1));
    const { rows } = runTimeline(steps, oneQb);

    expect(rows.length).toBe(roster.length);
    // Relevant cliff: QB3 pick
    const qb3 = rows.find((r) => r.pickLabel.includes("QB3"));
    expect(qb3).toBeTruthy();
    expect(qb3!.lastPickOc).toBeGreaterThan(0);
    expect(qb3!.opportunityCost).toBeGreaterThan(0);

    // Snapshot table for the gate report (stdout)
    // eslint-disable-next-line no-console
    console.log(
      "\n=== THREE-QB 1QB GRADE TIMELINE ===\n" +
        rows
          .map(
            (r) =>
              `Pick ${r.afterPick} (${r.pickLabel})\n` +
              `  P=${r.pickValue.toFixed(1)} T=${r.talent.toFixed(1)} C=${r.construction.toFixed(1)} L=${r.lineupDepth.toFixed(1)}\n` +
              `  OC=${r.opportunityCost.toFixed(1)} (last=${r.lastPickOc}) floorCeil=${r.floorCeiling}\n` +
              `  raw=${r.rawScore.toFixed(1)} smoothed=${r.smoothedScore.toFixed(1)} letter=${r.letter}\n` +
              `  reasons: ${r.reasons.length ? r.reasons.join(" | ") : "(none)"}`,
          )
          .join("\n\n"),
    );

    // Persist structured artifact for the report
    expect(rows.every((r) => Number.isFinite(r.rawScore))).toBe(true);
    expect(rows.every((r) => Number.isFinite(r.smoothedScore))).toBe(true);
  });
});

describe("tooltip / live update contracts", () => {
  it("snapshot fields required by live tooltip are always present after grade unlock", () => {
    const { final } = runTimeline(
      [3, 5, 8].map((n) => balancedRoster(1).slice(0, n)),
      oneQb,
    );
    expect(final.letter).not.toBe("—");
    for (const key of [
      "pickValue",
      "talent",
      "construction",
      "lineupDepth",
      "opportunityCost",
      "rawScore",
      "smoothedScore",
      "letter",
    ] as const) {
      expect(final[key]).toBeDefined();
    }
  });

  it("recomputes after every appended pick (live update)", () => {
    let prev: LeagueGradeState | null = null;
    const roster: GradePick[] = [];
    const scores: number[] = [];
    for (const p of balancedRoster(4).slice(0, 6)) {
      roster.push(p);
      const m = peerTeams([1], (tid) =>
        balancedRoster(tid).filter((x) => x.pickNumber <= p.pickNumber),
      );
      m.set(1, [...roster]);
      const state = computeLeagueGrades({
        rostersByTeam: m,
        profile: oneQb,
        lastLockedOverallPick: p.pickNumber,
        totalNonKeeperPicks: TOTAL,
        previous: prev,
      });
      prev = state;
      scores.push(state.byTeam.get(1)!.smoothedScore);
    }
    expect(scores.length).toBe(6);
    // Not a frozen constant across the draft
    expect(new Set(scores.map((s) => s.toFixed(2))).size).toBeGreaterThan(1);
  });
});
