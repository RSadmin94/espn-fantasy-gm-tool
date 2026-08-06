import { describe, expect, it } from "vitest";
import { assembleDossierRivalryExplanation } from "./dossierRivalryExplanation";
import type { H2HResult } from "./h2hAuthority";
import type { RivalryStoryResult } from "./rivalryStoryAuthority";
import type { RivalryNarrativeStatement } from "./rivalryNarrativeTemplates";

function emptyH2H(partial: Partial<H2HResult> & Pick<H2HResult, "career">): H2HResult {
  const emptyRec = { wins: 0, losses: 0, ties: 0, games: 0 };
  return {
    personA: "id:a",
    personB: "id:b",
    displayA: "Rod",
    displayB: "Rival",
    playoffs: emptyRec,
    recent5: emptyRec,
    recent10: emptyRec,
    streak: { type: "none", count: 0 },
    lastMeeting: null,
    largestVictory: null,
    largestLoss: null,
    averageMarginA: 0,
    seasonHistory: [],
    meetings: [],
    ...partial,
  };
}

describe("RFSN-048B assembleDossierRivalryExplanation", () => {
  it("historical card prefers documentary cold open when available", () => {
    const story = {
      focalOwnerKey: "id:rod",
      rivalOwnerKey: "id:vince",
      tier: "real",
      headline: { key: "NEMESIS", confidence: 0.9, receiptIds: [] },
      documentaryFacts: [],
      availableBlocks: ["coldOpen", "taleOfTape"],
    } as RivalryStoryResult;

    const statements: RivalryNarrativeStatement[] = [
      {
        statementKey: "CAREER_RECORD",
        block: "coldOpen",
        priority: 100,
        text: "Vince remains your strongest historical nemesis across the recorded series.",
        receiptIds: [],
        factKeys: [],
        confidence: 0.9,
      },
      {
        statementKey: "CAREER_RECORD",
        block: "taleOfTape",
        priority: 50,
        text: "Career: 0–7.",
        receiptIds: ["gm:2024:10"],
        factKeys: [],
        confidence: 0.95,
      },
    ];

    const out = assembleDossierRivalryExplanation({
      cardKind: "historical",
      opponentOwnerKey: "id:vince",
      opponentOwnerName: "Vince Sellers",
      story,
      statements,
      h2h: emptyH2H({
        career: { wins: 0, losses: 7, ties: 0, games: 7 },
        lastMeeting: {
          season: 2024,
          week: 10,
          matchupPeriodId: 10,
          isPlayoff: false,
          scoreA: 90,
          scoreB: 110,
          marginA: -20,
          winner: "id:vince",
        } as any,
        meetings: [{ season: 2024 } as any],
      }),
      loreSentence: "Should not beat cold open",
      advisorThreatReason: null,
      advisorThreatMatched: false,
      rivalryPlayoffEliminations: 0,
    });

    expect(out.reason).toMatch(/historical nemesis/i);
    expect(out.headline).toBe("Historical nemesis");
    expect(out.provenance).toContain("rivalryNarrativeTemplates.coldOpen");
    expect(out.bullets.some((b) => /Career: 0–7/.test(b.text))).toBe(true);
    expect(out.matchedAdvisorThreat).toBe(false);
  });

  it("uses lore when documentary cold open is missing", () => {
    const out = assembleDossierRivalryExplanation({
      cardKind: "currentRival",
      opponentOwnerKey: "id:bruce",
      opponentOwnerName: "Bruce Edwards",
      story: null,
      statements: [],
      h2h: emptyH2H({
        career: { wins: 27, losses: 27, ties: 2, games: 56 },
        meetings: [{ season: 2012 } as any, { season: 2025 } as any],
      }),
      loreSentence: "Fifty-six meetings and still dead even — the league's longest active feud.",
      advisorThreatReason: null,
      advisorThreatMatched: false,
      rivalryPlayoffEliminations: null,
    });
    expect(out.reason).toMatch(/dead even/i);
    expect(out.provenance).toContain("rivalryService.loreSentence");
  });

  it("biggest threat uses advisor reason only when matched", () => {
    const matched = assembleDossierRivalryExplanation({
      cardKind: "activeThreat",
      opponentOwnerKey: "id:demetri",
      opponentOwnerName: "Demetri Clark",
      story: null,
      statements: [],
      h2h: emptyH2H({ career: { wins: 19, losses: 32, ties: 3, games: 54 } }),
      loreSentence: null,
      advisorThreatReason: "Demetri Clark holds a 32-19 head-to-head edge over you.",
      advisorThreatMatched: true,
      rivalryPlayoffEliminations: 2,
    });
    expect(matched.matchedAdvisorThreat).toBe(true);
    expect(matched.reason).toMatch(/Demetri Clark holds/);
    expect(matched.provenance).toContain("biggestThreatService.reason");

    const mismatched = assembleDossierRivalryExplanation({
      cardKind: "activeThreat",
      opponentOwnerKey: "id:demetri",
      opponentOwnerName: "Demetri Clark",
      story: null,
      statements: [],
      h2h: emptyH2H({
        career: { wins: 19, losses: 32, ties: 3, games: 54 },
        meetings: [{ season: 2015 } as any, { season: 2025 } as any],
      }),
      loreSentence: null,
      advisorThreatReason: "Someone Else knocked you out of the playoffs 4 times.",
      advisorThreatMatched: false,
      rivalryPlayoffEliminations: 0,
    });
    expect(mismatched.matchedAdvisorThreat).toBe(false);
    expect(mismatched.reason).not.toMatch(/Someone Else/);
    expect(mismatched.provenance).not.toContain("biggestThreatService.reason");
    expect(mismatched.reason).toMatch(/sustained active edge/i);
  });

  it("never invents elimination claims without PLAYOFF_ELIMINATION fact", () => {
    const out = assembleDossierRivalryExplanation({
      cardKind: "activeThreat",
      opponentOwnerKey: "id:x",
      opponentOwnerName: "X",
      story: {
        focalOwnerKey: "id:rod",
        rivalOwnerKey: "id:x",
        tier: "quiet",
        headline: { key: "SERIES_ACTIVE", confidence: 0.5, receiptIds: [] },
        documentaryFacts: [],
        availableBlocks: ["coldOpen"],
      } as RivalryStoryResult,
      statements: [],
      h2h: emptyH2H({ career: { wins: 5, losses: 10, ties: 0, games: 15 } }),
      loreSentence: null,
      advisorThreatReason: null,
      advisorThreatMatched: false,
      rivalryPlayoffEliminations: 3,
    });
    expect(out.bullets.every((b) => !/eliminat/i.test(b.text))).toBe(true);
  });

  it("qualifies partial history coverage", () => {
    const out = assembleDossierRivalryExplanation({
      cardKind: "currentRival",
      opponentOwnerKey: "id:bruce",
      opponentOwnerName: "Bruce",
      story: null,
      statements: [],
      h2h: emptyH2H({
        career: { wins: 10, losses: 10, ties: 0, games: 20 },
        meetings: [{ season: 2021 } as any, { season: 2025 } as any],
      }),
      loreSentence: null,
      advisorThreatReason: null,
      advisorThreatMatched: false,
      rivalryPlayoffEliminations: null,
    });
    expect(out.coverageQualifier).toMatch(/2021–2025|recorded meetings/);
  });
});
