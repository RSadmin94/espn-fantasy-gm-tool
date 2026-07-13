// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isPickManual } from "@/lib/draftClock";
import { buildDefaultManualTeamIds, isAiCountdownActive } from "@/lib/draftManualTeams";
import { shouldRenderLiveCommentary } from "@/lib/rfsnLiveState";
import { buildLockedPickNotifyPayload } from "@/lib/rfsnLivePickNotify";
import { createRfsnLiveStandbySnapshot } from "@/lib/rfsnLiveState";

describe("live-draft lifecycle — simulation + wrap-up contracts", () => {
  it("pause-for-my-picks disabled (default) → user team pick does not stop AI countdown", () => {
    const manualTeamIds = buildDefaultManualTeamIds(11);
    expect(manualTeamIds.size).toBe(0);
    expect(isPickManual(manualTeamIds, 11)).toBe(false);
    expect(
      isAiCountdownActive({
        running: true,
        done: false,
        holding: false,
        onClockIsManual: false,
        isKeeperSlot: false,
      }),
    ).toBe(true);
  });

  it("final pick notify payload sets draftComplete and teamCount", () => {
    const payload = buildLockedPickNotifyPayload({
      leagueId: "lg",
      draftId: "draft-1",
      slot: { pickNumber: 196, round: 14, roundPick: 14, teamId: 3 },
      player: { name: "Player Z", position: "RB", id: "z" },
      teamCount: 14,
      draftComplete: true,
    });
    expect(payload.draftComplete).toBe(true);
    expect(payload.teamCount).toBe(14);
    expect(payload.pick.overallPick).toBe(196);
  });

  it("draft_complete session renders wrap-up commentary in the booth", () => {
    const snap = createRfsnLiveStandbySnapshot({
      overallPick: "14.14",
      primary: {
        id: "wrap:sofia:primary",
        commentator: "sofia",
        label: "Lead",
        text: "That wraps our draft.",
      },
    });
    expect(
      shouldRenderLiveCommentary({
        schemaVersion: 1,
        sessionState: "draft_complete",
        snapshot: snap,
        activePickIdentity: { draftId: "d", pickNumber: 196, pickId: "p196" },
        frameStatus: "ready",
        generatedAt: new Date().toISOString(),
        draftComplete: true,
      }),
    ).toBe(true);
  });
});
