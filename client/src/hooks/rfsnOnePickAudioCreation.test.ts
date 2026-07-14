// @vitest-environment jsdom
/**
 * CERT — one-pick creation chain through booth + useRfsnAudioPlayback.
 * Asserts selection → matching clip → playForCard → fetch → Audio (not ended/replay).
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

vi.mock("./usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));

import { useRfsnBoothController } from "./useRfsnBoothController";
import { useRfsnAudioPlayback } from "./useRfsnAudioPlayback";
import { createRfsnLiveStandbySnapshot } from "@/lib/rfsnLiveState";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnBroadcastSnapshot, RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import { buildBoothCommentarySequence } from "@/lib/rfsnBoothPresentation";

function act(fn: () => unknown): void {
  flushSync(() => {
    fn();
  });
}

function renderHook<P, R>(
  useHook: (props: P) => R,
  options: { initialProps: P },
): { result: { current: R }; unmount: () => void } {
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
    unmount: () => act(() => root.unmount()),
  };
}

class MockAudio {
  static instances: MockAudio[] = [];
  src: string;
  muted = false;
  volume = 1;
  currentTime = 0;
  duration = 5;
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
  dispatchEvent(ev: Event) {
    for (const fn of this.listeners[ev.type] ?? []) fn();
    return true;
  }
  play() {
    this.paused = false;
    this.currentTime = 0.01;
    queueMicrotask(() => {
      for (const fn of this.listeners.playing ?? []) fn();
    });
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
}

const CARD_ID = "pick-1:coach:primary";

function mkCard(): RfsnCommentaryCard {
  return {
    id: CARD_ID,
    commentator: "coach",
    label: "THE COACH",
    text: "A grounded commentary line that should auto-play after unlock.",
  };
}

function snap(primary: RfsnCommentaryCard): RfsnBroadcastSnapshot {
  return createRfsnLiveStandbySnapshot({
    overallPick: "1.01",
    primary,
  } as Partial<RfsnBroadcastSnapshot>);
}

function audioStatusReady(): RfsnLiveAudioStatus {
  return {
    enabled: true,
    draftId: "war-room-live-2026",
    pickId: "pick-1",
    pickNumber: 1,
    updatedAt: new Date().toISOString(),
    clips: [
      {
        commentaryId: CARD_ID,
        voice: "coach",
        audioId: "aud-1",
        contentType: "audio/wav",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        status: "ready",
      },
    ],
  };
}

async function flushPlayback(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("one-pick creation chain (booth + playback)", () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["RIFFxxxxWAVE"], { type: "audio/wav" }),
  }));

  beforeEach(() => {
    vi.useFakeTimers();
    MockAudio.instances = [];
    (globalThis as any).Audio = MockAudio;
    (window as any).Audio = MockAudio;
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-audio"),
      revokeObjectURL: vi.fn(),
    });
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("selects playable card, matches commentaryId, then playForCard→fetch→Audio once", async () => {
    const card = mkCard();
    const status = audioStatusReady();
    const sequence = buildBoothCommentarySequence(snap(card));
    expect(sequence.map((c) => c.id)).toEqual([CARD_ID]);

    const stack = renderHook(
      ({ snapshot, audioStatus }: { snapshot: RfsnBroadcastSnapshot; audioStatus: RfsnLiveAudioStatus }) => {
        const audio = useRfsnAudioPlayback(true, audioStatus);
        const booth = useRfsnBoothController(snapshot, { audio });
        return { audio, booth };
      },
      { initialProps: { snapshot: snap(card), audioStatus: status } },
    );

    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(50));

    expect(stack.result.current.booth.activeCard?.id).toBe(CARD_ID);
    expect(stack.result.current.booth.cardStates.coach).toBe("active");
    expect(status.clips[0]?.commentaryId).toBe(CARD_ID);
    expect(status.clips[0]?.status).toBe("ready");
    expect(MockAudio.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // Real unlock gesture — same entry the booth / UI use.
    act(() => stack.result.current.audio.unlockAudio());
    // Booth justUnlocked effect + audio status activation need timer + promise flushes.
    act(() => vi.advanceTimersByTime(50));
    await flushPlayback();
    await flushPlayback();

    expect(stack.result.current.audio.unlocked).toBe(true);
    expect(stack.result.current.audio.userEnabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/api/rfsn/audio/aud-1");
    expect(MockAudio.instances).toHaveLength(1);
    expect(MockAudio.instances[0]?.paused).toBe(false);
  });

  it("userEnabled=false never creates audio (break before playForCard)", () => {
    const card = mkCard();
    try {
      localStorage.setItem("rfsn-live-audio-enabled", "false");
    } catch {
      /* ignore */
    }
    const stack = renderHook(
      ({ snapshot, audioStatus }: { snapshot: RfsnBroadcastSnapshot; audioStatus: RfsnLiveAudioStatus }) => {
        const audio = useRfsnAudioPlayback(true, audioStatus);
        const booth = useRfsnBoothController(snapshot, { audio });
        return { audio, booth };
      },
      { initialProps: { snapshot: snap(card), audioStatus: audioStatusReady() } },
    );
    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(50));
    expect(stack.result.current.audio.userEnabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(MockAudio.instances).toHaveLength(0);
  });
});
