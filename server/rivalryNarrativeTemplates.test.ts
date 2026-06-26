import { describe, it, expect } from "vitest";
import type { H2HMeeting, H2HResult } from "./h2hAuthority";
import type { RivalryStoryResult } from "./rivalryStoryAuthority";
import type { RivalryStoryReceipt } from "./rivalryStoryReceipts";
import {
  buildRivalryNarrativeStatements,
  selectTopStatementForBlock,
} from "./rivalryNarrativeTemplates";

const FOCAL = "id:{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}";
const RIVAL = "id:{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}";

function meeting(
  season: number,
  mpId: number,
  winner: string | null,
  isPlayoff = false,
): H2HMeeting {
  return {
    season,
    week: mpId,
    matchupPeriodId: mpId,
    isPlayoff,
    winner,
    scoreA: 100,
    scoreB: 90,
    marginA: 10,
  };
}

function buildH2H(overrides: Partial<H2HResult> & { meetings?: H2HMeeting[] }): H2HResult {
  const meetings = overrides.meetings ?? [];
  return {
    personA: FOCAL,
    personB: RIVAL,
    displayA: "Rod",
    displayB: "Marlon",
    career: { wins: 6, losses: 6, ties: 0, games: 12 },
    playoffs: { wins: 1, losses: 4, ties: 0, games: 5 },
    recent5: { wins: 1, losses: 4, ties: 0, games: 5 },
    recent10: { wins: 1, losses: 4, ties: 0, games: 5 },
    streak: { type: "L", count: 3 },
    lastMeeting: meetings.at(-1) ?? null,
    largestVictory: null,
    largestLoss: null,
    averageMarginA: 0,
    seasonHistory: [],
    meetings,
    ...overrides,
  };
}

function gameReceipt(
  id: string,
  factKeys: RivalryStoryReceipt["factKeys"] = [],
  isPlayoff = false,
): RivalryStoryReceipt {
  const parts = id.match(/^gm:(\d+):(\d+)$/);
  return {
    receiptId: id,
    type: "game",
    season: parts ? Number(parts[1]) : 2024,
    week: parts ? Number(parts[2]) : 1,
    isPlayoff,
    focalOwnerKey: FOCAL,
    rivalOwnerKey: RIVAL,
    factKeys,
    source: "gmMatchups",
  };
}

function marlonLikeStory(): RivalryStoryResult {
  return {
    focalOwnerKey: FOCAL,
    rivalOwnerKey: RIVAL,
    tier: "legendary",
    headline: { key: "THREE_ELIMINATIONS", confidence: 0.95, receiptIds: ["gm:2016:15"] },
    documentaryFacts: [
      {
        factKey: "PLAYOFF_ELIMINATION",
        supportingGameIds: ["gm:2016:15", "gm:2021:16", "gm:2023:15", "gm:2024:17"],
        confidence: 0.9,
      },
    ],
    availableBlocks: ["coldOpen", "taleOfTape", "turningPoint"],
  };
}

function marlonLikeReceipts(): RivalryStoryReceipt[] {
  return [
    gameReceipt("gm:2016:15", ["PLAYOFF_ELIMINATION"], true),
    gameReceipt("gm:2021:16", ["PLAYOFF_ELIMINATION"], true),
    gameReceipt("gm:2023:15", ["PLAYOFF_ELIMINATION"], true),
    gameReceipt("gm:2024:17", ["PLAYOFF_ELIMINATION", "LEAD_FLIP"], true),
    gameReceipt("gm:2020:1", [], false),
    gameReceipt("gm:2021:2", [], false),
  ];
}

describe("buildRivalryNarrativeStatements", () => {
  it("produces Marlon-like cold open and tape statements only", () => {
    const meetings = [
      ...Array.from({ length: 12 }, (_, i) => meeting(2020 + Math.floor(i / 2), i + 1, i % 2 === 0 ? FOCAL : RIVAL)),
      meeting(2016, 15, RIVAL, true),
      meeting(2021, 16, RIVAL, true),
      meeting(2023, 15, RIVAL, true),
      meeting(2024, 17, RIVAL, true),
    ];
    const statements = buildRivalryNarrativeStatements({
      story: marlonLikeStory(),
      receipts: marlonLikeReceipts(),
      h2h: buildH2H({ meetings }),
      focalName: "Rod",
      rivalName: "Marlon",
    });

    const keys = statements.map((s) => s.statementKey);
    expect(keys).toEqual([
      "THREE_ELIMINATIONS_LEAD",
      "CAREER_RECORD",
      "PLAYOFF_RECORD",
      "RECENT_FORM",
    ]);
    expect(keys).not.toContain("DEAD_EVEN_DIFFERENT_LEGACIES_LEAD");
    expect(keys).not.toContain("PLAYOFF_OWNER_LEAD");

    const lead = statements.find((s) => s.statementKey === "THREE_ELIMINATIONS_LEAD")!;
    expect(lead.text).toBe("Marlon has ended Rod's season 4 times.");
    expect(lead.receiptIds.length).toBeGreaterThanOrEqual(3);
    expect(lead.block).toBe("coldOpen");
  });

  it("does not emit THREE_ELIMINATIONS_LEAD for REVENGE_COMPLETE headline", () => {
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "legendary",
      headline: { key: "REVENGE_COMPLETE", confidence: 0.8, receiptIds: ["gm:2024:16", "gm:2025:7"] },
      documentaryFacts: [],
      availableBlocks: ["coldOpen", "taleOfTape"],
    };
    const statements = buildRivalryNarrativeStatements({
      story,
      receipts: [gameReceipt("gm:2024:16", [], true), gameReceipt("gm:2025:7", [], false)],
      h2h: buildH2H({
        playoffs: { wins: 2, losses: 3, ties: 0, games: 5 },
        recent5: { wins: 3, losses: 2, ties: 0, games: 5 },
      }),
      focalName: "Rod",
      rivalName: "Sheldon",
    });

    expect(statements.some((s) => s.statementKey === "THREE_ELIMINATIONS_LEAD")).toBe(false);
    expect(statements.some((s) => s.block === "coldOpen")).toBe(false);
    expect(statements.map((s) => s.statementKey)).toEqual([
      "CAREER_RECORD",
      "PLAYOFF_RECORD",
      "RECENT_FORM",
    ]);
  });

  it("emits DEAD_EVEN_DIFFERENT_LEGACIES_LEAD when eligible", () => {
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "real",
      headline: { key: "DEAD_EVEN_DIFFERENT_LEGACIES", confidence: 0.85, receiptIds: ["title:focal:0", "title:rival:2"] },
      documentaryFacts: [{ factKey: "TITLE_DIVERGENCE", supportingGameIds: ["title:focal:0", "title:rival:2"], confidence: 0.95 }],
      availableBlocks: ["coldOpen", "taleOfTape"],
    };
    const statements = buildRivalryNarrativeStatements({
      story,
      receipts: [
        {
          receiptId: "title:focal:0",
          type: "championship",
          season: 0,
          focalOwnerKey: FOCAL,
          rivalOwnerKey: RIVAL,
          factKeys: ["TITLE_DIVERGENCE"],
          source: "championshipAuthority",
        },
        {
          receiptId: "title:rival:2",
          type: "championship",
          season: 2019,
          focalOwnerKey: FOCAL,
          rivalOwnerKey: RIVAL,
          factKeys: ["TITLE_DIVERGENCE"],
          source: "championshipAuthority",
        },
      ],
      h2h: buildH2H({
        career: { wins: 5, losses: 5, ties: 0, games: 10 },
        playoffs: { wins: 1, losses: 3, ties: 0, games: 4 },
      }),
      focalName: "Rod",
      rivalName: "Rival",
    });

    expect(statements[0]?.statementKey).toBe("DEAD_EVEN_DIFFERENT_LEGACIES_LEAD");
    expect(statements[0]?.text).toBe("Dead even in the series. Not in the legacy.");
  });

  it("emits PLAYOFF_OWNER_LEAD when headline and playoff edge align", () => {
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "real",
      headline: { key: "PLAYOFF_OWNER", confidence: 0.8, receiptIds: ["gm:2020:1"] },
      documentaryFacts: [],
      availableBlocks: ["coldOpen", "taleOfTape", "playoffWar"],
    };
    const statements = buildRivalryNarrativeStatements({
      story,
      receipts: [gameReceipt("gm:2020:1", ["PLAYOFF_MEETING"], true), gameReceipt("gm:2021:1", ["PLAYOFF_MEETING"], true)],
      h2h: buildH2H({
        playoffs: { wins: 1, losses: 3, ties: 0, games: 4 },
      }),
      focalName: "Rod",
      rivalName: "Marlon",
    });

    const lead = statements.find((s) => s.statementKey === "PLAYOFF_OWNER_LEAD");
    expect(lead?.text).toBe("Marlon owns the playoff chapter.");
    expect(lead?.block).toBe("coldOpen");
  });

  it("quiet pair produces only CAREER_RECORD when taleOfTape is available", () => {
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "quiet",
      headline: { key: "SERIES_ACTIVE", confidence: 0.5, receiptIds: ["gm:2025:1"] },
      documentaryFacts: [],
      availableBlocks: ["coldOpen", "taleOfTape"],
    };
    const statements = buildRivalryNarrativeStatements({
      story,
      receipts: [gameReceipt("gm:2025:1")],
      h2h: buildH2H({
        career: { wins: 1, losses: 1, ties: 0, games: 2 },
        playoffs: { wins: 0, losses: 0, ties: 0, games: 0 },
        recent5: { wins: 1, losses: 1, ties: 0, games: 2 },
        meetings: [meeting(2024, 1, FOCAL), meeting(2025, 1, RIVAL)],
      }),
      focalName: "Rod",
      rivalName: "Quiet",
    });

    expect(statements.map((s) => s.statementKey)).toEqual(["CAREER_RECORD", "RECENT_FORM"]);
    expect(statements.some((s) => s.block === "coldOpen")).toBe(false);
  });

  it("returns empty when taleOfTape is not available", () => {
    const story: RivalryStoryResult = {
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      tier: "quiet",
      headline: { key: "SERIES_ACTIVE", confidence: 0.5, receiptIds: [] },
      documentaryFacts: [],
      availableBlocks: ["coldOpen"],
    };
    const statements = buildRivalryNarrativeStatements({
      story,
      receipts: [],
      h2h: buildH2H({ career: { wins: 0, losses: 0, ties: 0, games: 0 }, recent5: { wins: 0, losses: 0, ties: 0, games: 0 } }),
      focalName: "Rod",
      rivalName: "Quiet",
    });
    expect(statements).toEqual([]);
  });
});

describe("selectTopStatementForBlock", () => {
  it("returns highest-priority statement for the block", () => {
    const statements = buildRivalryNarrativeStatements({
      story: marlonLikeStory(),
      receipts: marlonLikeReceipts(),
      h2h: buildH2H({}),
      focalName: "Rod",
      rivalName: "Marlon",
    });
    expect(selectTopStatementForBlock(statements, "coldOpen")?.statementKey).toBe(
      "THREE_ELIMINATIONS_LEAD",
    );
    expect(selectTopStatementForBlock(statements, "taleOfTape")?.statementKey).toBe(
      "CAREER_RECORD",
    );
  });
});
