/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildBoardPickSignatures,
  buildDraftRunId,
  fingerprintLockedBoard,
  isBoardContinuation,
  isTransientBoardObservation,
  parseDraftRunId,
  resolveDraftRunRotation,
} from "./draftRunIdentity";

describe("draftRunIdentity", () => {
  it("composes and parses run ids without colliding bases", () => {
    expect(buildDraftRunId("espn-live-457622-2026", "abc123")).toBe(
      "espn-live-457622-2026:run:abc123",
    );
    expect(buildDraftRunId("war-room-live-2026", "r1")).toBe(
      "war-room-live-2026:run:r1",
    );
    expect(buildDraftRunId("fp-mock-mdk", "x")).toBe("fp-mock-mdk:run:x");
    expect(parseDraftRunId("espn-live-457622-2026:run:abc123")).toEqual({
      baseDraftId: "espn-live-457622-2026",
      runId: "abc123",
    });
    expect(buildDraftRunId("espn-live-1-2026:run:a", "b")).toBe(
      "espn-live-1-2026:run:a",
    );
  });

  it("1–2: keeps run id across picks then refresh empty then rebuild", () => {
    const first = resolveDraftRunRotation({
      stored: null,
      boardSig: ["1:p1", "2:p2", "3:p3"],
      draftComplete: false,
      newRunId: () => "runA",
    });
    expect(first.runId).toBe("runA");

    // Refresh War Room — board empty until snapshot returns
    const refreshEmpty = resolveDraftRunRotation({
      stored: first.next,
      boardSig: [],
      draftComplete: false,
      newRunId: () => "runB",
    });
    expect(refreshEmpty.runId).toBe("runA");
    expect(refreshEmpty.rotated).toBe(false);
    expect(refreshEmpty.next.boardSig).toEqual(["1:p1", "2:p2", "3:p3"]);

    // Cumulative board returns
    const rebuilt = resolveDraftRunRotation({
      stored: refreshEmpty.next,
      boardSig: ["1:p1", "2:p2", "3:p3", "4:p4"],
      draftComplete: false,
      newRunId: () => "runC",
    });
    expect(rebuilt.runId).toBe("runA");
    expect(rebuilt.next.boardSig).toHaveLength(4);
  });

  it("3–4: close/reopen + partial undercount keep the same run", () => {
    const stored = {
      runId: "runA",
      boardSig: ["1:a", "2:b", "3:c", "4:d"],
      draftComplete: false,
      updatedAt: "t0",
    };
    const partial = resolveDraftRunRotation({
      stored,
      boardSig: ["1:a", "2:b"],
      draftComplete: false,
      newRunId: () => "nope",
    });
    expect(isTransientBoardObservation(stored.boardSig, ["1:a", "2:b"])).toBe(
      true,
    );
    expect(partial.runId).toBe("runA");
    expect(partial.next.boardSig).toEqual(stored.boardSig);
  });

  it("5–6: completed Mock A then Mock B rotates exactly once", () => {
    const done = resolveDraftRunRotation({
      stored: {
        runId: "runA",
        boardSig: ["1:ja", "2:cmc"],
        draftComplete: false,
        updatedAt: "t0",
      },
      boardSig: ["1:ja", "2:cmc"],
      draftComplete: true,
      newRunId: () => "should-not",
    });
    expect(done.runId).toBe("runA");
    expect(done.next.draftComplete).toBe(true);

    // Brief empty between mocks must NOT rotate
    const between = resolveDraftRunRotation({
      stored: done.next,
      boardSig: [],
      draftComplete: false,
      newRunId: () => "early",
    });
    expect(between.runId).toBe("runA");
    expect(between.next.draftComplete).toBe(true);

    const nextMock = resolveDraftRunRotation({
      stored: between.next,
      boardSig: ["1:cd", "2:jj"],
      draftComplete: false,
      newRunId: () => "runB",
    });
    expect(nextMock.runId).toBe("runB");
    expect(nextMock.rotated).toBe(true);
  });

  it("7: temporary empty/partial during active draft does not rotate", () => {
    const active = {
      runId: "runA",
      boardSig: ["1:a", "2:b", "3:c"],
      draftComplete: false,
      updatedAt: "t",
    };
    const empty = resolveDraftRunRotation({
      stored: active,
      boardSig: [],
      draftComplete: false,
      newRunId: () => "bad",
    });
    expect(empty.runId).toBe("runA");

    const undercount = resolveDraftRunRotation({
      stored: active,
      boardSig: ["1:a"],
      draftComplete: false,
      newRunId: () => "bad2",
    });
    expect(undercount.runId).toBe("runA");
  });

  it("8: reconnect to completed board keeps run (no second wrap-up identity)", () => {
    const completed = {
      runId: "runA",
      boardSig: ["1:a", "2:b", "3:c"],
      draftComplete: true,
      updatedAt: "t",
    };
    const emptyReconnect = resolveDraftRunRotation({
      stored: completed,
      boardSig: [],
      draftComplete: false,
      newRunId: () => "bad",
    });
    expect(emptyReconnect.runId).toBe("runA");
    expect(emptyReconnect.next.draftComplete).toBe(true);

    const fullReconnect = resolveDraftRunRotation({
      stored: emptyReconnect.next,
      boardSig: ["1:a", "2:b", "3:c"],
      draftComplete: true,
      newRunId: () => "bad2",
    });
    expect(fullReconnect.runId).toBe("runA");
    expect(fullReconnect.rotated).toBe(false);
  });

  it("forceNewRun always rotates", () => {
    const r = resolveDraftRunRotation({
      stored: {
        runId: "old",
        boardSig: ["1:a"],
        draftComplete: false,
        updatedAt: "t",
      },
      boardSig: ["1:a"],
      draftComplete: false,
      forceNewRun: true,
      newRunId: () => "fresh",
    });
    expect(r.runId).toBe("fresh");
    expect(r.rotated).toBe(true);
  });

  it("board fingerprint differs when picks differ", () => {
    const a = fingerprintLockedBoard([
      { overallPick: 1, playerId: "1", playerName: "A" },
      { overallPick: 2, playerId: "2", playerName: "B" },
    ]);
    const b = fingerprintLockedBoard([
      { overallPick: 1, playerId: "9", playerName: "Z" },
      { overallPick: 2, playerId: "8", playerName: "Y" },
    ]);
    expect(a).not.toBe(b);
    expect(
      isBoardContinuation(
        buildBoardPickSignatures([{ overallPick: 1, playerId: "1" }]),
        buildBoardPickSignatures([
          { overallPick: 1, playerId: "1" },
          { overallPick: 2, playerId: "2" },
        ]),
      ),
    ).toBe(true);
    expect(
      isBoardContinuation(
        buildBoardPickSignatures([{ overallPick: 1, playerId: "1" }]),
        buildBoardPickSignatures([{ overallPick: 1, playerId: "9" }]),
      ),
    ).toBe(false);
  });

  it("local mock A/B and espn mock A/B never share composed ids", () => {
    const localA = buildDraftRunId("war-room-live-2026", "la");
    const localB = buildDraftRunId("war-room-live-2026", "lb");
    const espnA = buildDraftRunId("espn-live-457622-2026", "ea");
    const espnB = buildDraftRunId("espn-live-457622-2026", "eb");
    const set = new Set([localA, localB, espnA, espnB]);
    expect(set.size).toBe(4);
  });
});
