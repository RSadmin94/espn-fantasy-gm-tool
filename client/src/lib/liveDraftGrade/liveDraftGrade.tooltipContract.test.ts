import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("DraftWarRoom live grade tooltip contract", () => {
  it("includes pillar labels, opportunity cost, and reason", () => {
    const src = readFileSync(
      join(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
      "utf8",
    );
    expect(src).toContain("Pick Value ${snap.pickValue");
    expect(src).toContain("Talent ${snap.talent");
    expect(src).toContain("Construction ${snap.construction");
    expect(src).toContain("Lineup & Depth ${snap.lineupDepth");
    expect(src).toContain("Opportunity Cost −${snap.opportunityCost");
    expect(src).toContain("Reason: ${reason}");
    expect(src).toContain("computeLeagueGrades");
    expect(src).toContain("gradePrevRef");
  });
});
