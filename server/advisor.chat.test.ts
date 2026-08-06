import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { resetRateLimiter } from "./rateLimiter";

// Mock the LLM and DB helpers to avoid real API calls in tests
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Mock AI response: Start Ja'Marr Chase." } }],
  }),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getChatHistory: vi.fn().mockResolvedValue([]),
    addChatMessage: vi.fn().mockResolvedValue(undefined),
    clearChatHistory: vi.fn().mockResolvedValue(undefined),
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
    expect(invokeLLM).not.toHaveBeenCalled();
    spy.mockRestore();
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
