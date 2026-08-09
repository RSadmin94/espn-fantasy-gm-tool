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

describe("RFSN-052J partial legacy podium seasons", () => {
  const fullRows: GmTeamRow[] = [
    team(2011, 1, "guid-A", "Alice", "Team A", 1),
    team(2011, 2, "guid-B", "Bob", "Team B", 2),
    team(2011, 3, "guid-C", "Cara", "Team C", 3),
    team(2021, 1, "guid-A", "Alice", "Team A", 1),
    team(2021, 2, "guid-B", "Bob", "Team B", 2),
    team(2021, 3, "guid-C", "Cara", "Team C", 3),
  ];
  const aliasLabelToKey = new Map([
    ["legacy alice fc", "id:guid-A"],
    ["legacy bob fc", "id:guid-B"],
    ["legacy cara fc", "id:guid-C"],
  ]);

  it("counts a podium-only season toward championship totals via approved alias", () => {
    const a = resolveChampionsFromRows(
      fullRows,
      [
        { season: 2009, championOwner: "Legacy Alice FC", runnerUpOwner: "Legacy Bob FC", thirdPlaceOwner: "Legacy Cara FC" },
        { season: 2011, championOwner: "Alice" },
        { season: 2021, championOwner: "Alice" },
      ],
      { aliasLabelToKey, matchupSeasons: new Set([2011, 2021]) },
    );
    const keyA = a.canonicalKeyForOwnerId("guid-A");
    expect(a.titlesByKey.get(keyA)).toBe(3);
    expect(a.championSeasonsByKey.get(keyA)).toEqual([2009, 2011, 2021]);
    expect(a.coverageBySeason.get(2009)).toBe("partial_legacy");
    expect(a.partialLegacySeasons).toEqual([2009]);
    expect(a.fullSeasons).toEqual([2011, 2021]);
    expect(a.championshipCoverageStart).toBe(2009);
    expect(a.championshipCoverageEnd).toBe(2021);
    expect(a.matchupCoverageStart).toBe(2011);
    expect(a.matchupCoverageEnd).toBe(2021);
    expect(a.championTeamIdBySeason.get(2009)).toBeNull();
    expect(a.sourceBySeason.get(2009)).toBe("medal");
  });

  it("keeps runner-up and third place available without inventing matchups", () => {
    const a = resolveChampionsFromRows(
      fullRows,
      [
        { season: 2009, championOwner: "Legacy Alice FC", runnerUpOwner: "Legacy Bob FC", thirdPlaceOwner: "Legacy Cara FC" },
        { season: 2011, championOwner: "Alice", runnerUpOwner: "Bob", thirdPlaceOwner: "Cara" },
      ],
      { aliasLabelToKey, matchupSeasons: new Set([2011, 2021]) },
    );
    expect(a.runnerUpSeasonsByKey.get(a.canonicalKeyForOwnerId("guid-B"))).toEqual([2009, 2011]);
    expect(a.thirdPlaceSeasonsByKey.get(a.canonicalKeyForOwnerId("guid-C"))).toEqual([2009, 2011]);
    expect(a.runnerUpNameBySeason.get(2009)).toBe("Bob");
    expect(a.thirdPlaceNameBySeason.get(2009)).toBe("Cara");
  });

  it("does not fabricate matchup history for partial legacy seasons", () => {
    const a = resolveChampionsFromRows(
      fullRows,
      [{ season: 2009, championOwner: "Legacy Alice FC", runnerUpOwner: "Legacy Bob FC", thirdPlaceOwner: "Legacy Cara FC" }],
      { aliasLabelToKey, matchupSeasons: new Set([2011, 2021]) },
    );
    expect(a.coverageBySeason.get(2009)).toBe("partial_legacy");
    expect(a.championOwnerIdBySeason.get(2009)).toBeNull();
    expect(a.championTeamIdBySeason.get(2009)).toBeNull();
    expect(a.fullSeasons).not.toContain(2009);
  });

  it("leaves full-data seasons unchanged when a partial legacy season is present", () => {
    const a = resolveChampionsFromRows(
      fullRows,
      [
        { season: 2009, championOwner: "Legacy Alice FC" },
        { season: 2011, championOwner: "Alice" },
        { season: 2021, championOwner: "Bob" },
      ],
      { aliasLabelToKey, matchupSeasons: new Set([2011, 2021]) },
    );
    expect(a.sourceBySeason.get(2011)).toBe("medal");
    expect(a.championOwnerIdBySeason.get(2011)).toBe("guid-A");
    expect(a.championTeamIdBySeason.get(2011)).toBe(1);
    expect(a.coverageBySeason.get(2011)).toBe("full");
    expect(a.coverageBySeason.get(2021)).toBe("full");
    expect(a.titlesByKey.get(a.canonicalKeyForOwnerId("guid-B"))).toBe(1);
  });

  it("does not double-count a championship when alias and in-season labels resolve to the same owner", () => {
    const a = resolveChampionsFromRows(
      [
        team(2011, 1, "guid-A", "Alice", "Team A", 1),
        team(2011, 2, "guid-B", "Bob", "Team B", 2),
      ],
      [
        { season: 2011, championOwner: "Alice" },
        { season: 2011, championOwner: "Legacy Alice FC" },
      ],
      { aliasLabelToKey, matchupSeasons: new Set([2011]) },
    );
    expect(a.titlesByKey.get(a.canonicalKeyForOwnerId("guid-A"))).toBe(1);
    expect(a.championSeasonsByKey.get(a.canonicalKeyForOwnerId("guid-A"))).toEqual([2011]);
  });
});
