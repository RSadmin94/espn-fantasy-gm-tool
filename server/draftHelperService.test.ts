import { describe, it, expect } from "vitest";
import {
  scorePositionalNeed,
  calcSurvivalRisk,
  detectPositionRun,
  parsePickRecommendation,
  buildPickRecommendationPrompt,
  type RosterSlot,
  type DraftPick,
  type OwnerTendency,
} from "./draftHelperService";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRoster(positions: string[]): RosterSlot[] {
  return positions.map((position, i) => ({
    position,
    playerName: `Player ${i}`,
    round: i + 1,
  }));
}

function makePick(position: string, overall: number): DraftPick {
  return {
    overall,
    round: Math.ceil(overall / 14),
    pickInRound: ((overall - 1) % 14) + 1,
    teamId: 1,
    ownerName: "Owner",
    playerName: `Player ${overall}`,
    position,
  };
}

function makeOwnerTendency(
  teamId: number,
  predictedPositions: string[],
  nextPickOverall: number | null = 10
): OwnerTendency {
  return {
    teamId,
    ownerName: `Owner ${teamId}`,
    gmArchetype: "Balanced",
    reachPositions: [],
    valuePositions: [],
    predictedPositions,
    keeperRate: 0,
    tiltScore: 0,
    nextPickOverall,
  };
}

// ─── scorePositionalNeed ─────────────────────────────────────────────────────

describe("scorePositionalNeed", () => {
  it("marks QB as critical when roster has no QB and it's early rounds", () => {
    const roster = makeRoster(["RB", "WR", "WR"]);
    const needs = scorePositionalNeed(roster, 4, 15);
    const qb = needs.find(n => n.position === "QB");
    expect(qb).toBeDefined();
    expect(qb!.urgency).toBe("critical");
    expect(qb!.urgencyScore).toBeGreaterThanOrEqual(90);
  });

  it("marks position as low urgency when at or above ideal count", () => {
    // 4 RBs — ideal is 4
    const roster = makeRoster(["RB", "RB", "RB", "RB"]);
    const needs = scorePositionalNeed(roster, 5, 15);
    const rb = needs.find(n => n.position === "RB");
    expect(rb).toBeDefined();
    expect(rb!.urgency).toBe("low");
  });

  it("returns needs sorted by urgencyScore descending", () => {
    // Empty roster — all positions critical
    const needs = scorePositionalNeed([], 1, 15);
    for (let i = 1; i < needs.length; i++) {
      expect(needs[i - 1].urgencyScore).toBeGreaterThanOrEqual(needs[i].urgencyScore);
    }
  });

  it("normalises DST and DEF to D/ST", () => {
    const roster = makeRoster(["DST", "DEF"]);
    const needs = scorePositionalNeed(roster, 14, 15);
    const dst = needs.find(n => n.position === "D/ST");
    expect(dst).toBeDefined();
    // 2 D/ST — above ideal (1), so low urgency
    expect(dst!.urgency).toBe("low");
  });

  it("increases urgency pressure in late rounds", () => {
    // 1 WR — below ideal (4) — compare round 1 vs round 14
    const roster = makeRoster(["WR"]);
    const earlyNeeds = scorePositionalNeed(roster, 1, 15);
    const lateNeeds  = scorePositionalNeed(roster, 14, 15);
    const earlyWR = earlyNeeds.find(n => n.position === "WR")!;
    const lateWR  = lateNeeds.find(n => n.position === "WR")!;
    expect(lateWR.urgencyScore).toBeGreaterThanOrEqual(earlyWR.urgencyScore);
  });

  it("caps urgencyScore at 100", () => {
    const needs = scorePositionalNeed([], 1, 15);
    for (const n of needs) {
      expect(n.urgencyScore).toBeLessThanOrEqual(100);
    }
  });
});

// ─── calcSurvivalRisk ────────────────────────────────────────────────────────

describe("calcSurvivalRisk", () => {
  it("returns 0 when Rod picks next (picksUntilRodNext = 0)", () => {
    expect(calcSurvivalRisk(5, 0, [], "RB")).toBe(0);
  });

  it("returns higher risk for a top-ranked player with many picks until Rod", () => {
    // ECR rank 1 with 10 picks until Rod — high chance someone takes him
    const risk = calcSurvivalRisk(1, 10, [], "RB");
    expect(risk).toBeGreaterThan(0.5);
  });

  it("returns lower risk for a low-ranked player with few picks until Rod", () => {
    // ECR rank 200 with 2 picks until Rod — unlikely to be taken
    const risk = calcSurvivalRisk(200, 2, [], "WR");
    expect(risk).toBeLessThan(0.1);
  });

  it("increases risk when multiple owners are targeting the same position", () => {
    const noTargeters  = [makeOwnerTendency(1, ["QB"])];
    const twoTargeters = [
      makeOwnerTendency(1, ["RB"]),
      makeOwnerTendency(2, ["RB"]),
      makeOwnerTendency(3, ["RB"]),
    ];
    const riskLow  = calcSurvivalRisk(20, 5, noTargeters,  "RB");
    const riskHigh = calcSurvivalRisk(20, 5, twoTargeters, "RB");
    expect(riskHigh).toBeGreaterThan(riskLow);
  });

  it("caps survival risk at 0.99", () => {
    // Worst case: ECR rank 1, 100 picks until Rod, 10 RB-hungry owners
    const owners = Array.from({ length: 10 }, (_, i) => makeOwnerTendency(i, ["RB"]));
    const risk = calcSurvivalRisk(1, 100, owners, "RB");
    expect(risk).toBeLessThanOrEqual(0.99);
  });
});

// ─── detectPositionRun ───────────────────────────────────────────────────────

describe("detectPositionRun", () => {
  it("returns null when no position run is detected", () => {
    const picks = [
      makePick("QB", 1),
      makePick("RB", 2),
      makePick("WR", 3),
      makePick("TE", 4),
    ];
    expect(detectPositionRun(picks)).toBeNull();
  });

  it("detects a run when 3+ same-position picks in last 8", () => {
    const picks = [
      makePick("QB", 1),
      makePick("RB", 2),
      makePick("RB", 3),
      makePick("RB", 4),
      makePick("WR", 5),
    ];
    const run = detectPositionRun(picks);
    expect(run).not.toBeNull();
    expect(run!.position).toBe("RB");
    expect(run!.count).toBe(3);
  });

  it("only looks at the last windowSize picks", () => {
    // 4 QB picks at the start, then 8 picks with no position appearing 3+ times
    const picks = [
      makePick("QB", 1), makePick("QB", 2), makePick("QB", 3), makePick("QB", 4),
      // Last 8: QB, RB, WR, TE, QB, RB, WR, TE — max 2 of any position
      makePick("QB", 5), makePick("RB", 6), makePick("WR", 7), makePick("TE", 8),
      makePick("QB", 9), makePick("RB", 10), makePick("WR", 11), makePick("TE", 12),
    ];
    expect(detectPositionRun(picks)).toBeNull();
  });

  it("detects the most frequent position when multiple are above threshold", () => {
    const picks = [
      makePick("RB", 1), makePick("RB", 2), makePick("RB", 3),
      makePick("WR", 4), makePick("WR", 5), makePick("WR", 6), makePick("WR", 7),
    ];
    const run = detectPositionRun(picks);
    expect(run!.position).toBe("WR");
    expect(run!.count).toBe(4);
  });

  it("includes a human-readable alert message", () => {
    const picks = [makePick("TE", 1), makePick("TE", 2), makePick("TE", 3)];
    const run = detectPositionRun(picks);
    expect(run!.alert).toContain("TE");
    expect(run!.alert.length).toBeGreaterThan(10);
  });

  it("returns null for an empty picks array", () => {
    expect(detectPositionRun([])).toBeNull();
  });
});

// ─── parsePickRecommendation ─────────────────────────────────────────────────

describe("parsePickRecommendation", () => {
  it("parses a valid JSON recommendation", () => {
    const raw = JSON.stringify({
      primaryPick: "Ja'Marr Chase",
      primaryPosition: "WR",
      primaryReasoning: "Elite WR1 with top-5 ECR.",
      alternativePick: "Tyreek Hill",
      alternativePosition: "WR",
      alternativeReasoning: "Speed threat with high floor.",
      avoidPick: "Davante Adams",
      avoidReason: "Owner 3 always takes him early.",
      rosterImpact: "Locks in WR1 slot, frees mid-rounds for RB depth.",
      urgencyAlert: null,
      confidenceLevel: "high",
    });
    const result = parsePickRecommendation(raw);
    expect(result).not.toBeNull();
    expect(result!.primaryPick).toBe("Ja'Marr Chase");
    expect(result!.confidenceLevel).toBe("high");
    expect(result!.urgencyAlert).toBeNull();
  });

  it("strips markdown code fences before parsing", () => {
    const raw = "```json\n{\"primaryPick\":\"CeeDee Lamb\",\"primaryPosition\":\"WR\",\"primaryReasoning\":\"Top WR\",\"alternativePick\":\"Justin Jefferson\",\"alternativePosition\":\"WR\",\"alternativeReasoning\":\"Safe\",\"avoidPick\":\"None\",\"avoidReason\":\"N/A\",\"rosterImpact\":\"Good\",\"urgencyAlert\":null,\"confidenceLevel\":\"medium\"}\n```";
    const result = parsePickRecommendation(raw);
    expect(result).not.toBeNull();
    expect(result!.primaryPick).toBe("CeeDee Lamb");
  });

  it("returns null for malformed JSON", () => {
    expect(parsePickRecommendation("not json at all")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePickRecommendation("")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    // Missing primaryPick
    const raw = JSON.stringify({
      primaryPosition: "WR",
      primaryReasoning: "Good pick.",
    });
    expect(parsePickRecommendation(raw)).toBeNull();
  });
});

// ─── buildPickRecommendationPrompt ───────────────────────────────────────────

describe("buildPickRecommendationPrompt", () => {
  it("includes the current overall pick number in the prompt", () => {
    const prompt = buildPickRecommendationPrompt({
      currentOverall: 42,
      currentRound: 3,
      pickInRound: 2,
      totalTeams: 14,
      totalRounds: 15,
      rodRoster: [],
      positionalNeeds: [],
      topAvailable: [],
      ownerTendencies: [],
      recentPicks: [],
      positionRun: null,
    });
    expect(prompt).toContain("42");
    expect(prompt).toContain("Round 3");
  });

  it("includes Rod's current roster in the prompt", () => {
    const prompt = buildPickRecommendationPrompt({
      currentOverall: 15,
      currentRound: 2,
      pickInRound: 1,
      totalTeams: 14,
      totalRounds: 15,
      rodRoster: [{ position: "QB", playerName: "Patrick Mahomes", round: 1 }],
      positionalNeeds: [],
      topAvailable: [],
      ownerTendencies: [],
      recentPicks: [],
      positionRun: null,
    });
    expect(prompt).toContain("Patrick Mahomes");
  });

  it("includes position run alert when present", () => {
    const prompt = buildPickRecommendationPrompt({
      currentOverall: 20,
      currentRound: 2,
      pickInRound: 6,
      totalTeams: 14,
      totalRounds: 15,
      rodRoster: [],
      positionalNeeds: [],
      topAvailable: [],
      ownerTendencies: [],
      recentPicks: [],
      positionRun: { position: "RB", count: 4, alert: "RB run in progress — 4 taken in last 8 picks." },
    });
    expect(prompt).toContain("RB run");
  });

  it("returns a non-empty string", () => {
    const prompt = buildPickRecommendationPrompt({
      currentOverall: 1,
      currentRound: 1,
      pickInRound: 1,
      totalTeams: 14,
      totalRounds: 15,
      rodRoster: [],
      positionalNeeds: [],
      topAvailable: [],
      ownerTendencies: [],
      recentPicks: [],
      positionRun: null,
    });
    expect(prompt.length).toBeGreaterThan(100);
  });
});
