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
    expect(appendCommentaryLogEntry(first, {
      id: "b",
      pickLabel: "1.02",
      commentator: "sofia",
      text: "   ",
    })).toHaveLength(1);
    expect(appendCommentaryLogEntry(first, {
      id: "c",
      pickLabel: "1.03",
      commentator: "sofia",
      text: "Same line.",
    })).toHaveLength(1);
    expect(appendCommentaryLogEntry(first, {
      id: "a",
      pickLabel: "1.01",
      commentator: "coach",
      text: "Different text same id.",
    })).toHaveLength(1);
  });

  it("keeps Sofia, Coach, and Roxanne accepted written lines in order", () => {
    const log = [
      { id: "p1:sofia", pickLabel: "1.01", commentator: "sofia" as const, text: "Sofia line." },
      { id: "p1:coach", pickLabel: "1.01", commentator: "coach" as const, text: "Coach line." },
      { id: "p1:roxanne", pickLabel: "1.01", commentator: "roxanne" as const, text: "Roxanne line." },
    ].reduce((acc, entry) => appendCommentaryLogEntry(acc, entry), [] as ReturnType<typeof appendCommentaryLogEntry>);
    expect(log.map((entry) => entry.commentator)).toEqual(["sofia", "coach", "roxanne"]);
  });
});
