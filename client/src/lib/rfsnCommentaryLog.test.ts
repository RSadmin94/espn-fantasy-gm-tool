import { describe, expect, it } from "vitest";
import { appendCommentaryLogEntry } from "./rfsnCommentaryLog";

describe("appendCommentaryLogEntry", () => {
  it("appends non-blank entries", () => {
    const next = appendCommentaryLogEntry([], {
      id: "a",
      pickLabel: "1.01",
      commentator: "sofia",
      text: "Opening board note.",
    });
    expect(next).toHaveLength(1);
  });

  it("skips blanks and duplicates", () => {
    const first = appendCommentaryLogEntry([], {
      id: "a",
      pickLabel: "1.01",
      commentator: "sofia",
      text: "Same line.",
    });
    const blank = appendCommentaryLogEntry(first, {
      id: "b",
      pickLabel: "1.02",
      commentator: "sofia",
      text: "   ",
    });
    expect(blank).toHaveLength(1);
    const dupText = appendCommentaryLogEntry(blank, {
      id: "c",
      pickLabel: "1.03",
      commentator: "sofia",
      text: "Same line.",
    });
    expect(dupText).toHaveLength(1);
    const dupId = appendCommentaryLogEntry(blank, {
      id: "a",
      pickLabel: "1.01",
      commentator: "coach",
      text: "Different text same id.",
    });
    expect(dupId).toHaveLength(1);
  });
});
