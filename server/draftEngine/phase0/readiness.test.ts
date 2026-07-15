import { describe, expect, it } from "vitest";
import { buildTeamsBySeason } from "../../resolveDraftPickOwner";
import { buildLeagueReadinessReport, formatReadinessTable } from "./readiness";

const LEAGUE = "457622";

function mockShared(openPickCount: number, keeperCount: number, seasons: number[]) {
  const teamRows = seasons.map((season) => ({
    season,
    teamId: 1,
    name: "Team Bruce",
    ownerName: "Bruce Smith",
    ownerId: "{BRUCE-GUID}",
  }));

  const allLeagueTeams = teamRows.map((t) => ({
    leagueId: LEAGUE,
    season: t.season,
    teamId: t.teamId,
    teamName: t.name,
    ownerName: t.ownerName,
    ownerId: t.ownerId,
  }));

  const teamsBySeason = buildTeamsBySeason(teamRows);

  const draftRows = [];
  for (let i = 0; i < openPickCount; i++) {
    draftRows.push({
      playerName: `Player ${i}`,
      position: "RB",
      roundId: (i % 15) + 1,
      isKeeper: 0,
      season: seasons[i % seasons.length]!,
      teamId: 1,
      rawPick: JSON.stringify({ draftedForAnalytics: true }),
    });
  }
  for (let i = 0; i < keeperCount; i++) {
    draftRows.push({
      playerName: `Keeper ${i}`,
      position: "WR",
      roundId: 3,
      isKeeper: 1,
      season: seasons[i % seasons.length]!,
      teamId: 1,
      rawPick: JSON.stringify({ draftedForAnalytics: false, keeperSlot: true }),
    });
  }

  return { allLeagueTeams, teamsBySeason, draftRows, medalRows: [] };
}

describe("buildLeagueReadinessReport", () => {
  it("classifies full-fit owner with enough open picks and seasons", () => {
    const seasons = Array.from({ length: 12 }, (_, i) => 2014 + i);
    const shared = mockShared(90, 5, seasons);
    const report = buildLeagueReadinessReport({ leagueId: LEAGUE, shared });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.tier).toBe("full_fit");
    expect(report.rows[0]!.openDraftPicks).toBe(90);
    expect(report.rows[0]!.keeperSlotPicks).toBe(5);
  });

  it("classifies cold-start when history is thin", () => {
    const shared = mockShared(10, 2, [2024, 2025]);
    const report = buildLeagueReadinessReport({ leagueId: LEAGUE, shared });
    expect(report.rows[0]!.tier).toBe("cold_start");
  });

  it("formats a readable table", () => {
    const seasons = Array.from({ length: 12 }, (_, i) => 2014 + i);
    const shared = mockShared(90, 0, seasons);
    const report = buildLeagueReadinessReport({ leagueId: LEAGUE, shared });
    const text = formatReadinessTable(report);
    expect(text).toContain("Bruce");
    expect(text).toContain("FULL");
  });
});
