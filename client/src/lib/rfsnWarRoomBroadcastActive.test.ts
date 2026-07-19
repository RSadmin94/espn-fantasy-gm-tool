import { describe, expect, it } from "vitest";
import { isRfsnWarRoomBroadcastActive } from "./rfsnWarRoomBroadcastActive";

describe("isRfsnWarRoomBroadcastActive", () => {
  it("is true only on Live Draft surface with Live Draft ON", () => {
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: true }),
    ).toBe(true);
  });

  it("is false on Mock even when Live Draft toggle is still ON", () => {
    expect(
      isRfsnWarRoomBroadcastActive({ liveDraftActive: true, preferLiveDraft: false }),
    ).toBe(false);
  });
});
