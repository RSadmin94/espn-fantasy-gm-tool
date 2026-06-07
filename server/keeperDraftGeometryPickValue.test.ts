import { describe, it, expect } from "vitest";
import { snakeRoundAndPickFromOverall, snakeOverallPick } from "./keeperDraftGeometry";
import { calcPickValue } from "./analytics";

describe("snakeRoundAndPickFromOverall", () => {
  it("maps overall 1 and 14 in a 14-team league to round 1 ends", () => {
    expect(snakeRoundAndPickFromOverall(1, 14)).toEqual({ round: 1, pickInRound: 1 });
    expect(snakeRoundAndPickFromOverall(14, 14)).toEqual({ round: 1, pickInRound: 14 });
  });

  it("maps overall 15 to 2.14 (snake)", () => {
    expect(snakeRoundAndPickFromOverall(15, 14)).toEqual({ round: 2, pickInRound: 14 });
  });

  it("rejects pickInRound > teamCount via calcPickValue", () => {
    expect(calcPickValue(1, 15, 14)).toBe(0);
  });
});

describe("calcPickValue league geometry", () => {
  it("12-team vs 14-team differs for the same labeled snake slot in round 2", () => {
    const v12 = calcPickValue(2, 1, 12);
    const v14 = calcPickValue(2, 1, 14);
    expect(v12).not.toBe(v14);
  });

  it("snake overall matches forward helper", () => {
    const tc = 12;
    const { round, pickInRound } = snakeRoundAndPickFromOverall(18, tc);
    expect(snakeOverallPick(tc, round, pickInRound)).toBe(18);
  });
});
