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
    availableBlocks: ["coldOpen", "taleOfTape"],
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

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({}),
  };
});

import { appRouter } from "./routers";
import { storiesMapToArray } from "./rivalryStoryRouter";

function anonCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    auth: {} as TrpcContext["auth"],
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

describe("rivalryStoryRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pair returns structured story without prose transformation", async () => {
    const caller = appRouter.createCaller(anonCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(result.tier).toBe("legendary");
    expect(result.headline.key).toBe("THREE_ELIMINATIONS");
    expect(result.availableBlocks).toContain("turningPoint");
    expect(result.documentaryFacts[0]?.factKey).toBe("PLAYOFF_ELIMINATION");
  });

  it("pair returns REVENGE_COMPLETE for a different rival shape", async () => {
    const caller = appRouter.createCaller(anonCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: MOCK_REVENGE.rivalOwnerKey,
    });
    expect(result.headline.key).toBe("REVENGE_COMPLETE");
  });

  it("pair returns quiet tier with minimal blocks", async () => {
    const caller = appRouter.createCaller(anonCtx());
    const result = await caller.rivalryStory.pair({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
      rivalOwnerKey: QUIET_RIVAL,
    });
    expect(result.tier).toBe("quiet");
    expect(result.availableBlocks).toEqual(["coldOpen", "taleOfTape"]);
  });

  it("forOwner returns all rival stories without throwing", async () => {
    const caller = appRouter.createCaller(anonCtx());
    const result = await caller.rivalryStory.forOwner({
      leagueId: "457622",
      focalOwnerKey: FOCAL,
    });
    expect(result.focalOwnerKey).toBe(FOCAL);
    expect(result.stories.length).toBe(3);
    expect(result.stories.some((s) => s.headline.key === "THREE_ELIMINATIONS")).toBe(true);
    expect(result.stories.some((s) => s.tier === "quiet")).toBe(true);
  });

  it("rejects pair when focal and rival are the same", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.rivalryStory.pair({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: FOCAL,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("returns NOT_FOUND when pair has no story", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.rivalryStory.pair({
        leagueId: "457622",
        focalOwnerKey: FOCAL,
        rivalOwnerKey: "id:{EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE}",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
  });
});
