import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import type { CompletedTradeIntel } from "./completedTradeAuthority";

const {
  MOCK_TRADE,
  MOCK_HISTORY,
  MOCK_LEDGER,
  MOCK_NOTORIOUS,
} = vi.hoisted(() => {
  const trade: CompletedTradeIntel = {
    clusterId: "t1",
    tradeId: "t1",
    season: 2026,
    processedDate: 1782436667451,
    kind: "pick_only",
    sideA: {
      teamId: 11,
      ownerKey: "id:rod",
      ownerName: "Rod Sellers",
      teamName: "Str8FrmHell",
      assetsReceived: [],
      valueReceived: 3201,
    },
    sideB: {
      teamId: 23,
      ownerKey: "id:sheldon",
      ownerName: "Sheldon deRoux",
      teamName: "DARE2BGR8",
      assetsReceived: [],
      valueReceived: 2956,
    },
    winnerTeamId: 11,
    winnerOwnerKey: "id:rod",
    loserTeamId: 23,
    loserOwnerKey: "id:sheldon",
    margin: 245,
    verdictLabel: "SLIGHT EDGE A",
    confidence: "high",
    receiptText: "Rod Sellers won the trade by 245 value points.",
    netValueA: 245,
  };

  return {
    MOCK_TRADE: trade,
    MOCK_HISTORY: {
      ownerKey: "id:rod",
      ownerName: "Rod Sellers",
      tradeCount: 2,
      wins: 2,
      losses: 0,
      ties: 0,
      pickOnlyCount: 2,
      playerOnlyCount: 0,
      mixedCount: 0,
      totalValueGained: 348,
      totalValueLost: 0,
      netValue: 348,
      biggestWin: trade,
      biggestLoss: null,
      trades: [
        {
          trade,
          ownerSide: "A" as const,
          result: "win" as const,
          valueReceived: 3201,
          valueGiven: 2956,
          netReceived: 245,
        },
      ],
    },
    MOCK_LEDGER: {
      ownerAKey: "id:rod",
      ownerBKey: "id:sheldon",
      ownerAName: "Rod Sellers",
      ownerBName: "Sheldon deRoux",
      tradeCount: 2,
      recordA: 2,
      recordB: 0,
      ties: 0,
      ledgerWinnerKey: "id:rod",
      ledgerWinnerName: "Rod Sellers",
      biggestFleece: trade,
      mostBalanced: trade,
      trades: [{ trade, winnerOwnerKey: "id:rod", margin: 245 }],
    },
    MOCK_NOTORIOUS: {
      biggestValueGap: trade,
      mostLopsided: trade,
      closestFairTrade: trade,
      biggestPickOnlyGap: trade,
      biggestPlayerTrade: null,
      biggestMixedTrade: null,
      mostActivePair: {
        ownerAKey: "id:rod",
        ownerBKey: "id:sheldon",
        ownerAName: "Rod Sellers",
        ownerBName: "Sheldon deRoux",
        count: 2,
      },
      mostSuccessfulOwner: {
        ownerKey: "id:rod",
        ownerName: "Rod Sellers",
        wins: 2,
        netValue: 348,
      },
      rankedByMargin: [trade],
    },
  };
});

vi.mock("./completedTradeAuthority", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./completedTradeAuthority")>();
  return {
    ...actual,
    loadCompletedTradeIntelligence: vi.fn().mockResolvedValue([MOCK_TRADE]),
    buildOwnerTradeHistory: vi.fn().mockReturnValue(MOCK_HISTORY),
    buildRivalryTradeLedger: vi.fn().mockReturnValue(MOCK_LEDGER),
    buildNotoriousTradesReport: vi.fn().mockReturnValue(MOCK_NOTORIOUS),
  };
});

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({}),
  };
});

import { appRouter } from "./routers";
import {
  resolveOwnerIdentifier,
  resolveSeasons,
} from "./completedTradeIntelRouter";

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

describe("completedTradeIntelRouter helpers", () => {
  it("resolveSeasons accepts single season", () => {
    expect(resolveSeasons({ season: 2026 })).toEqual([2026]);
  });

  it("resolveSeasons dedupes seasons array", () => {
    expect(resolveSeasons({ seasons: [2026, 2026, 2025] })).toEqual([2025, 2026]);
  });

  it("resolveOwnerIdentifier finds by name substring", () => {
    const found = resolveOwnerIdentifier([MOCK_TRADE], { ownerName: "Rod" });
    expect(found).toEqual({ ownerKey: "id:rod", ownerName: "Rod Sellers" });
  });

  it("resolveOwnerIdentifier finds by teamId", () => {
    const found = resolveOwnerIdentifier([MOCK_TRADE], { teamId: 23 });
    expect(found).toEqual({ ownerKey: "id:sheldon", ownerName: "Sheldon deRoux" });
  });
});

describe("completedTradeIntelRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ownerTradeHistory returns gated summary for anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx());
    const result = await caller.completedTradeIntel.ownerTradeHistory({
      leagueId: "457622",
      season: 2026,
      ownerName: "Rod",
    });
    expect(result.gated).toBe(true);
    expect(result.tradeCount).toBe(2);
    expect(result.wins).toBe(0);
    expect(result.netValue).toBe(0);
    expect(result.recentTrades).toEqual([]);
  });

  it("ownerTradeHistory returns summary and recent trades for entitled users", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.completedTradeIntel.ownerTradeHistory({
      leagueId: "457622",
      season: 2026,
      ownerName: "Rod",
    });
    expect(result.gated).toBe(false);
    expect(result.tradeCount).toBe(2);
    expect(result.wins).toBe(2);
    expect(result.netValue).toBe(348);
    expect(result.recentTrades.length).toBeGreaterThan(0);
  });

  it("rivalryTradeLedger returns gated ledger for anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx());
    const result = await caller.completedTradeIntel.rivalryTradeLedger({
      leagueId: "457622",
      seasons: [2026],
      ownerAName: "Rod",
      ownerBName: "Sheldon",
    });
    expect(result.gated).toBe(true);
    expect(result.tradeCount).toBe(2);
    expect(result.recordA).toBe(0);
    expect(result.trades).toEqual([]);
  });

  it("rivalryTradeLedger returns pairwise ledger for entitled users", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.completedTradeIntel.rivalryTradeLedger({
      leagueId: "457622",
      seasons: [2026],
      ownerAName: "Rod",
      ownerBName: "Sheldon",
    });
    expect(result.tradeCount).toBe(2);
    expect(result.recordA).toBe(2);
    expect(result.recordB).toBe(0);
    expect(result.ledgerWinnerName).toBe("Rod Sellers");
  });

  it("notoriousTradesReport returns gated count-only payload for anonymous users", async () => {
    const caller = appRouter.createCaller(anonCtx());
    const result = await caller.completedTradeIntel.notoriousTradesReport({
      leagueId: "457622",
      season: 2026,
    });
    expect(result.gated).toBe(true);
    expect(result.tradeCount).toBeGreaterThan(0);
    expect(result.rankedByMargin).toEqual([]);
    expect(result.biggestValueGap).toBeNull();
  });

  it("notoriousTradesReport returns league rankings for entitled users", async () => {
    const caller = appRouter.createCaller(entitledCtx());
    const result = await caller.completedTradeIntel.notoriousTradesReport({
      leagueId: "457622",
      season: 2026,
    });
    expect(result.biggestValueGap?.margin).toBe(245);
    expect(result.mostActivePair?.count).toBe(2);
  });

  it("rejects ownerTradeHistory without owner identifier", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.completedTradeIntel.ownerTradeHistory({
        leagueId: "457622",
        season: 2026,
      }),
    ).rejects.toThrow();
  });

  it("rejects rivalryTradeLedger when owners are the same", async () => {
    const { loadCompletedTradeIntelligence, buildRivalryTradeLedger } = await import(
      "./completedTradeAuthority"
    );
    vi.mocked(loadCompletedTradeIntelligence).mockResolvedValueOnce([MOCK_TRADE]);
    vi.mocked(buildRivalryTradeLedger).mockClear();

    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.completedTradeIntel.rivalryTradeLedger({
        leagueId: "457622",
        season: 2026,
        ownerAName: "Rod",
        ownerBName: "Rod",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });
});
