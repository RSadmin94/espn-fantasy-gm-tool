/**
 * Proves the live lock path uses real-player ADP overlays (not shadow fixture names).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDraftMomentForLockedPick,
  resetLiveDraftMomentSessionsForTests,
} from "./liveDraftMomentSession";
import { setLiveEspnAdpBoardForTests } from "./liveDraftReceiptContext";

const emptyBoard = () => ({
  loadedAt: Date.now(),
  adpByName: new Map<string, number>(),
  adpByEspnId: new Map<string, number>(),
  registry: [] as { norm: string; position: string; adp: number | null }[],
  nflTeamByName: new Map<string, string>(),
});

describe("liveDraftMomentSession — production ADP path", () => {
  beforeEach(() => {
    resetLiveDraftMomentSessionsForTests();
    setLiveEspnAdpBoardForTests(emptyBoard());
  });

  afterEach(() => {
    resetLiveDraftMomentSessionsForTests();
  });

  it("silences a real-name pick when ADP is missing (prior production failure mode)", async () => {
    setLiveEspnAdpBoardForTests(emptyBoard());
    const moment = await buildDraftMomentForLockedPick(
      "L1",
      "D1",
      {
        overallPick: 12,
        round: 1,
        roundPick: 12,
        teamId: "3",
        ownerName: "Rod",
        playerId: "espn:999",
        playerName: "Bijan Robinson",
        position: "RB",
      },
      { reset: true },
    );
    expect(moment.player.adp).toBeNull();
    expect(moment.level).toBe("routine");
    expect(moment.commentaryBudget.enabled).toBe(false);
  });

  it("fires value evidence when client ADP overlay is present (fell = STEAL)", async () => {
    setLiveEspnAdpBoardForTests(emptyBoard());
    const moment = await buildDraftMomentForLockedPick(
      "L1",
      "D1",
      {
        overallPick: 55,
        round: 4,
        roundPick: 13,
        teamId: "3",
        ownerName: "Rod",
        playerId: "espn:4047365",
        playerName: "Nico Collins",
        position: "WR",
        adp: 28,
      },
      { reset: true },
    );
    expect(moment.player.adp).toBe(28);
    expect(moment.signals.some((s) => s.startsWith("STEAL"))).toBe(true);
    expect(moment.level).not.toBe("routine");
    expect(moment.commentaryBudget.enabled).toBe(true);
    expect(moment.permittedClaims.some((c) => /fell|ADP/i.test(c))).toBe(true);
  });

  it("does not inject shadow Alice rivalry onto live owners", async () => {
    setLiveEspnAdpBoardForTests(emptyBoard());
    const moment = await buildDraftMomentForLockedPick(
      "L1",
      "D1",
      {
        overallPick: 55,
        round: 4,
        roundPick: 13,
        teamId: "1",
        ownerName: "Alice",
        playerId: "espn:1",
        playerName: "Nico Collins",
        position: "WR",
        adp: 28,
      },
      { reset: true, rivalryOverlay: null },
    );
    expect(moment.signals.some((s) => /RIVAL/i.test(s))).toBe(false);
    expect(moment.receipts.find((r) => r.id === "rivalry")?.status).toBe("unsupported");
  });

  it("marks rivalry available when a real rival locks a pick", async () => {
    setLiveEspnAdpBoardForTests(emptyBoard());
    const moment = await buildDraftMomentForLockedPick(
      "L1",
      "D1",
      {
        overallPick: 55,
        round: 4,
        roundPick: 13,
        teamId: "1",
        ownerName: "Alice",
        playerId: "espn:1",
        playerName: "Nico Collins",
        position: "WR",
        adp: 28,
      },
      {
        reset: true,
        rivalryOverlay: {
          focalOwnerName: "Rod",
          rivals: [{ ownerName: "Alice", heat: "Heated" }],
        },
      },
    );
    expect(moment.receipts.find((r) => r.id === "rivalry")?.status).toBe("available");
    expect(moment.permittedClaims.some((c) => /rival/i.test(c))).toBe(true);
  });
});
