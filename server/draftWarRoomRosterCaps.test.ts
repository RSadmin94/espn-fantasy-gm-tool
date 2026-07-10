import { describe, it, expect } from "vitest";
import { buildMockDraft, evaluateRosterCompletion } from "./draftWarRoomRouter";

/**
 * Regression: the mock-draft position caps must honor each league's real starting-lineup
 * requirements (data-driven), not a hardcoded table.
 *  - IDP league (DP:1)       -> exactly 1 IDP (DP) per team, 0 team defenses
 *  - Team D/ST league (DEF:1) -> exactly 1 team defense (DEF) per team, 0 IDP
 *  - No-defense league        -> 0 DP and 0 DEF
 * Inputs are synthetic: DP + DEF sit at the top of ADP and are CRITICAL needs, so the ONLY
 * thing that can keep them off a roster is the cap derived from lineupReqs.
 */
const TEAMS = 4;
const ROUNDS = 5;

function mkPicks() {
  const picks: any[] = [];
  let overall = 1;
  for (let r = 1; r <= ROUNDS; r++) {
    for (let t = 1; t <= TEAMS; t++) {
      picks.push({ teamId: t, roundId: r, roundPick: t, overallPick: overall++, draftedForAnalytics: true });
    }
  }
  return picks;
}

function mkPool() {
  const pool: any[] = [];
  let adp = 1;
  const add = (name: string, position: string) =>
    pool.push({ name, position, adp: adp++, projectedPoints: 300 - adp, marketValue: null, espnId: `id-${name}` });
  for (let i = 1; i <= 6; i++) add(`DP${i}`, "DP");   // top ADP
  for (let i = 1; i <= 6; i++) add(`DEF${i}`, "DEF"); // next
  for (let i = 1; i <= 14; i++) add(`RB${i}`, "RB");
  for (let i = 1; i <= 14; i++) add(`WR${i}`, "WR");
  for (let i = 1; i <= 8; i++) add(`QB${i}`, "QB");
  for (let i = 1; i <= 8; i++) add(`TE${i}`, "TE");
  return pool;
}

function mkNeeds() {
  const needs = ["DP", "DEF", "RB", "WR", "QB", "TE"].map((position) => ({ position, urgency: "CRITICAL" as const }));
  return Array.from({ length: TEAMS }, (_, i) => ({ teamId: i + 1, teamName: `Team ${i + 1}`, ownerName: `Owner ${i + 1}`, needs }));
}

function countByTeam(picks: any[], positions: string[]) {
  const per: Record<number, number> = {};
  for (const p of picks) if (positions.includes(String(p.position).toUpperCase())) per[p.teamId] = (per[p.teamId] ?? 0) + 1;
  return Array.from({ length: TEAMS }, (_, i) => per[i + 1] ?? 0);
}

function run(lineupReqs: Record<string, number>) {
  return buildMockDraft({
    allPicks: mkPicks(),
    rosterNeeds: mkNeeds(),
    keeperPredictions: [],
    tradedPicks: [],
    playerPool: mkPool(),
    dpTiming: null,
    ownerDnaContext: null,
    lineupReqs,
  });
}

const DEF = ["DEF", "DST", "D/ST"];

describe("Draft War Room mock caps honor league DP/D-ST roster slots", () => {
  it("IDP league (DP:1): exactly 1 DP per team, 0 team defenses", () => {
    const picks = run({ QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1, DP: 1 });
    expect(countByTeam(picks, ["DP"])).toEqual([1, 1, 1, 1]);
    expect(countByTeam(picks, DEF)).toEqual([0, 0, 0, 0]);
  });

  it("Team D/ST league (DEF:1): exactly 1 DEF per team, 0 IDP", () => {
    const picks = run({ QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1, DEF: 1 });
    expect(countByTeam(picks, DEF)).toEqual([1, 1, 1, 1]);
    expect(countByTeam(picks, ["DP"])).toEqual([0, 0, 0, 0]);
  });

  it("No-defense league (no DP/DEF requirement): 0 DP and 0 DEF", () => {
    const picks = run({ QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1 });
    expect(countByTeam(picks, ["DP"])).toEqual([0, 0, 0, 0]);
    expect(countByTeam(picks, DEF)).toEqual([0, 0, 0, 0]);
  });
});

/**
 * Roster-completion guarantee: no team may finish with an unfilled required starting slot while an
 * eligible player remains available. `evaluateRosterCompletion` forces the fill only when a team's
 * remaining open picks all have to become required starters.
 */
const REQS = { QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1, DEF: 1 }; // Teco-like team-D/ST league
const pl = (name: string, position: string, adp: number) => ({ name, position, adp });

describe("evaluateRosterCompletion — required-starter guarantee", () => {
  it("one remaining pick + missing K forces K", () => {
    const counts = { QB: 1, RB: 3, WR: 4, TE: 2, DEF: 1, K: 0 }; // FLEX covered by RB/WR/TE surplus
    const undrafted = [pl("Backup WR", "WR", 120), pl("Some Kicker", "K", 180)];
    const res = evaluateRosterCompletion({ counts, lineupReqs: REQS, undrafted, remainingOpenPicks: 1 });
    expect(res).not.toBeNull();
    expect(res!.position).toBe("K");
    expect(res!.player.name).toBe("Some Kicker");
  });

  it("two remaining picks + missing K and DEF fill both (over two calls)", () => {
    const counts: Record<string, number> = { QB: 1, RB: 3, WR: 4, TE: 2, DEF: 0, K: 0 };
    let undrafted = [pl("Bench RB", "RB", 100), pl("Team DEF", "DEF", 150), pl("Some Kicker", "K", 180)];
    const r1 = evaluateRosterCompletion({ counts, lineupReqs: REQS, undrafted, remainingOpenPicks: 2 });
    expect(r1).not.toBeNull();
    counts[r1!.position] = (counts[r1!.position] ?? 0) + 1;
    undrafted = undrafted.filter((p) => p.name !== r1!.player.name);
    const r2 = evaluateRosterCompletion({ counts, lineupReqs: REQS, undrafted, remainingOpenPicks: 1 });
    expect(r2).not.toBeNull();
    const filled = new Set([r1!.position, r2!.position]);
    expect(filled.has("K")).toBe(true);
    expect(filled.has("DEF")).toBe(true);
  });

  it("already-complete starters do not trigger the guarantee", () => {
    const counts = { QB: 1, RB: 3, WR: 4, TE: 2, DEF: 1, K: 1 }; // all required starters + FLEX satisfied
    const undrafted = [pl("Best RB", "RB", 5)];
    expect(evaluateRosterCompletion({ counts, lineupReqs: REQS, undrafted, remainingOpenPicks: 3 })).toBeNull();
  });

  it("unavailable required position fails honestly (no fake, no corruption)", () => {
    const counts = { QB: 1, RB: 3, WR: 4, TE: 2, DEF: 1, K: 0 }; // missing K
    const undrafted = [pl("Only an RB", "RB", 50)]; // no kicker available
    expect(evaluateRosterCompletion({ counts, lineupReqs: REQS, undrafted, remainingOpenPicks: 1 })).toBeNull();
  });

  it("does not trigger while a team still has spare picks (deficit < remaining)", () => {
    const counts = { QB: 1, RB: 3, WR: 4, TE: 2, DEF: 1, K: 0 }; // only K missing (deficit 1)
    const undrafted = [pl("Some Kicker", "K", 180)];
    expect(evaluateRosterCompletion({ counts, lineupReqs: REQS, undrafted, remainingOpenPicks: 3 })).toBeNull();
  });
});
