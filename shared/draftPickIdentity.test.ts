import { describe, expect, it } from "vitest";
import {
  applyDraftPickIdentityMap,
  draftPickNameIsBlank,
  historicalPickDisplayName,
  pickNeedsIdentity,
} from "../shared/draftPickIdentity";

describe("draftPickIdentity (RFSN-055B)", () => {
  it("does not treat missing ADP as missing identity", () => {
    expect(
      pickNeedsIdentity({ playerId: 3117251, playerName: "", position: "?" }),
    ).toBe(true);
    expect(
      pickNeedsIdentity({ playerId: 3117251, playerName: "Christian McCaffrey", position: "RB" }),
    ).toBe(false);
  });

  it("fills blank name and unknown position from the ESPN id map", () => {
    const filled = applyDraftPickIdentityMap(
      [
        {
          playerId: 3117251,
          playerName: "",
          position: "?",
          overallPick: 1,
        },
        {
          playerId: 16782,
          playerName: "Jerick McKinnon",
          position: "RB",
          overallPick: 32,
        },
      ],
      new Map([
        ["3117251", { fullName: "Christian McCaffrey", position: "RB" }],
        ["16782", { fullName: "SHOULD NOT REPLACE", position: "WR" }],
      ]),
    );
    expect(filled[0]).toEqual({
      playerId: 3117251,
      playerName: "Christian McCaffrey",
      position: "RB",
      overallPick: 1,
    });
    expect(filled[1]?.playerName).toBe("Jerick McKinnon");
    expect(filled[1]?.position).toBe("RB");
  });

  it("leaves a pick unchanged when the registry has no row", () => {
    const picks = [{ playerId: 1, playerName: "", position: "?" }];
    expect(applyDraftPickIdentityMap(picks, new Map())).toEqual(picks);
  });

  it("does not invent a name when playerId is missing", () => {
    expect(pickNeedsIdentity({ playerId: null, playerName: "", position: "?" })).toBe(false);
    expect(historicalPickDisplayName("")).toBe("Unknown historical player");
    expect(historicalPickDisplayName(null)).toBe("Unknown historical player");
    expect(historicalPickDisplayName("  Tyreek Hill  ")).toBe("Tyreek Hill");
    expect(draftPickNameIsBlank("")).toBe(true);
  });

  it("keeps keeper identity when filling from the map", () => {
    const [filled] = applyDraftPickIdentityMap(
      [{ playerId: 4427366, playerName: "", position: "?", isKeeper: true, overallPick: 66 }],
      new Map([["4427366", { fullName: "Breece Hall", position: "RB" }]]),
    );
    expect(filled).toMatchObject({
      playerName: "Breece Hall",
      position: "RB",
      isKeeper: true,
      overallPick: 66,
    });
  });
});
