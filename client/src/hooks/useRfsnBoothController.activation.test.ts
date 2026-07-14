// @vitest-environment jsdom
/**
 * Deterministic regression harness for useRfsnBoothController activation.
 *
 * Proves the shared booth controller activates the first speaker from a valid
 * commentary snapshot and — critically — is NOT reset by 2s polling that hands
 * back new object references for identical data (the standby regression). Visual
 * activation must not depend on browser audio permission.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

// Deterministic timing: no reduced-motion media query in jsdom, and 0ms delays.
vi.mock("./usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));

import { useRfsnBoothController } from "./useRfsnBoothController";
import { createRfsnLiveStandbySnapshot } from "@/lib/rfsnLiveState";
import { commentaryDisplayMs } from "@/lib/rfsnBoothPresentation";
import type {
  RfsnBroadcastSnapshot,
  RfsnCommentaryCard,
  RfsnCommentatorId,
} from "@/lib/rfsnPresentation";
import type { RfsnAudioPlayback } from "./useRfsnAudioPlayback";

function act(fn: () => unknown): void {
  flushSync(() => {
    fn();
  });
}

function renderHook<P, R>(
  useHook: (props: P) => R,
  options: { initialProps: P },
): { result: { current: R }; rerender: (props: P) => void; unmount: () => void } {
  const container = document.createElement("div");
  const root = createRoot(container);
  const result = { current: undefined as unknown as R };
  let props = options.initialProps;
  const Comp = () => {
    result.current = useHook(props);
    return null;
  };
  act(() => root.render(createElement(Comp)));
  return {
    result,
    rerender: (next: P) => {
      props = next;
      act(() => root.render(createElement(Comp)));
    },
    unmount: () => act(() => root.unmount()),
  };
}

// Advance past the 0ms start + enter timers so the first speaker reaches "active".
function settle(): void {
  act(() => vi.advanceTimersByTime(50));
  act(() => vi.advanceTimersByTime(50));
}

function mockAudio(overrides: Partial<RfsnAudioPlayback> = {}): RfsnAudioPlayback {
  return {
    state: "ready",
    userEnabled: true,
    muted: false,
    volume: 1,
    unlocked: true,
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
    ...overrides,
  } as unknown as RfsnAudioPlayback;
}

function mkCard(commentator: RfsnCommentatorId, id: string): RfsnCommentaryCard {
  return { id, commentator, label: "ROLE", text: "A grounded commentary line for the booth." };
}

function snap(opts: {
  pick?: string;
  primary?: RfsnCommentaryCard | null;
  secondary?: RfsnCommentaryCard | null;
}): RfsnBroadcastSnapshot {
  return createRfsnLiveStandbySnapshot({
    overallPick: opts.pick ?? "9.01",
    primary: opts.primary ?? undefined,
    secondary: opts.secondary ?? undefined,
  } as Partial<RfsnBroadcastSnapshot>);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useRfsnBoothController — activation regression", () => {
  it("[1] valid Coach-primary snapshot activates Coach", () => {
    const audio = mockAudio();
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("coach", "c-9") }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach");
    expect(result.current.cardStates.coach).toBe("active");
  });

  it("[2] valid Sofia-primary snapshot activates Sofia", () => {
    const audio = mockAudio();
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("sofia", "s-9") }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("sofia");
    expect(result.current.cardStates.sofia).toBe("active");
  });

  it("[3] secondary waits for primary completion (only primary active initially)", () => {
    const audio = mockAudio();
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      {
        initialProps: snap({
          pick: "9.01",
          primary: mkCard("coach", "c-9"),
          secondary: mkCard("sofia", "s-9"),
        }),
      },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach"); // primary first
    expect(result.current.cardStates.sofia).not.toBe("active"); // secondary waits
    expect(result.current.sequenceLength).toBe(2);
  });

  it("[4] identical polling snapshot (new object, same key) does NOT reset the active speaker", () => {
    const audio = mockAudio();
    const primary = mkCard("coach", "c-9");
    const { result, rerender } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach");
    (audio.playForCard as ReturnType<typeof vi.fn>).mockClear();
    (audio.onSnapshotChange as ReturnType<typeof vi.fn>).mockClear();
    // New snapshot OBJECT, identical semantic frame (same pick + same primary id).
    rerender(snap({ pick: "9.01", primary: mkCard("coach", "c-9") }));
    settle();
    expect(result.current.activeCommentator).toBe("coach"); // still active — not reset
    expect(result.current.cardStates.coach).toBe("active");
    expect(audio.onSnapshotChange).not.toHaveBeenCalled(); // no reset / audio stop
    expect(audio.playForCard).not.toHaveBeenCalled(); // no restart
  });

  it("[5] repeated 2s polls (new refs each time) never suppress the active speaker", () => {
    const audio = mockAudio();
    const { result, rerender } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("coach", "c-9") }) },
    );
    settle();
    for (let i = 0; i < 5; i++) {
      rerender(snap({ pick: "9.01", primary: mkCard("coach", "c-9") }));
      settle();
      expect(result.current.activeCommentator).toBe("coach");
    }
  });
});

describe("useRfsnBoothController — new frames, audio independence, silence", () => {
  it("[6] a new pick identity resets and activates the new primary", () => {
    const audio = mockAudio();
    const { result, rerender } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("coach", "c-9") }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach");
    // Next pick: different overallPick + different primary (Sofia).
    rerender(snap({ pick: "10.02", primary: mkCard("sofia", "s-10") }));
    settle();
    expect(result.current.activeCommentator).toBe("sofia");
    expect(result.current.cardStates.sofia).toBe("active");
  });

  it("[7] audio locked/failed still activates the visual card (text fallback, never stuck standby)", () => {
    // Locked audio whose playForCard immediately falls back to text.
    const audio = mockAudio({
      state: "locked",
      playForCard: vi.fn((_card, _onEnded, onFallback?: () => void) => onFallback?.()),
    });
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("coach", "c-9") }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach"); // visual activation despite lock
    expect(result.current.cardStates.coach).toBe("active");
  });

  it("[8b] preference on but locked still advances via written text timing", () => {
    const audio = mockAudio({ unlocked: false, userEnabled: true });
    const card = mkCard("coach", "c-9");
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: card }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach");
    expect(result.current.cardStates.coach).toBe("active");
    expect(audio.playForCard).toHaveBeenCalledTimes(1);
    // Written dwell owns advance — never waits on Enable Sound / unlock.
    act(() => vi.advanceTimersByTime(commentaryDisplayMs(card.text, true) + 50));
    act(() => vi.advanceTimersByTime(50)); // exit + gap under reduced motion
    expect(result.current.activeCommentator).toBeNull();
    expect(result.current.sequenceIndex).toBe(-1);
  });

  it("[8c] tts preference off shows written card and advances without audio", () => {
    const audio = mockAudio({ userEnabled: false, unlocked: false });
    const card = mkCard("sofia", "s-9");
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: card }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("sofia");
    expect(result.current.cardStates.sofia).toBe("active");
    expect(result.current.activeCard?.text).toBe(card.text);
    expect(audio.playForCard).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(commentaryDisplayMs(card.text, true) + 50));
    act(() => vi.advanceTimersByTime(50));
    expect(result.current.activeCommentator).toBeNull();
    expect(result.current.sequenceIndex).toBe(-1);
  });

  it("[8] audio enabled starts playback for the active card", () => {
    const audio = mockAudio({ state: "ready", userEnabled: true });
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("coach", "c-9") }) },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach");
    expect(audio.playForCard).toHaveBeenCalledTimes(1);
    const firstArg = (audio.playForCard as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstArg.commentator).toBe("coach");
  });

  it("[9] both surfaces share this controller — two independent instances activate identically", () => {
    // RfsnLive (via RfsnBroadcastShell) and RfsnBroadcastPanel both call
    // useRfsnBoothController; two independent mounts must behave identically.
    const audioLive = mockAudio();
    const audioPanel = mockAudio();
    const live = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio: audioLive }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("coach", "c-9") }) },
    );
    const panel = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio: audioPanel }),
      { initialProps: snap({ pick: "9.01", primary: mkCard("coach", "c-9") }) },
    );
    settle();
    expect(live.result.current.activeCommentator).toBe("coach");
    expect(panel.result.current.activeCommentator).toBe("coach");
    expect(audioLive.playForCard).toHaveBeenCalledTimes(1);
    expect(audioPanel.playForCard).toHaveBeenCalledTimes(1);
  });

  it("[10] routine silence (no primary/secondary) stays in standby", () => {
    const audio = mockAudio();
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: null, secondary: null }) },
    );
    settle();
    expect(result.current.activeCommentator).toBeNull();
    expect(result.current.cardStates.coach).toBe("standby");
    expect(result.current.cardStates.sofia).toBe("standby");
    expect(result.current.cardStates.roxanne).toBe("standby");
    expect(audio.playForCard).not.toHaveBeenCalled();
  });

  it("[11] a corrected line for the same pick (same id, new text) restarts the booth", () => {
    const audio = mockAudio();
    const cardWith = (text: string): RfsnCommentaryCard => ({
      id: "9:coach:primary",
      commentator: "coach",
      label: "ROLE",
      text,
    });
    const { result, rerender } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      { initialProps: snap({ pick: "9.01", primary: cardWith("Original line.") }) },
    );
    settle();
    expect(result.current.activeCard?.text).toBe("Original line.");
    (audio.onSnapshotChange as ReturnType<typeof vi.fn>).mockClear();
    rerender(snap({ pick: "9.01", primary: cardWith("Corrected line.") }));
    settle();
    expect(audio.onSnapshotChange).toHaveBeenCalled();
    expect(result.current.activeCard?.text).toBe("Corrected line.");
  });

  it("[12] ticker growth on poll does NOT reset the active speaker", () => {
    const audio = mockAudio();
    const primary = mkCard("coach", "c-9");
    const { result, rerender } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio }),
      {
        initialProps: snap({
          pick: "9.01",
          primary,
          secondary: undefined,
        }),
      },
    );
    settle();
    expect(result.current.activeCommentator).toBe("coach");
    (audio.onSnapshotChange as ReturnType<typeof vi.fn>).mockClear();
    const withTicker = snap({ pick: "9.01", primary });
    withTicker.ticker = [
      { id: "t1", text: "New ticker line.", commentator: "roxanne" as const, label: "X" },
    ];
    rerender(withTicker);
    settle();
    expect(result.current.activeCommentator).toBe("coach");
    expect(audio.onSnapshotChange).not.toHaveBeenCalled();
  });
});
