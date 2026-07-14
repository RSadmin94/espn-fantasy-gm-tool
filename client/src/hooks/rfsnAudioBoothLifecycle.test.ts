// @vitest-environment jsdom
/**
 * End-to-end lifecycle sequences for RFSN live-draft audio + booth.
 * Exercises real hook interactions (not isolated state transitions).
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

vi.mock("./usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));

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

import { useRfsnAudioPlayback } from "./useRfsnAudioPlayback";
import { useRfsnBoothController } from "./useRfsnBoothController";
import { createRfsnLiveStandbySnapshot } from "@/lib/rfsnLiveState";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnBroadcastSnapshot, RfsnCommentaryCard, RfsnCommentatorId } from "@/lib/rfsnPresentation";
import {
  clearWarRoomAudioSession,
  getWarRoomAudioSession,
  warRoomAudioSessionKey,
} from "@/lib/rfsnWarRoomAudioSession";

class MockAudio {
  static instances: MockAudio[] = [];
  src: string;
  muted = false;
  volume = 1;
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  ended = false;
  readyState = 4;
  private listeners: Record<string, Array<() => void>> = {};
  constructor(src?: string) {
    this.src = src ?? "";
    MockAudio.instances.push(this);
  }
  addEventListener(ev: string, fn: () => void) {
    (this.listeners[ev] ||= []).push(fn);
  }
  removeEventListener() {}
  play() {
    this.paused = false;
    this.currentTime = 0.01;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  emit(ev: string) {
    (this.listeners[ev] || []).forEach((fn) => fn());
  }
}

const last = () => MockAudio.instances[MockAudio.instances.length - 1];

function mkCard(commentator: RfsnCommentatorId, id: string, text: string): RfsnCommentaryCard {
  return { id, commentator, label: "ROLE", text };
}

function snap(pick: string, primary: RfsnCommentaryCard, secondary?: RfsnCommentaryCard): RfsnBroadcastSnapshot {
  return createRfsnLiveStandbySnapshot({
    overallPick: pick,
    primary,
    secondary,
  } as Partial<RfsnBroadcastSnapshot>);
}

function audioStatus(
  pickId: string,
  pickNumber: number,
  clips: Array<{ commentaryId: string; status?: string; audioId?: string }>,
): RfsnLiveAudioStatus {
  return {
    enabled: true,
    draftId: "D",
    pickId,
    pickNumber,
    updatedAt: "",
    clips: clips.map((c) => ({
      audioId: c.audioId ?? `aud-${c.commentaryId}`,
      voice: "coach" as const,
      commentaryId: c.commentaryId,
      contentType: "audio/wav",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: (c.status ?? "ready") as "ready",
    })),
  } as RfsnLiveAudioStatus;
}

async function flushPlayback(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function settleBooth(): void {
  act(() => vi.advanceTimersByTime(50));
  act(() => vi.advanceTimersByTime(50));
}

function useBoothWithAudio(input: {
  snapshot: RfsnBroadcastSnapshot;
  tts: boolean;
  audioStatus: RfsnLiveAudioStatus | null;
  watchdogMsOverride?: number;
}) {
  const audio = useRfsnAudioPlayback(input.tts, input.audioStatus, {
    persistKey: warRoomAudioSessionKey("league-1", "draft-1"),
    watchdogMsOverride: input.watchdogMsOverride,
  });
  const booth = useRfsnBoothController(input.snapshot, { audio });
  return { audio, booth };
}

beforeEach(() => {
  vi.useFakeTimers();
  MockAudio.instances = [];
  (globalThis as any).Audio = MockAudio as unknown as typeof Audio;
  (window as any).Audio = MockAudio;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["RIFFxxxx"], { type: "audio/wav" }),
    })),
  );
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock-audio"),
    revokeObjectURL: vi.fn(),
  });
  clearWarRoomAudioSession(warRoomAudioSessionKey("league-1", "draft-1"));
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  try {
    vi.runOnlyPendingTimers();
  } catch {
    // real timers active in timeout describe
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RFSN live-draft lifecycle sequences", () => {
  it("unlock → line 1 plays → ends → line 2 arrives → line 2 auto-plays", async () => {
    const line1 = mkCard("coach", "p9:coach:primary", "First analyst line.");
    const line2 = mkCard("sofia", "p9:sofia:secondary", "Second analyst line.");
    const { result, rerender } = renderHook(useBoothWithAudio, {
      initialProps: {
        snapshot: snap("9.01", line1, line2),
        tts: true,
        audioStatus: audioStatus("pick-9", 9, [
          { commentaryId: line1.id, status: "ready" },
          { commentaryId: line2.id, status: "pending" },
        ]),
      },
    });

    act(() => result.current.audio.unlockAudio());
    settleBooth();
    await flushPlayback();
    expect(result.current.booth.activeCommentator).toBe("coach");
    expect(MockAudio.instances.length).toBe(1);
    expect(last().paused).toBe(false);

    act(() => last().emit("ended"));
    settleBooth();
    expect(result.current.booth.activeCommentator).toBe("sofia");

    rerender({
      snapshot: snap("9.01", line1, line2),
      tts: true,
      audioStatus: audioStatus("pick-9", 9, [
        { commentaryId: line1.id, status: "ready" },
        { commentaryId: line2.id, status: "ready" },
      ]),
    });
    settleBooth();
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(2);
    expect(last().paused).toBe(false);
  });

  it("long spoken line stays active until audio ended (no fixed cut-off)", async () => {
    const longLine = mkCard(
      "coach",
      "p9:coach:primary",
      "This is a deliberately long spoken line that must not be cut off by a short booth timer.",
    );
    const { result } = renderHook(useBoothWithAudio, {
      initialProps: {
        snapshot: snap("9.01", longLine),
        tts: true,
        audioStatus: audioStatus("pick-9", 9, [{ commentaryId: longLine.id }]),
      },
    });
    act(() => result.current.audio.unlockAudio());
    settleBooth();
    await flushPlayback();
    const clip = last();
    expect(clip.paused).toBe(false);

    // Old speaker timer max was ~12s — booth must remain active past that while audio plays.
    act(() => vi.advanceTimersByTime(12_000));
    expect(result.current.booth.activeCommentator).toBe("coach");
    expect(result.current.booth.cardStates.coach).toBe("active");
    expect(clip.paused).toBe(false);

    act(() => clip.emit("ended"));
    settleBooth();
    expect(result.current.booth.activeCommentator).toBeNull();
  });

  it("watchdog terminal (not booth text timer) advances after hang past speaker dwell", async () => {
    const longLine = mkCard(
      "coach",
      "p9:coach:primary",
      "Short text dwell, long hang.",
    );
    const { result } = renderHook(useBoothWithAudio, {
      initialProps: {
        snapshot: snap("9.01", longLine),
        tts: true,
        audioStatus: audioStatus("pick-9", 9, [{ commentaryId: longLine.id }]),
        // Past text dwell (≤12s) but before terminal — proves booth ignores speaker timer.
        watchdogMsOverride: 20_000,
      },
    });
    act(() => result.current.audio.unlockAudio());
    settleBooth();
    await flushPlayback();
    expect(result.current.booth.activeCommentator).toBe("coach");
    expect(last().paused).toBe(false);

    act(() => vi.advanceTimersByTime(12_000));
    expect(result.current.booth.activeCommentator).toBe("coach");
    expect(result.current.booth.cardStates.coach).toBe("active");

    // Watchdog override → completePlayback(timed_out) → onEnded → advance once.
    act(() => vi.advanceTimersByTime(8_500));
    settleBooth();
    expect(result.current.booth.activeCommentator).toBeNull();
    expect(last().paused).toBe(true);
  });

  it("navigate away → playback pauses → return → same session and replay remain", async () => {
    const line = mkCard("coach", "p9:coach:primary", "Persist me.");
    const key = warRoomAudioSessionKey("league-1", "draft-1");
    const first = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) =>
        useRfsnAudioPlayback(tts, s, { persistKey: key }),
      {
        initialProps: {
          tts: true,
          s: audioStatus("pick-9", 9, [{ commentaryId: line.id }]),
        },
      },
    );
    act(() => first.result.current.unlockAudio());
    await act(async () => {
      first.result.current.playForCard(line as RfsnCommentaryCard, vi.fn(), vi.fn());
    });
    await flushPlayback();
    expect(first.result.current.replayAvailable).toBe(true);
    const savedEl = last();
    savedEl.pause();
    savedEl.currentTime = 4.2;
    first.unmount();

    const session = getWarRoomAudioSession(key);
    expect(session?.unlocked).toBe(true);
    expect(session?.lastPlayable?.commentaryId).toBe(line.id);
    expect(session?.currentTime).toBe(4.2);

    const second = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) =>
        useRfsnAudioPlayback(tts, s, { persistKey: key }),
      {
        initialProps: {
          tts: true,
          s: audioStatus("pick-9", 9, [{ commentaryId: line.id }]),
        },
      },
    );
    expect(second.result.current.unlocked).toBe(true);
    expect(second.result.current.replayAvailable).toBe(true);
    expect(getWarRoomAudioSession(key)?.audioEl?.currentTime).toBe(4.2);
  });
});

describe("timeout advances next booth card", () => {
  it("A never emits ended → onEnded terminal → B still activates", () => {
    const lineA = mkCard("coach", "p9:coach:primary", "Card A never ends.");
    const lineB = mkCard("sofia", "p9:sofia:secondary", "Card B must still play.");
    const playForCard = vi.fn((card: RfsnCommentaryCard, onEnded: () => void) => {
      // Simulate completePlayback(timed_out) — no HTMLAudioElement `ended`.
      if (card.id === lineA.id) {
        setTimeout(() => onEnded(), 500);
        return;
      }
      setTimeout(() => onEnded(), 40);
    });
    const audio = {
      state: "ready" as const,
      userEnabled: true,
      muted: false,
      volume: 1,
      unlocked: true,
      lastPlayable: null,
      replayAvailable: true,
      isPlaying: () => false,
      isPlayInFlight: () => false,
      stopCurrent: vi.fn(),
      forceTerminalTimedOut: vi.fn(),
      playForCard,
      onSnapshotChange: vi.fn(),
      unlockAudio: vi.fn(),
      setMuted: vi.fn(),
      setVolume: vi.fn(),
      replayCurrent: vi.fn(),
      clearReplay: vi.fn(),
    };
    const { result } = renderHook(
      (s: RfsnBroadcastSnapshot) => useRfsnBoothController(s, { audio: audio as never }),
      { initialProps: snap("9.01", lineA, lineB) },
    );
    settleBooth();
    expect(result.current.sequenceLength).toBe(2);
    expect(result.current.activeCommentator).toBe("coach");
    expect(playForCard).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(50);
    });
    expect(result.current.activeCommentator).toBe("sofia");
    expect(playForCard.mock.calls.some((c) => c[0].id === lineB.id)).toBe(true);
  });
});
