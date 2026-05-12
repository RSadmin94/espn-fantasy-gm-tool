/**
 * mockDraftIntelligence.test.ts
 *
 * Tests for the 5 pure mock draft intelligence functions extracted from MockDraftSimulator.tsx.
 *
 * Functions under test:
 *   1. calcSurvivalProb  — probability a player survives to Rod's next pick
 *   2. calcBestFit       — how well a player fits Rod's current roster
 *   3. calcChampEquityDelta — championship equity delta for drafting a player
 *   4. calcOpportunityBoard — live exploit opportunities during the draft
 *   5. calcRunAlerts     — position run detection (4+ picks of same position in last 12)
 *
 * All functions are pure (no React, no DB, no ESPN API) and can be tested in isolation.
 */
import { describe, it, expect } from "vitest";
import {
  calcSurvivalProb,
  calcBestFit,
  calcChampEquityDelta,
  calcOpportunityBoard,
  calcRunAlerts,
  type MergedPlayerLite,
  type DraftPickLite,
  type MockOwnerLite,
} from "../client/src/lib/mockDraftUtils";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let nextId = 1;
function makePlayer(overrides: Partial<MergedPlayerLite> = {}): MergedPlayerLite {
  const id = nextId++;
  return {
    fpId: id,
    playerName: `Player ${id}`,
    position: "RB",
    ecrRank: id * 5,
    adpRank: id * 5 + 2,
    ecrAdpGap: 2,
    pfr2025: { vbd: 50 },
    ...overrides,
  };
}

function makePick(
  owner: string,
  player: MergedPlayerLite,
  overall: number,
  isKeeper = false
): DraftPickLite {
  const round = Math.ceil(overall / 14);
  return {
    round,
    pick: overall - (round - 1) * 14,
    overall,
    owner,
    player,
    isKeeper,
  };
}

function makeOwner(overrides: Partial<MockOwnerLite> = {}): MockOwnerLite {
  return {
    teamId: 1,
    teamName: "Test Team",
    ownerName: "Test Owner",
    draftSlot: 1,
    isRod: false,
    gmArchetype: "Balanced Manager",
    draftStyleBadge: "Balanced Drafter",
    reachPositions: [],
    valuePositions: [],
    biasVsLeague: {},
    round1Distribution: {},
    keeperRate: 50,
    tiltScore: 20,
    exploitabilityScore: 30,
    recommendedKeeper: null,
    allKeeperOptions: [],
    keeperPrediction: "Will keep best value player",
    ...overrides,
  };
}

// ─── calcSurvivalProb ─────────────────────────────────────────────────────────

describe("calcSurvivalProb", () => {
  it("returns pct=100 when picksUntilRod <= 0 (it's Rod's pick now)", () => {
    const player = makePlayer({ position: "RB", ecrRank: 5 });
    const result = calcSurvivalProb(player, 0, [], [], [player]);
    expect(result.pct).toBe(100);
    expect(result.tooltip).toContain("Your pick now");
  });

  it("returns pct=100 when picksUntilRod is negative", () => {
    const player = makePlayer({ position: "RB", ecrRank: 5 });
    const result = calcSurvivalProb(player, -3, [], [], [player]);
    expect(result.pct).toBe(100);
  });

  it("returns lower survival probability with more owners picking before Rod", () => {
    const player = makePlayer({ position: "RB", ecrRank: 5 });
    const allPlayers = [player, ...Array.from({ length: 20 }, () => makePlayer({ position: "WR" }))];

    // 1 owner before Rod
    const result1 = calcSurvivalProb(player, 1, [makeOwner()], [], allPlayers);
    // 5 owners before Rod
    const result5 = calcSurvivalProb(player, 5, [
      makeOwner(), makeOwner({ ownerName: "O2" }), makeOwner({ ownerName: "O3" }),
      makeOwner({ ownerName: "O4" }), makeOwner({ ownerName: "O5" }),
    ], [], allPlayers);

    expect(result5.pct).toBeLessThanOrEqual(result1.pct);
  });

  it("returns lower survival probability for elite players (ECR rank 1-3) vs deep players", () => {
    const elitePlayer = makePlayer({ fpId: 1001, position: "RB", ecrRank: 2 });
    const deepPlayer = makePlayer({ fpId: 1002, position: "RB", ecrRank: 80 });
    const allPlayers = [elitePlayer, deepPlayer];
    const owners = [makeOwner()];

    const eliteResult = calcSurvivalProb(elitePlayer, 3, owners, [], allPlayers);
    const deepResult = calcSurvivalProb(deepPlayer, 3, owners, [], allPlayers);

    expect(deepResult.pct).toBeGreaterThanOrEqual(eliteResult.pct);
  });

  it("increases threat probability for owners who overvalue that position (positive bias)", () => {
    const player = makePlayer({ fpId: 2001, position: "RB", ecrRank: 10 });
    const allPlayers = [player];

    const neutralOwner = makeOwner({ biasVsLeague: { RB: 0 } });
    const rbFanaticOwner = makeOwner({ biasVsLeague: { RB: 3 }, reachPositions: ["RB"] });

    const neutralResult = calcSurvivalProb(player, 1, [neutralOwner], [], allPlayers);
    const fanaticResult = calcSurvivalProb(player, 1, [rbFanaticOwner], [], allPlayers);

    expect(fanaticResult.pct).toBeLessThanOrEqual(neutralResult.pct);
  });

  it("tooltip mentions threatening owners by first name", () => {
    const player = makePlayer({ fpId: 3001, position: "RB", ecrRank: 3 });
    const allPlayers = [player];
    const owner = makeOwner({ ownerName: "John Smith", biasVsLeague: { RB: 3 }, reachPositions: ["RB"] });

    const result = calcSurvivalProb(player, 1, [owner], [], allPlayers);
    // If the owner is a threat, their first name should appear in the tooltip
    if (result.pct < 100) {
      expect(result.tooltip).toContain("John");
    }
  });

  it("pct is always between 0 and 100", () => {
    const player = makePlayer({ fpId: 4001, position: "RB", ecrRank: 1 });
    const allPlayers = [player];
    const manyOwners = Array.from({ length: 13 }, (_, i) =>
      makeOwner({ ownerName: `Owner ${i}`, biasVsLeague: { RB: 5 }, reachPositions: ["RB"] })
    );
    const result = calcSurvivalProb(player, 13, manyOwners, [], allPlayers);
    expect(result.pct).toBeGreaterThanOrEqual(0);
    expect(result.pct).toBeLessThanOrEqual(100);
  });
});

// ─── calcBestFit ──────────────────────────────────────────────────────────────

describe("calcBestFit", () => {
  it("returns higher score when player fills a positional gap", () => {
    const rbPlayer = makePlayer({ fpId: 5001, position: "RB", ecrRank: 20, ecrAdpGap: 2 });
    const emptyRoster: DraftPickLite[] = [];  // Rod has no RBs
    const fullRBRoster: DraftPickLite[] = [
      makePick("Rod", makePlayer({ fpId: 5002, position: "RB" }), 1),
      makePick("Rod", makePlayer({ fpId: 5003, position: "RB" }), 15),
      makePick("Rod", makePlayer({ fpId: 5004, position: "RB" }), 29),
    ];
    const available = [rbPlayer];

    const gapResult = calcBestFit(rbPlayer, emptyRoster, available);
    const fullResult = calcBestFit(rbPlayer, fullRBRoster, available);

    expect(gapResult.score).toBeGreaterThan(fullResult.score);
  });

  it("score is higher when player has positive ECR/ADP gap (value surplus)", () => {
    const valuePick = makePlayer({ fpId: 6001, position: "WR", ecrRank: 20, ecrAdpGap: 15 });
    const fairPick = makePlayer({ fpId: 6002, position: "WR", ecrRank: 20, ecrAdpGap: 0 });
    const roster: DraftPickLite[] = [];
    const available = [valuePick, fairPick];

    const valueResult = calcBestFit(valuePick, roster, available);
    const fairResult = calcBestFit(fairPick, roster, available);

    expect(valueResult.score).toBeGreaterThan(fairResult.score);
  });

  it("score is higher when position is scarce (few remaining in top 50)", () => {
    // Only 1 TE in top 50 = very scarce
    const tePlayer = makePlayer({ fpId: 7001, position: "TE", ecrRank: 30, ecrAdpGap: 2 });
    const scarceAvailable = [tePlayer]; // only 1 TE in top 50
    const deepAvailable = Array.from({ length: 10 }, (_, i) =>
      makePlayer({ fpId: 7100 + i, position: "TE", ecrRank: 10 + i * 3 })
    );

    const scarceResult = calcBestFit(tePlayer, [], scarceAvailable);
    const deepResult = calcBestFit(tePlayer, [], deepAvailable);

    expect(scarceResult.score).toBeGreaterThan(deepResult.score);
  });

  it("reason mentions position gap when needScore > 0.5", () => {
    const rbPlayer = makePlayer({ fpId: 8001, position: "RB", ecrRank: 20, ecrAdpGap: 2 });
    const result = calcBestFit(rbPlayer, [], [rbPlayer]);
    // Rod has 0 RBs, needs 3 → needScore = 3/3 = 1.0 > 0.5
    expect(result.reason).toContain("RB");
  });

  it("reason mentions ECR value when ecrAdpGap >= 5", () => {
    const player = makePlayer({ fpId: 9001, position: "WR", ecrRank: 20, ecrAdpGap: 8 });
    const result = calcBestFit(player, [], [player]);
    expect(result.reason).toContain("+8 ECR value");
  });

  it("score is between 0 and 1", () => {
    const player = makePlayer({ fpId: 10001, position: "RB", ecrRank: 5, ecrAdpGap: 20 });
    const result = calcBestFit(player, [], [player]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("returns 'Solid depth' when no specific reason applies", () => {
    // Full RB roster, no ECR gap, deep position pool
    const player = makePlayer({ fpId: 11001, position: "RB", ecrRank: 60, ecrAdpGap: 0 });
    const fullRoster = [
      makePick("Rod", makePlayer({ fpId: 11002, position: "RB" }), 1),
      makePick("Rod", makePlayer({ fpId: 11003, position: "RB" }), 15),
      makePick("Rod", makePlayer({ fpId: 11004, position: "RB" }), 29),
    ];
    const deepPool = Array.from({ length: 10 }, (_, i) =>
      makePlayer({ fpId: 11100 + i, position: "RB", ecrRank: 20 + i * 3 })
    );
    const result = calcBestFit(player, fullRoster, deepPool);
    expect(result.reason).toBe("Solid depth");
  });
});

// ─── calcChampEquityDelta ─────────────────────────────────────────────────────

describe("calcChampEquityDelta", () => {
  it("returns a number (the equity delta)", () => {
    const player = makePlayer({ fpId: 20001, position: "RB", ecrRank: 5 });
    const result = calcChampEquityDelta(player, [], [player], []);
    expect(typeof result).toBe("number");
  });

  it("returns higher equity delta for elite players (low ECR rank) vs deep players", () => {
    const elitePlayer = makePlayer({ fpId: 21001, position: "RB", ecrRank: 3 });
    const deepPlayer = makePlayer({ fpId: 21002, position: "RB", ecrRank: 80 });
    const available = [elitePlayer, deepPlayer,
      makePlayer({ fpId: 21003, position: "RB", ecrRank: 20 }),
      makePlayer({ fpId: 21004, position: "RB", ecrRank: 30 }),
      makePlayer({ fpId: 21005, position: "RB", ecrRank: 40 }),
      makePlayer({ fpId: 21006, position: "RB", ecrRank: 50 }),
    ];

    const eliteResult = calcChampEquityDelta(elitePlayer, [], available, []);
    const deepResult = calcChampEquityDelta(deepPlayer, [], available, []);

    expect(eliteResult).toBeGreaterThan(deepResult);
  });

  it("returns higher equity when filling a positional gap (balanceBonus)", () => {
    const rbPlayer = makePlayer({ fpId: 22001, position: "RB", ecrRank: 20 });
    const available = [rbPlayer, makePlayer({ fpId: 22002, position: "RB", ecrRank: 30 })];

    // Empty roster (needs RB) vs full RB roster
    const emptyRosterResult = calcChampEquityDelta(rbPlayer, [], available, []);
    const fullRBRoster = [
      makePick("Rod", makePlayer({ fpId: 22003, position: "RB" }), 1),
      makePick("Rod", makePlayer({ fpId: 22004, position: "RB" }), 15),
      makePick("Rod", makePlayer({ fpId: 22005, position: "RB" }), 29),
    ];
    const fullRosterResult = calcChampEquityDelta(rbPlayer, fullRBRoster, available, []);

    expect(emptyRosterResult).toBeGreaterThan(fullRosterResult);
  });

  it("returns higher equity when position is scarce (few options left in top 80)", () => {
    // When scarce: only 1 other TE option (very high ECR rank) → big ecrImprovement
    // When deep: 10 other TE options at reasonable ECR → smaller ecrImprovement but scarcityBonus=0
    //
    // The scarcityBonus in calcChampEquityDelta is: posLeft <= 3 ? 0.3 : posLeft <= 6 ? 0.15 : 0
    // posLeft = available.filter(p => p.position === pos && p.ecrRank <= 80).length
    //
    // Scarce: only the target player has ecrRank <= 80 → posLeft = 1 → scarcityBonus = 0.3
    // Deep: 11 TEs with ecrRank <= 80 → posLeft = 11 → scarcityBonus = 0
    const tePlayer = makePlayer({ fpId: 23001, position: "TE", ecrRank: 20 });
    // Scarce: only 1 TE in top 80 (the target player itself)
    const scarceAvailable = [
      tePlayer,
      makePlayer({ fpId: 23002, position: "TE", ecrRank: 90 }), // outside top 80
      makePlayer({ fpId: 23003, position: "TE", ecrRank: 95 }), // outside top 80
    ];
    // Deep: 11 TEs all in top 80
    const deepAvailable = [
      tePlayer,
      ...Array.from({ length: 10 }, (_, i) => makePlayer({ fpId: 23100 + i, position: "TE", ecrRank: 25 + i * 5 })),
    ];

    const scarceResult = calcChampEquityDelta(tePlayer, [], scarceAvailable, []);
    const deepResult = calcChampEquityDelta(tePlayer, [], deepAvailable, []);

    // Scarce: posLeft=1 → scarcityBonus=0.3; Deep: posLeft=11 → scarcityBonus=0
    // However ecrImprovement may differ too; the net effect should favor scarce
    expect(scarceResult).toBeGreaterThan(deepResult);
  });

  it("result is rounded to 1 decimal place", () => {
    const player = makePlayer({ fpId: 24001, position: "WR", ecrRank: 15 });
    const result = calcChampEquityDelta(player, [], [player], []);
    const rounded = Math.round(result * 10) / 10;
    expect(result).toBe(rounded);
  });
});

// ─── calcOpportunityBoard ─────────────────────────────────────────────────────

describe("calcOpportunityBoard", () => {
  it("returns an array of at most 4 opportunities", () => {
    const result = calcOpportunityBoard([], [], [], 1, 0, 14);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("returns empty array when no opportunities exist", () => {
    const result = calcOpportunityBoard([], [], [], 1, 0, 14);
    expect(result).toHaveLength(0);
  });

  it("detects DESPERATION opportunity when opponent has no RB through round 3", () => {
    const owners = [
      makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true }),
      makeOwner({ ownerName: "John Smith", draftSlot: 1, isRod: false }),
    ];
    // John has no RBs in his picks
    const picks: DraftPickLite[] = [
      makePick("John Smith", makePlayer({ fpId: 30001, position: "WR" }), 1),
      makePick("John Smith", makePlayer({ fpId: 30002, position: "WR" }), 15),
    ];

    const result = calcOpportunityBoard(picks, owners, [], 4, 0, 14);
    const desperation = result.find(o => o.type === "DESPERATION");
    expect(desperation).toBeDefined();
    expect(desperation!.position).toBe("RB");
    expect(desperation!.ownerName).toBe("John");
  });

  it("DESPERATION urgency is ACT_NOW when round >= threshold + 2", () => {
    const owners = [
      makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true }),
      makeOwner({ ownerName: "Desperate Dan", draftSlot: 1, isRod: false }),
    ];
    // Dan has no RBs; RB threshold = 3; round 5 >= 3+2 = 5 → ACT_NOW
    const picks: DraftPickLite[] = [
      makePick("Desperate Dan", makePlayer({ fpId: 31001, position: "WR" }), 1),
    ];
    const result = calcOpportunityBoard(picks, owners, [], 5, 0, 14);
    const desperation = result.find(o => o.type === "DESPERATION" && o.ownerName === "Desperate");
    expect(desperation).toBeDefined();
    expect(desperation!.urgency).toBe("ACT_NOW");
  });

  it("detects VALUE_POCKET when 2+ players are available past their ADP round", () => {
    // Players with adpRank suggesting they should have been drafted in round 1
    // but we're now in round 3 → past ADP
    const latePlayers = [
      makePlayer({ fpId: 32001, position: "WR", ecrRank: 10, adpRank: 5 }),  // ADP round 1 in 14-team league
      makePlayer({ fpId: 32002, position: "WR", ecrRank: 12, adpRank: 7 }),  // ADP round 1
      makePlayer({ fpId: 32003, position: "WR", ecrRank: 14, adpRank: 9 }),  // ADP round 1
    ];
    const owners = [makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true })];
    const result = calcOpportunityBoard([], owners, latePlayers, 3, 0, 14);
    const valuePocket = result.find(o => o.type === "VALUE_POCKET");
    expect(valuePocket).toBeDefined();
    expect(valuePocket!.position).toBe("WR");
  });

  it("detects RUN_EXPLOIT when 4+ picks of same position in last 12", () => {
    const rbPicks = Array.from({ length: 5 }, (_, i) =>
      makePick("Other Owner", makePlayer({ fpId: 33000 + i, position: "RB" }), i + 1)
    );
    const owners = [makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true })];
    const result = calcOpportunityBoard(rbPicks, owners, [], 1, 0, 14);
    const runExploit = result.find(o => o.type === "RUN_EXPLOIT");
    expect(runExploit).toBeDefined();
    expect(runExploit!.position).toBe("RB");
  });

  it("RUN_EXPLOIT urgency is ACT_NOW when 6+ picks of same position", () => {
    const rbPicks = Array.from({ length: 7 }, (_, i) =>
      makePick("Other Owner", makePlayer({ fpId: 34000 + i, position: "RB" }), i + 1)
    );
    const owners = [makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true })];
    const result = calcOpportunityBoard(rbPicks, owners, [], 1, 0, 14);
    const runExploit = result.find(o => o.type === "RUN_EXPLOIT");
    expect(runExploit).toBeDefined();
    expect(runExploit!.urgency).toBe("ACT_NOW");
  });

  it("detects TILT_ALERT when high-tilt owner just missed their preferred position", () => {
    const tiltOwner = makeOwner({
      ownerName: "Tilter Jones",
      draftSlot: 1,
      isRod: false,
      tiltScore: 70,
      reachPositions: ["RB"],  // loves RBs
    });
    const owners = [
      makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true }),
      tiltOwner,
    ];
    // Tilter just picked a WR (not their preferred RB)
    const picks: DraftPickLite[] = [
      makePick("Tilter Jones", makePlayer({ fpId: 35001, position: "WR" }), 1),
    ];
    const result = calcOpportunityBoard(picks, owners, [], 1, 0, 14);
    const tiltAlert = result.find(o => o.type === "TILT_ALERT");
    expect(tiltAlert).toBeDefined();
    expect(tiltAlert!.ownerName).toBe("Tilter");
  });

  it("does NOT generate TILT_ALERT for Rod himself", () => {
    const rodOwner = makeOwner({
      ownerName: "Rod Sellers",
      draftSlot: 0,
      isRod: true,
      tiltScore: 90,
      reachPositions: ["RB"],
    });
    const owners = [rodOwner];
    const picks: DraftPickLite[] = [
      makePick("Rod Sellers", makePlayer({ fpId: 36001, position: "WR" }), 1),
    ];
    const result = calcOpportunityBoard(picks, owners, [], 1, 0, 14);
    const tiltAlert = result.find(o => o.type === "TILT_ALERT");
    expect(tiltAlert).toBeUndefined();
  });

  it("opportunities are sorted by urgency (ACT_NOW first)", () => {
    // Create both ACT_NOW and THIS_ROUND opportunities
    const owners = [
      makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true }),
      makeOwner({ ownerName: "No RB Guy", draftSlot: 1, isRod: false }),
    ];
    const picks = [
      makePick("No RB Guy", makePlayer({ fpId: 37001, position: "WR" }), 1),
    ];
    const result = calcOpportunityBoard(picks, owners, [], 6, 0, 14);
    // If multiple urgencies exist, ACT_NOW should come before THIS_ROUND
    for (let i = 0; i < result.length - 1; i++) {
      const urgencyOrder: Record<string, number> = { ACT_NOW: 0, THIS_ROUND: 1, MONITOR: 2 };
      expect(urgencyOrder[result[i]!.urgency]!).toBeLessThanOrEqual(urgencyOrder[result[i + 1]!.urgency]!);
    }
  });

  it("each opportunity has required fields: type, urgency, title, detail", () => {
    const owners = [
      makeOwner({ ownerName: "Rod Sellers", draftSlot: 0, isRod: true }),
      makeOwner({ ownerName: "No RB", draftSlot: 1, isRod: false }),
    ];
    const picks = [makePick("No RB", makePlayer({ fpId: 38001, position: "WR" }), 1)];
    const result = calcOpportunityBoard(picks, owners, [], 4, 0, 14);
    for (const opp of result) {
      expect(opp).toHaveProperty("type");
      expect(opp).toHaveProperty("urgency");
      expect(opp).toHaveProperty("title");
      expect(opp).toHaveProperty("detail");
    }
  });
});

// ─── calcRunAlerts ────────────────────────────────────────────────────────────

describe("calcRunAlerts", () => {
  it("returns empty array when fewer than 4 picks of any position in last 12", () => {
    const picks = [
      makePick("Owner A", makePlayer({ fpId: 40001, position: "RB" }), 1),
      makePick("Owner B", makePlayer({ fpId: 40002, position: "WR" }), 2),
      makePick("Owner C", makePlayer({ fpId: 40003, position: "RB" }), 3),
      makePick("Owner D", makePlayer({ fpId: 40004, position: "WR" }), 4),
    ];
    const result = calcRunAlerts(picks);
    expect(result).toHaveLength(0);
  });

  it("triggers 'warning' alert when 4-5 picks of same position in last 12", () => {
    const picks = Array.from({ length: 4 }, (_, i) =>
      makePick("Owner", makePlayer({ fpId: 41000 + i, position: "RB" }), i + 1)
    );
    const result = calcRunAlerts(picks);
    expect(result).toHaveLength(1);
    expect(result[0]!.position).toBe("RB");
    expect(result[0]!.count).toBe(4);
    expect(result[0]!.severity).toBe("warning");
  });

  it("triggers 'critical' alert when 6+ picks of same position in last 12", () => {
    const picks = Array.from({ length: 7 }, (_, i) =>
      makePick("Owner", makePlayer({ fpId: 42000 + i, position: "WR" }), i + 1)
    );
    const result = calcRunAlerts(picks);
    expect(result).toHaveLength(1);
    expect(result[0]!.position).toBe("WR");
    expect(result[0]!.severity).toBe("critical");
  });

  it("only looks at the last 12 non-keeper picks", () => {
    // The window is the last 12 picks. To put 5 RBs OUTSIDE the window we need
    // at least 13 total picks so the 5 old RBs are at positions 1-5 (outside last 12).
    // Total = 5 old RBs + 8+ recent non-RBs = 13+ picks
    // Last 12 = picks 2-13 = 1 RB + 7 WRs + 4 QBs (no RB run)
    const oldRBPicks = Array.from({ length: 5 }, (_, i) =>
      makePick("Owner", makePlayer({ fpId: 43000 + i, position: "RB" }), i + 1)
    );
    // 8 recent non-RB picks to push the 5 RBs out of the 12-pick window
    const recentPicks = Array.from({ length: 8 }, (_, i) =>
      makePick("Owner", makePlayer({ fpId: 43100 + i, position: "WR" }), 6 + i)
    );
    // Total = 13 picks; last 12 = picks 2-13 = 4 RBs + 8 WRs
    // Wait: last 12 of 13 = picks at index 1-12 = 4 RBs (indices 1-4) + 8 WRs
    // 4 RBs >= threshold of 4 → still triggers!
    // Need even more recent picks to push ALL 5 RBs out:
    // 5 RBs + 13 WRs = 18 total; last 12 = all WRs → no run
    const moreRecentPicks = Array.from({ length: 13 }, (_, i) =>
      makePick("Owner", makePlayer({ fpId: 43200 + i, position: "WR" }), 6 + i)
    );
    const result = calcRunAlerts([...oldRBPicks, ...moreRecentPicks]);
    // Last 12 of 18 picks = 12 WRs; 5 RBs are all outside the window
    // WRs: 12 in last 12 → triggers WR run (not RB)
    const rbAlert = result.find(a => a.position === "RB");
    expect(rbAlert).toBeUndefined(); // RBs are outside the 12-pick window
  });

  it("ignores keeper picks when counting runs", () => {
    const keeperPicks = Array.from({ length: 6 }, (_, i) =>
      makePick("Owner", makePlayer({ fpId: 44000 + i, position: "RB" }), i + 1, true) // isKeeper = true
    );
    const result = calcRunAlerts(keeperPicks);
    expect(result).toHaveLength(0); // keepers excluded
  });

  it("can detect multiple position runs simultaneously", () => {
    const picks = [
      ...Array.from({ length: 4 }, (_, i) => makePick("O", makePlayer({ fpId: 45000 + i, position: "RB" }), i + 1)),
      ...Array.from({ length: 4 }, (_, i) => makePick("O", makePlayer({ fpId: 45100 + i, position: "WR" }), 5 + i)),
    ];
    const result = calcRunAlerts(picks);
    const positions = result.map(a => a.position);
    expect(positions).toContain("RB");
    expect(positions).toContain("WR");
  });

  it("alerts are sorted by count descending (highest run first)", () => {
    const picks = [
      ...Array.from({ length: 6 }, (_, i) => makePick("O", makePlayer({ fpId: 46000 + i, position: "RB" }), i + 1)),
      ...Array.from({ length: 4 }, (_, i) => makePick("O", makePlayer({ fpId: 46100 + i, position: "WR" }), 7 + i)),
    ];
    const result = calcRunAlerts(picks);
    expect(result[0]!.count).toBeGreaterThanOrEqual(result[result.length - 1]!.count);
  });

  it("alert message mentions the position and count", () => {
    const picks = Array.from({ length: 5 }, (_, i) =>
      makePick("Owner", makePlayer({ fpId: 47000 + i, position: "QB" }), i + 1)
    );
    const result = calcRunAlerts(picks);
    expect(result[0]!.message).toContain("QB");
    expect(result[0]!.message).toContain("5");
  });
});
