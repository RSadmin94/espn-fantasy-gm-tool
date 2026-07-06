import { describe, expect, it } from "vitest";
import { createInitialWeather, mutateWeatherAfterPick, type SimPlayer } from "./weather";

const p = (name: string, pos: string, v = 50): SimPlayer => ({
  playerName: name,
  position: pos,
  playerKey: name.toLowerCase(),
  valueScore: v,
  tier: "T2",
});

describe("DraftWeather", () => {
  it("mutates available pool after pick", () => {
    const pool = [p("A", "RB"), p("B", "WR"), p("C", "RB")];
    let w = createInitialWeather({ leagueId: "457622", season: 2026, teamCount: 14, pool });
    w = mutateWeatherAfterPick({
      weather: w,
      chosen: pool[0]!,
      chooserProfileKey: "test",
      overallPick: 1,
    });
    expect(w.available).toHaveLength(2);
    expect(w.picksCompleted).toBe(1);
  });

  it("detects run-heavy tempo after position stack", () => {
    const pool = [p("A", "WR"), p("B", "WR"), p("C", "RB"), p("D", "WR"), p("E", "WR")];
    let w = createInitialWeather({ leagueId: "457622", season: 2026, teamCount: 14, pool });
    for (let i = 0; i < 3; i++) {
      w = mutateWeatherAfterPick({
        weather: w,
        chosen: pool[i]!.position === "WR" ? pool[i]! : pool[3]!,
        chooserProfileKey: "test",
        overallPick: i + 1,
      });
    }
    expect(w.tempo === "run-heavy" || w.roomState.runInProgress?.position === "WR").toBe(true);
  });
});
