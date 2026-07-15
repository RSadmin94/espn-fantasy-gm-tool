import { describe, expect, it } from "vitest";
import { formatPlayerTicker } from "./RfsnPickClock";

describe("formatPlayerTicker", () => {
  it("returns DRAFT READY when no locked player", () => {
    expect(formatPlayerTicker(null)).toEqual({
      display: "******** DRAFT READY ********",
      accessible: "Draft ready",
    });
  });
  it("uppercases the locked name for display", () => {
    expect(formatPlayerTicker("Nico Collins").display).toBe("******** NICO COLLINS ********");
    expect(formatPlayerTicker("Nico Collins").accessible).toBe("Last pick: NICO COLLINS");
  });
});
