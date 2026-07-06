import { describe, expect, it } from "vitest";
import { labelForEra } from "./behavioralEras";

describe("labelForEra", () => {
  it("labels a 50/50 early split as balanced, not WR-lean", () => {
    expect(
      labelForEra({
        rbPct: 50,
        wrPct: 50,
        seasonStart: 2023,
        legacyCoef: 0.2,
        modernCoef: 0.15,
      }),
    ).toBe("Balanced early-round chapter");
  });

  it("labels modern WR-heavy chapter when WR leads by more than 15 points", () => {
    expect(
      labelForEra({
        rbPct: 0,
        wrPct: 100,
        seasonStart: 2023,
        legacyCoef: 0.1,
        modernCoef: 0.12,
      }),
    ).toBe("Modern WR-lean");
  });

  it("labels legacy RB-first when pre-2023 and RB leads", () => {
    expect(
      labelForEra({
        rbPct: 64,
        wrPct: 21,
        seasonStart: 2011,
        legacyCoef: 0.2,
        modernCoef: 0.05,
      }),
    ).toBe("Legacy RB-first");
  });
});
