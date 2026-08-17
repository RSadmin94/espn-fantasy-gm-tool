/**
 * RFSN-055C — Draft Intelligence follow-up context.
 */
import { describe, expect, it } from "vitest";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";
import type { DraftIntelligenceQuery } from "./draftIntelligence";
import {
  isDraftIntelligenceFollowUpAsk,
  selectDraftIntelligenceTool,
} from "./draftIntelligenceTool";

const ALIASES: AdvisorOwnerAlias[] = [
  { memberId: "rod-id", displayName: "Rod Sellers", aliases: ["rod sellers", "rod"] },
  { memberId: "bruce-id", displayName: "Bruce Edwards", aliases: ["bruce edwards", "bruce"] },
];

const REACH_PRIOR: DraftIntelligenceQuery = {
  metric: "reach_frequency",
  topN: 5,
};

const STEAL_PRIOR: DraftIntelligenceQuery = {
  metric: "biggest_steals",
  topN: 5,
};

const QB_TIMING_PRIOR: DraftIntelligenceQuery = {
  metric: "qb_timing",
  timingDirection: "early",
  topN: 5,
};

const ADP_IGNORE_PRIOR: DraftIntelligenceQuery = {
  metric: "adp_ignore",
  topN: 5,
};

describe("RFSN-055C isDraftIntelligenceFollowUpAsk", () => {
  it("recognizes season, owner, position, and metric-switch refinements", () => {
    expect(isDraftIntelligenceFollowUpAsk("Only 2024.")).toBe(true);
    expect(isDraftIntelligenceFollowUpAsk("What about QBs?")).toBe(true);
    expect(isDraftIntelligenceFollowUpAsk("What about Rod?")).toBe(true);
    expect(isDraftIntelligenceFollowUpAsk("Now only steals.")).toBe(true);
    expect(isDraftIntelligenceFollowUpAsk("What about 2023?")).toBe(true);
  });

  it("does not treat full draft-intelligence prompts as follow-ups", () => {
    expect(isDraftIntelligenceFollowUpAsk("Who reaches the most?")).toBe(false);
    expect(isDraftIntelligenceFollowUpAsk("and who waits on quarterback?")).toBe(false);
  });
});

describe("RFSN-055C selectDraftIntelligenceTool follow-up merge", () => {
  const ctx = (prior: DraftIntelligenceQuery) => ({
    priorQuery: prior,
    lastIntent: "draft_intelligence" as const,
    ownerAliases: ALIASES,
  });

  it("inherits reach metric with season-only follow-up", () => {
    const hit = selectDraftIntelligenceTool("Only 2024.", ctx(REACH_PRIOR));
    expect(hit).not.toBeNull();
    expect(hit && "query" in hit && !("unsupportedAnswer" in hit)).toBe(true);
    if (!hit || "unsupportedAnswer" in hit) return;
    expect(hit.query.metric).toBe("reach_frequency");
    expect(hit.query.seasonFrom).toBe(2024);
    expect(hit.query.seasonTo).toBe(2024);
  });

  it("combines season then position on reach metric deterministically unsupported", () => {
    const season = selectDraftIntelligenceTool("Only 2024.", ctx(REACH_PRIOR));
    expect(season && "query" in season).toBe(true);
    const combined = selectDraftIntelligenceTool("What about QBs?", {
      ...ctx(REACH_PRIOR),
      priorQuery:
        season && "query" in season && !("unsupportedAnswer" in season) ? season.query : REACH_PRIOR,
    });
    expect(combined && "unsupportedAnswer" in combined).toBe(true);
    if (!combined || !("unsupportedAnswer" in combined)) return;
    expect(combined.query.metric).toBe("reach_frequency");
    expect(combined.query.seasonFrom).toBe(2024);
    expect(combined.unsupportedAnswer).toMatch(/cannot be filtered to quarterbacks/i);
  });

  it("preserves biggest-steal metric with season refinement", () => {
    const hit = selectDraftIntelligenceTool("Only 2022.", ctx(STEAL_PRIOR));
    expect(hit && "query" in hit && !("unsupportedAnswer" in hit)).toBe(true);
    if (!hit || "unsupportedAnswer" in hit) return;
    expect(hit.query.metric).toBe("biggest_steals");
    expect(hit.query.seasonFrom).toBe(2022);
    expect(hit.query.seasonTo).toBe(2022);
  });

  it("preserves QB timing with season refinement", () => {
    const hit = selectDraftIntelligenceTool("What about 2023?", ctx(QB_TIMING_PRIOR));
    expect(hit && "query" in hit && !("unsupportedAnswer" in hit)).toBe(true);
    if (!hit || "unsupportedAnswer" in hit) return;
    expect(hit.query.metric).toBe("qb_timing");
    expect(hit.query.timingDirection).toBe("early");
    expect(hit.query.seasonFrom).toBe(2023);
    expect(hit.query.seasonTo).toBe(2023);
  });

  it("scopes ADP ignore to a named owner", () => {
    const hit = selectDraftIntelligenceTool("What about Rod?", ctx(ADP_IGNORE_PRIOR));
    expect(hit && "query" in hit && !("unsupportedAnswer" in hit)).toBe(true);
    if (!hit || "unsupportedAnswer" in hit) return;
    expect(hit.query.metric).toBe("adp_ignore");
    expect(hit.query.ownerName).toMatch(/rod/i);
  });

  it("switches metric while preserving season filters", () => {
    const prior: DraftIntelligenceQuery = {
      ...REACH_PRIOR,
      seasonFrom: 2024,
      seasonTo: 2024,
    };
    const hit = selectDraftIntelligenceTool("Now only steals.", ctx(prior));
    expect(hit && "query" in hit && !("unsupportedAnswer" in hit)).toBe(true);
    if (!hit || "unsupportedAnswer" in hit) return;
    expect(hit.query.metric).toBe("biggest_steals");
    expect(hit.query.seasonFrom).toBe(2024);
    expect(hit.query.seasonTo).toBe(2024);
  });

  it("returns deterministic limitation for unsupported playoff-draft follow-ups", () => {
    const hit = selectDraftIntelligenceTool("What about playoff drafts?", ctx(REACH_PRIOR));
    expect(hit && "unsupportedAnswer" in hit).toBe(true);
    if (!hit || !("unsupportedAnswer" in hit)) return;
    expect(hit.unsupportedAnswer).toMatch(/playoff drafts are not/i);
  });
});
