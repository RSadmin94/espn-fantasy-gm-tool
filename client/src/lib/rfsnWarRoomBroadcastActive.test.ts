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

  it("does not arm FantasyPros booth on Live surface", () => {
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
