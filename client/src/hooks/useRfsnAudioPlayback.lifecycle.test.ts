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
  try { sessionStorage.clear(); } catch { /* ignore */ }
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

  it("[item8] a new pick does not truncate active speech until the booth stops it", async () => {
    const { result, rerender } = await setupPlaying("pick-9", "pick-9:coach:primary");
    const stale = last();
    expect(stale.paused).toBe(false);
    // Status for a faster pick alone must not cut the live element (booth deferral owns handoff).
    const nextStatus = status("pick-10", [{ commentaryId: "pick-10:coach:primary" }]);
    rerender({ tts: true, s: nextStatus });
    await flushPlayback();
    expect(stale.paused).toBe(false);
    // After explicit stop (booth finished / reset), the next card can play.
    act(() => result.current.stopCurrent());
    expect(stale.paused).toBe(true);
    await act(async () => {
      result.current.playForCard(card("pick-10:coach:primary"), vi.fn(), vi.fn());
    });
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(2);
    expect(last().paused).toBe(false);
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

  it("[unlock] clip ready before unlock: locked line waits, then plays on gesture", async () => {
    const onEnded = vi.fn();
    const onFallback = vi.fn();
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: status("pick-9", [{ commentaryId: CID }]) } },
    );
    await act(async () => view.result.current.playForCard(card(CID), onEnded, onFallback));
    await flushPlayback();
    expect(onFallback).not.toHaveBeenCalled();
    expect(view.result.current.state).toBe("locked");
    expect(MockAudio.instances.length).toBe(0);
    await act(async () => view.result.current.unlockAudio());
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1);
    expect(last().paused).toBe(false);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("[race] unlock before clip ready: one play after pending → ready", async () => {
    const onEnded = vi.fn();
    const onFallback = vi.fn();
    const pendingStatus = status("pick-9", [{ commentaryId: CID, status: "pending", audioId: undefined }]);
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: pendingStatus } },
    );
    await act(async () => view.result.current.unlockAudio());
    await act(async () => view.result.current.playForCard(card(CID), onEnded, onFallback));
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(0);
    expect(onFallback).not.toHaveBeenCalled();
    expect(view.result.current.state).toBe("loading");
    const readyStatus = status("pick-9", [{ commentaryId: CID, status: "ready" }]);
    view.rerender({ tts: true, s: readyStatus });
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(last().paused).toBe(false);
    view.rerender({ tts: true, s: readyStatus });
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("[race] failed clip after unlock invokes fallback once and does not fetch", async () => {
    const onEnded = vi.fn();
    const onFallback = vi.fn();
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: {
        tts: true,
        s: status("pick-9", [{ commentaryId: CID, status: "pending", audioId: undefined }]),
      } },
    );
    act(() => view.result.current.unlockAudio());
    await act(async () => view.result.current.playForCard(card(CID), onEnded, onFallback));
    view.rerender({
      tts: true,
      s: status("pick-9", [{ commentaryId: CID, status: "failed" }]),
    });
    await flushPlayback();
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances.length).toBe(0);
    view.rerender({
      tts: true,
      s: status("pick-9", [{ commentaryId: CID, status: "failed" }]),
    });
    await flushPlayback();
    expect(onFallback).toHaveBeenCalledTimes(1);
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

  it("[pause] draftPaused stops active playback and blocks catch-up", async () => {
    const onEnded = vi.fn();
    const onFallback = vi.fn();
    const view = renderHook(
      ({ tts, s, paused }: { tts: boolean; s: RfsnLiveAudioStatus; paused: boolean }) =>
        useRfsnAudioPlayback(tts, s, { draftPaused: paused }),
      { initialProps: { tts: true, s: status("pick-9", [{ commentaryId: CID }]), paused: false } },
    );
    act(() => view.result.current.unlockAudio());
    await act(async () => view.result.current.playForCard(card(CID), onEnded, onFallback));
    await flushPlayback();
    expect(last().paused).toBe(false);
    const genBefore = view.result.current.playbackGeneration;
    view.rerender({ tts: true, s: status("pick-9", [{ commentaryId: CID }]), paused: true });
    await flushPlayback();
    expect(last().paused).toBe(true);
    // Generation bumps on the pause transition (0 → 1 on first pause).
    expect(view.result.current.playbackGeneration).toBe(genBefore + 1);
    expect(view.result.current.isPlaying()).toBe(false);
    // While paused, status updates must not start a new play
    const count = MockAudio.instances.length;
    view.rerender({
      tts: true,
      s: status("pick-9", [{ commentaryId: CID, audioId: "aud-new" }]),
      paused: true,
    });
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(count);
  });

  it("[reset] sessionEpoch halt ignores stale play completion", async () => {
    let resolveFetch: ((v: unknown) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const view = renderHook(
      ({ tts, s, epoch }: { tts: boolean; s: RfsnLiveAudioStatus; epoch: number }) =>
        useRfsnAudioPlayback(tts, s, { sessionEpoch: epoch }),
      { initialProps: { tts: true, s: status("pick-9", [{ commentaryId: CID }]), epoch: 1 } },
    );
    act(() => view.result.current.unlockAudio());
    await act(async () => view.result.current.playForCard(card(CID), vi.fn(), vi.fn()));
    // Reset before fetch resolves
    view.rerender({ tts: true, s: status("pick-9", [{ commentaryId: CID }]), epoch: 2 });
    await flushPlayback();
    resolveFetch?.({
      ok: true,
      blob: async () => new Blob(["RIFFxxxx"], { type: "audio/wav" }),
    });
    await flushPlayback();
    expect(view.result.current.isPlaying()).toBe(false);
    expect(MockAudio.instances.every((a) => a.paused)).toBe(true);
  });

  it("[haltSession] clears queue intent so resume does not dump clips", async () => {
    const { result } = await setupPlaying();
    act(() => result.current.haltSession());
    expect(result.current.isPlaying()).toBe(false);
    expect(result.current.replayAvailable).toBe(false);
    const count = MockAudio.instances.length;
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(count);
  });
});
