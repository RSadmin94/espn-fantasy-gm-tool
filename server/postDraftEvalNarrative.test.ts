import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLM, resolveLlmRoute, getDb } = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  resolveLlmRoute: vi.fn(() => ({ provider: "openai", model: "gpt-4o" })),
  getDb: vi.fn(async () => null),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM,
  resolveLlmRoute,
}));
vi.mock("./db", () => ({
  getDb,
}));

import {
  __resetNarrativeInflightForTests,
  getPostDraftNarrative,
  narrativeCacheKey,
} from "./postDraftEvalNarrative";
import { recordInvokeUsage } from "./usageTracker";
import {
  EVALUATOR_VERSION,
  NARRATIVE_VERSION,
  buildFallbackNarrative,
  emptyUnavailableNarrative,
  type NarrativeFacts,
} from "../client/src/lib/postDraftEval/narrative";

function facts(season: number, extra: Partial<NarrativeFacts> = {}): NarrativeFacts {
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    narrativeVersion: NARRATIVE_VERSION,
    leagueId: "457622",
    season,
    teamId: 11,
    teamName: "Test Squad",
    overallGrade: "B",
    rivalsRedraftGrade: "B+",
    overallConfidence: "MEDIUM",
    rankingTier: "TIER_2_SEASON_CACHE",
    historicalDisclosure: null,
    evidenceDisclosure: "test",
    supportStatus: season === 2019 ? "LIMITED" : season < 2018 ? "UNSUPPORTED" : "FULL",
    recommendationCeiling: season === 2019 ? "LOW" : "MEDIUM",
    strongestPosition: "WR",
    weakestPosition: "RB",
    bestPick: null,
    biggestMiss: null,
    turningPoint: null,
    actualStarters: [],
    rivalsStarters: [],
    retainedKeepers: [],
    rosterEnteringLiveDraft: [],
    positionsFilledBeforeLive: [],
    sequentialRivalsRoster: [],
    sequentialRedraftPicks: [],
    picks: [],
    ...extra,
  };
}

function llmContent(body: unknown) {
  return { choices: [{ message: { content: typeof body === "string" ? body : JSON.stringify(body) } }] };
}

describe("post-draft storytelling server path", () => {
  beforeEach(() => {
    invokeLLM.mockReset();
    resolveLlmRoute.mockReset();
    resolveLlmRoute.mockReturnValue({ provider: "openai", model: "gpt-4o" });
    getDb.mockReset();
    getDb.mockResolvedValue(null);
    __resetNarrativeInflightForTests();
  });

  it("does not call the LLM for unsupported seasons", async () => {
    const result = await getPostDraftNarrative({
      facts: facts(2017),
      userId: 1,
      leagueId: "457622",
    });
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(result.source).toBe("unavailable");
  });

  it("makes exactly one centralized invokeLLM call for a supported season", async () => {
    invokeLLM.mockResolvedValue(llmContent(buildFallbackNarrative(facts(2018))));
    await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    expect(invokeLLM).toHaveBeenCalledTimes(1);
  });

  it("uses centralized provider selection — no model or provider override", async () => {
    invokeLLM.mockResolvedValue(llmContent(buildFallbackNarrative(facts(2018))));
    await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    const arg = invokeLLM.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.model).toBeUndefined();
    expect(arg.provider).toBeUndefined();
    expect(arg.callType).toBe("json_structured");
    expect((arg.response_format as { type?: string })?.type).toBe("json_schema");
  });

  it("does not hardcode Anthropic or a Claude model in the narrative service", () => {
    const src = readFileSync(path.join(process.cwd(), "server/postDraftEvalNarrative.ts"), "utf8");
    expect(src).toContain("invokeLLM");
    expect(src).toContain("resolveLlmRoute");
    expect(src).not.toMatch(/anthropic|claude-sonnet|claude-/i);
  });

  it("LLM adapter forwards usageContext into recordInvokeUsage", () => {
    const src = readFileSync(path.join(process.cwd(), "server/_core/llm.ts"), "utf8");
    expect(src).toContain("recordInvokeUsage");
    expect(src).toContain("usageContext");
  });

  it("attributes the LLM call to POST_DRAFT_STORYTELLING with league and season intent", async () => {
    invokeLLM.mockResolvedValue(llmContent(buildFallbackNarrative(facts(2018))));
    await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    const arg = invokeLLM.mock.calls[0]?.[0] as {
      usageContext?: { feature?: string; userId?: number; leagueId?: string; intent?: string };
    };
    expect(arg.usageContext?.feature).toBe("POST_DRAFT_STORYTELLING");
    expect(arg.usageContext?.userId).toBe(9);
    expect(arg.usageContext?.leagueId).toBe("457622");
    expect(arg.usageContext?.intent).toBe("season:2018");
  });

  it("returns unavailable copy when the provider errors, without throwing", async () => {
    invokeLLM.mockRejectedValue(new Error("AI access is disabled for this account."));
    const result = await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    expect(result.source).toBe("unavailable");
    expect(result.draftStory).toBe("");
    expect(result.unavailableReason).toBe("provider_error");
  });

  it("missing provider key degrades safely without crashing", async () => {
    invokeLLM.mockRejectedValue(new Error("OPENAI_API_KEY is not configured"));
    const result = await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    expect(result.source).toBe("unavailable");
    expect(result.draftStory).toBe("");
    expect(result.pickTakes).toEqual([]);
  });

  it("missing Anthropic key also degrades safely if that provider is selected globally", async () => {
    invokeLLM.mockRejectedValue(new Error("ANTHROPIC_API_KEY is not configured"));
    const result = await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    expect(result.source).toBe("unavailable");
    expect(result.unavailableReason).toBe("provider_error");
  });

  it("cache fingerprint includes provider, model, and prompt version", () => {
    const base = narrativeCacheKey(facts(2018), 1, { provider: "openai", model: "gpt-4o" });
    const otherProvider = narrativeCacheKey(facts(2018), 1, { provider: "anthropic", model: "gpt-4o" });
    const otherModel = narrativeCacheKey(facts(2018), 1, { provider: "openai", model: "gpt-4o-mini" });
    const otherPrompt = narrativeCacheKey(
      facts(2018, { narrativeVersion: "post-draft-eval-07" }),
      1,
      { provider: "openai", model: "gpt-4o" },
    );
    expect(base).not.toEqual(otherProvider);
    expect(base).not.toEqual(otherModel);
    expect(base).not.toEqual(otherPrompt);
    expect(narrativeCacheMaterialHasVersion());
  });

  it("model change causes a cache miss", () => {
    const a = narrativeCacheKey(facts(2018), 1, { provider: "openai", model: "gpt-4o" });
    const b = narrativeCacheKey(facts(2018), 1, { provider: "openai", model: "gpt-4.1" });
    expect(a).not.toEqual(b);
  });

  it("prompt version change causes a cache miss", () => {
    const a = narrativeCacheKey(facts(2018), 1, { provider: "openai", model: "gpt-4o" });
    const b = narrativeCacheKey(facts(2018, { narrativeVersion: "changed" }), 1, {
      provider: "openai",
      model: "gpt-4o",
    });
    expect(a).not.toEqual(b);
  });

  it("changed evaluation fingerprint produces a different cache key", () => {
    const route = { provider: "openai", model: "gpt-4o" };
    const a = narrativeCacheKey(facts(2018), 1, route);
    const b = narrativeCacheKey({ ...facts(2018), overallGrade: "C+" }, 1, route);
    const c = narrativeCacheKey(facts(2018), 2, route);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("string vs numeric userId produce the same cache key", () => {
    const route = { provider: "openai", model: "gpt-4o" };
    expect(narrativeCacheKey(facts(2018), 1, route)).toEqual(narrativeCacheKey(facts(2018), "1", route));
  });

  it("keeper or sequential redraft change produces a different cache key", () => {
    const route = { provider: "openai", model: "gpt-4o" };
    const base = facts(2018);
    const keeper = {
      ...base,
      retainedKeepers: [{ overallPick: 14, name: "Derrick Henry", pos: "RB" }],
    };
    const sequential = {
      ...base,
      sequentialRedraftPicks: [{ overallPick: 1, name: "Lamar Jackson", pos: "QB", isKeeper: false }],
    };
    expect(narrativeCacheKey(base, 1, route)).not.toEqual(narrativeCacheKey(keeper, 1, route));
    expect(narrativeCacheKey(base, 1, route)).not.toEqual(narrativeCacheKey(sequential, 1, route));
  });

  it("uses the centralized route in the default cache key", () => {
    resolveLlmRoute.mockReturnValue({ provider: "openai", model: "gpt-4o" });
    const a = narrativeCacheKey(facts(2018), 1);
    resolveLlmRoute.mockReturnValue({ provider: "openai", model: "gpt-4.1" });
    const b = narrativeCacheKey(facts(2018), 1);
    expect(a).not.toEqual(b);
    expect(resolveLlmRoute).toHaveBeenCalled();
  });

  it("accepts markdown-fenced JSON without failing the evaluation", async () => {
    const payload = buildFallbackNarrative(facts(2018));
    invokeLLM.mockResolvedValue(llmContent("```json\n" + JSON.stringify(payload) + "\n```"));
    const result = await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    expect(result.source).toBe("llm");
    expect(result.draftStory.length).toBeGreaterThan(0);
  });

  it("extracts JSON surrounded by extra prose", async () => {
    const payload = buildFallbackNarrative(facts(2018));
    invokeLLM.mockResolvedValue(llmContent("Sure, here you go:\n" + JSON.stringify(payload) + "\nHope this helps."));
    const result = await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    expect(result.source).toBe("llm");
  });

  it("invalid JSON degrades to unavailable without throwing", async () => {
    invokeLLM.mockResolvedValue(llmContent("not json at all"));
    const result = await getPostDraftNarrative({ facts: facts(2018), userId: 9, leagueId: "457622" });
    expect(result.source).toBe("unavailable");
    expect(result.unavailableReason).toBe("invalid_model_output");
  });

  it("empty unavailable narrative is safe to render beside deterministic facts", () => {
    const narrative = emptyUnavailableNarrative("provider_error");
    expect(narrative.source).toBe("unavailable");
    expect(narrative.pickTakes).toEqual([]);
  });

  it("one uncached generation records exactly one POST_DRAFT_STORYTELLING usage event", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    getDb.mockResolvedValue({
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          inserted.push(row);
        },
      }),
    });
    recordInvokeUsage(
      {
        callType: "json_structured",
        usageContext: {
          feature: "POST_DRAFT_STORYTELLING",
          userId: 1,
          leagueId: "457622",
          intent: "season:2026",
        },
      },
      {
        model: "gpt-4o-2024-08-06",
        promptTokens: 7292,
        completionTokens: 772,
        totalTokens: 8064,
        durationMs: 1200,
        streaming: false,
      },
      "openai",
    );
    await vi.waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]?.featureId).toBe("POST_DRAFT_STORYTELLING");
    expect(inserted[0]?.provider).toBe("OPENAI");
    expect(inserted[0]?.model).toBe("gpt-4o-2024-08-06");
    expect(inserted[0]?.promptTokens).toBe(7292);
    expect(inserted[0]?.completionTokens).toBe(772);
    expect(inserted[0]?.intent).toBe("season:2026");
    expect(Number(inserted[0]?.estimatedCostUsd)).toBeCloseTo(0.02595, 5);
    expect(inserted[0]?.status).toBe("SUCCESS");
  });

  it("reload and dashboard-return cache hits produce zero additional usage events", async () => {
    const payload = JSON.stringify({ v: NARRATIVE_VERSION, narrative: buildFallbackNarrative(facts(2026)) });
    getDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ payload }],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onDuplicateKeyUpdate: async () => undefined,
        }),
      }),
    });
    invokeLLM.mockResolvedValue(llmContent(buildFallbackNarrative(facts(2026))));
    const first = await getPostDraftNarrative({ facts: facts(2026), userId: 1, leagueId: "457622" });
    const reload = await getPostDraftNarrative({ facts: facts(2026), userId: 1, leagueId: "457622" });
    const dashboardReturn = await getPostDraftNarrative({ facts: facts(2026), userId: 1, leagueId: "457622" });
    expect(first.cached).toBe(true);
    expect(reload.cached).toBe(true);
    expect(dashboardReturn.cached).toBe(true);
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("repairs a cached Draft Story that collapsed Miss and Turning Point without calling the LLM", async () => {
    const collapsed = {
      ...buildFallbackNarrative(facts(2026)),
      draftStory:
        "Selecting Tre Tucker over Quentin Johnston was a double whammy, both the biggest miss and turning point of the draft.",
      source: "llm" as const,
    };
    const payload = JSON.stringify({ v: NARRATIVE_VERSION, narrative: collapsed });
    getDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ payload }],
          }),
        }),
      }),
    });
    const result = await getPostDraftNarrative({ facts: facts(2026), userId: 1, leagueId: "457622" });
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(result.cached).toBe(true);
    expect(result.draftStory.toLowerCase()).not.toMatch(/double whammy|both the biggest miss and turning point/);
  });
});

function narrativeCacheMaterialHasVersion() {
  expect(NARRATIVE_VERSION).toBe("post-draft-eval-06");
  return true;
}
