import { describe, it, expect } from "vitest";

describe("ESPN credentials", () => {
  it("ESPN_S2 secret is set and non-empty", () => {
    const s2 = process.env.ESPN_S2;
    expect(s2).toBeDefined();
    expect(typeof s2).toBe("string");
    expect((s2 as string).length).toBeGreaterThan(50);
  });

  it("ESPN_SWID secret is set and matches expected format", () => {
    const swid = process.env.ESPN_SWID;
    expect(swid).toBeDefined();
    expect(swid).toMatch(/^\{[0-9A-F-]{36}\}$/i);
  });

  it("ESPN_LEAGUE_ID is set to the correct league", () => {
    const leagueId = process.env.ESPN_LEAGUE_ID;
    expect(leagueId).toBeDefined();
    expect(leagueId).toBe("457622");
  });
});
