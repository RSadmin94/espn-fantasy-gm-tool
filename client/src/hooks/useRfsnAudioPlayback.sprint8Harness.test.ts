// @vitest-environment jsdom
/**
 * Sprint 8 — Deterministic Audio Playback Harness
 *
 * Isolates ONLY the audio lifecycle of useRfsnAudioPlayback. There is NO draft
 * engine, draft timer, navigation, replay, wrap-up generation, or live commentary
 * generation involved. It drives the real hook against a controllable mock Audio
 * element + mock fetch, using the hook's own built-in tracer for instrumentation.
 *
 * Three commentary cards:
 *   Card A — clip already ready BEFORE unlock
 *   Card B — clip becomes ready AFTER unlock (must auto-play)
 *   Card C — clip already ready (acts as wrap-up)
 *
 * Expected sequence:
 *   Enable Sound -> A plays -> A ends -> B becomes ready -> B auto-plays
 *   -> B ends -> C plays -> C ends -> harness completes
 *
 * Acceptance: 20 consecutive runs, 20/20 successful completions.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRfsnAudioPlayback } from "./useRfsnAudioPlayback";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import type { PlaybackTraceEvent } from "@/lib/rfsnPlaybackActivation";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

// React 19 build here does not expose `act`; flushSync applies state updates and
// re-renders synchronously so the hook's ref closures update between steps.
function act<T>(fn: () => T): T {
  return flushSync(fn);
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

class MockAudio {
  static instances: MockAudio[] = [];
  src: string;
  muted = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
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
    if (ev === "ended") this.ended = true;
    (this.listeners[ev] || []).slice().forEach((fn) => fn());
  }
}

function installMocks(): void {
  MockAudio.instances = [];
  (globalThis as any).Audio = MockAudio as unknown as typeof Audio;
  (window as any).Audio = MockAudio;
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["RIFFxxxx"], { type: "audio/wav" }),
  }));
  (globalThis as any).URL = {
    createObjectURL: vi.fn(() => "blob:mock-audio"),
    revokeObjectURL: vi.fn(),
  };
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  (window as any).__rfsnPlaybackTrace = undefined;
}

afterEach(() => vi.restoreAllMocks());

const now = () => Math.round(performance.now() * 1000) / 1000; // ms, 3dp
const lastAudio = () => MockAudio.instances[MockAudio.instances.length - 1];
const mkCard = (id: string): RfsnCommentaryCard => ({ id } as unknown as RfsnCommentaryCard);

async function flushPlayback(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Single-pick status carrying all three clips; only the registered card ever plays.
function harnessStatus(
  clips: Array<{ commentaryId: string; status: string; audioId?: string | undefined }>,
): RfsnLiveAudioStatus {
  return {
    enabled: true,
    draftId: "D",
    pickId: "harness-pick",
    pickNumber: 1,
    updatedAt: "",
    clips: clips.map((c) => ({
      audioId: "audioId" in c ? c.audioId : "aud-" + c.commentaryId,
      voice: "coach" as RfsnLiveAudioStatus["clips"][number]["voice"],
      commentaryId: c.commentaryId,
      contentType: "audio/wav",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      status: c.status as RfsnLiveAudioStatus["clips"][number]["status"],
    })),
  } as RfsnLiveAudioStatus;
}

const A = "harness:cardA:ready-before-unlock";
const B = "harness:cardB:ready-after-unlock";
const C = "harness:cardC:wrapup";

type CardRec = {
  card: string;
  rendered: number | null;
  playForCall: number | null;
  activated: number | null;      // tracer card_registered
  unlockReceived: number | null; // tracer unlock_click (Card A only)
  clipStatus: string | null;     // readiness at play time (from tracer)
  fetchStarted: number | null;   // tracer audio_fetch_start
  audioStarted: number | null;   // tracer audio_start
  ended: number | null;          // harness emitted 'ended'
  completed: number | null;      // onEnded callback fired
};

type RunResult = {
  run: number;
  ok: boolean;
  audioInstances: number;
  fallbackCalls: number;
  finalState: string;
  bWasPendingThenReady: boolean;
  cards: Record<string, CardRec>;
  error?: string;
};

const REQUIRED: (keyof CardRec)[] = [
  "rendered", "playForCall", "activated", "clipStatus",
  "fetchStarted", "audioStarted", "ended", "completed",
];

function newRec(card: string): CardRec {
  return {
    card, rendered: null, playForCall: null, activated: null, unlockReceived: null,
    clipStatus: null, fetchStarted: null, audioStarted: null, ended: null, completed: null,
  };
}

async function runHarnessOnce(run: number): Promise<RunResult> {
  installMocks();
  const cards: Record<string, CardRec> = { A: newRec(A), B: newRec(B), C: newRec(C) };
  let fallbackCalls = 0;
  let bWasPendingThenReady = false;

  const onFallback = () => { fallbackCalls += 1; };

  // Three cards rendered up front (booth mounts all three commentary slots).
  const t0 = now();
  cards.A.rendered = t0; cards.B.rendered = t0; cards.C.rendered = t0;

  const initial = harnessStatus([
    { commentaryId: A, status: "ready" },
    { commentaryId: B, status: "pending", audioId: undefined },
    { commentaryId: C, status: "ready" },
  ]);

  const view = renderHook(
    ({ tts, s }: { tts: boolean; s: RfsnLiveAudioStatus }) =>
      useRfsnAudioPlayback(tts, s, { tracePlayback: true }),
    { initialProps: { tts: true, s: initial } },
  );

  try {
    // ---- Card A: ready before unlock -> registers while locked, waits ----
    cards.A.playForCall = now();
    await act(async () => {
      view.result.current.playForCard(mkCard(A), () => { cards.A.completed = now(); }, onFallback);
    });
    await flushPlayback();
    // locked: no audio yet
    if (MockAudio.instances.length !== 0) throw new Error("A: audio created before unlock");
    if (view.result.current.state !== "locked") throw new Error(`A: expected locked, got ${view.result.current.state}`);

    // ---- Enable Sound (the single real user gesture) -> A plays ----
    cards.A.unlockReceived = now();
    await act(async () => view.result.current.unlockAudio());
    await flushPlayback();
    if (MockAudio.instances.length !== 1) throw new Error(`A: expected 1 audio after unlock, got ${MockAudio.instances.length}`);
    if (lastAudio().paused) throw new Error("A: audio not playing after unlock");

    // ---- A ends ----
    cards.A.ended = now();
    act(() => lastAudio().emit("ended"));
    await flushPlayback();
    if (cards.A.completed === null) throw new Error("A: onEnded (completed) never fired");

    // ---- Card B: register while still pending -> loading, no audio ----
    cards.B.playForCall = now();
    await act(async () => {
      view.result.current.playForCard(mkCard(B), () => { cards.B.completed = now(); }, onFallback);
    });
    await flushPlayback();
    if (MockAudio.instances.length !== 1) throw new Error("B: audio created before clip ready");
    if (view.result.current.state !== "loading") throw new Error(`B: expected loading while pending, got ${view.result.current.state}`);
    bWasPendingThenReady = true;

    // ---- Clip B becomes ready AFTER unlock -> must auto-play (no new gesture) ----
    view.rerender({
      tts: true,
      s: harnessStatus([
        { commentaryId: A, status: "ready" },
        { commentaryId: B, status: "ready" },
        { commentaryId: C, status: "ready" },
      ]),
    });
    await flushPlayback();
    if (MockAudio.instances.length !== 2) throw new Error(`B: expected auto-play (2 audio), got ${MockAudio.instances.length}`);
    if (lastAudio().paused) throw new Error("B: audio not playing after becoming ready");

    // ---- B ends ----
    cards.B.ended = now();
    act(() => lastAudio().emit("ended"));
    await flushPlayback();
    if (cards.B.completed === null) throw new Error("B: onEnded (completed) never fired");

    // ---- Card C: wrap-up, already ready -> plays ----
    cards.C.playForCall = now();
    await act(async () => {
      view.result.current.playForCard(mkCard(C), () => { cards.C.completed = now(); }, onFallback);
    });
    await flushPlayback();
    if (MockAudio.instances.length !== 3) throw new Error(`C: expected 3 audio, got ${MockAudio.instances.length}`);
    if (lastAudio().paused) throw new Error("C: audio not playing");

    // ---- C ends -> harness completes ----
    cards.C.ended = now();
    act(() => lastAudio().emit("ended"));
    await flushPlayback();
    if (cards.C.completed === null) throw new Error("C: onEnded (completed) never fired");

    // ---- merge tracer-derived per-card lifecycle timestamps ----
    const trace = ((window as any).__rfsnPlaybackTrace as PlaybackTraceEvent[]) || [];
    const first = (cardId: string, event: string) => trace.find((e) => e.cardId === cardId && e.event === event);
    for (const [key, id] of [["A", A], ["B", B], ["C", C]] as const) {
      const reg = first(id, "card_registered");
      const fetchE = first(id, "audio_fetch_start");
      const startE = first(id, "audio_start");
      const playE = first(id, "play_for_card");
      cards[key].activated = reg ? reg.ts : null;
      cards[key].fetchStarted = fetchE ? fetchE.ts : null;
      cards[key].audioStarted = startE ? startE.ts : null;
      cards[key].clipStatus = (fetchE?.clipStatus ?? playE?.clipStatus ?? null) as string | null;
    }

    const finalState = view.result.current.state;
    view.unmount();

    const complete = (r: CardRec) => REQUIRED.every((k) => r[k] !== null);
    const orderOK =
      (cards.A.completed ?? Infinity) <= (cards.B.playForCall ?? -Infinity) &&
      (cards.B.completed ?? Infinity) <= (cards.C.playForCall ?? -Infinity);

    const ok =
      MockAudio.instances.length === 3 &&
      fallbackCalls === 0 &&
      finalState === "ended" &&
      cards.A.unlockReceived !== null &&
      bWasPendingThenReady &&
      complete(cards.A) && complete(cards.B) && complete(cards.C) &&
      orderOK;

    return { run, ok, audioInstances: MockAudio.instances.length, fallbackCalls, finalState, bWasPendingThenReady, cards };
  } catch (err) {
    try { view.unmount(); } catch { /* ignore */ }
    return {
      run, ok: false,
      audioInstances: MockAudio.instances.length,
      fallbackCalls,
      finalState: (() => { try { return view.result.current.state; } catch { return "?"; } })(),
      bWasPendingThenReady,
      cards,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

describe("Sprint 8 — deterministic audio playback harness (A -> B -> C)", () => {
  it("completes the A->B->C audio lifecycle 20/20 consecutive runs", async () => {
    const RUNS = 20;
    const results: RunResult[] = [];
    for (let i = 1; i <= RUNS; i++) {
      results.push(await runHarnessOnce(i));
    }

    const passes = results.filter((r) => r.ok).length;

    // ---- 20-run matrix (per card lifecycle completeness) ----
    const cell = (r: CardRec) => REQUIRED.every((k) => r[k] !== null) ? "ok" : "MISS";
    const lines = results.map((r) =>
      `run ${String(r.run).padStart(2, "0")}: ${r.ok ? "PASS" : "FAIL"} | ` +
      `A:${cell(r.cards.A)} B:${cell(r.cards.B)} C:${cell(r.cards.C)} | ` +
      `audio=${r.audioInstances} fallback=${r.fallbackCalls} final=${r.finalState}` +
      (r.error ? ` | ERR: ${r.error}` : ""),
    );
    // eslint-disable-next-line no-console
    console.log(
      "\n===== SPRINT 8 · 20-RUN MATRIX =====\n" +
      lines.join("\n") +
      `\n------------------------------------\nRESULT: ${passes}/${RUNS} successful completions\n` +
      "Per-card lifecycle captured: rendered, activated, unlock received, clip status,\n" +
      "playForCard called, fetch started, audio started, ended, completed (timestamps ms).\n" +
      "Sample (run 01) Card B timeline: " +
      JSON.stringify(results[0]?.cards.B) + "\n====================================\n",
    );

    const firstFail = results.find((r) => !r.ok);
    if (firstFail) {
      // eslint-disable-next-line no-console
      console.log("ROOT CAUSE (first failing run):", firstFail.error ?? "assertion mismatch", JSON.stringify(firstFail));
    }

    expect(passes).toBe(RUNS);
  });
});
