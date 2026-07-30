import { describe, expect, it } from "vitest";
import {
  espnConnectorStatusLines,
  maskSessionNonceSuffix,
  resolveEspnConnectorMatchPhase,
} from "./espnLiveConnectorUx";

describe("RFSN-031B espnLiveConnectorUx", () => {
  it("waiting → found → connected", () => {
    expect(
      resolveEspnConnectorMatchPhase({
        liveDraftActive: true,
        autoInjectEnabled: true,
        espnLiveRoomCount: 0,
        espnLeagueIds: [],
        rivalsLeagueId: "457622",
        connectorReady: false,
        monitoring: false,
        lastError: null,
      }),
    ).toBe("waiting_for_draft");

    expect(
      resolveEspnConnectorMatchPhase({
        liveDraftActive: true,
        autoInjectEnabled: true,
        espnLiveRoomCount: 1,
        espnLeagueIds: ["457622"],
        rivalsLeagueId: "457622",
        connectorReady: false,
        monitoring: false,
        lastError: null,
      }),
    ).toBe("draft_found_connecting");

    expect(
      resolveEspnConnectorMatchPhase({
        liveDraftActive: true,
        autoInjectEnabled: true,
        espnLiveRoomCount: 1,
        espnLeagueIds: ["457622"],
        rivalsLeagueId: "457622",
        connectorReady: true,
        monitoring: true,
        lastError: null,
      }),
    ).toBe("connected");
  });

  it("mismatched league and ambiguous drafts", () => {
    expect(
      resolveEspnConnectorMatchPhase({
        liveDraftActive: true,
        autoInjectEnabled: true,
        espnLiveRoomCount: 1,
        espnLeagueIds: ["999"],
        rivalsLeagueId: "457622",
        connectorReady: false,
        monitoring: false,
        lastError: null,
      }),
    ).toBe("league_mismatch");

    expect(
      resolveEspnConnectorMatchPhase({
        liveDraftActive: true,
        autoInjectEnabled: true,
        espnLiveRoomCount: 2,
        espnLeagueIds: ["1", "2"],
        rivalsLeagueId: "1",
        connectorReady: false,
        monitoring: false,
        lastError: null,
      }),
    ).toBe("ambiguous_espn_drafts");
  });

  it("customer copy avoids internal jargon", () => {
    const lines = [
      ...espnConnectorStatusLines("league_mismatch"),
      ...espnConnectorStatusLines("ambiguous_espn_drafts"),
      ...espnConnectorStatusLines("update_required"),
      ...espnConnectorStatusLines("connected"),
    ].join(" ");
    expect(lines).not.toMatch(/ARM|inject|nonce|bookmarklet|content script|transport/i);
    expect(espnConnectorStatusLines("league_mismatch")[0]).toBe("Different ESPN draft found");
    expect(espnConnectorStatusLines("ambiguous_espn_drafts")[0]).toBe("Two ESPN drafts found");
    expect(espnConnectorStatusLines("update_required")[0]).toBe(
      "Live Draft Connector update required",
    );
  });

  it("masks session nonce suffix", () => {
    expect(maskSessionNonceSuffix("abcdefghijklmnop")).toBe("…klmnop");
  });
});
