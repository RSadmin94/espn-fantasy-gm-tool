import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AdminUsageCost UI contract", () => {
  const source = readFileSync(new URL("../pages/AdminUsageCost.tsx", import.meta.url), "utf8");

  it("renders the required title and subtitle", () => {
    expect(source).toContain("Usage & Cost");
    expect(source).toContain("AI usage, spend, efficiency, and budget health across Fantasy Football Rivals");
  });

  it("includes the primary date presets", () => {
    expect(source).toContain("Today");
    expect(source).toContain("Last 7 Days");
    expect(source).toContain("Last 30 Days");
    expect(source).toContain("Month to Date");
    expect(source).toContain("Previous Month");
    expect(source).toContain("Custom Range");
  });

  it("includes KPI and breakdown sections", () => {
    expect(source).toContain("AI Spend MTD");
    expect(source).toContain("Projected Monthly Spend");
    expect(source).toContain("Feature cost breakdown");
    expect(source).toContain("Advisor intent cost");
    expect(source).toContain("Provider / model");
    expect(source).toContain("Value / waste");
    expect(source).toContain("Cost alerts");
    expect(source).toContain("Budget settings");
  });

  it("uses adminProcedure-backed usageCost router", () => {
    expect(source).toContain("trpc.usageCost.getDashboard");
  });
});
