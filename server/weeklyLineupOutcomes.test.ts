import { describe, it, expect } from "vitest";
import {
  benchRegretForTeam,
  canFillSlot,
  classifyBenchImpact,
  isStarterSlot,
  leagueWeekMvp,
  playerOfGameForTeams,
  type LineupPlayer,
} from "./weeklyLineupOutcomes";

function p(partial: Partial<LineupPlayer> & Pick<LineupPlayer, "teamId" | "playerId" | "points">): LineupPlayer {
  return {
    playerName: `P${partial.playerId}`,
    position: partial.position ?? "RB",
    slotId: 2,
    ownerId: `{owner-${partial.teamId}}`,
    ownerName: `Owner ${partial.teamId}`,
    ...partial,
  };
}

describe("weeklyLineupOutcomes", () => {
  it("treats slot 20/21 as bench/IR", () => {
    expect(isStarterSlot(0)).toBe(true);
    expect(isStarterSlot(20)).toBe(false);
    expect(isStarterSlot(21)).toBe(false);
  });

  it("does not let a WR replace a QB", () => {
    expect(canFillSlot("WR", 0)).toBe(false);
    expect(canFillSlot("RB", 23)).toBe(true);
  });

  it("picks player of game from starters, ignoring a higher bench score", () => {
    const players = [
      p({ teamId: 1, playerId: 10, points: 28.4, slotId: 0, position: "QB", ownerId: "{aaa}", ownerName: "A" }),
      p({ teamId: 2, playerId: 20, points: 31.1, slotId: 2, position: "RB", ownerId: "{bbb}", ownerName: "B" }),
      p({ teamId: 2, playerId: 21, points: 40, slotId: 20, position: "RB", ownerId: "{bbb}", ownerName: "B" }),
    ];
    const pog = playerOfGameForTeams(players, [1, 2], { 1: 90, 2: 100 });
    expect(pog?.playerId).toBe(20);
    expect(pog?.ownerId).toBe("{bbb}");
  });

  it("ignores a high bench score that cannot legally replace the weak starter", () => {
    const players = [
      p({ teamId: 1, playerId: 1, points: 4, slotId: 0, position: "QB" }),
      p({ teamId: 1, playerId: 2, points: 18, slotId: 4, position: "WR" }),
      p({ teamId: 1, playerId: 3, points: 22, slotId: 20, position: "RB" }),
    ];
    expect(benchRegretForTeam(players, 1)).toBeNull();
  });

  it("records legal bench regret with net improvement", () => {
    const players = [
      p({ teamId: 1, playerId: 1, points: 4, slotId: 2, position: "RB" }),
      p({ teamId: 1, playerId: 2, points: 18, slotId: 4, position: "WR" }),
      p({ teamId: 1, playerId: 3, points: 22, slotId: 20, position: "RB" }),
    ];
    const regret = benchRegretForTeam(players, 1, { teamScore: 80, opponentScore: 90 });
    expect(regret?.playerId).toBe(3);
    expect(regret?.replacedStarterId).toBe(1);
    expect(regret?.netImprovement).toBe(18);
    expect(regret?.impact).toBe("WIN_FLIP");
  });

  it("classifies win-flip only when the swap exceeds the loss margin", () => {
    expect(classifyBenchImpact({ netImprovement: 3, teamScore: 100, opponentScore: 104 })).toBe("INSIGNIFICANT");
    expect(classifyBenchImpact({ netImprovement: 5, teamScore: 100, opponentScore: 104 })).toBe("WIN_FLIP");
  });

  it("selects league week MVP from starters only", () => {
    const mvp = leagueWeekMvp([
      p({ teamId: 1, playerId: 1, points: 40, slotId: 20, position: "RB" }),
      p({ teamId: 2, playerId: 2, points: 33, slotId: 4, position: "WR" }),
    ]);
    expect(mvp?.playerId).toBe(2);
  });
});
