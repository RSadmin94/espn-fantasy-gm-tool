import { describe, expect, it } from "vitest";
import {
  classifyReach,
  OUTRAGEOUS_REACH_MIN_DELTA,
  resolveDraftRound,
  type ReachSeverity,
} from "./reachClassification";
import { classifyMoment } from "./draftMomentClassifier";
import { buildEditorialAssignment, roxanneEligible } from "../sofia/broadcastEditorialRouting";
import { SessionEditorialLedger } from "../sofia/editorialLedger";
import type { BroadcastMoment } from "../sofia/broadcastMomentTypes";
import type { ReachClassification } from "./reachClassification";

function expectSeverity(
  pickNumber: number,
  playerAdp: number,
  round: number,
  severity: ReachSeverity,
  opts?: { personaOwner?: ReachClassification["personaOwner"]; isReach?: boolean },
) {
  const r = classifyReach({ pickNumber, playerAdp, round });
  expect(r.severity).toBe(severity);
  expect(r.isReach).toBe(opts?.isReach ?? severity !== "normal");
  if (opts?.personaOwner !== undefined) expect(r.personaOwner).toBe(opts.personaOwner);
}

describe("resolveDraftRound — league sizes", () => {
  it("uses existing round when provided", () => {
    expect(resolveDraftRound({ pickNumber: 25, numberOfTeams: 12, existingRound: 3 })).toBe(3);
  });

  it("10-team", () => {
    expect(resolveDraftRound({ pickNumber: 1, numberOfTeams: 10 })).toBe(1);
    expect(resolveDraftRound({ pickNumber: 10, numberOfTeams: 10 })).toBe(1);
    expect(resolveDraftRound({ pickNumber: 11, numberOfTeams: 10 })).toBe(2);
    expect(resolveDraftRound({ pickNumber: 100, numberOfTeams: 10 })).toBe(10);
  });

  it("12-team", () => {
    expect(resolveDraftRound({ pickNumber: 12, numberOfTeams: 12 })).toBe(1);
    expect(resolveDraftRound({ pickNumber: 13, numberOfTeams: 12 })).toBe(2);
    expect(resolveDraftRound({ pickNumber: 84, numberOfTeams: 12 })).toBe(7);
  });

  it("14-team", () => {
    expect(resolveDraftRound({ pickNumber: 14, numberOfTeams: 14 })).toBe(1);
    expect(resolveDraftRound({ pickNumber: 15, numberOfTeams: 14 })).toBe(2);
    expect(resolveDraftRound({ pickNumber: 99, numberOfTeams: 14 })).toBe(8);
  });

  it("16-team", () => {
    expect(resolveDraftRound({ pickNumber: 16, numberOfTeams: 16 })).toBe(1);
    expect(resolveDraftRound({ pickNumber: 17, numberOfTeams: 16 })).toBe(2);
    expect(resolveDraftRound({ pickNumber: 160, numberOfTeams: 16 })).toBe(10);
  });
});

describe("reach boundaries — early (round 3)", () => {
  const round = 3;
  it("7 = normal", () => expectSeverity(10, 17, round, "normal"));
  it("8 = mild", () => expectSeverity(10, 18, round, "mild", { personaOwner: "coach" }));
  it("14 = mild", () => expectSeverity(10, 24, round, "mild", { personaOwner: "coach" }));
  it("15 = big", () => expectSeverity(10, 25, round, "big", { personaOwner: "coach" }));
  it("24 = big", () => expectSeverity(10, 34, round, "big", { personaOwner: "coach" }));
  it("25 = massive Coach (not Roxanne)", () =>
    expectSeverity(10, 35, round, "massive", { personaOwner: "coach" }));
  it("40 = massive Roxanne", () =>
    expectSeverity(10, 50, round, "massive", { personaOwner: "roxanne" }));
});

describe("reach boundaries — middle (round 9)", () => {
  const round = 9;
  it("9 = normal", () => expectSeverity(100, 109, round, "normal"));
  it("10 = mild", () => expectSeverity(100, 110, round, "mild", { personaOwner: "coach" }));
  it("17 = mild", () => expectSeverity(100, 117, round, "mild", { personaOwner: "coach" }));
  it("18 = big", () => expectSeverity(100, 118, round, "big", { personaOwner: "coach" }));
  it("29 = big", () => expectSeverity(100, 129, round, "big", { personaOwner: "coach" }));
  it("30 = massive Coach until 40", () =>
    expectSeverity(100, 130, round, "massive", { personaOwner: "coach" }));
  it("40 = massive Roxanne", () =>
    expectSeverity(100, 140, round, "massive", { personaOwner: "roxanne" }));
});

describe("reach boundaries — late (round 14)", () => {
  const round = 14;
  it("14 = normal", () => expectSeverity(180, 194, round, "normal"));
  it("15 = mild", () => expectSeverity(180, 195, round, "mild", { personaOwner: "coach" }));
  it("24 = mild", () => expectSeverity(180, 204, round, "mild", { personaOwner: "coach" }));
  it("25 = big", () => expectSeverity(180, 205, round, "big", { personaOwner: "coach" }));
  it("39 = big", () => expectSeverity(180, 219, round, "big", { personaOwner: "coach" }));
  it("40 = massive Roxanne", () =>
    expectSeverity(180, 220, round, "massive", { personaOwner: "roxanne" }));
});

describe("reach edge cases", () => {
  it("negative delta never a reach", () => {
    const r = classifyReach({ pickNumber: 50, playerAdp: 40, round: 4 });
    expect(r.isReach).toBe(false);
    expect(r.reachDelta).toBeLessThan(0);
  });

  it("zero delta never a reach", () => {
    const r = classifyReach({ pickNumber: 50, playerAdp: 50, round: 4 });
    expect(r.isReach).toBe(false);
    expect(r.reachDelta).toBe(0);
  });

  it("missing ADP never a reach", () => {
    expect(classifyReach({ pickNumber: 10, playerAdp: null, round: 2 }).isReach).toBe(false);
    expect(classifyReach({ pickNumber: 10, playerAdp: undefined, round: 2 }).isReach).toBe(false);
  });

  it("decimal ADP uses exact thresholds", () => {
    expect(classifyReach({ pickNumber: 10, playerAdp: 17.9, round: 3 }).severity).toBe("normal"); // 7.9
    expect(classifyReach({ pickNumber: 10, playerAdp: 18.0, round: 3 }).severity).toBe("mild"); // 8
    expect(classifyReach({ pickNumber: 10, playerAdp: 18.5, round: 3 }).severity).toBe("mild");
  });

  it("no reach at phase floors: 7 early / 9 middle / 14 late", () => {
    expect(classifyReach({ pickNumber: 20, playerAdp: 27, round: 3 }).isReach).toBe(false);
    expect(classifyReach({ pickNumber: 100, playerAdp: 109, round: 9 }).isReach).toBe(false);
    expect(classifyReach({ pickNumber: 180, playerAdp: 194, round: 14 }).isReach).toBe(false);
  });

  it(`outrageous floor is ${OUTRAGEOUS_REACH_MIN_DELTA}`, () => {
    expect(classifyReach({ pickNumber: 10, playerAdp: 49, round: 1 }).personaOwner).toBe("coach"); // 39
    expect(classifyReach({ pickNumber: 10, playerAdp: 50, round: 1 }).personaOwner).toBe("roxanne"); // 40
  });
});

describe("persona ownership via editorial assignment", () => {
  function bm(reach: ReachClassification, signals: string[]): BroadcastMoment {
    return {
      identity: { kind: "draft_pick", draftId: "d", pickNumber: 10, pickId: "p10" },
      momentType: "draft_pick",
      significance: reach.severity === "mild" ? "notable" : reach.severity === "massive" && reach.personaOwner === "roxanne" ? "historic" : "major",
      headline: null,
      context: { kind: "none" },
      factPacket: {
        subject: { ownerName: "A", playerName: "P", position: "WR", overallPick: 10, round: reach.round },
        verifiedFacts: ["A selected P."],
        entities: ["A", "P"],
      },
      commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
      signals,
      storylines: ["REACH"],
      receipts: [],
      primaryStoryline: "REACH",
      callbackKeys: [],
      reachClassification: reach,
    };
  }

  it("Coach owns mild and big reaches", () => {
    const mild = classifyReach({ pickNumber: 10, playerAdp: 20, round: 3 });
    const big = classifyReach({ pickNumber: 10, playerAdp: 28, round: 3 });
    expect(buildEditorialAssignment(bm(mild, ["REACH"]), new SessionEditorialLedger()).leadVoice).toBe("coach");
    expect(buildEditorialAssignment(bm(big, ["REACH:strong"]), new SessionEditorialLedger()).leadVoice).toBe("coach");
    expect(roxanneEligible(bm(mild, ["REACH"]))).toBe(false);
    expect(roxanneEligible(bm(big, ["REACH:strong"]))).toBe(false);
  });

  it("Coach owns massive 25–39", () => {
    const r = classifyReach({ pickNumber: 10, playerAdp: 40, round: 3 }); // 30 early
    expect(r.severity).toBe("massive");
    expect(r.personaOwner).toBe("coach");
    expect(buildEditorialAssignment(bm(r, ["REACH:strong"]), new SessionEditorialLedger()).leadVoice).toBe("coach");
  });

  it("Roxanne eligible only at 40+", () => {
    const r = classifyReach({ pickNumber: 10, playerAdp: 55, round: 3 }); // 45
    expect(r.personaOwner).toBe("roxanne");
    expect(roxanneEligible(bm(r, ["REACH:strong"]))).toBe(true);
    expect(buildEditorialAssignment(bm(r, ["REACH:strong"]), new SessionEditorialLedger()).leadVoice).toBe("roxanne");
  });
});

describe("classifier integration — steals/runs unchanged", () => {
  it("steal still uses config ADP thresholds", () => {
    const r = classifyMoment({
      position: "WR",
      round: 5,
      adpDelta: 40,
      tierCliffGap: 30,
      positionRunIncludingThis: 1,
      ownerTiming: null,
      dpDeviation: null,
    });
    expect(r.signals.map((s) => s.name).sort()).toEqual(["STEAL", "TIER_CLIFF"]);
    expect(r.level).toBe("historic");
  });

  it("routine silence when below reach floor", () => {
    const r = classifyMoment({
      position: "WR",
      round: 3,
      adpDelta: -7,
      overallPick: 10,
      tierCliffGap: null,
      positionRunIncludingThis: 1,
      ownerTiming: null,
      dpDeviation: null,
    });
    expect(r.signals).toEqual([]);
    expect(r.level).toBe("routine");
    expect(r.reach?.isReach).toBe(false);
  });
});
