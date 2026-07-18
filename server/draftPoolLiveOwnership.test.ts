/**
 * RFSN-017 — Mock residual must not feed Live Draft rankings.
 * Server returns eligiblePool (shared) and availablePool (mock residual).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { deriveModeAvailablePool } from "../shared/draftPoolModeState";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("RFSN-017 Live Draft pool ownership", () => {
  it("router exposes eligiblePool separate from mock residual availablePool", () => {
    const src = fs.readFileSync(path.join(repoRoot, "server/draftWarRoomRouter.ts"), "utf-8");
    expect(src).toContain("eligiblePool");
    expect(src).toContain("deriveModeAvailablePool");
  });

  it("Live Draft UI binds to eligiblePool, not mock residual alone", () => {
    const warRoom = fs.readFileSync(path.join(repoRoot, "client/src/pages/DraftWarRoom.tsx"), "utf-8");
    expect(warRoom).toContain("eligiblePool");
    expect(warRoom).toContain("Live Draft uses shared eligiblePool");
  });

  it("mock-drafted elite QB remains in Live-derived pool from shared", () => {
    const shared = [
      { name: "Josh Allen", position: "QB", espnId: "1", adp: 12 },
      { name: "Aaron Rodgers", position: "QB", espnId: "2", adp: 150 },
    ];
    const mockResidual = deriveModeAvailablePool(shared, [{ name: "Josh Allen", espnId: "1" }]);
    const liveFromShared = deriveModeAvailablePool(shared, []);
    expect(mockResidual.map((p) => p.name)).toEqual(["Aaron Rodgers"]);
    expect(liveFromShared[0]?.name).toBe("Josh Allen");
  });
});
