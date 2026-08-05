import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import type { RivalryStoryResult } from "./rivalryStoryAuthority";

const {
  FOCAL,
  RIVAL,
  QUIET_RIVAL,
  MOCK_LEGENDARY,
  MOCK_REVENGE,
  MOCK_QUIET,
} = vi.hoisted(() => {
  const FOCAL = "id:{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}";
  const RIVAL = "id:{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}";
  const QUIET_RIVAL = "id:{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}";

  const MOCK_LEGENDARY: RivalryStoryResult = {
    focalOwnerKey: FOCAL,
    rivalOwnerKey: RIVAL,
    tier: "legendary",
    headline: {
      key: "THREE_ELIMINATIONS",
      confidence: 0.95,
      receiptIds: ["gm:2016:15", "gm:2021:16", "gm:2023:15"],
    },
    documentaryFacts: [
      { factKey: "PLAYOFF_ELIMINATION", supportingGameIds: ["gm:2016:15"], confidence: 0.9 },
    ],
    availableBlocks: [
      "autopsy",
      "championship",
      "coldOpen",
      "currentState",
      "ghosts",
      "playoffWar",
      "positional",
      "taleOfTape",
      "turningPoint",
    ],
  };

  const MOCK_REVENGE: RivalryStoryResult = {
    focalOwnerKey: FOCAL,
    rivalOwnerKey: "id:{DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD}",
    tier: "legendary",
    headline: {
      key: "REVENGE_COMPLETE",
      confidence: 0.8,
      receiptIds: ["gm:2024:16", "gm:2025:7"],
    },
    documentaryFacts: [],
    availableBlocks: [
      "autopsy",
      "championship",
      "coldOpen",
      "currentState",
      "ghosts",
      "playoffWar",
      "positional",
      "taleOfTape",
      "turningPoint",
    ],
  };

  const MOCK_QUIET: RivalryStoryResult = {
    focalOwnerKey: FOCAL,
    rivalOwnerKey: QUIET_RIVAL,
    tier: "quiet",
    headline: { key: "SERIES_ACTIVE", confidence: 0.5, receiptIds: ["gm:2025:1"] },
    documentaryFacts: [],
    availableBlocks: ["coldOpen"],
  };

  return { FOCAL, RIVAL, QUIET_RIVAL, MOCK_LEGENDARY, MOCK_REVENGE, MOCK_QUIET };
});

vi.mock("./rivalryStoryAuthority", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rivalryStoryAuthority")>();
  return {
    ...actual,
    buildRivalryStoryForPair: vi.fn(async (args: { rivalOwnerKey: string }) => {
      if (args.rivalOwnerKey === RIVAL) return MOCK_LEGENDARY;
      if (args.rivalOwnerKey === MOCK_REVENGE.rivalOwnerKey) return MOCK_REVENGE;
      if (args.rivalOwnerKey === QUIET_RIVAL) return MOCK_QUIET;
      return null;
    }),
    buildRivalryStoryAuthority: vi.fn().mockResolvedValue(
      new Map<string, RivalryStoryResult>([
        [RIVAL, MOCK_LEGENDARY],
        [MOCK_REVENGE.rivalOwnerKey, MOCK_REVENGE],
        [QUIET_RIVAL, MOCK_QUIET],
      ]),
    ),
  };
});

vi.mock("./leagueAccess", () => ({
  assertUserLeagueAccess: vi.fn().mockResolvedValue(undefined),
  userHasLeagueAccess: vi.fn().mockResolvedValue(true),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({}),
  };
});

const mockResolveRivalryStoryReceipts = vi.fn();
const mockResolveReceiptsForStory = vi.fn();

vi.mock("./rivalryStoryReceipts", () => ({
  resolveRivalryStoryReceipts: (...args: unknown[]) => mockResolveRivalryStoryReceipts(...args),
  resolveReceiptsForStory: (...args: unknown[]) => mockResolveReceiptsForStory(...args),
}));

const mockBuildH2HAuthority = vi.fn();

vi.mock("./h2hAuthority", () => ({
  buildH2HAuthority: (...args: unknown[]) => mockBuildH2HAuthority(...args),
}));

function mockH2hForStory(story: RivalryStoryResult) {
  const isRevenge = story.headline.key === "REVENGE_COMPLETE";
  const isQuiet = story.tier === "quiet";
  return {
    personA: story.focalOwnerKey,
    personB: story.rivalOwnerKey,
    displayA: "Rod",
    displayB: isRevenge ? "Sheldon" : isQuiet ? "Quiet" : "Marlon",
    career: isQuiet
      ? { wins: 2, losses: 1, ties: 0, games: 3 }
      : isRevenge
        ? { wins: 6, losses: 3, ties: 0, games: 9 }
        : { wins: 6, losses: 6, ties: 0, games: 12 },
    playoffs: isQuiet
      ? { wins: 0, losses: 0, ties: 0, games: 0 }
      : isRevenge
        ? { wins: 1, losses: 1, ties: 0, games: 2 }
        : { wins: 1, losses: 4, ties: 0, games: 5 },
    recent5: isQuiet
      ? { wins: 2, losses: 1, ties: 0, games: 3 }
      : isRevenge
        ? { wins: 4, losses: 1, ties: 0, games: 5 }
        : { wins: 1, losses: 4, ties: 0, games: 5 },
    recent10: { wins: 0, losses: 0, ties: 0, games: 0 },
    streak: { type: "none" as const, count: 0 },
    lastMeeting: null,
    largestVictory: null,
    largestLoss: null,
    averageMarginA: 0,
    seasonHistory: [],
    meetings: [],
  };
}

function mockReceiptsForStory(story: RivalryStoryResult) {
  if (story.headline.key === "THREE_ELIMINATIONS") {
    return ["gm:2016:15", "gm:2021:16", "gm:2023:15", "gm:2024:17"].map((receiptId) => ({
      receiptId,
      type: "game" as const,
      season: 2024,
      isPlayoff: true,
      focalOwnerKey: story.focalOwnerKey,
      rivalOwnerKey: story.rivalOwnerKey,
      factKeys: ["PLAYOFF_ELIMINATION"],
      source: "gmMatchups" as const,
    }));
  }
  const ids = [
    ...story.headline.receiptIds,
    ...story.documentaryFacts.flatMap((f) => f.supportingGameIds),
  ];
  return [...new Set(ids)].map((receiptId) => ({
    receiptId,
    type: "game" as const,
    season: 2024,
    isPlayoff: receiptId.includes(":16"),
    focalOwnerKey: story.focalOwnerKey,
    rivalOwnerKey: story.rivalOwnerKey,
    factKeys: [] as string[],
    source: "gmMatchups" as const,
  }));
}

function setupH2HMock() {
  mockBuildH2HAuthority.mockImplementation(async () => ({
    getH2H: (_a: string, b: string) => {
      if (b === RIVAL) return mockH2hForStory(MOCK_LEGENDARY);
      if (b === MOCK_REVENGE.rivalOwnerKey) return mockH2hForStory(MOCK_REVENGE);
      if (b === QUIET_RIVAL) return mockH2hForStory(MOCK_QUIET);
      return mockH2hForStory(MOCK_LEGENDARY);
    },
  }));
}

import { appRouter } from "./routers";
import { storiesMapToArray } from "./rivalryStoryRouter";
import { buildRivalryStoryForPair } from "./rivalryStoryAuthority";

function anonCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    auth: {} as TrpcContext["auth"],
  };
}

function entitledCtx(): TrpcContext {
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

describe("rivalryStoryRouter helpers", () => {
  it("storiesMapToArray sorts by rivalOwnerKey", () => {
    const map = new Map<string, RivalryStoryResult>([
      ["z", { ...MOCK_QUIET, rivalOwnerKey: "z" }],
      ["a", { ...MOCK_QUIET, rivalOwnerKey: "a" }],
    ]);
    expect(storiesMapToArray(map).map((s) => s.rivalOwnerKey)).toEqual(["a", "z"]);
  });
});

function freeCtx(): TrpcContext {
  const base = entitledCtx();
  return {
    ...base,
    user: {
      ...base.user!,
      subscriptionStatus: "inactive" as const,
    },
  };
}

describe("rivalryStoryRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveReceiptsForStory.mockImplementation(async ({ story }: { story: RivalryStoryResult }) => {
      const ids = [
        ...story.headline.receiptIds,
        ...story.documentaryFacts.flatMap((f) => f.supportingGameIds),
      ];
      return [...new Set(ids)].map((receiptId) => ({
        receiptId,
        type: "game" as const,
        season: 2024,
        focalOwnerKey: story.focalOwnerKey,
        rivalOwnerKey: story.rivalOwnerKey,
        factKeys: [],
        source: "gmMatchups" as const,
      }));
    });
    mockResolveRivalryStoryReceipts.mockImplementation(
      async ({
        receiptIds,
        focalOwnerKey,
        rivalOwnerKey,
      }: {
        receiptIds: string[];
        focalOwnerKey: string;
        rivalOwnerKey: string;
      }) =>
        receiptIds.map((receiptId) => ({
          receiptId,
          type: receiptId === "bogus:id" ? ("unknown" as const) : ("game" as const),
          season: receiptId === "bogus:id" ? 0 : 2024,
          focalOwnerKey,
          rivalOwnerKey,
          factKeys: [],
          source: receiptId === "bogus:id" ? ("derived" as const) : ("gmMatchups" as const),
        })),
    );
  });

  it("pair rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.rivalryStory.pair({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: RIVAL,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" } satisfies Partial<TRPCError>);
  });

  it("pair returns gated teaser for free users", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(result.gated).toBe(true);
    expect(result.tier).toBe("legendary");
    expect(result.headline.key).toBe("THREE_ELIMINATIONS");
    expect(result.headline.receiptIds).toEqual([]);
    expect(result.documentaryFacts).toEqual([]);
    expect(result.availableBlocks).toEqual(["coldOpen"]);
    expect(result.availableBlocks).not.toContain("turningPoint");
  });

  it("pair returns only teaser blocks for quiet rival when free", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: QUIET_RIVAL,
    });
    expect(result.gated).toBe(true);
    expect(result.availableBlocks).toEqual(["coldOpen"]);
  });

  it("pair returns full story for entitled users", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(result.gated).toBe(false);
    expect(result.tier).toBe("legendary");
    expect(result.headline.key).toBe("THREE_ELIMINATIONS");
    expect(result.availableBlocks).toContain("turningPoint");
    expect(result.documentaryFacts[0]?.factKey).toBe("PLAYOFF_ELIMINATION");
  });

  it("pair returns REVENGE_COMPLETE for a different rival shape", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: MOCK_REVENGE.rivalOwnerKey,
    });
    expect(result.headline.key).toBe("REVENGE_COMPLETE");
  });

  it("pair returns quiet tier with minimal blocks when entitled", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: QUIET_RIVAL,
    });
    expect(result.tier).toBe("quiet");
    expect(result.availableBlocks).toEqual(["coldOpen"]);
  });

  it("forOwner returns gated stories for free users", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.forOwner({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
    });
    expect(result.gated).toBe(true);
    expect(result.stories.length).toBe(3);
    expect(result.stories.every((s) => s.gated)).toBe(true);
    expect(result.stories.every((s) => s.documentaryFacts.length === 0)).toBe(true);
  });

  it("forOwner returns all rival stories for entitled users", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.forOwner({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
    });
    expect(result.gated).toBe(false);
    expect(result.focalOwnerKey).toBe(FOCAL);
    expect(result.stories.length).toBe(3);
    expect(result.stories.some((s) => s.headline.key === "THREE_ELIMINATIONS")).toBe(true);
    expect(result.stories.some((s) => s.tier === "quiet")).toBe(true);
  });

  it("rejects pair when focal and rival are the same", async () => {
    const caller = appRouter.createCaller(freeCtx());
    await expect(
      caller.rivalryStory.pair({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: FOCAL,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("returns NOT_FOUND when pair has no story", async () => {
    const caller = appRouter.createCaller(freeCtx());
    await expect(
      caller.rivalryStory.pair({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: "id:{EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE}",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
  });
});

describe("rivalryStoryRouter.receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveReceiptsForStory.mockImplementation(async ({ story }: { story: RivalryStoryResult }) => {
      const ids = [
        ...story.headline.receiptIds,
        ...story.documentaryFacts.flatMap((f) => f.supportingGameIds),
      ];
      return [...new Set(ids)].map((receiptId) => ({
        receiptId,
        type: "game" as const,
        season: 2024,
        focalOwnerKey: story.focalOwnerKey,
        rivalOwnerKey: story.rivalOwnerKey,
        factKeys: [],
        source: "gmMatchups" as const,
      }));
    });
    mockResolveRivalryStoryReceipts.mockImplementation(
      async ({
        receiptIds,
        focalOwnerKey,
        rivalOwnerKey,
      }: {
        receiptIds: string[];
        focalOwnerKey: string;
        rivalOwnerKey: string;
      }) =>
        receiptIds.map((receiptId) => ({
          receiptId,
          type: receiptId === "bogus:id" ? ("unknown" as const) : ("game" as const),
          season: receiptId === "bogus:id" ? 0 : 2024,
          focalOwnerKey,
          rivalOwnerKey,
          factKeys: [],
          source: receiptId === "bogus:id" ? ("derived" as const) : ("gmMatchups" as const),
        })),
    );
  });

  it("returns empty receipts for free users", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.receipts({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(result.gated).toBe(true);
    expect(result.entitled).toBe(false);
    expect(result.receipts).toEqual([]);
    expect(mockResolveReceiptsForStory).not.toHaveBeenCalled();
    expect(mockResolveRivalryStoryReceipts).not.toHaveBeenCalled();
  });

  it("returns empty receipts for free users even when receiptIds are provided", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.receipts({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      receiptIds: ["gm:2016:15", "gm:2021:16"],
    });
    expect(result.receipts).toEqual([]);
    expect(mockResolveRivalryStoryReceipts).not.toHaveBeenCalled();
  });

  it("resolves all story receipts when receiptIds are omitted for entitled users", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.receipts({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(result.focalOwnerKey).toBe(FOCAL);
    expect(result.rivalOwnerKey).toBe(RIVAL);
    expect(buildRivalryStoryForPair).toHaveBeenCalled();
    expect(mockResolveReceiptsForStory).toHaveBeenCalled();
    expect(mockResolveRivalryStoryReceipts).not.toHaveBeenCalled();
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(result.receipts.every((r) => r.type === "game")).toBe(true);
  });

  it("resolves explicit receiptIds for entitled users", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.receipts({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: MOCK_REVENGE.rivalOwnerKey,
      receiptIds: ["gm:2024:16", "gm:2025:7"],
    });
    expect(mockResolveRivalryStoryReceipts).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptIds: ["gm:2024:16", "gm:2025:7"],
      }),
    );
    expect(buildRivalryStoryForPair).not.toHaveBeenCalled();
    expect(mockResolveReceiptsForStory).not.toHaveBeenCalled();
    expect(result.receipts.map((r) => r.receiptId)).toEqual(["gm:2024:16", "gm:2025:7"]);
  });

  it("returns unknown receipts for bogus ids when entitled", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.receipts({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      receiptIds: ["bogus:id"],
    });
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]).toMatchObject({
      receiptId: "bogus:id",
      type: "unknown",
      season: 0,
      source: "derived",
    });
  });

  it("rejects receipts when focal and rival are the same", async () => {
    const caller = appRouter.createCaller(freeCtx());
    await expect(
      caller.rivalryStory.receipts({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: FOCAL,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("returns gated empty receipts for free users even when story is missing", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.receipts({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: "id:{EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE}",
    });
    expect(result.gated).toBe(true);
    expect(result.entitled).toBe(false);
    expect(result.receipts).toEqual([]);
  });
});

describe("rivalryStoryRouter.statements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupH2HMock();
    mockResolveReceiptsForStory.mockImplementation(async ({ story }: { story: RivalryStoryResult }) =>
      mockReceiptsForStory(story),
    );
  });

  it("returns no statements for quiet pair when free and no cold open exists", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.statements({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: QUIET_RIVAL,
    });
    expect(result.gated).toBe(true);
    expect(result.statements).toEqual([]);
    expect(result.lockedStatements).toBeGreaterThanOrEqual(0);
    expect(mockResolveReceiptsForStory).not.toHaveBeenCalled();
  });

  it("returns cold-open only for free users", async () => {
    const caller = appRouter.createCaller(freeCtx());
    const result = await caller.rivalryStory.statements({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(result.gated).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]?.block).toBe("coldOpen");
    expect(result.statements[0]?.receiptIds).toEqual([]);
    expect(result.lockedStatements).toBeGreaterThan(0);
    expect(mockResolveReceiptsForStory).not.toHaveBeenCalled();
  });

  it("returns controlled statements for THREE_ELIMINATIONS rivalry when entitled", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.statements({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(result.focalOwnerKey).toBe(FOCAL);
    expect(result.rivalOwnerKey).toBe(RIVAL);
    expect(buildRivalryStoryForPair).toHaveBeenCalled();
    expect(mockResolveReceiptsForStory).toHaveBeenCalled();
    expect(mockBuildH2HAuthority).toHaveBeenCalled();
    expect(result.statements.map((s) => s.statementKey)).toEqual([
      "THREE_ELIMINATIONS_LEAD",
      "CAREER_RECORD",
      "PLAYOFF_RECORD",
      "RECENT_FORM",
    ]);
    expect(result.statements[0]?.text).toContain("Marlon has ended Rod's season");
  });

  it("returns tape statements only for REVENGE_COMPLETE headline when entitled", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.statements({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: MOCK_REVENGE.rivalOwnerKey,
    });
    expect(result.statements.map((s) => s.statementKey)).toEqual([
      "CAREER_RECORD",
      "PLAYOFF_RECORD",
      "RECENT_FORM",
    ]);
    expect(result.statements.some((s) => s.statementKey === "THREE_ELIMINATIONS_LEAD")).toBe(false);
  });

  it("quiet pair has no cold-open lead statements when entitled", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.rivalryStory.statements({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: QUIET_RIVAL,
    });
    expect(result.statements.every((s) => s.block !== "coldOpen")).toBe(true);
    // Quiet pairs may return no narrative statements when there is no rivalry heat.
    expect(Array.isArray(result.statements)).toBe(true);
  });

  it("rejects statements when focal and rival are the same", async () => {
    const caller = appRouter.createCaller(freeCtx());
    await expect(
      caller.rivalryStory.statements({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: FOCAL,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("returns NOT_FOUND when pair has no story", async () => {
    const caller = appRouter.createCaller(freeCtx());
    await expect(
      caller.rivalryStory.statements({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: "id:{EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE}",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
  });
});
