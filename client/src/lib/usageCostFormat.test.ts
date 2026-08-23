import { describe, expect, it } from "vitest";
import { budgetTone, formatDelta, formatUsd } from "./usageCostFormat";

describe("usage cost formatters", () => {
  it("formats currency", () => {
    expect(formatUsd(41.28)).toBe("$41.28");
  });
  it("does not fake a delta when none exists", () => {
    expect(formatDelta(null).tone).toBe("none");
  });
  it("marks over-budget as red", () => {
    expect(budgetTone(110, -8)).toBe("over");
    expect(budgetTone(40, 20)).toBe("healthy");
  });
});
