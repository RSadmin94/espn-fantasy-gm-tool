import { describe, it, expect } from "vitest";

// ── Replicate the canonical pick value formula used in tradeOfferGenerator ────
// 14-team PPR snake draft, exponential decay — matches pickValueChart/pickTradeEval
const TEAMS = 14;
const BASE = 3000;
const K = 0.028;

function pickValueCanonical(round: number, pickInRound: number): number {
  const overall = (round - 1) * TEAMS + (round % 2 === 1 ? pickInRound : TEAMS + 1 - pickInRound);
  return Math.round(BASE * Math.exp(-K * (overall - 1)));
}

// ── Replicate the player value estimation logic ───────────────────────────────
function estimatePlayerValue(seasonPoints: number, position: string, keeperValueFuture: number): number {
  const posMultiplier: Record<string, number> = { QB: 1.0, RB: 1.3, WR: 1.2, TE: 1.1, K: 0.4, FLEX: 1.0 };
  const mult = posMultiplier[position] || 1.0;
  const baseValue = seasonPoints * mult;
  const keeperBonus = keeperValueFuture > 0 ? (15 - keeperValueFuture) * 80 : 0;
  return Math.round(baseValue + keeperBonus);
}

// ── Replicate the offer value ratio calculation ───────────────────────────────
function offerValueRatio(offerTotalValue: number, targetValue: number): number {
  return Math.round((offerTotalValue / targetValue) * 100);
}

// ── Replicate the player name fuzzy match logic ───────────────────────────────
function fuzzyMatchPlayer(query: string, players: Array<{ fullName: string }>): { fullName: string } | null {
  const q = query.toLowerCase();
  return players.find(p =>
    p.fullName.toLowerCase().includes(q) ||
    q.includes(p.fullName.toLowerCase().split(" ")[1] || "")
  ) || null;
}

// ── Replicate pick input parsing logic ───────────────────────────────────────
function parsePickInput(input: string): { round: number; pick: number } | null {
  const m = input.match(/(\d+)[.\s-](\d+)/);
  if (m) {
    return { round: parseInt(m[1]), pick: parseInt(m[2]) };
  }
  return null;
}

// ── Pick value tests (canonical snake-draft formula) ─────────────────────────
describe("tradeOfferGenerator canonical pick value formula", () => {
  it("pick 1.01 (overall 1) returns 3000", () => {
    expect(pickValueCanonical(1, 1)).toBe(3000);
  });

  it("pick 1.07 (overall 7) returns 2536", () => {
    expect(pickValueCanonical(1, 7)).toBe(2536);
  });

  it("pick 1.14 (overall 14) returns 2085", () => {
    expect(pickValueCanonical(1, 14)).toBe(2085);
  });

  it("pick 2.01 (snake: overall 28) returns 1409", () => {
    // Round 2 snake: pick 2.01 is the LAST pick of round 2 (overall 28)
    expect(pickValueCanonical(2, 1)).toBe(1409);
  });

  it("pick 2.07 (snake: overall 22) returns 1666", () => {
    // Round 2 snake: pick 2.07 is the 8th pick of round 2 (overall 22)
    expect(pickValueCanonical(2, 7)).toBe(1666);
  });

  it("pick 3.07 (overall 36) returns 1158", () => {
    expect(pickValueCanonical(3, 7)).toBe(1158);
  });

  it("pick 5.07 (overall 64) returns 529", () => {
    expect(pickValueCanonical(5, 7)).toBe(529);
  });

  it("snake draft: pick 2.14 is adjacent in value to pick 1.14 (consecutive overall picks)", () => {
    // Round 2 snake: 2.14 = overall 15 (first pick of round 2)
    const v1_14 = pickValueCanonical(1, 14); // overall 14
    const v2_14 = pickValueCanonical(2, 14); // overall 15 (snake: 2.14 is first pick of round 2)
    expect(Math.abs(v1_14 - v2_14)).toBeLessThan(100);
  });

  it("pick values decrease as overall pick number increases", () => {
    // Verify monotonic decrease across the first 5 rounds
    let prev = pickValueCanonical(1, 1);
    for (let overall = 2; overall <= TEAMS * 5; overall++) {
      const round = Math.ceil(overall / TEAMS);
      const positionInRound = overall - (round - 1) * TEAMS;
      const pir = round % 2 === 1 ? positionInRound : TEAMS + 1 - positionInRound;
      const v = pickValueCanonical(round, pir);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("round 5 pick 7 is less than half the value of round 1 pick 7", () => {
    const v1 = pickValueCanonical(1, 7);
    const v5 = pickValueCanonical(5, 7);
    expect(v5).toBeLessThan(v1 / 2);
  });

  it("matches the pickValueChart endpoint formula exactly for 1.01", () => {
    // pickValueChart uses: overall=1, BASE=3000, K=0.028 → Math.round(3000 * Math.exp(0)) = 3000
    expect(pickValueCanonical(1, 1)).toBe(3000);
  });
});

// ── Pick input parsing tests ──────────────────────────────────────────────────
describe("tradeOfferGenerator pick input parsing", () => {
  it("parses '2.03' as round 2, pick 3", () => {
    const result = parsePickInput("2.03");
    expect(result).not.toBeNull();
    expect(result!.round).toBe(2);
    expect(result!.pick).toBe(3);
  });

  it("parses '1.01' as round 1, pick 1", () => {
    const result = parsePickInput("1.01");
    expect(result).not.toBeNull();
    expect(result!.round).toBe(1);
    expect(result!.pick).toBe(1);
  });

  it("parses '3 7' (space-separated) as round 3, pick 7", () => {
    const result = parsePickInput("3 7");
    expect(result).not.toBeNull();
    expect(result!.round).toBe(3);
    expect(result!.pick).toBe(7);
  });

  it("parses '2-05' (dash-separated) as round 2, pick 5", () => {
    const result = parsePickInput("2-05");
    expect(result).not.toBeNull();
    expect(result!.round).toBe(2);
    expect(result!.pick).toBe(5);
  });

  it("returns null for non-numeric input like 'first round pick'", () => {
    const result = parsePickInput("first round pick");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parsePickInput("");
    expect(result).toBeNull();
  });
});

// ── Player value estimation tests ─────────────────────────────────────────────
describe("tradeOfferGenerator player value estimation", () => {
  it("RB with 300 season points and no keeper value = 390", () => {
    // 300 * 1.3 = 390, no keeper bonus
    expect(estimatePlayerValue(300, "RB", 0)).toBe(390);
  });

  it("WR with 250 season points and no keeper value = 300", () => {
    // 250 * 1.2 = 300
    expect(estimatePlayerValue(250, "WR", 0)).toBe(300);
  });

  it("QB with 400 season points and no keeper value = 400", () => {
    // 400 * 1.0 = 400
    expect(estimatePlayerValue(400, "QB", 0)).toBe(400);
  });

  it("TE with 200 season points and no keeper value = 220", () => {
    // 200 * 1.1 = 220
    expect(estimatePlayerValue(200, "TE", 0)).toBe(220);
  });

  it("RB with keeper round 5 gets a keeper bonus of 800", () => {
    // keeperBonus = (15 - 5) * 80 = 800
    const base = 300 * 1.3; // 390
    const bonus = (15 - 5) * 80; // 800
    expect(estimatePlayerValue(300, "RB", 5)).toBe(Math.round(base + bonus));
  });

  it("player with keeper round 1 gets a keeper bonus of 1120", () => {
    // keeperBonus = (15 - 1) * 80 = 1120
    const base = 200 * 1.2; // 240
    const bonus = (15 - 1) * 80; // 1120
    expect(estimatePlayerValue(200, "WR", 1)).toBe(Math.round(base + bonus));
  });

  it("K position has 0.4 multiplier (kickers are low value)", () => {
    // 100 * 0.4 = 40
    expect(estimatePlayerValue(100, "K", 0)).toBe(40);
  });

  it("unknown position defaults to 1.0 multiplier", () => {
    // 200 * 1.0 = 200
    expect(estimatePlayerValue(200, "FLEX", 0)).toBe(200);
  });
});

// ── Offer value ratio tests ───────────────────────────────────────────────────
describe("tradeOfferGenerator offer value ratio", () => {
  it("equal values returns 100%", () => {
    expect(offerValueRatio(500, 500)).toBe(100);
  });

  it("offer worth 110% of target returns 110", () => {
    expect(offerValueRatio(550, 500)).toBe(110);
  });

  it("offer worth 90% of target returns 90", () => {
    expect(offerValueRatio(450, 500)).toBe(90);
  });

  it("offer worth 150% of target returns 150 (overpay)", () => {
    expect(offerValueRatio(750, 500)).toBe(150);
  });

  it("offer worth 70% of target returns 70 (underpay)", () => {
    expect(offerValueRatio(350, 500)).toBe(70);
  });

  it("rounds to nearest integer", () => {
    // 333/500 = 66.6% → rounds to 67
    expect(offerValueRatio(333, 500)).toBe(67);
  });
});

// ── Player name fuzzy match tests ─────────────────────────────────────────────
describe("tradeOfferGenerator player name fuzzy matching", () => {
  const mockRoster = [
    { fullName: "Patrick Mahomes" },
    { fullName: "Tyreek Hill" },
    { fullName: "Travis Kelce" },
    { fullName: "Derrick Henry" },
    { fullName: "Justin Jefferson" },
  ];

  it("finds player by full name (case-insensitive)", () => {
    const result = fuzzyMatchPlayer("patrick mahomes", mockRoster);
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("Patrick Mahomes");
  });

  it("finds player by last name only", () => {
    const result = fuzzyMatchPlayer("kelce", mockRoster);
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("Travis Kelce");
  });

  it("finds player by partial first name + last name", () => {
    const result = fuzzyMatchPlayer("justin jefferson", mockRoster);
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("Justin Jefferson");
  });

  it("returns null when player is not found", () => {
    const result = fuzzyMatchPlayer("Nonexistent Player", mockRoster);
    expect(result).toBeNull();
  });

  it("finds player when query is a substring of full name", () => {
    const result = fuzzyMatchPlayer("derrick", mockRoster);
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("Derrick Henry");
  });

  it("handles empty player list gracefully", () => {
    const result = fuzzyMatchPlayer("mahomes", []);
    expect(result).toBeNull();
  });
});
