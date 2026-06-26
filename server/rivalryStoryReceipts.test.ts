import { describe, it, expect } from "vitest";
import type { H2HMeeting, H2HResult } from "./h2hAuthority";
import type { ChampionshipAuthority } from "./championshipAuthority";
import type { CompletedTradeIntel } from "./completedTradeAuthority";
import type { RivalryStoryResult } from "./rivalryStoryAuthority";
import {
  collectStoryReceiptIds,
  parseReceiptId,
  resolveReceiptsForStoryPure,
  resolveRivalryStoryReceiptsPure,
  type RivalryStoryReceiptContext,
} from "./rivalryStoryReceipts";

const FOCAL = "id:{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}";
const RIVAL = "id:{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}";

function meeting(
  season: number,
  mpId: number,
  winner: string | null,
  scoreA: number,
  scoreB: number,
  isPlayoff = false,
): H2HMeeting {
  return {
    season,
    week: mpId,
    matchupPeriodId: mpId,
    isPlayoff,
    winner,
    scoreA,
    scoreB,
    marginA: scoreA - scoreB,
  };
}

function buildH2H(meetings: H2HMeeting[]): H2HResult {
  return {
    personA: FOCAL,
    personB: RIVAL,
    displayA: "Focal",
    displayB: "Rival",
    career: { wins: 0, losses: 0, ties: 0, games: 0 },
    playoffs: { wins: 0, losses: 0, ties: 0, games: 0 },
    recent5: { wins: 0, losses: 0, ties: 0, games: 0 },
    recent10: { wins: 0, losses: 0, ties: 0, games: 0 },
    streak: { type: "none", count: 0 },
    lastMeeting: meetings.at(-1) ?? null,
    largestVictory: null,
    largestLoss: null,
    averageMarginA: 0,
    seasonHistory: [],
    meetings,
  };
}

const emptyChampionship: ChampionshipAuthority = {
  championKeyBySeason: new Map(),
  championOwnerIdBySeason: new Map(),
  championTeamIdBySeason: new Map(),
  championNameBySeason: new Map(),
  sourceBySeason: new Map(),
  titlesByKey: new Map(),
  championSeasonsByKey: new Map(),
  latestCompletedSeason: 2025,
  reigningKey: null,
  fallbackSeasons: [],
  unresolvedSeasons: [],
  fallbackLabel: "",
  canonicalKeyForOwnerId: () => "",
};

function context(overrides: Partial<RivalryStoryReceiptContext> = {}): RivalryStoryReceiptContext {
  return {
    focalOwnerKey: FOCAL,
    rivalOwnerKey: RIVAL,
    h2h: buildH2H([]),
    pairTrades: [],
    championship: emptyChampionship,
    ...overrides,
  };
}

describe("parseReceiptId", () => {
  it("parses gm receipts", () => {
    expect(parseReceiptId("gm:2024:17")).toEqual({
      kind: "game",
      season: 2024,
      matchupPeriodId: 17,
    });
  });

  it("parses trade receipts", () => {
    expect(parseReceiptId("trade:cluster-abc")).toEqual({
      kind: "trade",
      clusterId: "cluster-abc",
    });
  });

  it("parses title receipts", () => {
    expect(parseReceiptId("title:focal:2")).toEqual({
      kind: "title",
      side: "focal",
      titleCount: 2,
    });
  });

  it("returns unknown for unrecognized ids", () => {
    expect(parseReceiptId("bogus:id")).toEqual({ kind: "unknown" });
  });
});

describe("resolveRivalryStoryReceiptsPure", () => {
  it("resolves a playoff game from focal perspective with correct margin", () => {
    const m = meeting(2024, 17, RIVAL, 75.6, 88.2, true);
    const receipts = resolveRivalryStoryReceiptsPure({
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      receiptIds: ["gm:2024:17"],
      context: context({ h2h: buildH2H([m]) }),
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      receiptId: "gm:2024:17",
      type: "game",
      season: 2024,
      week: 17,
      isPlayoff: true,
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      winnerOwnerKey: RIVAL,
      loserOwnerKey: FOCAL,
      focalScore: 75.6,
      rivalScore: 88.2,
      margin: 75.6 - 88.2,
      source: "gmMatchups",
    });
    expect(receipts[0]!.margin).toBeLessThan(0);
  });

  it("resolves trade receipts with signed focal margin", () => {
    const trade: CompletedTradeIntel = {
      clusterId: "c1",
      tradeId: "t1",
      season: 2023,
      processedDate: 1,
      kind: "pick_only",
      sideA: {
        teamId: 1,
        ownerKey: FOCAL,
        ownerName: "Focal",
        teamName: "A",
        assetsReceived: [],
        valueReceived: 100,
      },
      sideB: {
        teamId: 2,
        ownerKey: RIVAL,
        ownerName: "Rival",
        teamName: "B",
        assetsReceived: [],
        valueReceived: 50,
      },
      winnerTeamId: 1,
      winnerOwnerKey: FOCAL,
      loserTeamId: 2,
      loserOwnerKey: RIVAL,
      margin: 50,
      verdictLabel: "win",
      confidence: "high",
      receiptText: "",
      netValueA: 50,
    };
    const receipts = resolveRivalryStoryReceiptsPure({
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      receiptIds: ["trade:c1"],
      context: context({ pairTrades: [trade] }),
    });
    expect(receipts[0]).toMatchObject({
      type: "trade",
      season: 2023,
      winnerOwnerKey: FOCAL,
      margin: 50,
      source: "completedTradeAuthority",
    });
  });

  it("resolves championship title receipts", () => {
    const champ: ChampionshipAuthority = {
      ...emptyChampionship,
      championSeasonsByKey: new Map([[RIVAL, [2018, 2019]]]),
    };
    const receipts = resolveRivalryStoryReceiptsPure({
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      receiptIds: ["title:rival:2"],
      context: context({ championship: champ }),
      factKeysByReceiptId: new Map([["title:rival:2", ["TITLE_DIVERGENCE"]]]),
    });
    expect(receipts[0]).toMatchObject({
      type: "championship",
      season: 2019,
      factKeys: ["TITLE_DIVERGENCE"],
      source: "championshipAuthority",
    });
  });

  it("returns unknown for missing game ids", () => {
    const receipts = resolveRivalryStoryReceiptsPure({
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      receiptIds: ["gm:2099:1"],
      context: context(),
    });
    expect(receipts[0]).toMatchObject({
      type: "unknown",
      season: 0,
      source: "derived",
    });
  });

  it("dedupes receipt ids while preserving first occurrence order", () => {
    const m = meeting(2025, 1, FOCAL, 100, 90);
    const receipts = resolveRivalryStoryReceiptsPure({
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      receiptIds: ["gm:2025:1", "gm:2025:1", "gm:2024:2"],
      context: context({
        h2h: buildH2H([meeting(2024, 2, RIVAL, 80, 100), m]),
      }),
    });
    expect(receipts.map((r) => r.receiptId)).toEqual(["gm:2025:1", "gm:2024:2"]);
  });

  it("handles empty receipt list safely", () => {
    expect(
      resolveRivalryStoryReceiptsPure({
        focalOwnerKey: FOCAL,
        rivalOwnerKey: RIVAL,
        receiptIds: [],
        context: context(),
      }),
    ).toEqual([]);
  });
});

describe("collectStoryReceiptIds", () => {
  it("merges headline and documentary fact ids with fact key mapping", () => {
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "legendary",
      headline: {
        key: "THREE_ELIMINATIONS",
        confidence: 0.95,
        receiptIds: ["gm:2016:15", "gm:2021:16"],
      },
      documentaryFacts: [
        {
          factKey: "PLAYOFF_ELIMINATION",
          supportingGameIds: ["gm:2016:15", "gm:2023:15"],
          confidence: 0.9,
        },
      ],
      availableBlocks: ["taleOfTape"],
    };
    const { receiptIds, factKeysByReceiptId } = collectStoryReceiptIds(story);
    expect(receiptIds).toEqual(["gm:2016:15", "gm:2021:16", "gm:2023:15"]);
    expect(factKeysByReceiptId.get("gm:2016:15")).toEqual(["PLAYOFF_ELIMINATION"]);
    expect(factKeysByReceiptId.get("gm:2021:16")).toBeUndefined();
  });
});

describe("resolveReceiptsForStoryPure", () => {
  it("resolves REVENGE_COMPLETE headline games", () => {
    const prev = meeting(2024, 16, RIVAL, 90, 100);
    const last = meeting(2025, 7, FOCAL, 110, 95);
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "legendary",
      headline: {
        key: "REVENGE_COMPLETE",
        confidence: 0.8,
        receiptIds: ["gm:2024:16", "gm:2025:7"],
      },
      documentaryFacts: [],
      availableBlocks: ["taleOfTape"],
    };
    const receipts = resolveReceiptsForStoryPure(
      story,
      context({ h2h: buildH2H([prev, last]) }),
    );
    expect(receipts).toHaveLength(2);
    expect(receipts[0]!.winnerOwnerKey).toBe(RIVAL);
    expect(receipts[1]!.winnerOwnerKey).toBe(FOCAL);
    expect(receipts.every((r) => r.type === "game")).toBe(true);
  });

  it("resolves quiet pair with minimal receipts", () => {
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "quiet",
      headline: { key: "SERIES_ACTIVE", confidence: 0.5, receiptIds: ["gm:2025:1"] },
      documentaryFacts: [],
      availableBlocks: ["coldOpen", "taleOfTape"],
    };
    const receipts = resolveReceiptsForStoryPure(
      story,
      context({ h2h: buildH2H([meeting(2025, 1, FOCAL, 100, 90)]) }),
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.type).toBe("game");
  });
});
