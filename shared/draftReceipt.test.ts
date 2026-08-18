import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_FACTS,
  RESULTS_HIGH_MIN,
  RESULTS_LOW_MAX,
  classifyNightResultsContradiction,
  formatDraftReceipt,
  receiptContainsHtml,
  type DraftReceiptInput,
} from "./draftReceipt";

const ADP_UNAVAILABLE = "Historical ADP unavailable for this season.";

function night(partial: Partial<DraftReceiptInput["draftNight"]> = {}): DraftReceiptInput["draftNight"] {
  return {
    available: true,
    reason: null,
    grade: "C",
    biggestReach: null,
    biggestSteal: null,
    ...partial,
  };
}

function reality(
  partial: Partial<DraftReceiptInput["draftReality"]> = {},
): DraftReceiptInput["draftReality"] {
  return {
    available: true,
    reason: null,
    draftGrade: 33,
    rosterMgmtGrade: 33,
    simulatedRecord: "6-8-0",
    actualRecord: "7-7-0",
    winDifference: 1,
    ...partial,
  };
}

function input(partial: Partial<DraftReceiptInput> = {}): DraftReceiptInput {
  return {
    season: 2024,
    ownerName: "Rod Sellers",
    draftNight: night(),
    draftReality: reality(),
    ...partial,
  };
}

describe("formatDraftReceipt (RFSN-055F)", () => {
  it("builds a full receipt with all three grade categories", () => {
    const text = formatDraftReceipt(input());
    expect(text).toContain("RIVALS DRAFT RECEIPT — 2024");
    expect(text).toContain("Rod Sellers");
    expect(text).toContain("Draft Night: C");
    expect(text).toContain("Draft Results: 33");
    expect(text).toContain("Roster Management: 33");
    expect(text).toContain("THE RECEIPTS DON'T LIE.");
    expect(text).toContain("Fantasy Football Rivals");
  });

  it("keeps missing Draft Night honest when historical ADP is unavailable", () => {
    const text = formatDraftReceipt(
      input({
        season: 2025,
        draftNight: night({
          available: false,
          reason: ADP_UNAVAILABLE,
          grade: null,
        }),
        draftReality: reality({ draftGrade: 77, rosterMgmtGrade: 62 }),
      }),
    );
    expect(text).toContain("Draft Night: Not graded — historical ADP unavailable");
    expect(text).not.toMatch(/Draft Night: F\b/);
    expect(text).not.toMatch(/Draft Night: 0\b/);
    expect(text).not.toMatch(/Draft Night: N\/A/i);
    expect(text).toContain("Draft Results: 77");
    expect(text).toContain("Roster Management: 62");
    expect(text).toContain("THE BOARD REMEMBERS.");
  });

  it("includes biggest reach when the night authority produced one", () => {
    const text = formatDraftReceipt(
      input({
        draftNight: night({
          grade: "C",
          biggestReach: { playerName: "Evan Engram", pick: 58 },
        }),
      }),
    );
    expect(text).toContain("Biggest Reach: Evan Engram — Pick 58");
  });

  it("surfaces a Draft Night / Draft Results contradiction without changing scores", () => {
    expect(classifyNightResultsContradiction("A", 8)).toBe("loved-it");
    expect(classifyNightResultsContradiction("F", 8)).toBeNull();
    expect(classifyNightResultsContradiction("C", 33)).toBeNull();
    expect(classifyNightResultsContradiction("F", RESULTS_HIGH_MIN)).toBe("board-cold");
    expect(classifyNightResultsContradiction("B", RESULTS_LOW_MAX)).toBe("loved-it");

    const src = input({
      season: 2022,
      draftNight: night({
        grade: "A",
        biggestSteal: { playerName: "Steal Guy", pick: 90 },
      }),
      draftReality: reality({ draftGrade: 8, rosterMgmtGrade: 50 }),
    });
    const text = formatDraftReceipt(src);
    expect(text).toContain("Draft Night: A");
    expect(text).toContain("Draft Results: 8");
    expect(text).toContain("Roster Management: 50");
    expect(text).toContain("DRAFT NIGHT SAID A.");
    expect(text).toContain("THE SEASON SAID OTHERWISE.");
    expect(src.draftNight.grade).toBe("A");
    expect(src.draftReality.draftGrade).toBe(8);
  });

  it("does not invent unsupported facts", () => {
    const text = formatDraftReceipt(
      input({
        draftNight: night({ biggestReach: null, biggestSteal: null }),
        draftReality: reality({
          simulatedRecord: null,
          actualRecord: null,
          winDifference: null,
        }),
      }),
    );
    expect(text).not.toContain("Biggest Reach:");
    expect(text).not.toContain("Biggest Steal:");
    expect(text).not.toContain("Win difference:");
    expect(text).not.toContain("Untouched draft");
    expect(text).not.toMatch(/\bF\b.*\bA\b/);
  });

  it("uses the provided owner and season", () => {
    const text = formatDraftReceipt(
      input({ season: 2022, ownerName: "Christian Graham" }),
    );
    expect(text).toContain("RIVALS DRAFT RECEIPT — 2022");
    expect(text).toContain("Christian Graham");
    expect(text).not.toContain("Rod Sellers");
    expect(text).not.toContain("2024");
  });

  it("emits plain text with no HTML", () => {
    const text = formatDraftReceipt(
      input({
        draftNight: night({ biggestReach: { playerName: "A.J. Brown", pick: 12 } }),
      }),
    );
    expect(receiptContainsHtml(text)).toBe(false);
    expect(text).not.toContain("<");
    expect(text).not.toContain(">");
    expect(text).not.toContain("|");
    expect(text).not.toContain("**");
  });

  it("stays compact enough to paste into league chat", () => {
    const text = formatDraftReceipt(
      input({
        draftNight: night({
          grade: "A",
          biggestReach: { playerName: "Reach Guy", pick: 4 },
          biggestSteal: { playerName: "Steal Guy", pick: 90 },
        }),
        draftReality: reality({ draftGrade: 8 }),
      }),
    );
    const lines = text.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(lines.length).toBeLessThanOrEqual(16);
    const factLines = lines.filter(
      (l) =>
        l.startsWith("Biggest Reach:") ||
        l.startsWith("Biggest Steal:") ||
        l.startsWith("Untouched draft") ||
        l.startsWith("Win difference:"),
    );
    expect(factLines.length).toBeLessThanOrEqual(MAX_RECEIPT_FACTS);
  });

  it("copies grade values exactly from the evaluation payload", () => {
    const text = formatDraftReceipt(
      input({
        season: 2022,
        draftNight: night({
          grade: "F",
          biggestReach: { playerName: "Whatever", pick: 3 },
        }),
        draftReality: reality({ draftGrade: 8, rosterMgmtGrade: 50 }),
      }),
    );
    expect(text).toMatch(/^RIVALS DRAFT RECEIPT — 2022$/m);
    expect(text).toMatch(/^Draft Night: F$/m);
    expect(text).toMatch(/^Draft Results: 8$/m);
    expect(text).toMatch(/^Roster Management: 50$/m);
  });

  it("does not mutate the evaluation input", () => {
    const src = input({
      draftNight: night({ grade: "C" }),
      draftReality: reality({ draftGrade: 33, rosterMgmtGrade: 33 }),
    });
    const snapshot = JSON.stringify(src);
    formatDraftReceipt(src);
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});
