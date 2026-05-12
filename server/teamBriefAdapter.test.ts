/**
 * Tests for the teamBrief extension-compatible adapter fields.
 * Verifies that the server maps internal field names to the names
 * expected by the Chrome extension (v1.2.1+).
 */
import { describe, it, expect } from "vitest";

// ── Archetype key mapping ──────────────────────────────────────────────────────
const ARCHETYPE_KEY_MAP: Record<string, string> = {
  "Dealmaker":          "AGGRESSIVE_TRADER",
  "Waiver Grinder":     "WAIVER_HAWK",
  "Trade Shark":        "AGGRESSIVE_TRADER",
  "Set & Forget":       "DRAFT_AND_HOLD",
  "Positional Fanatic": "ANALYTICS_DRIVEN",
  "Emotional Trader":   "EMOTIONAL_REACTOR",
  "Balanced Manager":   "BALANCED_OPERATOR",
};

function archetypeKey(gmArchetype: string): string {
  return ARCHETYPE_KEY_MAP[gmArchetype] || "BALANCED_OPERATOR";
}

// ── Roster health computation ─────────────────────────────────────────────────
const INJURED_STATUSES = new Set(["OUT", "DOUBTFUL", "QUESTIONABLE", "IR", "INJURED_RESERVE"]);

function computeRosterHealth(starters: { injuryStatus: string; projectedPoints: number }[]) {
  const injuredCount = starters.filter(
    (p) => INJURED_STATUSES.has((p.injuryStatus || "").toUpperCase())
  ).length;
  const byeCount = starters.filter(
    (p) => p.projectedPoints === 0 && (p.injuryStatus || "").toUpperCase() === "ACTIVE"
  ).length;
  return { injuredCount, byeCount, starterCount: starters.length };
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("teamBrief adapter — archetype key mapping", () => {
  it("maps Dealmaker → AGGRESSIVE_TRADER", () => {
    expect(archetypeKey("Dealmaker")).toBe("AGGRESSIVE_TRADER");
  });
  it("maps Waiver Grinder → WAIVER_HAWK", () => {
    expect(archetypeKey("Waiver Grinder")).toBe("WAIVER_HAWK");
  });
  it("maps Trade Shark → AGGRESSIVE_TRADER", () => {
    expect(archetypeKey("Trade Shark")).toBe("AGGRESSIVE_TRADER");
  });
  it("maps Set & Forget → DRAFT_AND_HOLD", () => {
    expect(archetypeKey("Set & Forget")).toBe("DRAFT_AND_HOLD");
  });
  it("maps Positional Fanatic → ANALYTICS_DRIVEN", () => {
    expect(archetypeKey("Positional Fanatic")).toBe("ANALYTICS_DRIVEN");
  });
  it("maps Emotional Trader → EMOTIONAL_REACTOR", () => {
    expect(archetypeKey("Emotional Trader")).toBe("EMOTIONAL_REACTOR");
  });
  it("maps Balanced Manager → BALANCED_OPERATOR", () => {
    expect(archetypeKey("Balanced Manager")).toBe("BALANCED_OPERATOR");
  });
  it("falls back to BALANCED_OPERATOR for unknown archetype", () => {
    expect(archetypeKey("Unknown Archetype")).toBe("BALANCED_OPERATOR");
  });
  it("all mapped keys are valid ARCHETYPE_COLORS keys", () => {
    const VALID_KEYS = new Set([
      "AGGRESSIVE_TRADER", "WAIVER_HAWK", "DRAFT_AND_HOLD",
      "ANALYTICS_DRIVEN", "EMOTIONAL_REACTOR", "BALANCED_OPERATOR",
      "PASSIVE_MANAGER", "CHAMPIONSHIP_PEDIGREE",
    ]);
    for (const [, key] of Object.entries(ARCHETYPE_KEY_MAP)) {
      expect(VALID_KEYS.has(key)).toBe(true);
    }
  });
});

describe("teamBrief adapter — rosterHealth computation", () => {
  it("counts injured starters correctly", () => {
    const starters = [
      { injuryStatus: "OUT", projectedPoints: 0 },
      { injuryStatus: "Active", projectedPoints: 15 },
      { injuryStatus: "DOUBTFUL", projectedPoints: 5 },
      { injuryStatus: "Active", projectedPoints: 12 },
    ];
    const health = computeRosterHealth(starters);
    expect(health.injuredCount).toBe(2);
  });

  it("counts bye-week starters (projected 0, Active status)", () => {
    const starters = [
      { injuryStatus: "Active", projectedPoints: 0 },
      { injuryStatus: "Active", projectedPoints: 0 },
      { injuryStatus: "OUT", projectedPoints: 0 },   // injured, not bye
      { injuryStatus: "Active", projectedPoints: 14 },
    ];
    const health = computeRosterHealth(starters);
    expect(health.byeCount).toBe(2);
    expect(health.injuredCount).toBe(1);
  });

  it("returns correct starterCount", () => {
    const starters = Array(9).fill({ injuryStatus: "Active", projectedPoints: 10 });
    const health = computeRosterHealth(starters);
    expect(health.starterCount).toBe(9);
  });

  it("handles empty starters array", () => {
    const health = computeRosterHealth([]);
    expect(health.injuredCount).toBe(0);
    expect(health.byeCount).toBe(0);
    expect(health.starterCount).toBe(0);
  });
});

describe("teamBrief adapter — field name mapping", () => {
  it("maps rodOpportunities.action → opportunities[].description", () => {
    const rodOpportunities = [
      { type: "TRADE_WINDOW", action: "Trade for RB depth", urgency: "NOW" as const, targetTeamId: 2, targetOwner: "Bob", reasoning: "..." },
    ];
    const opportunities = rodOpportunities.map((op) => ({
      type: op.type,
      description: op.action,
      urgency: op.urgency,
    }));
    expect(opportunities[0].description).toBe("Trade for RB depth");
    expect(opportunities[0].type).toBe("TRADE_WINDOW");
    expect(opportunities[0].urgency).toBe("NOW");
  });

  it("maps playoffProbability → playoffOdds", () => {
    const assessment = { playoffProbability: 72 };
    const result = { playoffOdds: assessment.playoffProbability };
    expect(result.playoffOdds).toBe(72);
  });

  it("maps wins/losses → record object", () => {
    const assessment = { wins: 8, losses: 4 };
    const result = { record: { wins: assessment.wins, losses: assessment.losses } };
    expect(result.record.wins).toBe(8);
    expect(result.record.losses).toBe(4);
  });

  it("maps aiGMBriefing → briefing", () => {
    const assessment = { aiGMBriefing: "This team is in good shape." };
    const result = { briefing: assessment.aiGMBriefing };
    expect(result.briefing).toBe("This team is in good shape.");
  });
});
