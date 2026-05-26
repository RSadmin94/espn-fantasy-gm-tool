import { describe, it, expect } from "vitest";
import { normalizeDraftPicks, teamsArrayFromEspnPayload, extractDraftPickRowsFromPayload } from "./espnService";

describe("normalizeDraftPicks (combined teams dict + HTML-style draft picks)", () => {
  it("normalizes picks when teams is an object map (ESPN combined shape)", () => {
    const teams: Record<string, Record<string, unknown>> = {
      "1": { id: 1, location: "Test", nickname: "Alpha", abbrev: "ALP" },
      "2": { id: 2, location: "Test", nickname: "Beta", abbrev: "BET" },
    };
    const draftDetail = {
      picks: [
        {
          roundId: 1,
          roundPickNumber: 1,
          overallPickNumber: 1,
          teamId: 1,
          playerId: 0,
          playerPoolEntry: {
            player: {
              id: 0,
              fullName: "Dez Bryant",
              defaultPositionId: 3,
              proTeamId: 6,
            },
          },
        },
        {
          roundId: 1,
          roundPickNumber: 2,
          overallPickNumber: 2,
          teamId: 2,
          playerId: 0,
          playerPoolEntry: {
            player: {
              fullName: "Other Player",
              defaultPositionId: 2,
              proTeam: "BUF",
            },
          },
        },
      ],
    };
    const data = {
      id: 457622,
      seasonId: 2010,
      teams,
      draftDetail,
    };
    expect(teamsArrayFromEspnPayload(data as Record<string, unknown>)).toHaveLength(2);
    expect(extractDraftPickRowsFromPayload(data as Record<string, unknown>).pathUsed).toBe("picks");
    const rows = normalizeDraftPicks(data as Record<string, unknown>);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.playerName).toContain("Dez Bryant");
    expect(rows[0]?.playerId).toBeNull();
    expect(rows[0]?.teamId).toBe(1);
    expect(rows[1]?.proTeam).toBe("BUF");
  });
});
