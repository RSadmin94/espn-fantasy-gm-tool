import { describe, it, expect } from "vitest";
import {
  compareGivenSideTotals,
  compareReceivedSideTotals,
  fairnessGradeFromGainRatio,
  isChronologicalOverallPick,
  parsePickLabel,
  pickPackageVerdictForSideA,
  resolveAndValueTradePick,
  resolveTradePickSlot,
  sumPickLabels,
  sumTradePickValues,
  toTradeAgingVerdict,
  PICK_TO_MARKET_SCALE,
} from "./tradePickValueAuthority";

const TC = 14;

describe("resolveTradePickSlot", () => {
  it("prefers explicit round/pick over ESPN pick-slot id in overallPickNumber", () => {
    const slot = resolveTradePickSlot({
      round: 1,
      pickInRound: 11,
      overallPickNumber: 512, // slot id — not chronological overall
      teamCount: TC,
      roundCount: 15,
    });
    expect(slot.round).toBe(1);
    expect(slot.pickInRound).toBe(11);
    expect(slot.source).toBe("explicit");
  });

  it("derives from chronological overall when explicit slot missing", () => {
    const slot = resolveTradePickSlot({
      overallPickNumber: 20,
      teamCount: TC,
      roundCount: 15,
    });
    expect(slot.round).toBe(2);
    expect(slot.pickInRound).toBe(9);
    expect(slot.source).toBe("overall");
  });

  it("returns unknown for missing geometry", () => {
    const slot = resolveTradePickSlot({
      round: 1,
      pickInRound: 11,
      overallPickNumber: 512,
      teamCount: 0,
    });
    expect(slot.source).toBe("unknown");
    expect(resolveAndValueTradePick({ round: 1, pickInRound: 11, teamCount: 0 }).rawValue).toBe(0);
  });
});

describe("isChronologicalOverallPick", () => {
  it("accepts valid overall picks for league size", () => {
    expect(isChronologicalOverallPick(11, TC, 15)).toBe(true);
    expect(isChronologicalOverallPick(39, TC, 15)).toBe(true);
  });

  it("rejects ESPN slot ids above draft slot count", () => {
    expect(isChronologicalOverallPick(512, TC, 15)).toBe(false);
  });
});

describe("known pick trade R1.11 vs R2.09 (14-team)", () => {
  const givenA = resolveAndValueTradePick({ round: 1, pickInRound: 11, teamCount: TC }).rawValue;
  const givenB = resolveAndValueTradePick({ round: 2, pickInRound: 9, teamCount: TC }).rawValue;

  it("values R1.11 above R2.09", () => {
    expect(givenA).toBeGreaterThan(givenB);
  });

  it("proposed trade: B wins when A gives R1.11 and B gives R2.09", () => {
    const proposed = compareGivenSideTotals(givenA, givenB);
    expect(proposed.winner).toBe("B");
    expect(proposed.fairnessGrade).toBe("B WINS");
    expect(pickPackageVerdictForSideA(givenA, givenB)).toBe("LOSS");
  });

  it("completed trade: same winner when sides are received values", () => {
    const completed = compareReceivedSideTotals(givenB, givenA);
    expect(completed.winner).toBe("B");
    expect(toTradeAgingVerdict(completed.winner)).toBe("sideB");
  });

  it("market-scaled proposed totals preserve winner", () => {
    const mA = Math.round(givenA * PICK_TO_MARKET_SCALE);
    const mB = Math.round(givenB * PICK_TO_MARKET_SCALE);
    const proposed = compareGivenSideTotals(mA, mB, Math.round(50 * PICK_TO_MARKET_SCALE));
    expect(proposed.winner).toBe("B");
  });

  it("reversed sides flip winner", () => {
    const proposed = compareGivenSideTotals(givenB, givenA);
    expect(proposed.winner).toBe("A");
    expect(proposed.fairnessGrade).toBe("A WINS");
  });
});

describe("pick-only trade via sumTradePickValues", () => {
  it("aggregates multi-pick sides", () => {
    const a = sumTradePickValues([{ round: 1, pick: 11 }], TC, "raw");
    const b = sumTradePickValues([{ round: 2, pick: 9 }], TC, "raw");
    expect(compareGivenSideTotals(a, b).winner).toBe("B");
  });
});

describe("player + pick trade (pick portion only)", () => {
  it("pick values add to side totals consistently", () => {
    const playerA = 120;
    const pickB = sumTradePickValues([{ round: 2, pick: 9 }], TC, "market");
    const playerB = 80;
    const pickA = sumTradePickValues([{ round: 1, pick: 11 }], TC, "market");
    const cmp = compareGivenSideTotals(playerA + pickA, playerB + pickB, Math.round(50 * PICK_TO_MARKET_SCALE));
    expect(cmp.winner).toBe("B");
  });
});

describe("unknown pick slot", () => {
  it("values unknown picks at zero without throwing", () => {
    const v = resolveAndValueTradePick({ round: 0, pickInRound: 0, teamCount: TC }).rawValue;
    expect(v).toBe(0);
    const cmp = compareGivenSideTotals(0, 500);
    expect(cmp.winner).toBe("A");
    expect(compareGivenSideTotals(0, 0).winner).toBe("even");
  });
});

describe("future pick labels (year ignored for value — same slot curve)", () => {
  it("parses and values 2027 R1.11 same as current-year slot", () => {
    const labels = ["2027 R1.11"];
    const v = sumPickLabels(labels, TC, "raw");
    const direct = resolveAndValueTradePick({ round: 1, pickInRound: 11, teamCount: TC }).rawValue;
    expect(v).toBe(direct);
  });
});

describe("completed ESPN pick trade fixture (overall 7 vs 39)", () => {
  it("matches tradeAging geometry from espnTrade2026.test", () => {
    const receivedA = resolveAndValueTradePick({ overallPickNumber: 39, teamCount: TC, roundCount: 15 }).rawValue;
    const receivedB = resolveAndValueTradePick({ overallPickNumber: 7, teamCount: TC, roundCount: 15 }).rawValue;
    // Team receiving overall 39 (later pick) vs team receiving overall 7 (earlier pick)
    const cmp = compareReceivedSideTotals(receivedA, receivedB);
    expect(cmp.winner).toBe("B");
  });

  it("parsePickLabel handles transaction copy", () => {
    expect(parsePickLabel("2026 R1.11")).toEqual({ round: 1, pickInRound: 11 });
    expect(parsePickLabel("2026 R2.09")).toEqual({ round: 2, pickInRound: 9 });
  });

  it("sumPickLabels matches manual slot math for pick-only executed trade", () => {
    const toA = sumPickLabels(["2026 R2.09"], TC, "raw");
    const toB = sumPickLabels(["2026 R1.11"], TC, "raw");
    const cmp = compareReceivedSideTotals(toA, toB);
    expect(cmp.winner).toBe("B");
  });
});

describe("fairnessGradeFromGainRatio", () => {
  it("aligns with compareGivenSideTotals", () => {
    const cmp = compareGivenSideTotals(3000, 2000);
    expect(cmp.fairnessGrade).toBe(fairnessGradeFromGainRatio(cmp.gainRatioA));
  });
});
