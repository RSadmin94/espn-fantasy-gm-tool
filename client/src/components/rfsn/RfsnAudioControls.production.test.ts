// @vitest-environment jsdom
/**
 * RfsnAudioControls / audio unlock — BEHAVIORAL regression.
 *
 * Replaces the prior test that asserted on hook SOURCE TEXT (implementation detail).
 * This verifies observable BEHAVIOR only, against the real useRfsnAudioPlayback hook:
 *   - the unlock gesture flips userEnabled + unlocked
 *   - exactly ONE playback starts on unlock (no duplicate activation)
 *   - a poll / re-render after unlock does not start a second playback
 *   - replay still functions
 *   - a natural end does not auto-replay
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRfsnAudioPlayback } from "@/hooks/useRfsnAudioPlayback";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
function act<T>(fn: () => T): T { return flushSync(fn); }
function renderHook<P, R>(useHook: (p: P) => R, o: { initialProps: P }) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const result = { current: undefined as unknown as R };
  let props = o.initialProps;
  const Comp = () => { result.current = useHook(props); return null; };
  act(() => root.render(createElement(Comp)));
  return { result, rerender: (n: P) => { props = n; act(() => root.render(createElement(Comp))); } };
}
class MockAudio {
  static instances: MockAudio[] = [];
  src: string; muted = false; volume = 1; currentTime = 0; paused = true; ended = false;
  private l: Record<string, Array<() => void>> = {};
  constructor(src?: string) { this.src = src ?? ""; MockAudio.instances.push(this); }
  addEventListener(e: string, f: () => void) { (this.l[e] ||= []).push(f); }
  removeEventListener() {}
  play() { this.paused = false; this.currentTime = 0.01; return Promise.resolve(); }
  pause() { this.paused = true; }
  emit(e: string) { (this.l[e] || []).slice().forEach((f) => f()); }
}
beforeEach(() => {
  MockAudio.instances = [];
  (globalThis as any).Audio = MockAudio;
  (window as any).Audio = MockAudio;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["RIFFxxxx"], { type: "audio/wav" }) })));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => vi.restoreAllMocks());
const card = (id: string): RfsnCommentaryCard => ({ id } as unknown as RfsnCommentaryCard);
async function flushPlayback() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
function status(cid: string, clipStatus = "ready"): RfsnLiveAudioStatus {
  return {
    enabled: true, draftId: "D", pickId: "P", pickNumber: 1, updatedAt: "",
    clips: [{
      audioId: "aud-" + cid, voice: "coach" as RfsnLiveAudioStatus["clips"][number]["voice"],
      commentaryId: cid, contentType: "audio/wav",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      status: clipStatus as RfsnLiveAudioStatus["clips"][number]["status"],
    }],
  } as RfsnLiveAudioStatus;
}
const CID = "pick:coach:primary";

describe("RfsnAudioControls audio unlock — behavioral regression", () => {
  it("unlock gesture flips userEnabled + unlocked and starts exactly one playback", async () => {
    const onEnded = vi.fn(), onFallback = vi.fn();
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: status(CID) } },
    );
    await act(async () => view.result.current.playForCard(card(CID), onEnded, onFallback));
    await flushPlayback();
    expect(view.result.current.unlocked).toBe(false);
    expect(MockAudio.instances.length).toBe(0); // locked line waits for gesture
    await act(async () => view.result.current.unlockAudio());
    await flushPlayback();
    expect(view.result.current.userEnabled).toBe(true);
    expect(view.result.current.unlocked).toBe(true);
    expect(MockAudio.instances.length).toBe(1); // exactly one playback
    expect(MockAudio.instances[0].paused).toBe(false);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("a poll / re-render after unlock does not start a second playback", async () => {
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: status(CID) } },
    );
    act(() => view.result.current.unlockAudio());
    await act(async () => view.result.current.playForCard(card(CID), vi.fn(), vi.fn()));
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1);
    view.rerender({ tts: true, s: status(CID) }); // new object, identical frame (2s poll)
    view.rerender({ tts: true, s: status(CID) });
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1); // no duplicate playback
  });

  it("replay still functions after unlock", async () => {
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: status(CID) } },
    );
    act(() => view.result.current.unlockAudio());
    await act(async () => view.result.current.playForCard(card(CID), vi.fn(), vi.fn()));
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(1);
    expect(view.result.current.replayAvailable).toBe(true);
    const before = MockAudio.instances.length;
    act(() => view.result.current.replayCurrent());
    await flushPlayback();
    expect(MockAudio.instances.length).toBeGreaterThan(before); // replay produced playback
  });

  it("a natural end does not auto-replay on the next poll", async () => {
    const onEnded = vi.fn();
    const view = renderHook(
      ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) => useRfsnAudioPlayback(tts, s),
      { initialProps: { tts: true, s: status(CID) } },
    );
    act(() => view.result.current.unlockAudio());
    await act(async () => view.result.current.playForCard(card(CID), onEnded, vi.fn()));
    await flushPlayback();
    const el = MockAudio.instances[MockAudio.instances.length - 1];
    act(() => el.emit("ended"));
    expect(onEnded).toHaveBeenCalledTimes(1);
    const count = MockAudio.instances.length;
    view.rerender({ tts: true, s: status(CID) });
    await flushPlayback();
    expect(MockAudio.instances.length).toBe(count); // no auto-replay after end
  });
});
