import { describe, it, expect } from "vitest";
import { resolveChampionsFromRows, type MedalRowLite } from "./championshipAuthority";
import { championSeasonsFromAuthority, type GmTeamRow } from "./ownerProfileService";

function team(
  season: number,
  teamId: number,
  ownerId: string,
  ownerName: string,
  name: string,
  finalStanding: number | null,
): GmTeamRow {
  return { season, teamId, ownerId, ownerName, name, finalStanding } as unknown as GmTeamRow;
}

describe("championSeasonsFromAuthority", () => {
  it("returns medal-resolved title seasons for the profile owner", () => {
    const rows: GmTeamRow[] = [
      team(2020, 1, "guid-A", "Alice", "Team A", 1),
      team(2020, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const medals: MedalRowLite[] = [{ season: 2020, championOwner: "Alice" }];
    const auth = resolveChampionsFromRows(rows, medals);
    const lookup = {
      championSeasonsByKey: auth.championSeasonsByKey,
      canonicalKeyForOwnerId: auth.canonicalKeyForOwnerId,
    };
    const keyA = auth.canonicalKeyForOwnerId("guid-A");
    const seasons = championSeasonsFromAuthority(lookup, { ownerId: "guid-A", profileOwnerKey: keyA });
    expect(seasons).toEqual([2020]);
  });

  it("returns finalStanding-fallback seasons when medals are absent (480452315-style)", () => {
    const rows: GmTeamRow[] = [
      team(2023, 1, "guid-A", "Alice", "Team A", 1),
      team(2023, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const auth = resolveChampionsFromRows(rows, []);
    const lookup = {
      championSeasonsByKey: auth.championSeasonsByKey,
      canonicalKeyForOwnerId: auth.canonicalKeyForOwnerId,
    };
    const keyA = auth.canonicalKeyForOwnerId("guid-A");
    const seasons = championSeasonsFromAuthority(lookup, { ownerId: "guid-A", profileOwnerKey: keyA });
    expect(seasons).toEqual([2023]);
    expect(auth.fallbackSeasons).toContain(2023);
  });
});
