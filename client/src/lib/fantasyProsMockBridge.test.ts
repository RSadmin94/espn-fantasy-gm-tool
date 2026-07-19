import { describe, expect, it } from "vitest";
import {
  parseFantasyProsBridgeMessage,
} from "./fantasyProsMockBridge";

describe("fantasyProsMockBridge", () => {
  it("accepts valid FantasyPros pick batch", () => {
    const parsed = parseFantasyProsBridgeMessage({
      source: "gmwarroom-extension",
      channel: "GMWR_FP_MOCK",
      type: "GMWR_FP_MOCK_PICK_BATCH",
      provider: "fantasypros",
      draftId: "fp-mock-abc",
      providerDraftId: "abc",
      picks: [
        {
          id: "17298",
          pick: 1,
          round: 1,
          posInRound: 1,
          ownerPos: 0,
          owner: "Your Team",
          isKeeper: false,
        },
      ],
      playerMapSlice: {
        "17298": { name: "Ja'Marr Chase", position: "WR", team: "CIN", adp: 1.2 },
      },
    });
    expect(parsed?.type).toBe("GMWR_FP_MOCK_PICK_BATCH");
    if (parsed?.type === "GMWR_FP_MOCK_PICK_BATCH") {
      expect(parsed.picks).toHaveLength(1);
      expect(parsed.playerMapSlice["17298"]?.name).toContain("Chase");
    }
  });

  it("rejects wrong provider", () => {
    expect(
      parseFantasyProsBridgeMessage({
        source: "gmwarroom-extension",
        type: "GMWR_FP_MOCK_PICK_BATCH",
        provider: "espn",
        draftId: "fp-mock-abc",
        providerDraftId: "abc",
        picks: [{ id: "1", pick: 1, round: 1, posInRound: 1, ownerPos: 0, owner: "A" }],
      }),
    ).toBeNull();
  });

  it("rejects malformed payload", () => {
    expect(
      parseFantasyProsBridgeMessage({
        source: "gmwarroom-extension",
        type: "GMWR_FP_MOCK_PICK_BATCH",
        provider: "fantasypros",
        draftId: "not-fp",
        providerDraftId: "abc",
        picks: [{ id: "1", pick: 1 }],
      }),
    ).toBeNull();
    expect(
      parseFantasyProsBridgeMessage({
        source: "gmwarroom-extension",
        type: "GMWR_FP_MOCK_PICK_BATCH",
        provider: "fantasypros",
        draftId: "fp-mock-abc",
        providerDraftId: "abc",
        picks: [],
      }),
    ).toBeNull();
  });

  it("rejects duplicate-looking empty / bad rows", () => {
    const parsed = parseFantasyProsBridgeMessage({
      source: "gmwarroom-extension",
      type: "GMWR_FP_MOCK_PICK_BATCH",
      provider: "fantasypros",
      draftId: "fp-mock-abc",
      providerDraftId: "abc",
      picks: [{ id: "", pick: 0 }, { foo: 1 }],
    });
    expect(parsed).toBeNull();
  });

  it("forwards one normalized event shape", () => {
    const parsed = parseFantasyProsBridgeMessage({
      type: "GMWR_FP_MOCK_PICK_BATCH",
      provider: "fantasypros",
      draftId: "fp-mock-sess",
      providerDraftId: "sess",
      picks: [
        { id: "9", pick: 3, round: 1, posInRound: 3, ownerPos: 2, owner: "Team 3", isKeeper: false },
      ],
      playerMapSlice: {},
    });
    expect(parsed).toMatchObject({
      type: "GMWR_FP_MOCK_PICK_BATCH",
      provider: "fantasypros",
      source: "solo-mock",
      draftId: "fp-mock-sess",
    });
  });

  it("does not require credentials in the payload", () => {
    const parsed = parseFantasyProsBridgeMessage({
      type: "GMWR_FP_MOCK_PICK_BATCH",
      provider: "fantasypros",
      draftId: "fp-mock-x",
      providerDraftId: "x",
      picks: [{ id: "1", pick: 1, round: 1, posInRound: 1, ownerPos: 0, owner: "A" }],
      clerkToken: "SECRET",
      cookie: "SECRET",
    });
    expect(parsed && "clerkToken" in parsed).toBe(false);
    expect(parsed && "cookie" in parsed).toBe(false);
  });
});
