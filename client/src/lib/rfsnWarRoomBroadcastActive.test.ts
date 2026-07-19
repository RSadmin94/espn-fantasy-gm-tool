import { describe, expect, it } from "vitest";
import { isLiveDraftSurfaceActive } from "./liveDraftSurfaceActive";
import { isRfsnWarRoomBroadcastActive } from "./rfsnWarRoomBroadcastActive";

describe("isRfsnWarRoomBroadcastActive", () => {
  it("delegates to isLiveDraftSurfaceActive", () => {
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: true }),
    ).toBe(
      isLiveDraftSurfaceActive({ liveDraftActive: true, preferLiveDraft: true }),
    );
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: false }),
    ).toBe(false);
  });
});
