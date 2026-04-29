import { describe, it, expect } from "vitest";

// ── Replicate the pick value formula ─────────────────────────────────────────
const TEAMS = 14;
const BASE = 3000;
const K = 0.028;

function pickValue(round: number, pickInRound: number): number {
  const overall = (round - 1) * TEAMS + (round % 2 === 1 ? pickInRound : TEAMS + 1 - pickInRound);
  return Math.round(BASE * Math.exp(-K * (overall - 1)));
}

function tradeVerdict(sideA: Array<{ round: number; pickInRound: number }>, sideB: Array<{ round: number; pickInRound: number }>) {
  const valueA = sideA.reduce((s, p) => s + pickValue(p.round, p.pickInRound), 0);
  const valueB = sideB.reduce((s, p) => s + pickValue(p.round, p.pickInRound), 0);
  const pct = valueB > 0 ? Math.round((valueA / valueB) * 100) : 0;
  const verdict: "WIN" | "FAIR" | "LOSS" = pct >= 110 ? "WIN" : pct >= 90 ? "FAIR" : "LOSS";
  return { valueA, valueB, pct, verdict };
}

// ── Pick value chart tests ────────────────────────────────────────────────────
describe("14-team PPR pick value chart", () => {
  it("anchors pick 1.01 at 3000", () => {
    expect(pickValue(1, 1)).toBe(3000);
  });

  it("end of round 1 (1.14) is approximately 2085", () => {
    const v = pickValue(1, 14);
    expect(v).toBeGreaterThanOrEqual(2080);
    expect(v).toBeLessThanOrEqual(2090);
  });

  it("snake draft: pick 2.14 is the 15th overall and adjacent to 1.14", () => {
    // In a snake draft, round 2 runs in reverse: 2.14 is the first pick of round 2
    const v1_14 = pickValue(1, 14); // last pick of round 1
    const v2_14 = pickValue(2, 14); // first pick of round 2 (snake)
    // They should be close in value (adjacent overall picks)
    expect(Math.abs(v1_14 - v2_14)).toBeLessThan(100);
  });

  it("end of round 2 (2.01) is approximately 1409", () => {
    const v = pickValue(2, 1);
    expect(v).toBeGreaterThanOrEqual(1400);
    expect(v).toBeLessThanOrEqual(1420);
  });

  it("end of round 3 (3.14) is approximately 952", () => {
    const v = pickValue(3, 14);
    expect(v).toBeGreaterThanOrEqual(945);
    expect(v).toBeLessThanOrEqual(960);
  });

  it("end of round 5 (5.14) is approximately 435", () => {
    const v = pickValue(5, 14);
    expect(v).toBeGreaterThanOrEqual(430);
    expect(v).toBeLessThanOrEqual(440);
  });

  it("value decreases monotonically across overall pick order", () => {
    // Values decrease as overall pick number increases (not necessarily by snake position)
    let prev = 3001;
    for (let overall = 1; overall <= TEAMS * 15; overall++) {
      const round = Math.ceil(overall / TEAMS);
      const positionInRound = overall - (round - 1) * TEAMS;
      const pir = round % 2 === 1 ? positionInRound : TEAMS + 1 - positionInRound;
      const v = pickValue(round, pir);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("last pick (15.14 or 15.01 depending on snake) is at least 1", () => {
    // Round 15 is odd, so it runs 1→14. Last pick is 15.14
    const v = pickValue(15, 14);
    expect(v).toBeGreaterThanOrEqual(1);
  });

  it("generates exactly 210 unique picks (14 teams × 15 rounds)", () => {
    const seen = new Set<string>();
    for (let round = 1; round <= 15; round++) {
      for (let pos = 1; pos <= TEAMS; pos++) {
        const pir = round % 2 === 1 ? pos : TEAMS + 1 - pos;
        seen.add(`${round}.${pir}`);
      }
    }
    expect(seen.size).toBe(210);
  });
});

// ── Trade verdict tests ───────────────────────────────────────────────────────
describe("pick trade verdict logic", () => {
  it("returns WIN when side A value is ≥ 110% of side B", () => {
    // 1.01 (3000) vs 1.14 (2085) — ratio ≈ 144%
    const result = tradeVerdict(
      [{ round: 1, pickInRound: 1 }],
      [{ round: 1, pickInRound: 14 }]
    );
    expect(result.verdict).toBe("WIN");
    expect(result.pct).toBeGreaterThanOrEqual(110);
  });

  it("returns LOSS when side A value is < 90% of side B", () => {
    // 1.14 (2085) vs 1.01 (3000) — ratio ≈ 70%
    const result = tradeVerdict(
      [{ round: 1, pickInRound: 14 }],
      [{ round: 1, pickInRound: 1 }]
    );
    expect(result.verdict).toBe("LOSS");
    expect(result.pct).toBeLessThan(90);
  });

  it("returns FAIR when ratio is between 90% and 110%", () => {
    // 1.07 (2536) vs 1.08 (2466) — ratio ≈ 103%
    const result = tradeVerdict(
      [{ round: 1, pickInRound: 7 }],
      [{ round: 1, pickInRound: 8 }]
    );
    expect(result.verdict).toBe("FAIR");
    expect(result.pct).toBeGreaterThanOrEqual(90);
    expect(result.pct).toBeLessThan(110);
  });

  it("handles multi-pick trades: two 2nd-round picks vs one 1st-round pick", () => {
    // 2.01 (1409) + 2.07 (1666) = 3075 vs 1.01 (3000) — ratio ≈ 102% → FAIR
    const result = tradeVerdict(
      [{ round: 2, pickInRound: 1 }, { round: 2, pickInRound: 7 }],
      [{ round: 1, pickInRound: 1 }]
    );
    expect(result.valueA).toBeGreaterThan(result.valueB);
    // 3075 / 3000 ≈ 102% — between 90-110% so FAIR
    expect(result.verdict).toBe("FAIR");
  });

  it("handles empty side B gracefully (pct = 0)", () => {
    const result = tradeVerdict(
      [{ round: 1, pickInRound: 1 }],
      []
    );
    expect(result.pct).toBe(0);
    expect(result.verdict).toBe("LOSS");
  });

  it("exact same picks on both sides returns FAIR (100%)", () => {
    const result = tradeVerdict(
      [{ round: 2, pickInRound: 5 }],
      [{ round: 2, pickInRound: 5 }]
    );
    expect(result.verdict).toBe("FAIR");
    expect(result.pct).toBe(100);
  });

  it("Tony Dorsey scenario: 1.03 for 2.01 + 3.01", () => {
    // 1.03 ≈ 2837 vs 2.01 (1409) + 3.01 (1370) = 2779 — ratio ≈ 102% → FAIR/WIN
    const result = tradeVerdict(
      [{ round: 1, pickInRound: 3 }],
      [{ round: 2, pickInRound: 1 }, { round: 3, pickInRound: 1 }]
    );
    expect(result.valueA).toBeGreaterThan(0);
    expect(result.valueB).toBeGreaterThan(0);
    // 2837 vs 2779 → ratio ≈ 102% → FAIR
    expect(result.verdict).toBe("FAIR");
  });
});
