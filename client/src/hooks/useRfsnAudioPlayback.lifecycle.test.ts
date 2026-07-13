// @vitest-environment jsdom
/**
 * Deterministic audio-lifecycle certification harness for useRfsnAudioPlayback.
 *
 * Renders the real hook against a controllable mock Audio element and asserts the
 * mechanical playback-lifecycle contracts that are impractical to catch against
 * short-lived live clips in the browser:
 *   - mute stops sound
 *   - unmute does not replay dismissed audio
 *   - dismiss stops playback
 *   - secondary waits for primary (advances only on 'ended')
 *   - a new pick stops stale audio
 *   - re-render / poll does not replay
 *   - failed TTS falls back to text (onFallback, no audio)
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

// React 19 does not expose `act` in this build; flushSync applies state updates
// and re-renders synchronously so the hook's closures (unlocked/muted) update.
function act(fn: () => unknown): void {
  flushSync(() => {
    fn();
  });
}

// Minimal renderHook (flushSync-driven; no testing-library dependency).
function renderHook<P, R>(
  useHook: (props: P) => R,
  options: { initialProps: P },
): { result: { current: R }; rerender: (props: P) => void } {
  const container = document.createElement("div");
  const root = createRoot(container);
  const result = { current: undefined as unknown as R };
  let props = options.initialProps;
  const Comp = () => {
    result.current = useHook(props);
    return null;
  };
  act(() => {
    root.render(createElement(Comp));
  });
  return {
    result,
    rerender: (next: P) => {
      props = next;
      act(() => {
        root.render(createElement(Comp));
      });
    },
  };
}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRfsnAudioPlayback } from "./useRfsnAudioPlayback";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";

class MockAudio {
  static instances: MockAudio[] = [];
  src: string;
  muted = false;
  volume = 1;
  currentTime = 0;
  paused = true;
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

beforeEach(() => {
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
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => vi.restoreAllMocks());

const last = () => MockAudio.instances[MockAudio.instances.length - 1];
const card = (id: string): RfsnCommentaryCard => ({ id } as unknown as RfsnCommentaryCard);

async function flushPlayback(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function status(pickId: string, clips: Array<Partial<{ audioId: string; voice: string; commentaryId: string; status: string }>>): RfsnLiveAudioStatus {
  return {
    enabled: true,
    draftId: "D",
    pickId,
    pickNumber: Number(pickId.replace(/\D/g, "")) || 1,
    updatedAt: "",
    clips: clips.map((c) => ({
      audioId: c.audioId ?? "aud-" + (c.commentaryId ?? "x"),
      voice: (c.voice ?? "coach") as RfsnLiveAudioStatus["clips"][number]["voice"],
      commentaryId: c.commentaryId ?? "c",
      contentType: "audio/wav",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      status: (c.status ?? "ready") as RfsnLiveAudioStatus["clips"][number]["status"],
    })),
  } as RfsnLiveAudioStatus;
}

const CID = "pick-9:coach:primary";

async function setupPlaying(pickId = "pick-9", cid = CID, clipStatus = "ready") {
  const onEnded = vi.fn();
  const onFallback = vi.fn();
  const view = renderHook(
    ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
    { initialProps: { tts: true, s: status(pickId, [{ commentaryId: cid, status: clipStatus }]) } },
  );
  act(() => view.result.current.unlockAudio());
  await act(async () => {
    view.result.current.playForCard(card(cid), onEnded, onFallback);
  });
  await flushPlayback();
  return { ...view, onEnded, onFallback };
}

describe("useRfsnAudioPlayback — deterministic lifecycle harness", () => {
  it("[item4] mute stops sound: setMuted(true) mutes the live audio element", async () => {
    const { result } = await setupPlaying();
    expect(last().paused).toBe(false); // playing
    expect(last().muted).toBe(false);
    act(() => result.current.setMuted(true));
    expect(last().muted).toBe(true);
    expect(result.current.muted).toBe(true);
  });

  it("[item5] unmute does not replay dismissed audio", async () => {
    const { result } = await setupPlaying();
    act(() => result.current.onSnapshotChange()); // dismiss / snapshot advance
    expect(last().paused).toBe(true); // stopped
    const count = MockAudio.instances.length;
    act(() => result.current.setMuted(false)); // unmute
    expect(MockAudio.instances.length).toBe(count); // no new audio -> no replay
  });

  it("[item6] dismiss stops playback (stopCurrent pauses current clip)", async () => {
    const { result } = await setupPlaying();
    expect(last().paused).toBe(false);
    act(() => result.current.stopCurrent());
    expect(last().paused).toBe(true);
    expect(result.current.state).toBe("ready"); // returns to ready, able to advance
  });

  it("[item7] secondary waits for primary: advance signal fires only on 'ended'", async () => {
    const { result, onEnded } = await setupPlaying("pick-9", "pick-9:coach:primary");
    const primary = last();
    expect(MockAudio.instances.length).toBe(1); // only primary is playing
    expect(onEnded).not.toHaveBeenCalled(); // secondary not yet advanced
    act(() => primary.emit("ended"));
    expect(onEnded).toHaveBeenCalledTimes(1); // page advances to secondary only now
  });

  it("[item8] a new pick stops stale audio before playing the new clip", async () => {
    const { result, rerender } = await setupPlaying("pick-9", "pick-9:coach:primary");
    const stale = last();
    expect(stale.paused).toBe(false);
    // new pick arrives: page passes new audioStatus, then plays the new card
    const nextStatus = status("pick-10", [{ commentaryId: "pick-10:coach:primary" }]);
    rerender({ tts: true, s: nextStatus });
    await act(async () => {
      result.current.playForCard(card("pick-10:coach:primary"), vi.fn(), vi.fn());
    });
    await flushPlayback();
    expect(stale.paused).toBe(true); // stale clip stopped
    expect(MockAudio.instances.length).toBe(2);
    expect(last().paused).toBe(false); // new clip playing
  });

  it("[item9] re-render / poll with identical status does not replay", async () => {
    const sameStatus = status("pick-9", [{ commentaryId: CID }]);
    const onEnded = vi.fn();
    const onFallback = vi.fn();
    const { result, rerender } = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: sameStatus } },
    );
    act(() => result.current.unlockAudio());
    await act(async () => result.current.playForCard(card(CID), onEnded, onFallback));
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1);
    // simulate several 2s polls returning the same snapshot object identity + a new one
    rerender({ tts: true, s: sameStatus });
    rerender({ tts: true, s: status("pick-9", [{ commentaryId: CID }]) });
    await act(async () => {});
    expect(MockAudio.instances.length).toBe(1); // no replay from re-render alone
  });

  it("[item11] failed TTS clip falls back to text (onFallback, no audio element)", async () => {
    const onEnded = vi.fn();
    const onFallback = vi.fn();
    const { result } = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: status("pick-9", [{ commentaryId: CID, status: "failed" }]) } },
    );
    act(() => result.current.unlockAudio());
    await act(async () => result.current.playForCard(card(CID), onEnded, onFallback));
    await flushPlayback();
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("failed");
    expect(MockAudio.instances.length).toBe(0); // never created audio -> text fallback
  });

  it("[unlock] a line that arrived while locked plays as soon as the user unlocks", async () => {
    const onEnded = vi.fn();
    const onFallback = vi.fn();
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: status("pick-9", [{ commentaryId: CID }]) } },
    );
    // Locked (no user gesture yet): the on-air line must fall back to text, create no audio.
    await act(async () => view.result.current.playForCard(card(CID), onEnded, onFallback));
    await flushPlayback();
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances.length).toBe(0);
    // Real gesture unlock -> the pending line plays immediately (root-cause fix for no sound).
    await act(async () => view.result.current.unlockAudio());
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1);
    expect(last().paused).toBe(false);
  });

  it("[replay] stores last playable clip and replayCurrent reuses it", async () => {
    const { result } = await setupPlaying();
    expect(result.current.replayAvailable).toBe(true);
    const count = MockAudio.instances.length;
    act(() => result.current.replayCurrent());
    await flushPlayback();
    expect(MockAudio.instances.length).toBeGreaterThan(count);
  });

  it("[replay-reset] clearReplay disables replay until a new clip arrives", async () => {
    const { result } = await setupPlaying();
    expect(result.current.replayAvailable).toBe(true);
    act(() => result.current.clearReplay());
    expect(result.current.replayAvailable).toBe(false);
    act(() => result.current.replayCurrent());
    expect(MockAudio.instances.length).toBe(1);
  });
});
