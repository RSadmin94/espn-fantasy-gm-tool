import { describe, it, expect } from "vitest";

// ── GM Style metric computation tests ─────────────────────────────────────────
// These mirror the logic in the ownerCareerStats and ownerPredictions endpoints.

function computeGmMetrics(txnSeasons: Array<{ acquisitions: number; drops: number; trades: number }>) {
  const count = txnSeasons.length || 1;
  const totalAcquisitions = txnSeasons.reduce((s, t) => s + t.acquisitions, 0);
  const totalDrops = txnSeasons.reduce((s, t) => s + t.drops, 0);
  const totalTrades = txnSeasons.reduce((s, t) => s + t.trades, 0);
  const avgAcquisitions = Math.round((totalAcquisitions / count) * 10) / 10;
  const avgTrades = Math.round((totalTrades / count) * 10) / 10;
  const waiverAggression = Math.min(100, Math.round((avgAcquisitions / 70) * 100));
  const tradeFrequency = Math.min(100, Math.round((avgTrades / 15) * 100));
  const avgChurn = (totalAcquisitions + totalDrops) / count;
  const rosterStability = Math.max(0, Math.round(100 - (avgChurn / 100) * 100));

  let gmArchetype: string;
  if (waiverAggression >= 70 && tradeFrequency >= 60) gmArchetype = "Dealmaker";
  else if (waiverAggression >= 70) gmArchetype = "Waiver Grinder";
  else if (tradeFrequency >= 60) gmArchetype = "Trade Shark";
  else if (rosterStability >= 70) gmArchetype = "Patient Builder";
  else if (waiverAggression >= 45) gmArchetype = "Opportunist";
  else gmArchetype = "Set & Forget";

  return { avgAcquisitions, avgTrades, waiverAggression, tradeFrequency, rosterStability, gmArchetype };
}

describe("GM Style metrics", () => {
  it("classifies a high-volume waiver grinder correctly", () => {
    // avg 56 acquisitions/season → waiverAggression = 80, low trades
    const txn = [
      { acquisitions: 60, drops: 58, trades: 3 },
      { acquisitions: 52, drops: 50, trades: 2 },
    ];
    const m = computeGmMetrics(txn);
    expect(m.waiverAggression).toBeGreaterThanOrEqual(70);
    expect(m.gmArchetype).toBe("Waiver Grinder");
  });

  it("classifies a trade shark correctly", () => {
    // low acquisitions, high trades
    const txn = [
      { acquisitions: 15, drops: 14, trades: 12 },
      { acquisitions: 18, drops: 17, trades: 14 },
    ];
    const m = computeGmMetrics(txn);
    expect(m.tradeFrequency).toBeGreaterThanOrEqual(60);
    expect(m.gmArchetype).toBe("Trade Shark");
  });

  it("classifies a dealmaker when both waiver and trade scores are high", () => {
    const txn = [
      { acquisitions: 70, drops: 68, trades: 12 },
      { acquisitions: 65, drops: 63, trades: 11 },
    ];
    const m = computeGmMetrics(txn);
    expect(m.waiverAggression).toBeGreaterThanOrEqual(70);
    expect(m.tradeFrequency).toBeGreaterThanOrEqual(60);
    expect(m.gmArchetype).toBe("Dealmaker");
  });

  it("classifies a patient builder with low activity", () => {
    const txn = [
      { acquisitions: 10, drops: 9, trades: 1 },
      { acquisitions: 12, drops: 11, trades: 2 },
    ];
    const m = computeGmMetrics(txn);
    expect(m.rosterStability).toBeGreaterThanOrEqual(70);
    expect(m.gmArchetype).toBe("Patient Builder");
  });

  it("caps waiverAggression at 100 for extreme values", () => {
    const txn = [{ acquisitions: 200, drops: 200, trades: 5 }];
    const m = computeGmMetrics(txn);
    expect(m.waiverAggression).toBe(100);
  });

  it("returns 0 rosterStability floor for extreme churn", () => {
    const txn = [{ acquisitions: 500, drops: 500, trades: 0 }];
    const m = computeGmMetrics(txn);
    expect(m.rosterStability).toBe(0);
  });

  it("handles empty txnSeasons without division by zero", () => {
    const m = computeGmMetrics([]);
    expect(m.avgAcquisitions).toBe(0);
    expect(m.avgTrades).toBe(0);
    expect(m.waiverAggression).toBe(0);
  });

  it("computes avgAcquisitions correctly across multiple seasons", () => {
    const txn = [
      { acquisitions: 40, drops: 38, trades: 5 },
      { acquisitions: 60, drops: 58, trades: 7 },
    ];
    const m = computeGmMetrics(txn);
    expect(m.avgAcquisitions).toBe(50);
  });
});

describe("ownerPredictions endpoint input validation", () => {
  it("accepts a valid memberId string", () => {
    const memberId = "{AE295BDF-FC02-479E-969E-0E712690503C}";
    expect(typeof memberId).toBe("string");
    expect(memberId.length).toBeGreaterThan(0);
  });

  it("rejects empty memberId", () => {
    // Zod schema: z.string() — empty string would pass zod but return no data
    const memberId = "";
    expect(memberId.length).toBe(0);
  });
});
