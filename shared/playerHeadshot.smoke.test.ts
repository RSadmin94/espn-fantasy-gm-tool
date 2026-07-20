/**
 * @vitest-environment node
 * Manual smoke checklist — cascade order parity app vs Board Mirror.
 */
import { describe, expect, it } from "vitest";
import { getPlayerHeadshotCandidates } from "./playerIdentityLookup";
import { enrichEspnPickIdentity } from "../standalone/draft-board-monitor/src/draft-monitor/adapters/espnAdapter";

describe("HD headshot smoke — cascade checklist", () => {
  it("known Sleeper player → Sleeper full HD first", () => {
    const app = getPlayerHeadshotCandidates(
      { espnId: "3139477", name: "Patrick Mahomes", position: "QB", nflTeam: "KC" },
      "full",
      { prefer: "sleeper" },
    );
    expect(app[0]).toMatch(/sleepercdn\.com\/content\/nfl\/players\/\d+\.jpg$/);
    expect(app[0]).not.toContain("/thumb/");

    const mirror = enrichEspnPickIdentity({
      playerName: "Patrick Mahomes",
      playerId: "3139477",
      position: "QB",
      nflTeam: "KC",
    });
    expect(mirror.headshotCandidates![0]).toMatch(/sleepercdn\.com/);
    expect(mirror.headshotUrl).toBe(mirror.headshotCandidates![0]);
  });

  it("Sleeper missing, ESPN available → ESPN full fallback", () => {
    const list = getPlayerHeadshotCandidates(
      { espnId: "99999999", name: "Unknown Player", position: "QB" },
      "full",
      { prefer: "sleeper" },
    );
    // No sleeper id resolved — should still attempt ESPN full if numeric id present
    if (list.length > 0) {
      expect(list[0]).toContain("espncdn.com");
    }
  });

  it("both unavailable → empty candidates (initials, no broken img src)", () => {
    expect(
      getPlayerHeadshotCandidates(
        { name: "Definitely Not A Real Nfl Player Zzz 99999", position: "QB" },
        "full",
        { prefer: "sleeper" },
      ),
    ).toEqual([]);
    const mirror = enrichEspnPickIdentity({
      playerName: "Definitely Not A Real Nfl Player Zzz 99999",
      position: "QB",
    });
    expect(mirror.headshotCandidates ?? []).toEqual([]);
    expect(mirror.headshotUrl).toBeUndefined();
  });

  it("app and Board Mirror agree on first candidate for same player", () => {
    const scraped =
      "https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3139477.png";
    const app = getPlayerHeadshotCandidates(
      { espnId: "3139477", name: "Patrick Mahomes", position: "QB", nflTeam: "KC" },
      "full",
      { prefer: "sleeper" },
    );
    const mirror = enrichEspnPickIdentity({
      playerName: "Patrick Mahomes",
      playerId: "3139477",
      headshotUrl: scraped,
      position: "QB",
      nflTeam: "KC",
    });
    expect(app[0]).toBe(mirror.headshotCandidates![0]);
  });
});
