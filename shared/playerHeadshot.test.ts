/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  espnPlayerHeadshotUrl,
  extractEspnPlayerId,
  resolvePlayerHeadshotUrl,
  sleeperPlayerHeadshotUrl,
} from "./playerHeadshot";
import {
  getPlayerHeadshotCandidates,
  getPlayerHeadshotUrl,
} from "./playerIdentityLookup";

describe("shared/playerHeadshot", () => {
  it("builds ESPN and Sleeper URLs", () => {
    expect(espnPlayerHeadshotUrl("3139477")).toContain("3139477.png");
    expect(sleeperPlayerHeadshotUrl("4046")).toContain("/thumb/4046.jpg");
    expect(sleeperPlayerHeadshotUrl("4046", { size: "full" })).toContain(
      "/players/4046.jpg",
    );
    expect(sleeperPlayerHeadshotUrl("4046", { size: "full" })).not.toContain(
      "/thumb/",
    );
  });

  it("prefers ESPN over Sleeper", () => {
    const url = resolvePlayerHeadshotUrl({
      espnPlayerId: "3139477",
      sleeperPlayerId: "4046",
    });
    expect(url).toContain("espncdn.com");
  });

  it("extractEspnPlayerId accepts numeric and espn: prefix", () => {
    expect(extractEspnPlayerId("3139477")).toBe("3139477");
    expect(extractEspnPlayerId("espn:3139477")).toBe("3139477");
    expect(extractEspnPlayerId("keeper:ja'marr chase")).toBeNull();
    expect(extractEspnPlayerId(null)).toBeNull();
  });
});

describe("getPlayerHeadshotUrl", () => {
  it("returns ESPN CDN for a known espn id (thumb)", () => {
    const url = getPlayerHeadshotUrl(
      { espnId: "3139477", name: "Patrick Mahomes", position: "QB" },
      "thumb",
    );
    expect(url).toBeTruthy();
    expect(url).toContain("espncdn.com");
    expect(url).toContain("3139477");
  });

  it("returns full-size CDN when size=full", () => {
    const url = getPlayerHeadshotUrl({ espnId: "3139477" }, "full");
    expect(url).toBeTruthy();
    expect(url).toMatch(/w=200|\/players\/\d+\.jpg/);
  });

  it("returns null when no id and no resolvable name", () => {
    expect(
      getPlayerHeadshotUrl({
        name: "",
        position: "QB",
      }),
    ).toBeNull();
    expect(
      getPlayerHeadshotUrl({
        id: "keeper:unknown-player-xyz",
        name: "Definitely Not A Real Nfl Player Zzz 99999",
        position: "QB",
      }),
    ).toBeNull();
  });

  it("candidates are ESPN-first then Sleeper when both resolve", () => {
    const list = getPlayerHeadshotCandidates({
      espnId: "3139477",
      name: "Patrick Mahomes",
      position: "QB",
      nflTeam: "KC",
    });
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).toContain("espncdn.com");
  });

  it("no-photo / no-match yields empty candidates", () => {
    expect(
      getPlayerHeadshotCandidates({
        name: "Definitely Not A Real Nfl Player Zzz 99999",
        position: "QB",
      }),
    ).toEqual([]);
  });
});
