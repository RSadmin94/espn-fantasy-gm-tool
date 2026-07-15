import { describe, expect, it } from "vitest";
import {
  formatDecisionLedger,
  mapPickPrimaryToDecisionFactor,
  type DraftDecisionContext,
} from "./draftDecisionEngine";
import { buildDraftDecisionFromResolvedPick } from "./draftDecisionBridge";
import { getDefaultDraftDecisionEngine } from "./draftDecisionFactors";

describe("draftDecisionEngine", () => {
  it("maps pick primary factors to decision primary factors", () => {
    expect(mapPickPrimaryToDecisionFactor("ESPN_ADP")).toBe("BPA");
    expect(mapPickPrimaryToDecisionFactor("POSITION_CAP")).toBe("BPA");
    expect(mapPickPrimaryToDecisionFactor("LEAGUE_TIMING")).toBe("LEAGUE_TIMING");
    expect(mapPickPrimaryToDecisionFactor("OWNER_DNA")).toBe("OWNER_DNA");
  });

  it("builds a ledger with pipeline stages", () => {
    const decision = buildDraftDecisionFromResolvedPick({
      pickNum: 75,
      round: 6,
      ownerName: "Christian Graham",
      teamName: "Team",
      pick: { name: "Myles Garrett", position: "DP", adp: 63.85, projectedPoints: 0, marketValue: 86 },
      targetPosition: "DP",
      primaryFactor: "ESPN_ADP",
      pickReason: "Best player available by ADP",
      blockedOverrides: [],
      bpa: { name: "Myles Garrett", position: "DP", adp: 63.85, projectedPoints: 0, marketValue: 86 },
      needUrgency: null,
      teamNeeds: [],
      dpTiming: {
        position: "DP",
        leagueId: "457622",
        teamCount: 14,
        confidence: "Medium",
        confidenceReasons: [],
        baselineFirstPick: 95,
        baselineFirstRound: 7,
        firstPickP25: 80,
        firstPickP75: 110,
        windowStartPick: 80,
        windowEndPick: 110,
        seasonsAnalyzed: 9,
        totalPositionPicks: 100,
        seasonsWithEarlyFirst: 1,
        earliestFirstBySeason: [],
        interpretation: "League waits on defenders.",
      },
      ownerDnaMeta: null,
      ownerConfidence: null,
      legacyReason: "Best player available by ADP",
      confidenceScore: 85,
    });

    expect(decision.primaryFactor).toBe("BPA");
    expect(decision.factors.length).toBeGreaterThan(0);
    expect(decision.explanationSections.board.length).toBeGreaterThan(0);
    expect(formatDecisionLedger(decision)).toContain("Decision");
    expect(decision.pickIntelligence?.plainEnglish).toContain("League first-DP median");
  });

  it("evaluates built-in pipeline factors", () => {
    const ctx = {
      pickNum: 1,
      round: 1,
      ownerName: "Test",
      teamName: "T",
      player: { name: "A", position: "RB", adp: 1, projectedPoints: 100, marketValue: 90 },
      targetPosition: "RB",
      primaryFactor: "ESPN_ADP" as const,
      pickReason: "BPA",
      blockedOverrides: [],
      bpa: { name: "A", position: "RB", adp: 1, projectedPoints: 100, marketValue: 90 },
      needUrgency: null,
      teamNeeds: [],
      dpTiming: null,
      ownerDnaMeta: null,
      ownerConfidence: null,
      isKeeper: false,
      pickIntelligence: null,
      confidenceScore: 70,
    };

    const factors = getDefaultDraftDecisionEngine().evaluateAll(ctx);
    expect(factors.some((f) => f.id === "board-bpa")).toBe(true);
    expect(factors.some((f) => f.id === "espn-value")).toBe(true);
  });
});
