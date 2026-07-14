// @vitest-environment jsdom
/**
 * Minimal 3-round written-commentary proof — no TTS / Enable Sound / clip readiness.
 */
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).React = ReactNamespace;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
vi.mock("@/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("./usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));

import { useRfsnBoothController } from "./useRfsnBoothController";
import { RfsnAnalystBooth } from "@/components/rfsn/RfsnAnalystBooth";
import { buildBoothCommentarySequence, commentaryDisplayMs } from "@/lib/rfsnBoothPresentation";
import {
  createRfsnLiveStandbySnapshot,
  resolveBoothFeedSnapshot,
  shouldRenderLiveCommentary,
  type RfsnLivePublicPayload,
} from "@/lib/rfsnLiveState";
import { appendCommentaryLogEntry } from "@/lib/rfsnCommentaryLog";
import type { RfsnBroadcastSnapshot, RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import type { RfsnAudioPlayback } from "./useRfsnAudioPlayback";

function act(fn: () => unknown): void {
  flushSync(() => {
    fn();
  });
}

function settle(): void {
  act(() => vi.advanceTimersByTime(50));
  act(() => vi.advanceTimersByTime(50));
}

function mockAudioOff(): RfsnAudioPlayback {
  return {
    state: "disabled",
    userEnabled: false,
    muted: false,
    volume: 1,
    unlocked: false,
    lastPlayable: null,
    replayAvailable: false,
    isPlaying: () => false,
    stopCurrent: vi.fn(),
    playForCard: vi.fn(),
    onSnapshotChange: vi.fn(),
    unlockAudio: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    replayCurrent: vi.fn(),
    clearReplay: vi.fn(),
  } as unknown as RfsnAudioPlayback;
}

function mkCard(
  commentator: RfsnCommentaryCard["commentator"],
  pick: number,
  text: string,
): RfsnCommentaryCard {
  return {
    id: `pick-${pick}:${commentator}:primary`,
    commentator,
    label: "ROLE",
    text,
  };
}

function activePayload(pick: number, primary: RfsnCommentaryCard): RfsnLivePublicPayload {
  const snapshot = createRfsnLiveStandbySnapshot({
    overallPick: `${pick}.01`,
    primary,
    significance: "notable",
  } as Partial<RfsnBroadcastSnapshot>);
  return {
    schemaVersion: 1,
    sessionState: "commentary_active",
    snapshot,
    activePickIdentity: { draftId: "war-room-live-2026", pickNumber: pick, pickId: `pick-${pick}` },
    frameStatus: "ready",
    generatedAt: new Date().toISOString(),
    draftComplete: false,
    audioStatus: null,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("written commentary — 3-round, no TTS", () => {
  it("renders analyst name + commentary text for each qualifying pick", () => {
    const rounds: Array<{ pick: number; card: RfsnCommentaryCard }> = [
      { pick: 3, card: mkCard("sofia", 3, "Sofia notes the opening statement pick.") },
      { pick: 7, card: mkCard("coach", 7, "Coach calls the board pressure correctly.") },
      { pick: 11, card: mkCard("roxanne", 11, "Roxanne frames the rivalry angle.") },
    ];

    const audio = mockAudioOff();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let boothSnapshot = createRfsnLiveStandbySnapshot();
    let firstVisible: { pick: number; analyst: string; text: string } | null = null;

    const Comp = () => {
      const booth = useRfsnBoothController(boothSnapshot, { audio });
      const sequence = buildBoothCommentarySequence(boothSnapshot);
      return createElement(RfsnAnalystBooth, {
        cardStates: booth.cardStates,
        activeCommentator: booth.activeCommentator,
        activeCard: booth.activeCard,
        sequence,
        onDismiss: booth.dismissFor,
        layout: "desktop",
      });
    };

    for (const round of rounds) {
      const payload = activePayload(round.pick, round.card);
      expect(shouldRenderLiveCommentary(payload)).toBe(true);
      const resolved = resolveBoothFeedSnapshot(payload);
      expect(resolved.primary?.text).toBe(round.card.text);
      expect(buildBoothCommentarySequence(resolved).length).toBeGreaterThan(0);

      boothSnapshot = resolved;
      act(() => root.render(createElement(Comp)));
      settle();

      const active = container.querySelector('[data-booth-state="active"]');
      expect(active).toBeTruthy();
      expect(active?.textContent).toContain(
        round.card.commentator === "sofia"
          ? "Sofia"
          : round.card.commentator === "coach"
            ? "Coach"
            : "Roxanne",
      );
      expect(active?.textContent).toContain(round.card.text);

      if (!firstVisible) {
        firstVisible = {
          pick: round.pick,
          analyst: round.card.commentator,
          text: round.card.text,
        };
      }

      act(() => vi.advanceTimersByTime(commentaryDisplayMs(round.card.text, true) + 100));
      settle();
    }

    expect(firstVisible).toEqual({
      pick: 3,
      analyst: "sofia",
      text: "Sofia notes the opening statement pick.",
    });
    expect(audio.playForCard).not.toHaveBeenCalled();

    // Also prove the running-log helper keeps analyst identity without duplicates.
    const log = rounds.reduce(
      (acc, round) =>
        appendCommentaryLogEntry(acc, {
          id: round.card.id,
          pickLabel: `${round.pick}.01`,
          commentator: round.card.commentator,
          text: round.card.text,
        }),
      [] as ReturnType<typeof appendCommentaryLogEntry>,
    );
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.commentator)).toEqual(["sofia", "coach", "roxanne"]);

    act(() => root.unmount());
    container.remove();
  });
});
