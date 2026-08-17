/**
 * RFSN-055 — Deterministic Draft Intelligence Authority.
 */
import { describe, expect, it } from "vitest";
import {
  computeDraftIntelligence,
  computeReachDelta,
  coverageYears,
  draftIntelligenceNeedsAdp,
  isUsableAdp,
  scoreDraftPicks,
  type DraftPickEvidence,
} from "./draftIntelligence";
import {
  attachSameSeasonAdp,
  resolveEspnPlayerIdFromRawPick,
  selectDraftIntelligenceTool,
} from "./draftIntelligenceTool";

function pick(over: Partial<DraftPickEvidence> & Pick<DraftPickEvidence, "season" | "overallPick" | "ownerName">): DraftPickEvidence {
  return {
    round: Math.ceil(over.overallPick / 12),
    teamId: 1,
    playerName: over.playerName ?? "Player",
    position: over.position ?? "RB",
    numberOfTeams: 12,
    ...over,
  };
}

const BOARD: DraftPickEvidence[] = [
  pick({ season: 2010, overallPick: 1, ownerName: "Demetri Clark", playerName: "A", playerId: 1, position: "RB" }),
  pick({ season: 2010, overallPick: 13, ownerName: "Rod Sellers", playerName: "B", playerId: 2, position: "QB", round: 2 }),
  pick({
    season: 2025,
    overallPick: 12,
    ownerName: "Demetri Clark",
    playerName: "Chase",
    playerId: 101,
    position: "WR",
    adp: 28,
    round: 1,
  }),
  pick({
    season: 2025,
    overallPick: 36,
    ownerName: "Rod Sellers",
    playerName: "Barkley",
    playerId: 102,
    position: "RB",
    adp: 8,
    round: 3,
  }),
  pick({
    season: 2025,
    overallPick: 3,
    ownerName: "LOZELL",
    playerName: "Daniels",
    playerId: 103,
    position: "QB",
    adp: 24,
    round: 1,
  }),
  pick({
    season: 2025,
    overallPick: 25,
    ownerName: "LOZELL",
    playerName: "Rookie WR",
    playerId: 200,
    position: "WR",
    adp: 40,
    round: 3,
  }),
  pick({
    season: 2024,
    overallPick: 14,
    ownerName: "Bruce Edwards",
    playerName: "Old WR",
    playerId: 200,
    position: "WR",
    adp: 20,
    round: 2,
  }),
];

describe("RFSN-055 same-season ADP join", () => {
  it("recovers ESPN playerId from rawPick when the column is empty", () => {
    expect(resolveEspnPlayerIdFromRawPick(JSON.stringify({ playerId: 4362628 }), null)).toBe(4362628);
    expect(resolveEspnPlayerIdFromRawPick("{}", 3117251)).toBe(3117251);
    expect(resolveEspnPlayerIdFromRawPick("{}", 0)).toBeNull();
    expect(resolveEspnPlayerIdFromRawPick(null, null)).toBeNull();
  });

  it("never applies another season's ADP map", () => {
    const picks: DraftPickEvidence[] = [
      pick({ season: 2025, overallPick: 1, ownerName: "Rod", playerId: 101, playerName: "Chase" }),
    ];
    const adp2026 = new Map([["101", 12]]);
    const joined = attachSameSeasonAdp(picks, new Map([[2026, adp2026]]));
    expect(joined[0]?.adp).toBeNull();
    const same = attachSameSeasonAdp(picks, new Map([[2025, adp2026]]));
    expect(same[0]?.adp).toBe(12);
  });
});

describe("RFSN-055 reach convention", () => {
  it("uses ADP − actual pick (positive = reach)", () => {
    expect(computeReachDelta(12, 28)).toBe(16);
    expect(computeReachDelta(36, 8)).toBe(-28);
  });

  it("rejects undrafted-sentinel ADP", () => {
    expect(isUsableAdp(170)).toBe(false);
    expect(isUsableAdp(28)).toBe(true);
    expect(isUsableAdp(null)).toBe(false);
  });
});

describe("selectDraftIntelligenceTool", () => {
  it("routes the required founder prompts", () => {
    expect(selectDraftIntelligenceTool("Who reaches the most?")?.query.metric).toBe("reach_frequency");
    expect(selectDraftIntelligenceTool("What was the biggest reach ever?")?.query.metric).toBe(
      "largest_single_reach",
    );
    expect(selectDraftIntelligenceTool("Biggest reach?")?.query.metric).toBe("largest_single_reach");
    expect(selectDraftIntelligenceTool("What was the biggest steal?")?.query.metric).toBe("biggest_steals");
    expect(selectDraftIntelligenceTool("Biggest steal?")?.query.metric).toBe("biggest_steals");
    expect(selectDraftIntelligenceTool("Who drafts QBs early?")?.query).toMatchObject({
      metric: "qb_timing",
      timingDirection: "early",
    });
    expect(selectDraftIntelligenceTool("Who drafts quarterbacks early?")?.query).toMatchObject({
      metric: "qb_timing",
      timingDirection: "early",
    });
    expect(selectDraftIntelligenceTool("Who waits on QB?")?.query).toMatchObject({
      metric: "qb_timing",
      timingDirection: "late",
    });
    expect(selectDraftIntelligenceTool("Who always waits on QB?")?.query).toMatchObject({
      metric: "qb_timing",
      timingDirection: "late",
    });
    expect(selectDraftIntelligenceTool("Who reached the most in 2010?")?.query).toMatchObject({
      metric: "reach_frequency",
      seasonFrom: 2010,
      seasonTo: 2010,
    });
    expect(selectDraftIntelligenceTool("Who always drafts rookies?")?.query.metric).toBe("rookie_preference");
    expect(selectDraftIntelligenceTool("Who loves RBs?")?.query).toMatchObject({
      metric: "rb_timing",
      timingDirection: "early",
    });
    expect(selectDraftIntelligenceTool("Who drafts safest?")?.query).toMatchObject({
      metric: "draft_aggression",
      aggressionMode: "safest",
    });
    expect(selectDraftIntelligenceTool("Who gambles the most?")?.query).toMatchObject({
      metric: "draft_aggression",
      aggressionMode: "gambles",
    });
    expect(selectDraftIntelligenceTool("Who drafts running backs early?")?.query).toMatchObject({
      metric: "rb_timing",
      timingDirection: "early",
    });
    expect(selectDraftIntelligenceTool("Who drafts wide receivers early?")?.query).toMatchObject({
      metric: "wr_timing",
      timingDirection: "early",
    });
    expect(selectDraftIntelligenceTool("Who waits on quarterback?")?.query).toMatchObject({
      metric: "qb_timing",
      timingDirection: "late",
    });
    expect(selectDraftIntelligenceTool("Who follows ADP the closest?")?.query.metric).toBe("adp_follow");
    expect(selectDraftIntelligenceTool("Who ignores ADP the most?")?.query.metric).toBe("adp_ignore");
    expect(selectDraftIntelligenceTool("and who waits on quarterback?")?.query.metric).toBe("qb_timing");
  });

  it("does not treat coaching as draft intelligence", () => {
    expect(selectDraftIntelligenceTool("Should I draft Chase this week?")).toBeNull();
    expect(selectDraftIntelligenceTool("Who should I start?")).toBeNull();
  });
});

describe("computeDraftIntelligence", () => {
  it("ranks largest reach from ADP-joined seasons only", () => {
    const r = computeDraftIntelligence(BOARD, { metric: "largest_single_reach" });
    expect(r.noAdp).toBe(false);
    expect(r.adpFrom).toBe(2024);
    expect(r.adpTo).toBe(2025);
    expect(r.draftBoardFrom).toBe(2010);
    expect(r.largestReach?.playerName).toBe("Daniels");
    expect(r.largestReach?.reachDelta).toBe(21);
    expect(r.formattedAnswer).toMatch(/Daniels/);
    expect(r.formattedAnswer).toMatch(/Draft reach data is available from 2024–2025/);
    expect(r.formattedAnswer).toMatch(/earlier draft boards \(2010–2025\) are preserved without reliable ADP/);
    expect(r.formattedAnswer).not.toMatch(/lacks draft strategy/i);
  });

  it("returns coverage years when ADP is missing instead of lacking strategy", () => {
    const boardOnly = BOARD.map((p) => ({ ...p, adp: null }));
    const r = computeDraftIntelligence(boardOnly, { metric: "reach_frequency" });
    expect(r.noAdp).toBe(true);
    expect(r.formattedAnswer).toMatch(/2010–2025/);
    expect(r.formattedAnswer).toMatch(/ADP is not available/);
    expect(r.formattedAnswer).not.toMatch(/lacks draft strategy/i);
    expect(r.formattedAnswer).not.toMatch(/does not have recorded draft strategy/i);
  });

  it("scopes a thin old season to coverage years, not a fake strategy gap", () => {
    const r = computeDraftIntelligence(BOARD, {
      metric: "reach_frequency",
      seasonFrom: 2010,
      seasonTo: 2010,
    });
    expect(r.noAdp).toBe(true);
    expect(r.draftBoardFrom).toBe(2010);
    expect(r.formattedAnswer).toMatch(/2010/);
    expect(r.formattedAnswer).toMatch(/ADP is not available/);
    expect(r.formattedAnswer).not.toMatch(/lacks draft strategy/i);
  });

  it("answers QB wait / RB early from the draft board without ADP", () => {
    const boardOnly = BOARD.map((p) => ({ ...p, adp: null }));
    const qb = computeDraftIntelligence(boardOnly, { metric: "qb_timing", timingDirection: "late" });
    expect(qb.noAdp).toBe(false);
    expect(qb.formattedAnswer).toMatch(/Rod Sellers/);
    expect(qb.formattedAnswer).toMatch(/2010–2025/);

    const rb = computeDraftIntelligence(boardOnly, { metric: "rb_timing", timingDirection: "early" });
    expect(rb.formattedAnswer).toMatch(/Demetri Clark|Rod Sellers/);
    expect(rb.formattedAnswer).not.toMatch(/loves RBs/i);
  });

  it("counts first-time draftees in this league, not invented rookies", () => {
    const r = computeDraftIntelligence(BOARD, { metric: "rookie_preference" });
    const lozell = r.rookieOwners.find((o) => o.ownerName === "LOZELL");
    expect(lozell?.rookiePicks).toBeGreaterThan(0);
    expect(r.formattedAnswer).toMatch(/first-time draftees/i);
    expect(r.formattedAnswer).toMatch(/NFL debut year is not stored/);
  });

  it("scores steal as pick − ADP", () => {
    const scored = scoreDraftPicks(BOARD);
    const barkley = scored.find((p) => p.playerName === "Barkley");
    expect(barkley?.stealDelta).toBe(28);
    expect(barkley?.reachDelta).toBe(-28);
    const steals = computeDraftIntelligence(BOARD, { metric: "biggest_steals" });
    expect(steals.topSteals[0]?.playerName).toBe("Barkley");
  });

  it("compares named owners without inventing a personality", () => {
    const r = computeDraftIntelligence(BOARD, {
      metric: "reach_frequency",
      ownerNames: ["Demetri Clark", "LOZELL"],
    });
    expect(r.ownerReach.map((o) => o.ownerName).sort()).toEqual(["Demetri Clark", "LOZELL"]);
    expect(r.formattedAnswer).toMatch(/Demetri Clark|LOZELL/);
    expect(r.formattedAnswer).not.toMatch(/gambler|madman|reckless/i);
  });

  it("ranks safest vs gamblers from average reach", () => {
    const safe = computeDraftIntelligence(BOARD, { metric: "draft_aggression", aggressionMode: "safest" });
    const gamble = computeDraftIntelligence(BOARD, { metric: "draft_aggression", aggressionMode: "gambles" });
    expect(safe.formattedAnswer).toMatch(/safest/);
    expect(gamble.formattedAnswer).toMatch(/aggressive/);
    expect(draftIntelligenceNeedsAdp("draft_aggression")).toBe(true);
    expect(draftIntelligenceNeedsAdp("qb_timing")).toBe(false);
  });

  it("coverageYears formats single and range", () => {
    expect(coverageYears(2025, 2025)).toBe("2025");
    expect(coverageYears(2010, 2025)).toBe("2010–2025");
  });

  it("ranks closest vs farthest from ADP without inventing a personality", () => {
    const follow = computeDraftIntelligence(BOARD, { metric: "adp_follow" });
    const ignore = computeDraftIntelligence(BOARD, { metric: "adp_ignore" });
    expect(follow.formattedAnswer).toMatch(/closest to ADP/i);
    expect(ignore.formattedAnswer).toMatch(/farthest from ADP/i);
    expect(follow.ownerReach.some((r) => r.avgAbsDelta != null)).toBe(true);
    expect(follow.formattedAnswer).not.toMatch(/personality|gambler|madman/i);
    expect(draftIntelligenceNeedsAdp("adp_follow")).toBe(true);
    expect(draftIntelligenceNeedsAdp("adp_ignore")).toBe(true);
  });
});
