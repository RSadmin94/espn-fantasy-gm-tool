import { describe, expect, it } from "vitest";
import { buildSeasonTerrain, topTerrainCards } from "./buildSeasonTerrain";

describe("buildSeasonTerrain", () => {
  it("ranks veterans by prior-season points", () => {
    const terrain = buildSeasonTerrain({
      leagueId: "457622",
      season: 2024,
      draftPicks: [
        { playerName: "Star RB", position: "RB", overallPick: 3, playerId: 1, season: 2024 },
        { playerName: "Star WR", position: "WR", overallPick: 2, playerId: 2, season: 2024 },
        { playerName: "Rookie WR", position: "WR", overallPick: 20, playerId: 3, season: 2024 },
      ],
      priorSeasonPoints: [
        { playerId: 1, totalPoints: 250 },
        { playerId: 2, totalPoints: 280 },
      ],
      playerCache: [],
    });
    const top = topTerrainCards(terrain, 4);
    expect(top.find((t) => t.playerName === "Star WR")!.valueSource).toBe("prior_season_fantasy_points");
    expect(top.find((t) => t.playerName === "Star RB")!.valueSource).toBe("prior_season_fantasy_points");
    expect(top.find((t) => t.playerName === "Star WR")!.valueScore).toBe(100);
  });

  it("position-normalizes value within position", () => {
    const terrain = buildSeasonTerrain({
      leagueId: "457622",
      season: 2024,
      draftPicks: [
        { playerName: "QB Star", position: "QB", overallPick: 1, playerId: 1, season: 2024 },
        { playerName: "WR Star", position: "WR", overallPick: 2, playerId: 2, season: 2024 },
        { playerName: "RB Star", position: "RB", overallPick: 3, playerId: 3, season: 2024 },
      ],
      priorSeasonPoints: [
        { playerId: 1, totalPoints: 400 },
        { playerId: 2, totalPoints: 280 },
        { playerId: 3, totalPoints: 250 },
      ],
      playerCache: [],
    });
    const wr = terrain.cards.find((c) => c.playerName === "WR Star")!;
    const rb = terrain.cards.find((c) => c.playerName === "RB Star")!;
    expect(wr.valueScore).toBe(100);
    expect(rb.valueScore).toBe(100);
  });
});
