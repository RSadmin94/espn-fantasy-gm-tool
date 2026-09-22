import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLM, getDb } = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  getDb: vi.fn(async () => null),
}));

vi.mock("./_core/llm", () => ({ invokeLLM }));
vi.mock("./db", () => ({ getDb }));

import {
  deterministicWeeklyNarrative,
  generateGroundedNarrative,
  getOrCreateWeeklyNarrative,
  weeklyIntelUsage,
  type NarrativeFactPacket,
} from "./weeklySeasonNarratives";
import { recordInvokeUsage } from "./usageTracker";
import { clearAiUsageTraces, getRecentAiUsageTraces } from "./aiCost/debugTrace";

function statementPacket(): NarrativeFactPacket {
  return {
    eventId: "matchup:1-2:w1:statement",
    eventType: "BIGGEST_STATEMENT",
    subject: "Jan Graham",
    opponent: "Bruce Edwards",
    facts: {
      score: 175.26,
      margin: 64,
      winScore: 175.26,
      loseScore: 111.26,
      leagueAverage: 132.61,
      winner: "Jan Graham",
      loser: "Bruce Edwards",
    },
    confidence: 90,
    tone: "Rivals booth",
  };
}

function llmJson(headline: string, body: string) {
  return { choices: [{ message: { content: JSON.stringify({ headline, body }) } }] };
}

function usageOf(call: unknown) {
  return (call as { usageContext?: { feature?: string; leagueId?: string; intent?: string; retryCount?: number } }).usageContext;
}

describe("weeklyIntelUsage", () => {
  it("puts resolved league identity on the existing WEEKLY_INTEL usage context", () => {
    expect(weeklyIntelUsage({ leagueId: "league-a", season: 2026, week: 1 })).toEqual({
      feature: "WEEKLY_INTEL",
      leagueId: "league-a",
      intent: "season:2026 week:1",
      retryCount: 0,
    });
  });
});

describe("weekly narrative usage attribution", () => {
  const packet = statementPacket();
  const clean = deterministicWeeklyNarrative(packet, 1);

  beforeEach(() => {
    invokeLLM.mockReset();
    getDb.mockReset();
    getDb.mockResolvedValue(null);
    clearAiUsageTraces();
  });

  it("attributes league A generation to A and league B generation to B", async () => {
    invokeLLM.mockResolvedValue(llmJson(clean.headline, clean.body));
    await generateGroundedNarrative({ leagueId: "league-a", season: 2026, week: 1, packet });
    await generateGroundedNarrative({ leagueId: "league-b", season: 2026, week: 1, packet });
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    const a = usageOf(invokeLLM.mock.calls[0]?.[0]);
    const b = usageOf(invokeLLM.mock.calls[1]?.[0]);
    expect(a?.feature).toBe("WEEKLY_INTEL");
    expect(b?.feature).toBe("WEEKLY_INTEL");
    expect(a?.leagueId).toBe("league-a");
    expect(b?.leagueId).toBe("league-b");
    expect(a?.leagueId).not.toBe(b?.leagueId);
    expect(a?.intent).toBe("season:2026 week:1");
  });

  it("keeps leagueId on the grounding retry", async () => {
    invokeLLM
      .mockResolvedValueOnce(llmJson("Jan Graham crushed Bruce Edwards", "Jan Graham won at 90% confidence."))
      .mockResolvedValueOnce(llmJson(clean.headline, clean.body));
    const produced = await generateGroundedNarrative({
      leagueId: "league-a",
      season: 2026,
      week: 1,
      packet,
    });
    expect(produced.source).toBe("sofia");
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(usageOf(invokeLLM.mock.calls[0]?.[0])?.leagueId).toBe("league-a");
    expect(usageOf(invokeLLM.mock.calls[1]?.[0])?.leagueId).toBe("league-a");
    expect(usageOf(invokeLLM.mock.calls[0]?.[0])?.retryCount).toBe(0);
    expect(usageOf(invokeLLM.mock.calls[1]?.[0])?.retryCount).toBe(1);
  });

  it("does not invent a usage event on deterministic fallback after LLM failure", async () => {
    invokeLLM.mockRejectedValue(new Error("provider_error"));
    const produced = await generateGroundedNarrative({
      leagueId: "league-a",
      season: 2026,
      week: 1,
      packet,
    });
    expect(produced.source).toBe("fallback");
    expect(invokeLLM).toHaveBeenCalledTimes(1);
    expect(usageOf(invokeLLM.mock.calls[0]?.[0])?.leagueId).toBe("league-a");
  });

  it("cache HIT returns existing copy and does not call invokeLLM", async () => {
    getDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                status: "generated",
                headline: clean.headline,
                bodyText: clean.body,
              },
            ],
          }),
        }),
      }),
      insert: () => ({
        values: async () => {
          throw new Error("cache HIT must not start generation");
        },
      }),
    });
    const result = await getOrCreateWeeklyNarrative({
      leagueId: "league-a",
      season: 2026,
      week: 1,
      packet,
    });
    expect(result.status).toBe("HIT");
    expect(result.cache).toBe("HIT");
    expect(result.bodyText).toBe(clean.body);
    expect(invokeLLM).not.toHaveBeenCalled();
  });
});

describe("existing usage writer maps WEEKLY_INTEL leagueId", () => {
  beforeEach(() => clearAiUsageTraces());

  it("recordInvokeUsage writes A and B without cross-attribution", () => {
    const usageData = {
      model: "test-model",
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
      durationMs: 12,
      streaming: false,
    };
    recordInvokeUsage(
      { callType: "weekly_briefing", usageContext: weeklyIntelUsage({ leagueId: "league-a", season: 2026, week: 1 }) },
      usageData,
      "openai",
    );
    recordInvokeUsage(
      { callType: "weekly_briefing", usageContext: weeklyIntelUsage({ leagueId: "league-b", season: 2026, week: 2 }) },
      usageData,
      "openai",
    );
    const traces = getRecentAiUsageTraces(10);
    const a = traces.find((t) => t.leagueId === "league-a");
    const b = traces.find((t) => t.leagueId === "league-b");
    expect(a?.feature).toBe("WEEKLY_INTEL");
    expect(b?.feature).toBe("WEEKLY_INTEL");
    expect(a?.leagueId).toBe("league-a");
    expect(b?.leagueId).toBe("league-b");
    expect(traces.every((t) => t.leagueId !== "457622")).toBe(true);
  });
});

describe("weekly WEEKLY_INTEL call-site contract", () => {
  it("storylines LLM path uses weeklyIntelUsage with the resolved leagueKey", () => {
    const src = readFileSync(path.join(process.cwd(), "server/weeklyStorylinesService.ts"), "utf8");
    expect(src).toContain("weeklyIntelUsage(usage)");
    expect(src).toContain("leagueId: leagueKey");
    expect(src).not.toMatch(/aiUsage\("WEEKLY_INTEL"\)/);
  });

  it("Admin weeklyWeek already attributes usage by leagueId", () => {
    const src = readFileSync(path.join(process.cwd(), "server/adminConsole/router.ts"), "utf8");
    expect(src).toContain('eq(usageEvents.featureId, "WEEKLY_INTEL")');
    expect(src).toContain("eq(usageEvents.leagueId, input.leagueId)");
  });

  it("scheduled edition generation already passes resolved leagueId into getOrCreateWeeklyNarrative", () => {
    const src = readFileSync(path.join(process.cwd(), "server/weeklyEditionService.ts"), "utf8");
    expect(src).toMatch(/getOrCreateWeeklyNarrative\(\{\s*leagueId: opts\.leagueId/s);
  });
});
