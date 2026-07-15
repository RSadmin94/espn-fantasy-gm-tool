import { describe, expect, it } from "vitest";
import {
  createRfsnLiveStandbySnapshot,
  liveSessionStatusLabel,
  resolveRfsnLiveDisplaySnapshot,
  shouldRenderLiveCommentary,
} from "./rfsnLiveState";

describe("rfsnLiveState", () => {
  it("standby snapshot has no fabricated commentary", () => {
    const snap = createRfsnLiveStandbySnapshot();
    expect(snap.primary).toBeUndefined();
    expect(snap.secondary).toBeUndefined();
    expect(snap.significance).toBe("routine");
  });

  it("renders commentary only when active with snapshot", () => {
    const snap = createRfsnLiveStandbySnapshot({
      primary: {
        id: "p1",
        commentator: "sofia",
        label: "Desk",
        text: "Verified fact.",
      },
    });
    expect(
      shouldRenderLiveCommentary({
        schemaVersion: 1,
        sessionState: "commentary_active",
        snapshot: snap,
        activePickIdentity: { draftId: "d", pickNumber: 1, pickId: "e1" },
        frameStatus: "ready",
        generatedAt: new Date().toISOString(),
        draftComplete: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderLiveCommentary({
        schemaVersion: 1,
        sessionState: "broadcast_unavailable",
        snapshot: snap,
        activePickIdentity: null,
        frameStatus: "failed",
        generatedAt: null,
        draftComplete: false,
      }),
    ).toBe(false);
  });

  it("maps session states to user-facing labels", () => {
    expect(liveSessionStatusLabel("waiting_for_draft")).toContain("Standing by");
    expect(liveSessionStatusLabel("draft_complete")).toContain("complete");
  });

  it("projects polled snapshot board data when present", () => {
    const snap = createRfsnLiveStandbySnapshot({
      onClockTeam: "Alice",
      board: [
        {
          rank: 1,
          player: "CeeDee Lamb",
          position: "WR",
          team: "DAL",
          bye: 10,
          adp: 4,
          isOnClock: true,
        },
      ],
      draftOrder: [
        { pickLabel: "1.01", teamName: "Alice", teamAbbr: "ALI", isOnClock: true },
      ],
    });
    const projected = resolveRfsnLiveDisplaySnapshot(
      {
        schemaVersion: 1,
        sessionState: "between_picks",
        snapshot: snap,
        activePickIdentity: { draftId: "war-room-live-2025", pickNumber: 1, pickId: "p1" },
        frameStatus: "ready",
        generatedAt: new Date().toISOString(),
        draftComplete: false,
      },
      "My League",
    );
    expect(projected.board).toHaveLength(1);
    expect(projected.board[0]?.player).toBe("CeeDee Lamb");
    expect(projected.onClockTeam).toBe("Alice");
  });

  it("uses empty standing-by scaffold when snapshot is null", () => {
    const projected = resolveRfsnLiveDisplaySnapshot(
      {
        schemaVersion: 1,
        sessionState: "waiting_for_draft",
        snapshot: null,
        activePickIdentity: null,
        frameStatus: "idle",
        generatedAt: null,
        draftComplete: false,
      },
      "My League",
    );
    expect(projected.board).toEqual([]);
    expect(projected.draftOrder).toEqual([]);
    expect(projected.onClockTeam).toBe("My League draft");
  });

  it("keeps between-picks board visible without commentary cards", () => {
    const snap = createRfsnLiveStandbySnapshot({
      board: [
        {
          rank: 2,
          player: "Josh Allen",
          position: "QB",
          team: "BUF",
          bye: 7,
          adp: 12,
        },
      ],
    });
    const payload = {
      schemaVersion: 1 as const,
      sessionState: "between_picks" as const,
      snapshot: snap,
      activePickIdentity: { draftId: "war-room-live-2025", pickNumber: 2, pickId: "p2" },
      frameStatus: "ready",
      generatedAt: new Date().toISOString(),
      draftComplete: false,
    };
    expect(shouldRenderLiveCommentary(payload)).toBe(false);
    expect(resolveRfsnLiveDisplaySnapshot(payload).board[0]?.player).toBe("Josh Allen");
  });
});
