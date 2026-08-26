import { describe, expect, it } from "vitest";
import { computeBudgetHealth, periodDelta, projectMonthlySpend } from "./projections";
import { resolveDateRange } from "./dateRange";

describe("projectMonthlySpend", () => {
  it("scales MTD run rate to the full month", () => {
    const now = new Date("2026-08-10T12:00:00Z"); // 10 days elapsed in August (31 days)
    const r = projectMonthlySpend(10, now);
    expect(r.daysElapsed).toBe(10);
    expect(r.daysInMonth).toBe(31);
    expect(r.projectedMonthEndUsd).toBeCloseTo(31, 6);
  });
});

describe("computeBudgetHealth", () => {
  it("computes remaining, percent, and over/under", () => {
    const h = computeBudgetHealth({
      monthlyBudgetUsd: 100,
      mtdActualUsd: 40,
      now: new Date("2026-08-10T12:00:00Z"),
    });
    expect(h.remainingUsd).toBe(60);
    expect(h.percentUsed).toBeCloseTo(40, 6);
    expect(h.projectedMonthEndUsd).toBeCloseTo(124, 6);
    expect(h.projectedOverUnderUsd).toBeCloseTo(-24, 6);
  });

  it("leaves budget fields null when not configured", () => {
    const h = computeBudgetHealth({ monthlyBudgetUsd: null, mtdActualUsd: 12 });
    expect(h.percentUsed).toBeNull();
    expect(h.remainingUsd).toBeNull();
    expect(h.projectedOverUnderUsd).toBeNull();
  });
});

describe("periodDelta", () => {
  it("does not fabricate a comparison when previous is missing", () => {
    expect(periodDelta(10, null).deltaPct).toBeNull();
  });
});

describe("resolveDateRange", () => {
  const now = new Date("2026-08-23T15:00:00Z");
  it("today is a single UTC day", () => {
    const r = resolveDateRange({ preset: "today", now });
    expect(r.dayCount).toBe(1);
  });
  it("last 7 includes today", () => {
    const r = resolveDateRange({ preset: "last_7", now });
    expect(r.dayCount).toBe(7);
  });
  it("mtd starts on the first of the month", () => {
    const r = resolveDateRange({ preset: "mtd", now });
    expect(r.start.toISOString().startsWith("2026-08-01")).toBe(true);
  });
});
