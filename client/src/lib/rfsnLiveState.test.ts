import { describe, expect, it } from "vitest";
import {
  createRfsnLiveStandbySnapshot,
  liveSessionStatusLabel,
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
});
