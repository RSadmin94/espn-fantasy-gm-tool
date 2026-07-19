import { describe, expect, it } from "vitest";
import { isLiveDraftSurfaceActive } from "./liveDraftSurfaceActive";
import { isRfsnWarRoomBroadcastActive } from "./rfsnWarRoomBroadcastActive";

describe("isRfsnWarRoomBroadcastActive", () => {
  it("delegates to isLiveDraftSurfaceActive for ESPN Live", () => {
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: true }),
    ).toBe(
      isLiveDraftSurfaceActive({ liveDraftActive: true, preferLiveDraft: true }),
    );
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: false }),
    ).toBe(false);
  });

  it("arms booth for FantasyPros simulation on Mock surface", () => {
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: false,
        preferLiveDraft: false,
        fantasyProsSessionActive: true,
      }),
    ).toBe(true);
  });

  it("arms booth for RFSN Local Mock on Mock surface", () => {
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: true,
        preferLiveDraft: false,
        rfsnLocalMockSessionActive: true,
      }),
    ).toBe(true);
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: false,
        preferLiveDraft: false,
        rfsnLocalMockSessionActive: true,
      }),
    ).toBe(false);
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        rfsnLocalMockSessionActive: true,
      }),
    ).toBe(true); // Live surface still wins via ESPN path
  });

  it("does not arm FantasyPros booth on Live surface without Live session", () => {
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        fantasyProsSessionActive: true,
      }),
    ).toBe(true); // Live surface still active via ESPN path
    expect(
      isRfsnWarRoomBroadcastActive({
        liveDraftActive: false,
        preferLiveDraft: true,
        fantasyProsSessionActive: true,
      }),
    ).toBe(false);
  });
});
