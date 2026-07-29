import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { resetRateLimiter } from "./rateLimiter";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { sanitizeAdvisorClientError } from "./advisorErrorSanitize";

// Mock the LLM and DB helpers to avoid real API calls in tests
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Mock AI response: Start Ja'Marr Chase." } }],
  }),
}));

vi.mock("./advisorContextBuilder", () => ({
  buildAdvisorSystemPrompt: vi.fn().mockResolvedValue("Mock system prompt"),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserMemory: vi.fn().mockResolvedValue(null),
    getChatHistory: vi.fn().mockResolvedValue([]),
    addChatMessage: vi.fn().mockResolvedValue(undefined),
    clearChatHistory: vi.fn().mockResolvedValue(undefined),
    getCachedView: vi.fn().mockResolvedValue(null),
    upsertCachedView: vi.fn().mockResolvedValue(undefined),
    getRefreshManifests: vi.fn().mockResolvedValue([]),
    upsertRefreshManifest: vi.fn().mockResolvedValue(undefined),
    getAllCachedSeasons: vi.fn().mockResolvedValue([]),
    resolveActiveLeagueId: vi.fn().mockResolvedValue({ leagueId: "457622", connectionId: 1 }),
    sanitizeAdvisorChatLeagueId: (s: string) => s || "457622",
    persistLlmUsage: vi.fn().mockResolvedValue(undefined),
  };
});

function createAuthContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
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
    resetRateLimiter();
    vi.mocked(db.getUserMemory).mockResolvedValue(null);
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

  it("still produces a response when user has no memory record", async () => {
    vi.mocked(db.getUserMemory).mockResolvedValue(null);
    const ctx = createAuthContext(55);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({ message: "Who should I start?", season: 2025 });
    expect(result.message).toBeTruthy();
    expect(db.getUserMemory).toHaveBeenCalledWith(55);
    expect(String(result.message)).not.toMatch(/Failed query/i);
  });

  it("uses existing memory and still answers", async () => {
    vi.mocked(db.getUserMemory).mockResolvedValue({
      id: 3,
      userId: 55,
      riskTolerance: "aggressive",
      tradePhilosophy: "buy low",
      keeperPhilosophy: null,
      draftStyle: null,
      favoritePlayerTypes: null,
      rivalManagers: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof db.getUserMemory>>);
    const { buildAdvisorSystemPrompt } = await import("./advisorContextBuilder");
    const ctx = createAuthContext(55);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({ message: "Trade advice?", season: 2025 });
    expect(result.message).toBeTruthy();
    expect(db.getUserMemory).toHaveBeenCalledWith(55);
    expect(buildAdvisorSystemPrompt).toHaveBeenCalled();
    const memArg = vi.mocked(buildAdvisorSystemPrompt).mock.calls.at(-1)?.[1];
    expect(String(memArg ?? "")).toMatch(/Risk Tolerance: aggressive/);
  });

  it("continues when getUserMemory returns null after missing-table soft-fail", async () => {
    // Soft-fail path inside getUserMemory returns null — chat must still answer.
    vi.mocked(db.getUserMemory).mockResolvedValue(null);
    const ctx = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisor.chat({ message: "Help me set lineup", season: 2025 });
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("does not expose raw SQL when a non-memory failure is sanitized", () => {
    const leaked =
      "Failed query: select `id`, `userId` from `user_memory` where `user_memory`.`userId` = ? limit ?\nparams: 1,1";
    const safe = sanitizeAdvisorClientError(new Error(leaked));
    expect(safe).not.toMatch(/Failed query/i);
    expect(safe).not.toMatch(/user_memory/);
    expect(safe).not.toMatch(/params:/);
    expect(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: safe });
    }).toThrow(/temporarily unavailable/i);
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
