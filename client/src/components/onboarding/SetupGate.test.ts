import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gate = readFileSync(new URL("./SetupGate.tsx", import.meta.url), "utf8");

describe("SetupGate contract", () => {
  it("uses server setupPhase rather than presentation state", () => {
    expect(gate).toContain("setupPhase");
    expect(gate).toContain("setupGateDestination");
    expect(gate).toContain("me.activeProfile");
    expect(gate).toContain("getConnectionLimits");
  });

  it("does not force Connected Leagues as the team-selection ceremony", () => {
    expect(gate).not.toContain('to="/connected-leagues"');
  });

  it("keeps connect, team-select, and admin routes reachable", () => {
    expect(gate).toContain('"/connect"');
    expect(gate).toContain('"/select-team"');
    expect(gate).toContain('"/admin"');
  });
});
