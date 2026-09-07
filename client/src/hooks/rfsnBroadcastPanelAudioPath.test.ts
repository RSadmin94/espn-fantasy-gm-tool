// @vitest-environment jsdom
/**
 * CERT-002 regression — reproduces the live panel path:
 * commentary_pending (null snapshot) → commentary_active (playable card)
 * with audio unlocked before the active frame arrives.
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
): { result: { current: R }; rerender: (props: P) => void } {
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
  };
}

import { useRfsnAudioPlayback } from "./useRfsnAudioPlayback";
import { useRfsnBoothController } from "./useRfsnBoothController";
import {
  createRfsnLiveStandbySnapshot,
  resolveBoothFeedSnapshot,
  type RfsnLiveAudioStatus,
  type RfsnLivePublicPayload,
} from "@/lib/rfsnLiveState";
import type { RfsnBroadcastSnapshot, RfsnCommentaryCard } from "@/lib/rfsnPresentation";

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
  play() {
    this.paused = false;
    this.currentTime = 0.01;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

function mkCard(id: string): RfsnCommentaryCard {
  return { id, commentator: "coach", label: "HC", text: "Locked pick commentary." };
}

function audioStatus(
  clips: Array<{ commentaryId: string; status?: string }>,
): RfsnLiveAudioStatus {
  return {
    enabled: true,
    draftId: "war-room-live-2026",
    pickId: "pick-11",
    pickNumber: 11,
    updatedAt: "",
    clips: clips.map((c) => ({
      audioId: `aud-${c.commentaryId}`,
      voice: "coach" as const,
      commentaryId: c.commentaryId,
      contentType: "audio/wav",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: (c.status ?? "ready") as "ready",
    })),
  } as RfsnLiveAudioStatus;
}

function pendingPayload(): RfsnLivePublicPayload {
  return {
    schemaVersion: 1,
    sessionState: "commentary_pending",
    snapshot: null,
    activePickIdentity: { draftId: "war-room-live-2026", pickNumber: 11, pickId: "pick-11" },
    frameStatus: "pending",
    generatedAt: null,
    draftComplete: false,
  };
}

function activePayload(card: RfsnCommentaryCard): RfsnLivePublicPayload {
  const snapshot = createRfsnLiveStandbySnapshot({
    overallPick: "11.01",
    primary: card,
  } as Partial<RfsnBroadcastSnapshot>);
  return {
    schemaVersion: 1,
    sessionState: "commentary_active",
    snapshot,
    activePickIdentity: { draftId: "war-room-live-2026", pickNumber: 11, pickId: "pick-11" },
    frameStatus: "ready",
    generatedAt: new Date().toISOString(),
    draftComplete: false,
    audioStatus: audioStatus([{ commentaryId: card.id }]),
  };
}

function usePanelPath(input: {
  payload: RfsnLivePublicPayload | null;
  tts: boolean;
  audioStatus: RfsnLiveAudioStatus | null;
}) {
  const boothSnapshot = resolveBoothFeedSnapshot(input.payload);
  const audio = useRfsnAudioPlayback(input.tts, input.audioStatus);
  const booth = useRfsnBoothController(boothSnapshot, { audio });
  return { boothSnapshot, audio, booth };
}

async function flushPlayback(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  MockAudio.instances = [];
  (globalThis as any).Audio = MockAudio;
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
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CERT-002 — panel commentary_pending → active audio path", () => {
  it("unlocked before active frame → playForCard runs and audio element is created", async () => {
    const card = mkCard("457622:war-room-live-2026:11:coach:primary");
    const { result, rerender } = renderHook(usePanelPath, {
      initialProps: {
        payload: pendingPayload(),
        tts: true,
        audioStatus: null,
      },
    });

    act(() => result.current.audio.unlockAudio());
    expect(result.current.audio.userEnabled).toBe(true);
    expect(result.current.audio.unlocked).toBe(true);
    expect(resolveBoothFeedSnapshot(pendingPayload()).primary).toBeUndefined();

    rerender({
      payload: activePayload(card),
      tts: true,
      audioStatus: audioStatus([{ commentaryId: card.id }]),
    });

    await act(async () => {
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(50);
    });
    await flushPlayback();

    expect(result.current.booth.activeCommentator).toBe("coach");
    expect(result.current.audio.state).not.toBe("disabled");
    expect(vi.mocked(fetch)).toHaveBeenCalled();
    expect(MockAudio.instances.length).toBeGreaterThanOrEqual(1);
  });

  it("unlock after text-only start on pending null → active frame still plays audio", async () => {
    const card = mkCard("457622:war-room-live-2026:11:coach:primary");
    const { result, rerender } = renderHook(usePanelPath, {
      initialProps: {
        payload: pendingPayload(),
        tts: true,
        audioStatus: null,
      },
    });

    rerender({
      payload: activePayload(card),
      tts: true,
      audioStatus: audioStatus([{ commentaryId: card.id }]),
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
      for (let i = 0; i < 4; i++) await Promise.resolve();
    });

    act(() => result.current.audio.unlockAudio());
    await act(async () => {
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(50);
    });
    await flushPlayback();

    expect(vi.mocked(fetch)).toHaveBeenCalled();
    expect(MockAudio.instances.length).toBeGreaterThanOrEqual(1);
  });
});
