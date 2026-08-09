import { describe, expect, it } from "vitest";
import {
  classifyEspnPlayoffTier,
  matchupIsPlayoffFromEspnTier,
  parsePlayoffTierFromRawMatchup,
  placementWinnersBracketKeys,
} from "./matchupPlayoffTier";

describe("RFSN-052I playoff tier semantics", () => {
  it("treats any non-NONE ESPN tier as isPlayoff (including consolation)", () => {
    expect(matchupIsPlayoffFromEspnTier("WINNERS_BRACKET")).toBe(true);
    expect(matchupIsPlayoffFromEspnTier("LOSERS_BRACKET")).toBe(true);
    expect(matchupIsPlayoffFromEspnTier("NONE")).toBe(false);
    expect(matchupIsPlayoffFromEspnTier(undefined)).toBe(false);
  });

  it("classifies winners vs consolation vs unknown isPlayoff", () => {
    expect(classifyEspnPlayoffTier("WINNERS_BRACKET")).toBe("winners");
    expect(classifyEspnPlayoffTier("LOSERS_BRACKET")).toBe("consolation");
    expect(classifyEspnPlayoffTier("NONE")).toBe("none");
    expect(classifyEspnPlayoffTier(null, true)).toBe("unknown");
    expect(classifyEspnPlayoffTier(null, false)).toBe("none");
  });

  it("reads playoffTierType from gmMatchups.rawMatchup", () => {
    expect(parsePlayoffTierFromRawMatchup(JSON.stringify({ playoffTierType: "WINNERS_BRACKET" }))).toBe(
      "WINNERS_BRACKET",
    );
    expect(parsePlayoffTierFromRawMatchup(JSON.stringify({ playoffTierType: "LOSERS_BRACKET" }))).toBe(
      "LOSERS_BRACKET",
    );
    expect(parsePlayoffTierFromRawMatchup("{}")).toBeNull();
    expect(parsePlayoffTierFromRawMatchup("not-json")).toBeNull();
  });

  it("excludes 3rd-place WINNERS_BRACKET when semi-final winners identify the title game", () => {
    const games = [
      {
        season: 2018,
        matchupPeriodId: 15,
        homePerson: "A",
        awayPerson: "B",
        winnerPerson: "A",
        kind: "winners" as const,
      },
      {
        season: 2018,
        matchupPeriodId: 15,
        homePerson: "C",
        awayPerson: "D",
        winnerPerson: "D",
        kind: "winners" as const,
      },
      {
        season: 2018,
        matchupPeriodId: 16,
        homePerson: "A",
        awayPerson: "D",
        winnerPerson: "D",
        kind: "winners" as const,
      },
      {
        season: 2018,
        matchupPeriodId: 16,
        homePerson: "B",
        awayPerson: "C",
        winnerPerson: "B",
        kind: "winners" as const,
      },
    ];
    const placement = placementWinnersBracketKeys(games);
    expect([...placement]).toEqual(["2018:16:B:C"]);
  });

  it("does not exclude when only one final-period winners game exists", () => {
    const placement = placementWinnersBracketKeys([
      {
        season: 2021,
        matchupPeriodId: 16,
        homePerson: "A",
        awayPerson: "B",
        winnerPerson: "A",
        kind: "winners",
      },
    ]);
    expect(placement.size).toBe(0);
  });
});
