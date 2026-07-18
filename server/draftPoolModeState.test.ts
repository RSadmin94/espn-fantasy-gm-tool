/**
 * RFSN-017 — shared pool vs Mock/Live state ownership.
 */
import { describe, expect, it } from "vitest";
import {
  assertLivePoolIndependentOfMock,
  deriveModeAvailablePool,
} from "../shared/draftPoolModeState";

const SHARED = [
  { name: "Josh Allen", position: "QB", espnId: "3918298", adp: 15 },
  { name: "Jalen Hurts", position: "QB", espnId: "4040715", adp: 25 },
  { name: "Aaron Rodgers", position: "QB", espnId: "8439", adp: 140 },
  { name: "CeeDee Lamb", position: "WR", espnId: "4241389", adp: 5 },
  { name: "IDP Star", position: "DP", espnId: "999", adp: 80 },
];

describe("RFSN-017 draftPoolModeState", () => {
  it("mock activity cannot affect Live Draft available rankings", () => {
    const mockConsumed = [
      { name: "Josh Allen", espnId: "3918298" },
      { name: "Jalen Hurts", espnId: "4040715" },
      { name: "CeeDee Lamb", espnId: "4241389" },
    ];
    const { mockAvailable, liveAvailable } = assertLivePoolIndependentOfMock({
      shared: SHARED,
      mockConsumed,
      liveConsumed: [],
    });

    expect(mockAvailable.map((p) => p.name)).toEqual(["Aaron Rodgers", "IDP Star"]);
    // Live still sees full ADP board — Allen remains QB1 by ADP
    expect(liveAvailable.map((p) => p.name)).toEqual(SHARED.map((p) => p.name));
    expect(liveAvailable.find((p) => p.name === "Josh Allen")?.adp).toBe(15);
    expect(liveAvailable[0]?.name).not.toBe("Aaron Rodgers");
  });

  it("live picks remove players only from Live state", () => {
    const liveConsumed = [{ name: "Josh Allen", espnId: "3918298" }];
    const liveAvailable = deriveModeAvailablePool(SHARED, liveConsumed);
    const mockAvailable = deriveModeAvailablePool(SHARED, []);

    expect(liveAvailable.map((p) => p.name)).not.toContain("Josh Allen");
    expect(mockAvailable.map((p) => p.name)).toContain("Josh Allen");
    expect(liveAvailable.find((p) => p.name === "Jalen Hurts")).toBeTruthy();
  });

  it("shared pool is not mutated by derive", () => {
    const shared = [...SHARED];
    deriveModeAvailablePool(shared, [{ name: "Aaron Rodgers", espnId: "8439" }]);
    expect(shared).toHaveLength(5);
    expect(shared.map((p) => p.name)).toContain("Aaron Rodgers");
  });
});
