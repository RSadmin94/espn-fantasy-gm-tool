import { describe, it, expect } from "vitest";
import { pickInRoundFromOverall, roundFromOverall } from "./draftBoardHelpers";

describe("canonicalDraftBoard geometry", () => {
  it("computes chronological pickInRound from overallPick (14-team)", () => {
    const tc = 14;
    expect(roundFromOverall(1, tc)).toBe(1);
    expect(pickInRoundFromOverall(1, tc)).toBe(1);
    expect(pickInRoundFromOverall(14, tc)).toBe(14);
    expect(roundFromOverall(15, tc)).toBe(2);
    expect(pickInRoundFromOverall(15, tc)).toBe(1);
    expect(pickInRoundFromOverall(28, tc)).toBe(14);
  });

  it("never uses snake inversion on even rounds", () => {
    const tc = 14;
    expect(pickInRoundFromOverall(8, tc)).toBe(8);
    expect(pickInRoundFromOverall(22, tc)).toBe(8);
  });
});
