import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { resetRateLimiter } from "./rateLimiter";

// Mock the LLM and DB helpers to avoid real API calls in tests
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Mock AI response: Start Ja'Marr Chase." } }],
    model: "gpt-4o",
    usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280 },
  }),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getChatHistory: vi.fn().mockResolvedValue([]),
    addChatMessage: vi.fn().mockResolvedValue(undefined),
    clearChatHistory: vi.fn().mockResolvedValue(undefined),
    getUserMemory: vi.fn().mockResolvedValue(null),
    getCachedView: vi.fn().mockResolvedValue(null),
    upsertCachedView: vi.fn().mockResolvedValue(undefined),
    getRefreshManifests: vi.fn().mockResolvedValue([]),
    upsertRefreshManifest: vi.fn().mockResolvedValue(undefined),
    getAllCachedSeasons: vi.fn().mockResolvedValue([]),
  };
});

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "rod@example.com",
      name: "Rod Sellers",
      loginMethod: "manus",
      role: "user",
      subscriptionStatus: "active" as const,
      trialStartedAt: null,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    auth: { userId: "test-user" } as TrpcContext["auth"],
  };
}

describe("advisor.chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiter(); // clear per-user cooldowns between tests
  });

  it("returns an AI message for a valid input", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({ message: "Who should I start this week?", season: 2025 });
    expect(result).toHaveProperty("message");
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("defaults to season 2025 when season is omitted", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({ message: "Give me a keeper recommendation." });
    expect(result).toHaveProperty("message");
    expect(typeof result.message).toBe("string");
  });

  it("rejects empty messages", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.advisor.chat({ message: "", season: 2025 })).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const anonCtx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
      auth: {} as TrpcContext["auth"],
    };
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.advisor.chat({ message: "Who should I start?", season: 2025 })).rejects.toThrow();
  });

  it("RFSN-049: selects deterministic matchup margin tool and skips LLM", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const toolMod = await import("./matchupMarginTool");
    const spy = vi.spyOn(toolMod, "tryMatchupMarginToolAnswer").mockResolvedValue({
      selected: true,
      toolName: "query_matchup_margins",
      query: { metric: "losses_by_margin", marginExact: 1 },
      analytics: {} as never,
      answer:
        "Bruce Edwards has the most one-point losses: 6 across 214 recorded regular-season games from 2011–2025. Here, “one-point loss” means a final margin from 0.50 to 1.49 points.",
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({
      message: "Who has the most one-point losses?",
      season: 2025,
    });
    expect(result.message).toContain("Bruce Edwards");
    expect((result as { tool?: string }).tool).toBe("query_matchup_margins");
    const meta049 = (result as { meta?: Record<string, unknown> }).meta;
    expect(meta049?.llmInvoked).toBe(false);
    expect(meta049?.deterministicShortCircuit).toBe(true);
    expect(meta049?.intent).toBe("matchup_margins");
    expect(meta049?.authoritiesUsed).toEqual(expect.arrayContaining(["matchup_margins"]));
    expect(meta049?.resolvedLeagueId).toBeDefined();
    expect(meta049?.resolvedScope).toBeTruthy();
    expect(meta049?.evidenceCoverage).toBeTruthy();
    expect(invokeLLM).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("RFSN-053D: returns visual matchup_gallery payload and skips LLM", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const galleryMod = await import("./matchupGalleryTool");
    const spy = vi.spyOn(galleryMod, "tryMatchupGalleryToolAnswer").mockResolvedValue({
      selected: true,
      toolName: "query_matchup_gallery",
      query: { ownerName: "Rod Sellers", noMercy: true, marginMin: 50, result: "win" },
      preset: "no_mercy",
      answer: "You have 22 No Mercy Rule victories across recorded league history.",
      analytics: {} as never,
      visual: {
        type: "matchup_gallery",
        preset: "no_mercy",
        filters: { owner: "Rod Sellers", marginMin: 50, winsOnly: true, noMercy: true, result: "win" },
        result: {
          matchups: [],
          total: 22,
          summary: "Rod Sellers has 22 No Mercy Rule victories.",
          empty: false,
          emptyReason: null,
          seeAllHref: "/league/history/matchups?noMercy=1",
          filter: {},
          coverage: {} as never,
        },
        href: "/league/history/matchups?noMercy=1&ownerName=Rod+Sellers",
      },
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({
      message: "Show me my No Mercy wins.",
      season: 2025,
    });
    expect(result.message).toMatch(/22 No Mercy/);
    expect((result as { tool?: string }).tool).toBe("query_matchup_gallery");
    expect((result as { visual?: { type?: string } }).visual?.type).toBe("matchup_gallery");
    const meta = (result as { meta?: Record<string, unknown> }).meta;
    expect(meta?.llmInvoked).toBe(false);
    expect(meta?.deterministicShortCircuit).toBe(true);
    expect(meta?.intent).toBe("matchup_gallery");
    expect(invokeLLM).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("RFSN-049B: returns runtime telemetry meta for LLM answers", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({
      message: "Who should I start at WR2?",
      season: 2025,
    });
    const meta = (result as { meta?: Record<string, unknown> }).meta;
    expect(meta).toBeTruthy();
    expect(meta?.classification).toBe("START_SIT");
    expect(meta?.llmInvoked).toBe(true);
    expect(meta?.promptTokens).toBe(1200);
    expect(meta?.model).toBe("gpt-4o");
    expect(meta?.deterministicShortCircuit).toBe(false);
    expect(meta?.intent).toBe("advisor_fallback");
    expect(meta?.resolvedScope).toBeTruthy();
    expect(meta?.authoritiesUsed).toEqual([]);
  });
});

describe("advisor.history", () => {
  it("returns empty array when no history exists", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.history({ season: 2025 });
    expect(Array.isArray(result)).toBe(true);
  });
});
