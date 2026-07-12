import { describe, expect, it } from "vitest";
import {
  buildRfsnLiveDraftId,
  buildRfsnLiveDraftIdFromLeague,
  resolveLeagueDraftSeason,
} from "./rfsnLiveDraftId";

const OFFSEASON_NOW = new Date("2026-07-12T12:00:00Z");

describe("rfsnLiveDraftId", () => {
  it("builds canonical war-room draft id from season", () => {
    expect(buildRfsnLiveDraftId(2026)).toBe("war-room-live-2026");
  });

  it("uses max synced league season when it differs from the calendar year", () => {
    expect(resolveLeagueDraftSeason([2024, 2025], OFFSEASON_NOW)).toBe(2025);
    expect(buildRfsnLiveDraftIdFromLeague([2024, 2025], OFFSEASON_NOW)).toBe(
      "war-room-live-2025",
    );
  });

  it("War Room and RFSN Live resolve identical draft ids from the same league seasons", () => {
    const seasons = [2023, 2025];
    const season = resolveLeagueDraftSeason(seasons, OFFSEASON_NOW);
    const warRoomDraftId = buildRfsnLiveDraftId(season);
    const rfsnLiveDraftId = buildRfsnLiveDraftIdFromLeague(seasons, OFFSEASON_NOW);
    expect(warRoomDraftId).toBe(rfsnLiveDraftId);
    expect(warRoomDraftId).toBe("war-room-live-2025");
  });

  it("falls back to calendar year when no seasons are synced", () => {
    expect(resolveLeagueDraftSeason(null, OFFSEASON_NOW)).toBe(2026);
    expect(resolveLeagueDraftSeason(undefined, OFFSEASON_NOW)).toBe(2026);
    expect(resolveLeagueDraftSeason([], OFFSEASON_NOW)).toBe(2026);
    expect(buildRfsnLiveDraftIdFromLeague(null, OFFSEASON_NOW)).toBe("war-room-live-2026");
  });

  it("ignores invalid season entries", () => {
    expect(resolveLeagueDraftSeason([0, -1, Number.NaN, 2025], OFFSEASON_NOW)).toBe(2025);
  });
});
