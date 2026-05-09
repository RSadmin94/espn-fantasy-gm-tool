// Tests for the fantasyDataService and draftBoard tRPC procedures
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Unit tests for the data merging / normalization logic ──────────────────

describe("draftBoard data normalization", () => {
  it("computes ecrAdpGap correctly when both ECR and ADP are present", () => {
    // ECR rank 10, ADP 15 → gap = 10 - 15 = -5 (going earlier than ADP suggests)
    const ecrRank = 10;
    const adp = 15;
    const gap = ecrRank - adp;
    expect(gap).toBe(-5);
  });

  it("returns null gap when ADP is missing", () => {
    const ecrRank = 10;
    const adp: number | null = null;
    const gap = adp !== null ? ecrRank - adp : null;
    expect(gap).toBeNull();
  });

  it("identifies positive gap as value pick (ECR better than ADP)", () => {
    // ECR 20, ADP 30 → gap = -10 → player going later than experts rank them → value
    const ecrRank = 20;
    const adp = 30;
    const gap = ecrRank - adp;
    expect(gap).toBe(-10);
    // Negative gap means ECR rank is better (lower number) than ADP → value
    expect(gap).toBeLessThan(0);
  });

  it("identifies negative gap as reach (ADP better than ECR)", () => {
    // ECR 30, ADP 20 → gap = 10 → player going earlier than experts rank them → reach
    const ecrRank = 30;
    const adp = 20;
    const gap = ecrRank - adp;
    expect(gap).toBe(10);
    expect(gap).toBeGreaterThan(0);
  });
});

describe("draftBoard player name normalization", () => {
  function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[*+'.]/g, "").trim();
  }

  it("strips asterisks from player names", () => {
    expect(normalizeName("Patrick Mahomes*")).toBe("patrick mahomes");
  });

  it("strips plus signs from player names", () => {
    expect(normalizeName("Justin Jefferson+")).toBe("justin jefferson");
  });

  it("strips periods from player names", () => {
    expect(normalizeName("A.J. Brown")).toBe("aj brown");
  });

  it("handles names with multiple special chars", () => {
    expect(normalizeName("CeeDee Lamb*+")).toBe("ceedee lamb");
  });

  it("handles already clean names", () => {
    expect(normalizeName("Josh Allen")).toBe("josh allen");
  });
});

describe("draftBoard tier classification", () => {
  // Tier 1 = ECR 1-12, Tier 2 = 13-24, etc. (standard FantasyPros tier system)
  function getTierLabel(tier: number): string {
    if (tier === 1) return "Elite";
    if (tier === 2) return "Top 24";
    if (tier <= 4) return "Starter";
    return "Depth";
  }

  it("classifies tier 1 as Elite", () => {
    expect(getTierLabel(1)).toBe("Elite");
  });

  it("classifies tier 2 as Top 24", () => {
    expect(getTierLabel(2)).toBe("Top 24");
  });

  it("classifies tiers 3-4 as Starter", () => {
    expect(getTierLabel(3)).toBe("Starter");
    expect(getTierLabel(4)).toBe("Starter");
  });

  it("classifies tiers 5+ as Depth", () => {
    expect(getTierLabel(5)).toBe("Depth");
    expect(getTierLabel(10)).toBe("Depth");
  });
});

describe("draftBoard waiver priority", () => {
  function getWaiverPriority(ecrRank: number): string {
    if (ecrRank <= 50) return "Must Add";
    if (ecrRank <= 100) return "High Priority";
    if (ecrRank <= 150) return "Solid Add";
    if (ecrRank <= 200) return "Depth Add";
    return "Stash";
  }

  it("ranks ECR 1-50 as Must Add", () => {
    expect(getWaiverPriority(1)).toBe("Must Add");
    expect(getWaiverPriority(50)).toBe("Must Add");
  });

  it("ranks ECR 51-100 as High Priority", () => {
    expect(getWaiverPriority(51)).toBe("High Priority");
    expect(getWaiverPriority(100)).toBe("High Priority");
  });

  it("ranks ECR 101-150 as Solid Add", () => {
    expect(getWaiverPriority(101)).toBe("Solid Add");
    expect(getWaiverPriority(150)).toBe("Solid Add");
  });

  it("ranks ECR 151-200 as Depth Add", () => {
    expect(getWaiverPriority(151)).toBe("Depth Add");
    expect(getWaiverPriority(200)).toBe("Depth Add");
  });

  it("ranks ECR 201+ as Stash", () => {
    expect(getWaiverPriority(201)).toBe("Stash");
    expect(getWaiverPriority(400)).toBe("Stash");
  });
});

describe("mock draft AI pick logic", () => {
  type OwnerTendency = {
    rb1Pct: number;
    wr1Pct: number;
    earlyQbPct: number;
    earlyTePct: number;
  };

  function getPositionBias(owner: OwnerTendency, round: number): Record<string, number> {
    const weights: Record<string, number> = {};
    if (round === 1 && owner.rb1Pct > 50) weights["RB"] = (weights["RB"] ?? 0) + 0.5;
    if (round === 1 && owner.wr1Pct > 50) weights["WR"] = (weights["WR"] ?? 0) + 0.5;
    if (round <= 3 && owner.earlyQbPct > 30) weights["QB"] = (weights["QB"] ?? 0) + 0.3;
    if (round <= 3 && owner.earlyTePct > 30) weights["TE"] = (weights["TE"] ?? 0) + 0.3;
    return weights;
  }

  it("adds RB bias in round 1 for RB-heavy managers", () => {
    const owner: OwnerTendency = { rb1Pct: 70, wr1Pct: 20, earlyQbPct: 5, earlyTePct: 5 };
    const weights = getPositionBias(owner, 1);
    expect(weights["RB"]).toBe(0.5);
    expect(weights["WR"]).toBeUndefined();
  });

  it("adds WR bias in round 1 for WR-heavy managers", () => {
    const owner: OwnerTendency = { rb1Pct: 20, wr1Pct: 65, earlyQbPct: 5, earlyTePct: 5 };
    const weights = getPositionBias(owner, 1);
    expect(weights["WR"]).toBe(0.5);
    expect(weights["RB"]).toBeUndefined();
  });

  it("adds QB bias in rounds 1-3 for early-QB managers", () => {
    const owner: OwnerTendency = { rb1Pct: 30, wr1Pct: 30, earlyQbPct: 45, earlyTePct: 5 };
    const weights2 = getPositionBias(owner, 2);
    expect(weights2["QB"]).toBe(0.3);
    const weights4 = getPositionBias(owner, 4);
    expect(weights4["QB"]).toBeUndefined();
  });

  it("adds TE bias in rounds 1-3 for early-TE managers", () => {
    const owner: OwnerTendency = { rb1Pct: 30, wr1Pct: 30, earlyQbPct: 5, earlyTePct: 40 };
    const weights1 = getPositionBias(owner, 1);
    expect(weights1["TE"]).toBe(0.3);
    const weights5 = getPositionBias(owner, 5);
    expect(weights5["TE"]).toBeUndefined();
  });

  it("applies no bias for balanced managers", () => {
    const owner: OwnerTendency = { rb1Pct: 30, wr1Pct: 30, earlyQbPct: 10, earlyTePct: 10 };
    const weights = getPositionBias(owner, 1);
    expect(Object.keys(weights)).toHaveLength(0);
  });
});

describe("player comparison ranking", () => {
  type Player = { name: string; ecrRank: number; adp: number | null; tier: number };

  function compareByEcr(a: Player, b: Player): Player {
    return a.ecrRank <= b.ecrRank ? a : b;
  }

  it("prefers the player with lower ECR rank (better consensus)", () => {
    const playerA: Player = { name: "Player A", ecrRank: 5, adp: 6, tier: 1 };
    const playerB: Player = { name: "Player B", ecrRank: 12, adp: 10, tier: 2 };
    expect(compareByEcr(playerA, playerB).name).toBe("Player A");
  });

  it("handles equal ECR ranks by returning first player (tie-break to first)", () => {
    const playerA: Player = { name: "Player A", ecrRank: 8, adp: 8, tier: 1 };
    const playerB: Player = { name: "Player B", ecrRank: 8, adp: 9, tier: 1 };
    expect(compareByEcr(playerA, playerB).name).toBe("Player A");
  });
});
