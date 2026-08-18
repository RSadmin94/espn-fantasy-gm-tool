import { describe, expect, it } from "vitest";
import { espnDefenseIdentity, isEspnDefensePlayerId } from "./espnDefenseIdentity";
import {
  overlayDraftPickIdentities,
  rosterCannotAssignDraftIdentity,
} from "./draftPickSourceSelection";
import { applyEspnDefenseIdentities, draftBoardPickDisplayName } from "./draftPickIdentity";
import { normalizeDraftPicks } from "../server/espnService";

describe("RFSN-055E keeper/D-ST identity recovery", () => {
  it("recovers D/ST identity from an exact ESPN playerId mapping", () => {
    expect(isEspnDefensePlayerId(-16024)).toBe(true);
    expect(espnDefenseIdentity(-16024)).toEqual({
      playerId: -16024,
      proTeamId: 24,
      fullName: "Chargers D/ST",
      position: "D/ST",
    });
    const [filled] = applyEspnDefenseIdentities([
      {
        overallPickNumber: 183,
        playerId: -16024,
        playerName: "",
        position: "?",
        draftedForAnalytics: true,
        keeper: false,
      },
    ]);
    expect(filled?.playerName).toBe("Chargers D/ST");
    expect(filled?.draftedForAnalytics).toBe(true);
    expect(filled?.keeper).toBe(false);
  });

  it("overlays recap/cache identity onto a blank keeper row without changing analytics flags", () => {
    const base = [
      {
        overallPickNumber: 66,
        playerId: null,
        playerName: "",
        position: "?",
        keeper: true,
        reservedForKeeper: true,
        keeperSlot: true,
        retained: false,
        draftedForAnalytics: false,
      },
    ];
    const recap = [
      {
        overallPickNumber: 66,
        playerId: 4427366,
        playerName: "Breece Hall",
        position: "RB",
        draftedForAnalytics: true,
        keeper: false,
      },
    ];
    const [merged] = overlayDraftPickIdentities(base, recap);
    expect(merged).toMatchObject({
      playerId: 4427366,
      playerName: "Breece Hall",
      position: "RB",
      draftedForAnalytics: false,
      keeper: true,
      reservedForKeeper: true,
      keeperSlot: true,
    });
  });

  it("does not assign a player from ambiguous roster evidence", () => {
    const pick = { overallPickNumber: 222, playerId: null, playerName: "" };
    const roster = [
      { playerId: 17372, playerName: "Chris Boswell" },
      { playerId: -16024, playerName: "Chargers D/ST" },
    ];
    expect(rosterCannotAssignDraftIdentity(pick, roster)).toBe(true);
    const [merged] = overlayDraftPickIdentities([pick], roster);
    expect(merged?.playerName).toBe("");
    expect(merged?.playerId).toBeNull();
    expect(draftBoardPickDisplayName(merged!)).toBe("Unassigned pick");
  });

  it("keeps genuine unassigned future slots unlabeled as players", () => {
    expect(
      draftBoardPickDisplayName({ playerId: null, playerName: "", position: "?" }),
    ).toBe("Unassigned pick");
  });

  it("normalizes ESPN combined D/ST picks instead of dropping playerId <= 0", () => {
    const payload = {
      seasonId: 2026,
      settings: { size: 16 },
      teams: [{ id: 7, location: "LA", nickname: "Street Runners" }],
      draftDetail: {
        drafted: true,
        picks: [
          {
            overallPickNumber: 183,
            roundId: 13,
            roundPickNumber: 3,
            teamId: 7,
            playerId: -16024,
            keeper: false,
            reservedForKeeper: false,
          },
        ],
      },
    };
    const [pick] = normalizeDraftPicks(payload);
    expect(pick?.playerId).toBe(-16024);
    expect(pick?.playerName).toBe("Chargers D/ST");
    expect(pick?.position).toBe("D/ST");
    expect(pick?.draftedForAnalytics).toBe(true);
    expect(pick?.keeper).toBe(false);
  });
});
