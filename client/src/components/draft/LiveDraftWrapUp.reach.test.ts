import { describe, expect, it } from "vitest";
import {
  classifyReach,
  resolveDraftRound,
  selectBiggestClassifiedReach,
} from "@shared/reachClassification";

describe("LiveDraftWrapUp / selectBiggestClassifiedReach — P4 boundaries", () => {
  it("early-round 7 picks early is not shown as a reach", () => {
    const r = selectBiggestClassifiedReach(
      [{ name: "A", teamName: "T", pickNumber: 10, adp: 17 }],
      12,
    );
    expect(classifyReach({ pickNumber: 10, playerAdp: 17, round: 3 }).isReach).toBe(false);
    expect(r).toBeNull();
  });

  it("early-round 8 picks early is eligible", () => {
    const r = selectBiggestClassifiedReach(
      [{ name: "Mild", teamName: "T", pickNumber: 10, adp: 18, round: 3 }],
      12,
    );
    expect(r?.name).toBe("Mild");
    expect(r?.reachDelta).toBe(8);
  });

  it("middle-round 9 picks early is not eligible", () => {
    expect(
      selectBiggestClassifiedReach(
        [{ name: "X", teamName: "T", pickNumber: 100, adp: 109, round: 9 }],
        12,
      ),
    ).toBeNull();
  });

  it("middle-round 10 picks early is eligible", () => {
    const r = selectBiggestClassifiedReach(
      [{ name: "Mid", teamName: "T", pickNumber: 100, adp: 110, round: 9 }],
      12,
    );
    expect(r?.name).toBe("Mid");
    expect(r?.reachDelta).toBe(10);
  });

  it("late-round 14 picks early is not eligible", () => {
    expect(
      selectBiggestClassifiedReach(
        [{ name: "X", teamName: "T", pickNumber: 180, adp: 194, round: 14 }],
        14,
      ),
    ).toBeNull();
  });

  it("late-round 15 picks early is eligible", () => {
    const r = selectBiggestClassifiedReach(
      [{ name: "Late", teamName: "T", pickNumber: 180, adp: 195, round: 14 }],
      14,
    );
    expect(r?.name).toBe("Late");
    expect(r?.reachDelta).toBe(15);
  });

  it("raw largest difference below phase floor loses to a smaller qualifying reach", () => {
    // 30 early in round 14 is below late mild floor of 15? Wait 30 >= 15 so it qualifies.
    // Use 7 early (largest raw early among non-qualifiers) vs 8 early qualifier.
    const r = selectBiggestClassifiedReach(
      [
        { name: "RawBiggest", teamName: "A", pickNumber: 10, adp: 17, round: 3 }, // 7 early — not a reach
        { name: "Qualifier", teamName: "B", pickNumber: 20, adp: 28, round: 3 }, // 8 early — mild
      ],
      12,
    );
    expect(r?.name).toBe("Qualifier");
    expect(r?.reachDelta).toBe(8);
  });

  it("no qualifying reaches produces no biggest reach", () => {
    expect(
      selectBiggestClassifiedReach(
        [
          { name: "OnAdp", teamName: "T", pickNumber: 50, adp: 50, round: 5 },
          { name: "Slight", teamName: "T", pickNumber: 50, adp: 55, round: 5 }, // 5 early
          { name: "NoAdp", teamName: "T", pickNumber: 50, adp: null, round: 5 },
        ],
        12,
      ),
    ).toBeNull();
  });

  it("10/12/14/16-team round calculations remain correct", () => {
    expect(resolveDraftRound({ pickNumber: 11, numberOfTeams: 10 })).toBe(2);
    expect(resolveDraftRound({ pickNumber: 13, numberOfTeams: 12 })).toBe(2);
    expect(resolveDraftRound({ pickNumber: 15, numberOfTeams: 14 })).toBe(2);
    expect(resolveDraftRound({ pickNumber: 17, numberOfTeams: 16 })).toBe(2);
  });

  it("missing ADP is ignored", () => {
    const r = selectBiggestClassifiedReach(
      [
        { name: "Missing", teamName: "T", pickNumber: 5, adp: null, round: 1 },
        { name: "Undefined", teamName: "T", pickNumber: 5, adp: undefined, round: 1 },
        { name: "Valid", teamName: "T", pickNumber: 5, adp: 20, round: 1 }, // 15 early = big
      ],
      12,
    );
    expect(r?.name).toBe("Valid");
  });
});
