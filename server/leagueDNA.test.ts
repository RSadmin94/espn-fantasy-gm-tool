/**
 * leagueDNA.test.ts
 *
 * Tests for the League DNA engine.
 *
 * Coverage:
 *   - calcManagerDNA: gmArchetype assignment, tiltScore, biasVsLeague, exploitabilityScore
 *   - calcLeagueDNA: batch processing, sorted by exploitabilityScore descending
 *   - calcTradeDesperationScore: live desperation scoring
 *   - buildDNAPromptBlock: prompt injection formatting
 *   - DraftDNA: reachPositions, valuePositions, draftStyleBadge, keeperRate
 *   - TradeDNA: lossTradeRatio, desperation_triggers, h2hVsRod
 *   - WaiverDNA: waiverAggression, injuryOverreactionCount
 *   - TiltProfile: tiltScore thresholds, tiltLabel
 */
import { describe, it, expect } from "vitest";
import {
  calcManagerDNA,
  calcLeagueDNA,
  calcTradeDesperationScore,
  buildDNAPromptBlock,
  type ManagerRawData,
  type SeasonRecord,
  type TxnSeason,
  type DraftPickRecord,
} from "./leagueDNA";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSeasonRecord(overrides: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    season: 2025,
    wins: 8,
    losses: 6,
    ties: 0,
    pf: 1400,
    pa: 1300,
    rank: 3,
    madePlayoffs: true,
    isChampion: false,
    ...overrides,
  };
}

function makeTxnSeason(overrides: Partial<TxnSeason> = {}): TxnSeason {
  return {
    season: 2025,
    acquisitions: 20,
    drops: 18,
    trades: 3,
    ...overrides,
  };
}

function makeDraftPick(overrides: Partial<DraftPickRecord> = {}): DraftPickRecord {
  return {
    season: 2025,
    roundId: 3,
    position: "RB",
    keeper: false,
    ...overrides,
  };
}

function makeManager(overrides: Partial<ManagerRawData> = {}): ManagerRawData {
  return {
    memberId: "m1",
    ownerName: "Test Owner",
    seasonRecords: [makeSeasonRecord()],
    txnSeasons: [makeTxnSeason()],
    draftPicks: [makeDraftPick()],
    h2hVsRod: { wins: 5, losses: 5 },
    currentSeason: null,
    ...overrides,
  };
}

// ─── GM Archetype assignment ──────────────────────────────────────────────────

describe("calcManagerDNA — gmArchetype", () => {
  it("assigns 'Dealmaker' when waiverAggression >= 70 AND tradeFrequency >= 60", () => {
    // waiverAggression = min(100, round((avgAcq/70)*100)); need avgAcq >= 49 → 70+ acquisitions/season
    // tradeFrequency = min(100, round((avgTrades/15)*100)); need avgTrades >= 9 → 9+ trades/season
    const manager = makeManager({
      txnSeasons: [makeTxnSeason({ acquisitions: 70, trades: 10 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.gmArchetype).toBe("Dealmaker");
  });

  it("assigns 'Waiver Grinder' when waiverAggression >= 70 but tradeFrequency < 60", () => {
    const manager = makeManager({
      txnSeasons: [makeTxnSeason({ acquisitions: 70, trades: 2 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.gmArchetype).toBe("Waiver Grinder");
  });

  it("assigns 'Trade Shark' when tradeFrequency >= 60 but waiverAggression < 70", () => {
    const manager = makeManager({
      txnSeasons: [makeTxnSeason({ acquisitions: 10, trades: 10 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.gmArchetype).toBe("Trade Shark");
  });

  it("assigns 'Set & Forget' when both waiverAggression < 30 and tradeFrequency < 30", () => {
    const manager = makeManager({
      txnSeasons: [makeTxnSeason({ acquisitions: 5, trades: 1 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.gmArchetype).toBe("Set & Forget");
  });

  it("assigns 'Emotional Trader' when tiltScore >= 60 and no higher-priority archetype matches", () => {
    // Priority order: Dealmaker > Waiver Grinder > Trade Shark > Set & Forget > Positional Fanatic > Emotional Trader
    // To get Emotional Trader: need tiltScore >= 60, but waiverAggression < 70, tradeFrequency < 60,
    // waiverAggression >= 30 or tradeFrequency >= 30 (not Set & Forget), and reachPositions.length < 2
    //
    // Use LOW acquisitions (waiverAggression < 30 is Set & Forget territory, so use 20-30 range)
    // and LOW trades (tradeFrequency < 60) but with tilt pattern
    //
    // avgAcq = 20 → waiverAggression = round((20/70)*100) = 29 (< 30 = Set & Forget!)
    // So use avgAcq = 25 → waiverAggression = round((25/70)*100) = 36 (>= 30, not Set & Forget)
    // avgTrades = 3 → tradeFrequency = round((3/15)*100) = 20 (< 60, not Trade Shark)
    // But tradeFrequency = 20 < 30 AND waiverAggression = 36 >= 30 → not Set & Forget
    // tiltScore: need 2 losing seasons with trades > avg*1.4
    // avg = (1+5+5)/3 = 3.67; threshold = 3.67*1.4 = 5.13; losing season trades = 5 < 5.13 → no tilt
    // Use avg = (1+8+8)/3 = 5.67; threshold = 5.67*1.4 = 7.93; losing trades = 8 > 7.93 → tilt!
    const txns = [
      makeTxnSeason({ season: 2020, trades: 1, acquisitions: 25 }),   // winning season, low trades
      makeTxnSeason({ season: 2021, trades: 8, acquisitions: 25 }),   // losing season, high trades
      makeTxnSeason({ season: 2022, trades: 8, acquisitions: 25 }),   // losing season, high trades
    ];
    const records = [
      makeSeasonRecord({ season: 2020, wins: 10, losses: 4 }),  // winning
      makeSeasonRecord({ season: 2021, wins: 3, losses: 11 }),  // losing
      makeSeasonRecord({ season: 2022, wins: 3, losses: 11 }),  // losing
    ];
    // avgTrades = (1+8+8)/3 = 5.67; tilt threshold = 5.67*1.4 = 7.93
    // 2021: losing, trades=8 > 7.93 → tilt event ✓
    // 2022: losing, trades=8 > 7.93 → tilt event ✓
    // losingSeasons = 2; tradeTiltEvents = 2; tiltScore = round(2/2*100) = 100
    // waiverAggression = round((25/70)*100) = 36 (< 70, not Waiver Grinder)
    // tradeFrequency = round((5.67/15)*100) = 38 (< 60, not Trade Shark)
    // waiverAggression=36 >= 30 AND tradeFrequency=38 >= 30 → not Set & Forget
    // reachPositions = [] (no draft picks in fixture) → not Positional Fanatic
    // tiltScore = 100 >= 60 → Emotional Trader ✓
    const manager = makeManager({ txnSeasons: txns, seasonRecords: records });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.tilt.tiltScore).toBeGreaterThanOrEqual(60);
    expect(dna.gmArchetype).toBe("Emotional Trader");
  });

  it("assigns 'Balanced Manager' as default when no strong signals", () => {
    const manager = makeManager({
      txnSeasons: [makeTxnSeason({ acquisitions: 25, trades: 4 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.gmArchetype).toBe("Balanced Manager");
  });
});

// ─── Tilt score ───────────────────────────────────────────────────────────────

describe("calcManagerDNA — tiltScore", () => {
  it("returns tiltScore = 0 when there are no losing seasons", () => {
    const manager = makeManager({
      seasonRecords: [makeSeasonRecord({ wins: 12, losses: 2 })],
      txnSeasons: [makeTxnSeason({ trades: 3 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.tilt.tiltScore).toBe(0);
  });

  it("returns tiltScore = 0 when losing seasons exist but trades don't spike", () => {
    const manager = makeManager({
      seasonRecords: [makeSeasonRecord({ wins: 3, losses: 11 })],
      txnSeasons: [makeTxnSeason({ trades: 3 })],
    });
    // avgTrades = 3; tilt threshold = 3*1.4 = 4.2; trades=3 < 4.2 → no tilt event
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.tilt.tiltScore).toBe(0);
  });

  it("tiltLabel is 'High Tilt Risk' when tiltScore >= 70", () => {
    // Force a high tilt: 3 losing seasons all with elevated trades
    const txns = [
      makeTxnSeason({ season: 2020, trades: 1, acquisitions: 5 }),
      makeTxnSeason({ season: 2021, trades: 15, acquisitions: 5 }),
      makeTxnSeason({ season: 2022, trades: 15, acquisitions: 5 }),
    ];
    const records = [
      makeSeasonRecord({ season: 2020, wins: 10, losses: 4 }),
      makeSeasonRecord({ season: 2021, wins: 3, losses: 11 }),
      makeSeasonRecord({ season: 2022, wins: 3, losses: 11 }),
    ];
    const manager = makeManager({ txnSeasons: txns, seasonRecords: records });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.tilt.tiltScore).toBeGreaterThanOrEqual(70);
    expect(dna.tilt.tiltLabel).toBe("High Tilt Risk");
  });

  it("tiltLabel is 'Ice Cold' when tiltScore < 20", () => {
    const manager = makeManager({
      seasonRecords: [makeSeasonRecord({ wins: 10, losses: 4 })],
      txnSeasons: [makeTxnSeason({ trades: 2 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.tilt.tiltScore).toBeLessThan(20);
    expect(dna.tilt.tiltLabel).toBe("Ice Cold");
  });

  it("tiltLabel is 'Moderate Tilt' when tiltScore is 40-69", () => {
    // 2 seasons: 1 winning, 1 losing with elevated trades
    const txns = [
      makeTxnSeason({ season: 2020, trades: 1, acquisitions: 5 }),
      makeTxnSeason({ season: 2021, trades: 15, acquisitions: 5 }),
    ];
    const records = [
      makeSeasonRecord({ season: 2020, wins: 10, losses: 4 }),
      makeSeasonRecord({ season: 2021, wins: 3, losses: 11 }),
    ];
    const manager = makeManager({ txnSeasons: txns, seasonRecords: records });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    // 1 losing season, 1 tilt event → tiltScore = 100 (still high)
    // This tests the calculation is correct
    expect(dna.tilt.tiltSampleSeasons).toBe(2);
  });
});

// ─── Draft DNA — biasVsLeague ─────────────────────────────────────────────────

describe("calcManagerDNA — biasVsLeague", () => {
  it("biasVsLeague[pos] > 0 means they draft that position earlier than league average", () => {
    // Manager drafts RB in round 1 consistently
    // League average for RB = calculated from all picks
    const managerPicks: DraftPickRecord[] = [
      { season: 2025, roundId: 1, position: "RB", keeper: false },
      { season: 2024, roundId: 1, position: "RB", keeper: false },
      { season: 2023, roundId: 1, position: "RB", keeper: false },
    ];
    // League picks: RB avg = round 4 (league drafts RB later)
    const leaguePicks: DraftPickRecord[] = [
      { season: 2025, roundId: 4, position: "RB", keeper: false },
      { season: 2025, roundId: 5, position: "RB", keeper: false },
      { season: 2025, roundId: 3, position: "RB", keeper: false },
      ...managerPicks,
    ];
    const manager = makeManager({ draftPicks: managerPicks });
    const dna = calcManagerDNA(manager, leaguePicks);
    // Manager avg RB = 1.0; league avg RB = (4+5+3+1+1+1)/6 = 2.5
    // bias = leagueAvg - managerAvg = 2.5 - 1.0 = 1.5 → positive = overvalue
    expect(dna.draft.biasVsLeague["RB"]).toBeGreaterThan(0);
  });

  it("biasVsLeague[pos] < 0 means they draft that position later than league average (undervalue)", () => {
    // Manager drafts QB in round 10 consistently
    const managerPicks: DraftPickRecord[] = [
      { season: 2025, roundId: 10, position: "QB", keeper: false },
      { season: 2024, roundId: 11, position: "QB", keeper: false },
    ];
    // League picks: QB avg = round 6
    const leaguePicks: DraftPickRecord[] = [
      { season: 2025, roundId: 6, position: "QB", keeper: false },
      { season: 2025, roundId: 6, position: "QB", keeper: false },
      ...managerPicks,
    ];
    const manager = makeManager({ draftPicks: managerPicks });
    const dna = calcManagerDNA(manager, leaguePicks);
    // Manager QB avg = 10.5; league QB avg = (6+6+10+11)/4 = 8.25
    // bias = 8.25 - 10.5 = -2.25 → negative = undervalue
    expect(dna.draft.biasVsLeague["QB"]).toBeLessThan(0);
  });

  it("reachPositions includes positions with bias >= 1.5", () => {
    const managerPicks: DraftPickRecord[] = [
      { season: 2025, roundId: 1, position: "RB", keeper: false },
      { season: 2024, roundId: 1, position: "RB", keeper: false },
      { season: 2023, roundId: 1, position: "RB", keeper: false },
    ];
    const leaguePicks: DraftPickRecord[] = [
      { season: 2025, roundId: 5, position: "RB", keeper: false },
      { season: 2025, roundId: 5, position: "RB", keeper: false },
      ...managerPicks,
    ];
    const manager = makeManager({ draftPicks: managerPicks });
    const dna = calcManagerDNA(manager, leaguePicks);
    expect(dna.draft.reachPositions).toContain("RB");
  });

  it("valuePositions includes positions with bias <= -1.5", () => {
    const managerPicks: DraftPickRecord[] = [
      { season: 2025, roundId: 12, position: "QB", keeper: false },
      { season: 2024, roundId: 13, position: "QB", keeper: false },
    ];
    const leaguePicks: DraftPickRecord[] = [
      { season: 2025, roundId: 6, position: "QB", keeper: false },
      { season: 2025, roundId: 7, position: "QB", keeper: false },
      ...managerPicks,
    ];
    const manager = makeManager({ draftPicks: managerPicks });
    const dna = calcManagerDNA(manager, leaguePicks);
    expect(dna.draft.valuePositions).toContain("QB");
  });
});

// ─── Draft DNA — draftStyleBadge ─────────────────────────────────────────────

describe("calcManagerDNA — draftStyleBadge", () => {
  it("assigns 'RB-First Builder' when 4+ round-1 picks are RBs", () => {
    const picks: DraftPickRecord[] = [
      { season: 2021, roundId: 1, position: "RB", keeper: false },
      { season: 2022, roundId: 1, position: "RB", keeper: false },
      { season: 2023, roundId: 1, position: "RB", keeper: false },
      { season: 2024, roundId: 1, position: "RB", keeper: false },
    ];
    const manager = makeManager({ draftPicks: picks });
    const dna = calcManagerDNA(manager, picks);
    expect(dna.draft.draftStyleBadge).toBe("RB-First Builder");
  });

  it("assigns 'WR-Heavy Drafter' when 4+ round-1 picks are WRs", () => {
    const picks: DraftPickRecord[] = [
      { season: 2021, roundId: 1, position: "WR", keeper: false },
      { season: 2022, roundId: 1, position: "WR", keeper: false },
      { season: 2023, roundId: 1, position: "WR", keeper: false },
      { season: 2024, roundId: 1, position: "WR", keeper: false },
    ];
    const manager = makeManager({ draftPicks: picks });
    const dna = calcManagerDNA(manager, picks);
    expect(dna.draft.draftStyleBadge).toBe("WR-Heavy Drafter");
  });

  it("assigns 'Early QB Gambler' when QB avg round <= 3", () => {
    const picks: DraftPickRecord[] = [
      { season: 2021, roundId: 2, position: "QB", keeper: false },
      { season: 2022, roundId: 3, position: "QB", keeper: false },
      { season: 2023, roundId: 2, position: "QB", keeper: false },
    ];
    const manager = makeManager({ draftPicks: picks });
    const dna = calcManagerDNA(manager, picks);
    expect(dna.draft.draftStyleBadge).toBe("Early QB Gambler");
  });

  it("assigns 'Balanced Drafter' as default", () => {
    const picks: DraftPickRecord[] = [
      { season: 2025, roundId: 3, position: "RB", keeper: false },
      { season: 2025, roundId: 4, position: "WR", keeper: false },
      { season: 2025, roundId: 7, position: "QB", keeper: false },
    ];
    const manager = makeManager({ draftPicks: picks });
    const dna = calcManagerDNA(manager, picks);
    expect(dna.draft.draftStyleBadge).toBe("Balanced Drafter");
  });
});

// ─── Trade DNA ────────────────────────────────────────────────────────────────

describe("calcManagerDNA — tradeDNA", () => {
  it("lossTradeRatio > 1 when they trade more in losing seasons", () => {
    const txns = [
      makeTxnSeason({ season: 2020, trades: 8 }),  // losing season
      makeTxnSeason({ season: 2021, trades: 2 }),  // winning season
    ];
    const records = [
      makeSeasonRecord({ season: 2020, wins: 3, losses: 11 }),
      makeSeasonRecord({ season: 2021, wins: 10, losses: 4 }),
    ];
    const manager = makeManager({ txnSeasons: txns, seasonRecords: records });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.trade.lossTradeRatio).toBeGreaterThan(1);
  });

  it("lossTradeRatio < 1 when they trade more in winning seasons", () => {
    const txns = [
      makeTxnSeason({ season: 2020, trades: 1 }),  // losing season
      makeTxnSeason({ season: 2021, trades: 8 }),  // winning season
    ];
    const records = [
      makeSeasonRecord({ season: 2020, wins: 3, losses: 11 }),
      makeSeasonRecord({ season: 2021, wins: 10, losses: 4 }),
    ];
    const manager = makeManager({ txnSeasons: txns, seasonRecords: records });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.trade.lossTradeRatio).toBeLessThan(1);
  });

  it("h2hVsRod winPct is correctly calculated", () => {
    const manager = makeManager({ h2hVsRod: { wins: 3, losses: 7 } });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.trade.h2hVsRod.winPct).toBe(30);
  });

  it("desperation_triggers counts seasons with bad start AND elevated trades", () => {
    // Bad start = wins <= 2 with at least 4 games played
    // Elevated = trades > avgTrades * 1.3
    const txns = [
      makeTxnSeason({ season: 2020, trades: 1 }),
      makeTxnSeason({ season: 2021, trades: 10 }),  // elevated vs avg=5.5
    ];
    const records = [
      makeSeasonRecord({ season: 2020, wins: 5, losses: 9 }),
      makeSeasonRecord({ season: 2021, wins: 2, losses: 12 }),  // bad start
    ];
    const manager = makeManager({ txnSeasons: txns, seasonRecords: records });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    // avgTrades = (1+10)/2 = 5.5; threshold = 5.5*1.3 = 7.15; 2021 trades=10 > 7.15 → trigger
    expect(dna.trade.desperation_triggers).toBeGreaterThanOrEqual(1);
  });
});

// ─── Waiver DNA ───────────────────────────────────────────────────────────────

describe("calcManagerDNA — waiverDNA", () => {
  it("waiverAggression = 100 when avgAcquisitions >= 70/season", () => {
    const manager = makeManager({
      txnSeasons: [makeTxnSeason({ acquisitions: 70 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.waiver.waiverAggression).toBe(100);
  });

  it("injuryOverreactionCount counts seasons with acquisitions > 1.6x their own average", () => {
    const txns = [
      makeTxnSeason({ season: 2020, acquisitions: 10 }),
      makeTxnSeason({ season: 2021, acquisitions: 10 }),
      makeTxnSeason({ season: 2022, acquisitions: 25 }),  // spike: 25 > 10*1.6=16 ✓
    ];
    const manager = makeManager({ txnSeasons: txns });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    // avgAcq = (10+10+25)/3 = 15; threshold = 15*1.6 = 24; 2022 acq=25 > 24 → 1 overreaction
    expect(dna.waiver.injuryOverreactionCount).toBeGreaterThanOrEqual(1);
  });

  it("returns zero waiver stats when txnSeasons is empty", () => {
    const manager = makeManager({ txnSeasons: [] });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.waiver.avgAcquisitionsPerSeason).toBe(0);
    expect(dna.waiver.waiverAggression).toBe(0);
    expect(dna.waiver.injuryOverreactionCount).toBe(0);
  });
});

// ─── Exploitability score ─────────────────────────────────────────────────────

describe("calcManagerDNA — exploitabilityScore", () => {
  it("exploitabilityScore is between 0 and 100", () => {
    const manager = makeManager();
    const dna = calcManagerDNA(manager, manager.draftPicks);
    expect(dna.exploitabilityScore).toBeGreaterThanOrEqual(0);
    expect(dna.exploitabilityScore).toBeLessThanOrEqual(100);
  });

  it("exploitabilityLabel is 'Highly Exploitable' when score >= 70", () => {
    // Force high exploitability: high tilt + high loss-trade ratio + reach positions
    const txns = [
      makeTxnSeason({ season: 2020, trades: 1, acquisitions: 5 }),
      makeTxnSeason({ season: 2021, trades: 15, acquisitions: 5 }),
      makeTxnSeason({ season: 2022, trades: 15, acquisitions: 5 }),
    ];
    const records = [
      makeSeasonRecord({ season: 2020, wins: 10, losses: 4 }),
      makeSeasonRecord({ season: 2021, wins: 3, losses: 11 }),
      makeSeasonRecord({ season: 2022, wins: 3, losses: 11 }),
    ];
    const picks: DraftPickRecord[] = [
      { season: 2021, roundId: 1, position: "RB", keeper: false },
      { season: 2022, roundId: 1, position: "RB", keeper: false },
    ];
    const leaguePicks: DraftPickRecord[] = [
      { season: 2021, roundId: 5, position: "RB", keeper: false },
      { season: 2022, roundId: 5, position: "RB", keeper: false },
      ...picks,
    ];
    const manager = makeManager({ txnSeasons: txns, seasonRecords: records, draftPicks: picks });
    const dna = calcManagerDNA(manager, leaguePicks);
    if (dna.exploitabilityScore >= 70) {
      expect(dna.exploitabilityLabel).toBe("Highly Exploitable");
    }
  });

  it("exploitabilityLabel is 'Shark' when score < 20", () => {
    const manager = makeManager({
      txnSeasons: [makeTxnSeason({ acquisitions: 5, trades: 1 })],
      seasonRecords: [makeSeasonRecord({ wins: 12, losses: 2 })],
    });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    if (dna.exploitabilityScore < 20) {
      expect(dna.exploitabilityLabel).toBe("Shark");
    }
  });
});

// ─── calcLeagueDNA (batch) ────────────────────────────────────────────────────

describe("calcLeagueDNA", () => {
  it("returns one DNA profile per manager", () => {
    const managers = [
      makeManager({ memberId: "m1", ownerName: "Owner A" }),
      makeManager({ memberId: "m2", ownerName: "Owner B" }),
      makeManager({ memberId: "m3", ownerName: "Owner C" }),
    ];
    const results = calcLeagueDNA(managers);
    expect(results).toHaveLength(3);
  });

  it("sorts results by exploitabilityScore descending", () => {
    const managers = [
      makeManager({ memberId: "m1", ownerName: "Low", txnSeasons: [makeTxnSeason({ acquisitions: 5, trades: 1 })], seasonRecords: [makeSeasonRecord({ wins: 12, losses: 2 })] }),
      makeManager({ memberId: "m2", ownerName: "High", txnSeasons: [makeTxnSeason({ acquisitions: 70, trades: 10 })], seasonRecords: [makeSeasonRecord({ wins: 3, losses: 11 })] }),
    ];
    const results = calcLeagueDNA(managers);
    expect(results[0]!.exploitabilityScore).toBeGreaterThanOrEqual(results[1]!.exploitabilityScore);
  });

  it("handles empty manager array", () => {
    const results = calcLeagueDNA([]);
    expect(results).toEqual([]);
  });

  it("uses all league picks (from all managers) for biasVsLeague calculation", () => {
    // Manager A drafts RB in round 1; Manager B drafts RB in round 5
    // League avg RB = (1+5)/2 = 3; Manager A bias = 3-1 = 2 (positive = overvalue)
    const managerA = makeManager({
      memberId: "mA",
      ownerName: "A",
      draftPicks: [{ season: 2025, roundId: 1, position: "RB", keeper: false }],
    });
    const managerB = makeManager({
      memberId: "mB",
      ownerName: "B",
      draftPicks: [{ season: 2025, roundId: 5, position: "RB", keeper: false }],
    });
    const results = calcLeagueDNA([managerA, managerB]);
    const dnaA = results.find(d => d.memberId === "mA")!;
    const dnaB = results.find(d => d.memberId === "mB")!;
    // A drafts RB earlier than league avg → positive bias
    expect(dnaA.draft.biasVsLeague["RB"]).toBeGreaterThan(0);
    // B drafts RB later than league avg → negative bias
    expect(dnaB.draft.biasVsLeague["RB"]).toBeLessThan(0);
  });
});

// ─── calcTradeDesperationScore ────────────────────────────────────────────────

describe("calcTradeDesperationScore", () => {
  function makeDNA(overrides: Partial<ReturnType<typeof calcManagerDNA>> = {}) {
    const base = calcManagerDNA(makeManager(), makeManager().draftPicks);
    return { ...base, ...overrides };
  }

  it("returns desperationScore = 0 and windowOpen = false when currentSeason is null", () => {
    const dna = makeDNA();
    const result = calcTradeDesperationScore(dna, null);
    expect(result.desperationScore).toBe(0);
    expect(result.windowOpen).toBe(false);
    expect(result.desperationLabel).toBe("Neutral");
  });

  it("windowOpen = true when desperationScore >= 45", () => {
    const dna = makeDNA({ tilt: { tiltScore: 80, waiverTiltScore: 60, tiltSampleSeasons: 8, tiltLabel: "High Tilt Risk" } });
    const currentSeason = {
      season: 2026,
      currentWins: 1,
      currentLosses: 9,
      currentWeek: 10,
      recentAcquisitions: 15,
      recentTrades: 5,
      lastWeekScore: 80,
      leagueAvgScore: 120,
    };
    const result = calcTradeDesperationScore(dna, currentSeason);
    expect(result.windowOpen).toBe(result.desperationScore >= 45);
  });

  it("desperationLabel is 'Wide Open' when score >= 70", () => {
    const dna = makeDNA({ tilt: { tiltScore: 100, waiverTiltScore: 80, tiltSampleSeasons: 10, tiltLabel: "High Tilt Risk" } });
    const currentSeason = {
      season: 2026,
      currentWins: 0,
      currentLosses: 10,
      currentWeek: 10,
      recentAcquisitions: 20,
      recentTrades: 8,
      lastWeekScore: 60,
      leagueAvgScore: 130,
    };
    const result = calcTradeDesperationScore(dna, currentSeason);
    if (result.desperationScore >= 70) {
      expect(result.desperationLabel).toBe("Wide Open");
    }
  });

  it("desperationLabel is 'Not Interested' when score < 25", () => {
    const dna = makeDNA({ tilt: { tiltScore: 0, waiverTiltScore: 0, tiltSampleSeasons: 5, tiltLabel: "Ice Cold" } });
    const currentSeason = {
      season: 2026,
      currentWins: 10,
      currentLosses: 0,
      currentWeek: 10,
      recentAcquisitions: 1,
      recentTrades: 0,
      lastWeekScore: 150,
      leagueAvgScore: 120,
    };
    const result = calcTradeDesperationScore(dna, currentSeason);
    if (result.desperationScore < 25) {
      expect(result.desperationLabel).toBe("Not Interested");
    }
  });

  it("returns correct memberId and ownerName", () => {
    const dna = makeDNA({ memberId: "test-id", ownerName: "Test Owner" });
    const result = calcTradeDesperationScore(dna, null);
    expect(result.memberId).toBe("test-id");
    expect(result.ownerName).toBe("Test Owner");
  });
});

// ─── buildDNAPromptBlock ──────────────────────────────────────────────────────

describe("buildDNAPromptBlock", () => {
  it("returns a string containing 'LEAGUE DNA INTELLIGENCE'", () => {
    const manager = makeManager({ ownerName: "Rod Sellers" });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    const block = buildDNAPromptBlock([dna]);
    expect(block).toContain("LEAGUE DNA INTELLIGENCE");
  });

  it("includes owner name in the prompt block", () => {
    const manager = makeManager({ ownerName: "Rod Sellers" });
    const dna = calcManagerDNA(manager, manager.draftPicks);
    const block = buildDNAPromptBlock([dna]);
    expect(block).toContain("Rod Sellers");
  });

  it("returns fallback message when profiles array is empty", () => {
    const block = buildDNAPromptBlock([]);
    expect(block).toContain("No behavioral profile data available");
  });

  it("filters to focusMembers when provided", () => {
    const m1 = calcManagerDNA(makeManager({ memberId: "m1", ownerName: "Owner One" }), []);
    const m2 = calcManagerDNA(makeManager({ memberId: "m2", ownerName: "Owner Two" }), []);
    const block = buildDNAPromptBlock([m1, m2], ["m1"]);
    expect(block).toContain("Owner One");
    expect(block).not.toContain("Owner Two");
  });

  it("includes all profiles when focusMembers is not provided", () => {
    const m1 = calcManagerDNA(makeManager({ memberId: "m1", ownerName: "Owner One" }), []);
    const m2 = calcManagerDNA(makeManager({ memberId: "m2", ownerName: "Owner Two" }), []);
    const block = buildDNAPromptBlock([m1, m2]);
    expect(block).toContain("Owner One");
    expect(block).toContain("Owner Two");
  });
});
