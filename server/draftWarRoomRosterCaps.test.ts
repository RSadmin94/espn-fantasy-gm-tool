import { describe, it, expect } from "vitest";
import { buildMockDraft } from "./draftWarRoomRouter";

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
