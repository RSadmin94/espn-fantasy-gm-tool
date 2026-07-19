import { describe, expect, it } from "vitest";
import {
  RFSN_SESSION_MODE,
  isFantasyProsSimulationBroadcastActive,
  resolveRfsnSessionMode,
  shouldRunEspnConnectedLeagueMonitor,
} from "./fantasyProsMockSession";
import { isConnectedLeagueLiveActive } from "./liveDraftSurfaceActive";
import { isRfsnWarRoomBroadcastActive } from "./rfsnWarRoomBroadcastActive";
import { buildFantasyProsSeatMapping } from "./fantasyProsSeatMapping";

describe("fantasyProsMockSession lifecycle gates", () => {
  it("start arms FantasyPros mode only on Mock surface", () => {
    expect(
      resolveRfsnSessionMode({
        preferLiveDraft: false,
        liveDraftActive: false,
        liveDraftSource: "espn",
        fantasyProsSessionActive: true,
      }),
    ).toBe(RFSN_SESSION_MODE.FANTASYPROS_SIMULATION);
  });

  it("ESPN monitor remains off during FantasyPros simulation", () => {
    expect(
      shouldRunEspnConnectedLeagueMonitor({
        liveDraftActive: true,
        preferLiveDraft: true,
        source: "espn",
        fantasyProsSessionActive: true,
      }),
    ).toBe(false);
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        source: "espn",
        fantasyProsSessionActive: true,
      }),
    ).toBe(false);
  });

  it("stop / inactive tears down FantasyPros booth gate", () => {
    expect(
      isFantasyProsSimulationBroadcastActive({
        fantasyProsSessionActive: false,
        preferLiveDraft: false,
      }),
    ).toBe(false);
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: false,
        preferLiveDraft: false,
        fantasyProsSessionActive: false,
      }),
    ).toBe(false);
  });

  it("route exit to Live stops FantasyPros booth even if sticky flags linger", () => {
    expect(
      isFantasyProsSimulationBroadcastActive({
        fantasyProsSessionActive: true,
        preferLiveDraft: true,
      }),
    ).toBe(false);
  });

  it("Mock route does not activate ESPN polling", () => {
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: false,
        source: "espn",
        fantasyProsSessionActive: false,
      }),
    ).toBe(false);
  });

  it("FantasyPros session can arm booth on Mock without Live Draft", () => {
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: false,
        preferLiveDraft: false,
        fantasyProsSessionActive: true,
      }),
    ).toBe(true);
  });

  it("Live connected-league booth still works without FantasyPros", () => {
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        fantasyProsSessionActive: false,
      }),
    ).toBe(true);
  });
});

describe("fantasyProsSeatMapping", () => {
  it("maps user seat and remaining teams by draft order", () => {
    const m = buildFantasyProsSeatMapping({
      teams: [
        { teamId: 1, ownerName: "Alice", draftSlot: 1 },
        { teamId: 2, ownerName: "Bob", draftSlot: 2 },
        { teamId: 3, ownerName: "Carol", draftSlot: 3 },
      ],
      userOwnerPos: 0,
      userTeamId: 2,
      teamCount: 3,
    });
    expect(m.seatNameByPos.get(0)).toBe("Bob");
    expect(m.seatTeamIdByPos.get(0)).toBe("2");
    expect(m.seatNameByPos.get(1)).toBe("Alice");
    expect(m.mappingConfirmed).toBe(true);
  });
});
