import { describe, expect, it } from "vitest";
import {
  classifyEspnFantasyUrl,
  extractEspnLeagueIdFromUrl,
  isSupportedEspnLiveDraftRoomUrl,
} from "./espnLiveDraftRoom.js";

describe("RFSN-031B ESPN live draft URL matcher", () => {
  it("supports live draft room URLs", () => {
    const urls = [
      "https://fantasy.espn.com/football/draft?leagueId=457622&seasonId=2026",
      "https://fantasy.espn.com/football/league/draft?leagueId=457622",
      "https://fantasy.espn.com/ffl/draft?leagueId=1",
    ];
    for (const href of urls) {
      expect(classifyEspnFantasyUrl(href)).toBe("live_draft_room");
      expect(isSupportedEspnLiveDraftRoomUrl(href)).toBe(true);
    }
  });

  it("rejects draft recap, league home, historical, unsupported", () => {
    expect(
      classifyEspnFantasyUrl(
        "https://fantasy.espn.com/football/league/draftrecap?leagueId=457622&seasonId=2025",
      ),
    ).toBe("draft_recap");
    expect(
      classifyEspnFantasyUrl("https://fantasy.espn.com/football/league?leagueId=457622"),
    ).toBe("league_home");
    expect(
      classifyEspnFantasyUrl("https://fantasy.espn.com/football/league/history?leagueId=457622"),
    ).toBe("historical");
    expect(classifyEspnFantasyUrl("https://fantasy.espn.com/football/team?leagueId=1")).toBe(
      "league_home",
    );
    expect(classifyEspnFantasyUrl("https://example.com/football/draft?leagueId=1")).toBe(
      "unsupported",
    );
    expect(isSupportedEspnLiveDraftRoomUrl("https://fantasy.espn.com/football/league")).toBe(
      false,
    );
  });

  it("extracts league id", () => {
    expect(
      extractEspnLeagueIdFromUrl(
        "https://fantasy.espn.com/football/draft?leagueId=457622&seasonId=2026",
      ),
    ).toBe("457622");
    expect(extractEspnLeagueIdFromUrl("https://fantasy.espn.com/football/draft")).toBeNull();
  });
});
