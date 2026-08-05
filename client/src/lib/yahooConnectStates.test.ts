import { describe, expect, it } from "vitest";
import {
  failureFromOAuthQueryParam,
  oauthSuccessFromQueryParam,
  sanitizeCustomerError,
  selectableYahooLeagues,
  selectedLeaguesInOrder,
  shouldLoadYahooLeagues,
  toggleLeagueSelection,
  YAHOO_CONNECT_MESSAGES,
} from "@/lib/yahooConnectStates";

describe("yahooConnectStates", () => {
  it("maps OAuth success query to discovery-ready", () => {
    expect(oauthSuccessFromQueryParam("success")).toBe(true);
    expect(oauthSuccessFromQueryParam("nope")).toBe(false);
    expect(
      shouldLoadYahooLeagues({ oauthSuccess: true, hasPendingAuth: false }),
    ).toBe(true);
    expect(
      shouldLoadYahooLeagues({ oauthSuccess: false, hasPendingAuth: true }),
    ).toBe(true);
    expect(
      shouldLoadYahooLeagues({ oauthSuccess: false, hasPendingAuth: false }),
    ).toBe(false);
  });

  it("maps OAuth failure query params to typed customer states", () => {
    expect(failureFromOAuthQueryParam("denied")).toEqual({
      code: "oauth_denied",
      message: YAHOO_CONNECT_MESSAGES.oauth_denied,
    });
    expect(failureFromOAuthQueryParam("callback_failed")?.code).toBe(
      "oauth_callback_failed",
    );
    expect(failureFromOAuthQueryParam("denied")?.message).not.toMatch(/token/i);
  });

  it("returns selectable leagues from discovery payload", () => {
    const leagues = selectableYahooLeagues([
      {
        leagueKey: "423.l.1",
        leagueId: "1",
        name: "Keepers",
        season: "2025",
        teamCount: 12,
      },
      {
        leagueKey: "423.l.2",
        leagueId: "  ",
        name: "Bad",
        season: "2025",
        teamCount: 10,
      },
    ]);
    expect(leagues).toHaveLength(1);
    expect(leagues[0].name).toBe("Keepers");
  });

  it("supports selecting multiple Yahoo leagues", () => {
    const leagues = selectableYahooLeagues([
      {
        leagueKey: "a",
        leagueId: "10",
        name: "A",
        season: "2025",
        teamCount: 10,
      },
      {
        leagueKey: "b",
        leagueId: "20",
        name: "B",
        season: "2025",
        teamCount: 12,
      },
    ]);
    let selected = new Set<string>();
    selected = toggleLeagueSelection(selected, "10");
    selected = toggleLeagueSelection(selected, "20");
    expect(selectedLeaguesInOrder(leagues, selected)).toHaveLength(2);
    selected = toggleLeagueSelection(selected, "10");
    expect(selectedLeaguesInOrder(leagues, selected).map((l) => l.leagueId)).toEqual([
      "20",
    ]);
  });

  it("sanitizes import/read-back failures without leaking tokens", () => {
    expect(
      sanitizeCustomerError("Bearer abc.def.ghi exploded", YAHOO_CONNECT_MESSAGES.import_failed),
    ).toBe(YAHOO_CONNECT_MESSAGES.import_failed);
    expect(
      sanitizeCustomerError("We couldn't import this league.", YAHOO_CONNECT_MESSAGES.import_failed),
    ).toBe("We couldn't import this league.");
    expect(YAHOO_CONNECT_MESSAGES.readback_failed.length).toBeGreaterThan(10);
    expect(YAHOO_CONNECT_MESSAGES.no_leagues).toMatch(/No Yahoo/i);
  });
});
