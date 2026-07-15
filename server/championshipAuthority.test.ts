import { describe, it, expect } from "vitest";
import { resolveChampionsFromRows, CHAMPIONSHIP_FALLBACK_LABEL, type MedalRowLite } from "./championshipAuthority";
import type { GmTeamRow } from "./ownerProfileService";

function team(
  season: number, teamId: number, ownerId: string, ownerName: string, name: string,
  finalStanding: number | null,
): GmTeamRow {
  return { season, teamId, ownerId, ownerName, name, finalStanding } as unknown as GmTeamRow;
}

describe("championshipAuthority.resolveChampionsFromRows", () => {
  it("follows the MEDAL champion even when finalStanding disagrees", () => {
    const rows: GmTeamRow[] = [
      team(2020, 1, "guid-A", "Alice", "Team A", 2), // medal says Alice won
      team(2020, 2, "guid-B", "Bob", "Team B", 1),   // finalStanding says Bob
    ];
    const medals: MedalRowLite[] = [{ season: 2020, championOwner: "Alice" }];
    const a = resolveChampionsFromRows(rows, medals);
    expect(a.sourceBySeason.get(2020)).toBe("medal");
    expect(a.championOwnerIdBySeason.get(2020)).toBe("guid-A");
    expect(a.championTeamIdBySeason.get(2020)).toBe(1);
    expect(a.fallbackSeasons).not.toContain(2020);
  });

  it("falls back to finalStanding when a season has no medal row", () => {
    const rows: GmTeamRow[] = [
      team(2021, 1, "guid-A", "Alice", "Team A", 1),
      team(2021, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const a = resolveChampionsFromRows(rows, []); // no medals
    expect(a.sourceBySeason.get(2021)).toBe("finalStanding-fallback");
    expect(a.championOwnerIdBySeason.get(2021)).toBe("guid-A");
    expect(a.fallbackSeasons).toContain(2021);
    expect(a.fallbackLabel).toBe(CHAMPIONSHIP_FALLBACK_LABEL);
  });

  it("falls back when a medal label cannot be resolved to a team", () => {
    const rows: GmTeamRow[] = [
      team(2023, 1, "guid-A", "Alice", "Team A", 1),
      team(2023, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const medals: MedalRowLite[] = [{ season: 2023, championOwner: "Nonexistent Ghost" }];
    const a = resolveChampionsFromRows(rows, medals);
    expect(a.sourceBySeason.get(2023)).toBe("finalStanding-fallback");
    expect(a.championTeamIdBySeason.get(2023)).toBe(1);
  });

  it("marks a season unresolved when neither medal nor finalStanding champion exists", () => {
    const rows: GmTeamRow[] = [
      team(2022, 1, "guid-A", "Alice", "Team A", 0),
      team(2022, 2, "guid-B", "Bob", "Team B", null),
    ];
    const a = resolveChampionsFromRows(rows, []);
    expect(a.sourceBySeason.get(2022)).toBe("unresolved");
    expect(a.unresolvedSeasons).toContain(2022);
    expect(a.championTeamIdBySeason.get(2022)).toBeNull();
  });

  it("aggregates titles per owner and computes reigning champion", () => {
    const rows: GmTeamRow[] = [
      team(2020, 1, "guid-A", "Alice", "Team A", 2),
      team(2020, 2, "guid-B", "Bob", "Team B", 1),
      team(2021, 1, "guid-A", "Alice", "Team A", 1),
      team(2021, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const medals: MedalRowLite[] = [{ season: 2020, championOwner: "Alice" }]; // 2021 has no medal -> fallback
    const a = resolveChampionsFromRows(rows, medals);
    const keyA = a.canonicalKeyForOwnerId("guid-A");
    expect(a.titlesByKey.get(keyA)).toBe(2);             // 2020 (medal) + 2021 (fallback)
    expect(a.championSeasonsByKey.get(keyA)).toEqual([2020, 2021]);
    expect(a.latestCompletedSeason).toBe(2021);
    expect(a.reigningKey).toBe(keyA);
  });

  it("handles a medal-less league (mirrors 480452315): all seasons fallback, titles still computed", () => {
    const rows: GmTeamRow[] = [
      team(2024, 1, "guid-A", "Alice", "Team A", 1),
      team(2024, 2, "guid-B", "Bob", "Team B", 2),
      team(2025, 1, "guid-A", "Alice", "Team A", 2),
      team(2025, 2, "guid-B", "Bob", "Team B", 1),
    ];
    const a = resolveChampionsFromRows(rows, []); // zero medal rows
    expect(a.fallbackSeasons.sort()).toEqual([2024, 2025]);
    expect(a.sourceBySeason.get(2024)).toBe("finalStanding-fallback");
    expect(a.championOwnerIdBySeason.get(2024)).toBe("guid-A");
    expect(a.championOwnerIdBySeason.get(2025)).toBe("guid-B");
    expect(a.titlesByKey.get(a.canonicalKeyForOwnerId("guid-A"))).toBe(1);
    expect(a.titlesByKey.get(a.canonicalKeyForOwnerId("guid-B"))).toBe(1);
  });
});
