import { describe, expect, it } from "vitest";
import { pickIdentityScore } from "../shared/draftPickSourceSelection";

describe("resolveDraftBoardPicks source scoring (RFSN-055D2)", () => {
  it("prefers a finished-draft source over placeholder normalized rows", () => {
    const placeholderNormalized = Array.from({ length: 196 }, (_, i) => ({
      playerId: null,
      playerName: "",
      position: "?",
      overallPickNumber: i + 1,
    }));
    const completedCache = [
      { playerId: 3117251, playerName: "Christian McCaffrey", position: "RB" },
      { playerId: 4035538, playerName: "Jonathan Taylor", position: "RB" },
      { playerId: 4362628, playerName: "Ja'Marr Chase", position: "WR" },
    ];
    const normalizedScore = pickIdentityScore(placeholderNormalized);
    const cacheScore = pickIdentityScore(completedCache);
    expect(normalizedScore).toBe(0);
    expect(cacheScore).toBeGreaterThan(normalizedScore);
  });

  it("ties on identity score favor the longer source", () => {
    const short = [{ playerId: 3117251, playerName: "Christian McCaffrey", position: "RB" }];
    const long = [
      ...short,
      { playerId: 4035538, playerName: "Jonathan Taylor", position: "RB" },
    ];
    expect(pickIdentityScore(long)).toBeGreaterThan(pickIdentityScore(short));
  });
});
