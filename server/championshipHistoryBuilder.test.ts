/**
 * Tests for championshipHistoryBuilder.ts
 * Covers: buildTrophySummary, buildTrophyPromptBlock, buildLeagueTrophyLeaderboard,
 * mergeTrophyHistoryFromAuthorityAndHoF (PR-G vs ChampionshipAuthority; OLD rank path in tests only)
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildTrophySummary,
  buildTrophyPromptBlock,
  buildLeagueTrophyLeaderboard,
  mergeTrophyHistoryFromAuthorityAndHoF,
  sumChampionshipsInTrophyMap,
  type OwnerTrophyRecord,
} from "./championshipHistoryBuilder";
import { resolveChampionsFromRows, type MedalRowLite } from "./championshipAuthority";
import type { HallOfFamePayload } from "./hallOfFameService";
import type { GmTeamRow } from "./ownerProfileService";
import { memberIdFromOwnerKey } from "./db";

/** Same key shape as `championshipHistoryBuilder` trophy map (bare member id when `id:{uuid}`). */
function trophyMapKey(canonicalOwnerKey: string): string {
  const mid = memberIdFromOwnerKey(canonicalOwnerKey);
  return mid && mid.length > 0 ? mid : canonicalOwnerKey;
}

function team(
  season: number,
  teamId: number,
  ownerId: string,
  ownerName: string,
  name: string,
  finalStanding: number | null,
  rawTeam?: string,
): GmTeamRow {
  return {
    season,
    teamId,
    ownerId,
    ownerName,
    name,
    finalStanding,
    rawTeam: rawTeam ?? "{}",
  } as unknown as GmTeamRow;
}

/** Deprecated-style champion pick (tests only): `rankCalculatedFinal === 1` else `finalStanding === 1`. */
function countTitlesOldRankOrFinalStanding(rows: GmTeamRow[]): Map<string, number> {
  const rowsBySeason = new Map<number, GmTeamRow[]>();
  for (const t of rows) {
    const s = Number(t.season);
    if (!rowsBySeason.has(s)) rowsBySeason.set(s, []);
    rowsBySeason.get(s)!.push(t);
  }
  const titlesByKey = new Map<string, number>();
  for (const [, seasonRows] of rowsBySeason) {
    let champ: GmTeamRow | undefined;
    for (const t of seasonRows) {
      let rank: number | null = null;
      try {
        const raw = JSON.parse(String(t.rawTeam || "{}")) as { rankCalculatedFinal?: number };
        if (raw.rankCalculatedFinal != null) rank = Number(raw.rankCalculatedFinal);
      } catch {
        /* ignore */
      }
      if (rank === 1) {
        champ = t;
        break;
      }
    }
    if (!champ) champ = seasonRows.find((t) => Number(t.finalStanding) === 1);
    if (!champ) continue;
    const oid = String(champ.ownerId || "").trim();
    const ownerKey = oid ? `id:${oid}` : String(champ.ownerName || "").trim();
    const key = trophyMapKey(ownerKey);
    titlesByKey.set(key, (titlesByKey.get(key) ?? 0) + 1);
  }
  return titlesByKey;
}

function hofPayloadWithHistory(
  history: HallOfFamePayload["championships"]["history"],
  ownerRecords: HallOfFamePayload["ownerRecords"] = [],
): HallOfFamePayload {
  return {
    coverage: {
      completedRsGmMatchupGames: 0,
      dedupedMatchupRows: 0,
      seasonsTouched: [],
      note: "",
    },
    championships: {
      leaderboard: [],
      history,
      medalDiagnostics: {
        totalMedals: 0,
        unmatchedChampionTeams: [],
        unmatchedRunnerUpTeams: [],
        unmatchedThirdTeams: [],
      },
    },
    ownerRecords,
  } as unknown as HallOfFamePayload;
}

function makeRecord(overrides: Partial<OwnerTrophyRecord> = {}): OwnerTrophyRecord {
  return {
    memberId: "m1",
    name: "Rod Sellers",
    championships: 0,
    championshipYears: [],
    runnerUps: 0,
    runnerUpYears: [],
    thirdPlaceFinishes: 0,
    thirdPlaceYears: [],
    finalsAppearances: 0,
    totalTrophies: 0,
    lastTitle: null,
    yearsSinceTitle: null,
    longestDrought: 0,
    prestige: "hungry",
    ...overrides,
  };
}

describe("buildTrophySummary", () => {
  it("returns 'never won' message when no trophies", () => {
    const rec = makeRecord();
    const result = buildTrophySummary(rec);
    expect(result).toContain("never won a championship");
  });

  it("includes championship year(s) in summary", () => {
    const rec = makeRecord({
      championships: 2,
      championshipYears: [2018, 2022],
      finalsAppearances: 2,
      totalTrophies: 2,
      lastTitle: 2022,
      yearsSinceTitle: 3,
      prestige: "contender",
    });
    const result = buildTrophySummary(rec);
    expect(result).toContain("2 championships");
    expect(result).toContain("2018, 2022");
    expect(result).toContain("Last title: 2022");
  });

  it("includes runner-up years when present", () => {
    const rec = makeRecord({
      championships: 1,
      championshipYears: [2019],
      runnerUps: 2,
      runnerUpYears: [2021, 2023],
      finalsAppearances: 3,
      totalTrophies: 3,
      lastTitle: 2019,
      yearsSinceTitle: 6,
      prestige: "finalist",
    });
    const result = buildTrophySummary(rec);
    expect(result).toContain("1 championship");
    expect(result).toContain("2 runner-up");
    expect(result).toContain("2021, 2023");
  });

  it("handles single championship with correct grammar", () => {
    const rec = makeRecord({
      championships: 1,
      championshipYears: [2020],
      finalsAppearances: 1,
      totalTrophies: 1,
      lastTitle: 2020,
      yearsSinceTitle: 5,
      prestige: "finalist",
    });
    const result = buildTrophySummary(rec);
    expect(result).toContain("1 championship");
    expect(result).not.toContain("2 championship");
  });
});

describe("buildTrophyPromptBlock", () => {
  it("includes prestige label for dynasty", () => {
    const rec = makeRecord({
      championships: 3,
      championshipYears: [2012, 2013, 2018],
      finalsAppearances: 3,
      totalTrophies: 3,
      lastTitle: 2018,
      yearsSinceTitle: 7,
      prestige: "dynasty",
    });
    const block = buildTrophyPromptBlock(rec);
    expect(block).toContain("DYNASTY");
    expect(block).toContain("2012, 2013, 2018");
  });

  it("includes near-miss note for multiple runner-ups with no title", () => {
    const rec = makeRecord({
      championships: 0,
      runnerUps: 2,
      runnerUpYears: [2019, 2021],
      finalsAppearances: 2,
      totalTrophies: 2,
      prestige: "finalist",
    });
    const block = buildTrophyPromptBlock(rec);
    expect(block).toContain("near-misses");
    expect(block).toContain("2019, 2021");
  });

  it("shows 'never won' for owner with no trophies", () => {
    const rec = makeRecord({ prestige: "hungry" });
    const block = buildTrophyPromptBlock(rec);
    expect(block).toContain("never won");
  });

  it("uses custom label when provided", () => {
    const rec = makeRecord({ championships: 1, championshipYears: [2020], lastTitle: 2020, yearsSinceTitle: 5, prestige: "finalist", finalsAppearances: 1, totalTrophies: 1 });
    const block = buildTrophyPromptBlock(rec, "Christian Edmondson Trophy History");
    expect(block).toContain("Christian Edmondson Trophy History");
  });
});

describe("buildLeagueTrophyLeaderboard", () => {
  it("returns empty string when no champions or runner-ups", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Owner A" })],
    ]);
    expect(buildLeagueTrophyLeaderboard(map)).toBe("");
  });

  it("sorts by championships desc", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Owner A", championships: 1, championshipYears: [2020], finalsAppearances: 1, totalTrophies: 1, lastTitle: 2020, yearsSinceTitle: 5, prestige: "finalist" })],
      ["m2", makeRecord({ memberId: "m2", name: "Owner B", championships: 3, championshipYears: [2012, 2013, 2018], finalsAppearances: 3, totalTrophies: 3, lastTitle: 2018, yearsSinceTitle: 7, prestige: "dynasty" })],
    ]);
    const result = buildLeagueTrophyLeaderboard(map);
    const posA = result.indexOf("Owner A");
    const posB = result.indexOf("Owner B");
    expect(posB).toBeLessThan(posA); // Owner B (3 titles) should appear before Owner A (1 title)
  });

  it("includes DYNASTY callout for 3+ title owners", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Christian Edmondson", championships: 3, championshipYears: [2012, 2013, 2018], finalsAppearances: 3, totalTrophies: 3, lastTitle: 2018, yearsSinceTitle: 7, prestige: "dynasty" })],
    ]);
    const result = buildLeagueTrophyLeaderboard(map);
    expect(result).toContain("DYNASTY");
    expect(result).toContain("Christian Edmondson");
    expect(result).toContain("2012, 2013, 2018");
  });

  it("includes NEAR-MISSES callout for 0 titles but 2+ runner-ups", () => {
    const map = new Map<string, OwnerTrophyRecord>([
      ["m1", makeRecord({ memberId: "m1", name: "Sad Owner", championships: 0, runnerUps: 2, runnerUpYears: [2019, 2021], finalsAppearances: 2, totalTrophies: 2, prestige: "finalist" })],
    ]);
    const result = buildLeagueTrophyLeaderboard(map);
    expect(result).toContain("NEAR-MISSES");
    expect(result).toContain("Sad Owner");
  });
});

describe("mergeTrophyHistoryFromAuthorityAndHoF (PR-G / ChampionshipAuthority)", () => {
  it("matches authority titles per map key and league-wide title sum", () => {
    const rows: GmTeamRow[] = [
      team(2020, 1, "guid-A", "Alice", "Team A", 2),
      team(2020, 2, "guid-B", "Bob", "Team B", 1),
      team(2021, 1, "guid-A", "Alice", "Team A", 1),
      team(2021, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const medals: MedalRowLite[] = [{ season: 2020, championOwner: "Alice" }];
    const authority = resolveChampionsFromRows(rows, medals);
    const keyA = authority.canonicalKeyForOwnerId("guid-A");
    const payload = hofPayloadWithHistory([]);
    const map = mergeTrophyHistoryFromAuthorityAndHoF({
      authority,
      payload,
      leagueId: "test-league",
    });
    expect(sumChampionshipsInTrophyMap(map)).toBe(
      [...authority.titlesByKey.values()].reduce((a, b) => a + b, 0),
    );
    expect(map.get(trophyMapKey(keyA))?.championships).toBe(authority.titlesByKey.get(keyA));
  });

  it("golden 158918 pattern: 8 distinct medal champions => 8 league titles", () => {
    const rows: GmTeamRow[] = [];
    const medals: MedalRowLite[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 2010 + i;
      const winner = `guid-${i}`;
      const wname = `Owner${i}`;
      rows.push(team(y, 1, winner, wname, `Team${i}`, 1));
      rows.push(team(y, 2, "guid-loser", "Loser", "LTeam", 2));
      medals.push({ season: y, championOwner: wname });
    }
    const authority = resolveChampionsFromRows(rows, medals);
    const map = mergeTrophyHistoryFromAuthorityAndHoF({
      authority,
      payload: hofPayloadWithHistory([]),
      leagueId: "158918",
    });
    expect(sumChampionshipsInTrophyMap(map)).toBe(8);
    expect(authority.fallbackSeasons).toHaveLength(0);
  });

  it("golden 457622 pattern: 16 distinct medal champions => 16 league titles", () => {
    const rows: GmTeamRow[] = [];
    const medals: MedalRowLite[] = [];
    for (let i = 0; i < 16; i++) {
      const y = 2000 + i;
      const winner = `guid-${i}`;
      const wname = `Mgr${i}`;
      rows.push(team(y, 1, winner, wname, `T${i}`, 1));
      rows.push(team(y, 2, "guid-loser", "Loser", "LTeam", 2));
      medals.push({ season: y, championOwner: wname });
    }
    const authority = resolveChampionsFromRows(rows, medals);
    const map = mergeTrophyHistoryFromAuthorityAndHoF({
      authority,
      payload: hofPayloadWithHistory([]),
      leagueId: "457622",
    });
    expect(sumChampionshipsInTrophyMap(map)).toBe(16);
  });

  it("golden 480452315 pattern: no medals, 3 fallback seasons => 3 titles total", () => {
    const rows: GmTeamRow[] = [
      team(2022, 1, "guid-A", "Alice", "Team A", 1),
      team(2022, 2, "guid-B", "Bob", "Team B", 2),
      team(2023, 1, "guid-A", "Alice", "Team A", 2),
      team(2023, 2, "guid-B", "Bob", "Team B", 1),
      team(2024, 1, "guid-A", "Alice", "Team A", 1),
      team(2024, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const authority = resolveChampionsFromRows(rows, []);
    expect(authority.fallbackSeasons.sort()).toEqual([2022, 2023, 2024]);
    const map = mergeTrophyHistoryFromAuthorityAndHoF({
      authority,
      payload: hofPayloadWithHistory([]),
      leagueId: "480452315",
    });
    expect(sumChampionshipsInTrophyMap(map)).toBe(3);
  });

  it("logs fallback seasons as finalStanding fallback (not medals)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const rows: GmTeamRow[] = [
      team(2029, 1, "guid-A", "Alice", "Team A", 1),
      team(2029, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const authority = resolveChampionsFromRows(rows, []);
    mergeTrophyHistoryFromAuthorityAndHoF({
      authority,
      payload: hofPayloadWithHistory([]),
      leagueId: "480452315",
    });
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("finalStanding fallback, NOT league_medals"))).toBe(
      true,
    );
    logSpy.mockRestore();
  });

  it("HoF supplies runner-up / third only (champs still from authority)", () => {
    const rows: GmTeamRow[] = [
      team(2020, 1, "guid-A", "Alice", "Team A", 1),
      team(2020, 2, "guid-B", "Bob", "Team B", 2),
    ];
    const medals: MedalRowLite[] = [{ season: 2020, championOwner: "Alice" }];
    const authority = resolveChampionsFromRows(rows, medals);
    const keyA = authority.canonicalKeyForOwnerId("guid-A");
    const keyB = authority.canonicalKeyForOwnerId("guid-B");
    const history: HallOfFamePayload["championships"]["history"] = [
      {
        season: 2020,
        championTeam: null,
        runnerUpTeam: null,
        thirdTeam: null,
        resolvedChampionOwnerKey: null,
        resolvedChampionDisplay: null,
        resolvedRunnerUpOwnerKey: keyB,
        resolvedRunnerUpDisplay: "Bob",
        resolvedThirdOwnerKey: null,
        resolvedThirdDisplay: null,
      },
    ];
    const map = mergeTrophyHistoryFromAuthorityAndHoF({
      authority,
      payload: hofPayloadWithHistory(history),
      leagueId: "hof-ru",
    });
    expect(map.get(trophyMapKey(keyA))?.championships).toBe(1);
    expect(map.get(trophyMapKey(keyB))?.runnerUps).toBe(1);
    expect(map.get(trophyMapKey(keyB))?.runnerUpYears).toEqual([2020]);
  });

  it("three-way: PR-G matches authority; OLD rank path can disagree when medal beats rankCalculatedFinal", () => {
    const rows: GmTeamRow[] = [
      team(2020, 1, "guid-A", "Alice", "Team A", 2, JSON.stringify({ rankCalculatedFinal: 2 })),
      team(2020, 2, "guid-B", "Bob", "Team B", 1, JSON.stringify({ rankCalculatedFinal: 1 })),
    ];
    const medals: MedalRowLite[] = [{ season: 2020, championOwner: "Alice" }];
    const authority = resolveChampionsFromRows(rows, medals);
    const keyA = authority.canonicalKeyForOwnerId("guid-A");
    const keyB = authority.canonicalKeyForOwnerId("guid-B");
    const map = mergeTrophyHistoryFromAuthorityAndHoF({
      authority,
      payload: hofPayloadWithHistory([]),
      leagueId: "three-way",
    });
    expect(map.get(trophyMapKey(keyA))?.championships).toBe(1);
    expect(map.get(trophyMapKey(keyB))?.championships ?? 0).toBe(0);
    expect(authority.titlesByKey.get(keyA)).toBe(1);
    const oldTitles = countTitlesOldRankOrFinalStanding(rows);
    expect(oldTitles.get(trophyMapKey(keyB))).toBe(1);
    expect(oldTitles.get(trophyMapKey(keyA)) ?? 0).toBe(0);
  });
});
