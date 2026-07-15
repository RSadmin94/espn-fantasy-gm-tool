// @vitest-environment jsdom
/**
 * Sprint 8 — Component-level integration test for the RFSN app-to-audio path.
 *
 * The isolated hook harness (useRfsnAudioPlayback.sprint8Harness.test.ts) proved the
 * playback state machine works when driven directly. This test drives the SAME A->B->C
 * three-card logic through the REAL product component stack to find why the integrated
 * path may not reliably drive the already-working hook:
 *
 *   RfsnBroadcastPanel (real)
 *     -> resolveBoothFeedSnapshot (real)         [booth/card selection]
 *     -> useRfsnBoothController (real)            [clip readiness -> playForCard]
 *     -> RfsnAudioControls (real unlock button)   [real gesture]
 *     -> useRfsnAudioPlayback (real)              [playback hook]
 *
 * Mocked ONLY: trpc queries, prefers-reduced-motion, the visual booth leaf, and the
 * audio/TTS primitives (Audio, fetch, URL). Instrumentation wraps the real hook's
 * playForCard / onEnded / onFallback / unlock without changing behavior.
 */
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

// RfsnBroadcastPanel compiles JSX to React.createElement (classic runtime) and relies
// on the build to supply React. Under vitest we provide it as a global. Test-only shim.
(globalThis as any).React = ReactNamespace;
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

// ---- shared instrumentation (hoisted so vi.mock factories can use it) ----
const H = vi.hoisted(() => {
  const events: Array<Record<string, any>> = [];
  return {
    events,
    now: () => Math.round(performance.now() * 1000) / 1000,
    reset: () => { events.length = 0; },
  };
});

// Deterministic timing: reduced motion => booth delays collapse to 0ms setTimeouts.
vi.mock("@/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));

// Visual-only leaf; not part of the audio path. Stub to avoid asset-import noise.
vi.mock("@/components/rfsn/RfsnAnalystBooth", () => ({
  RfsnAnalystBooth: () => null,
}));

// Controllable trpc: access always granted; live snapshot reads the mutable fixture.
const FIXTURE = vi.hoisted(() => ({ payload: null as any }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    rfsnBroadcast: {
      getAccess: { useQuery: () => ({ data: { ttsEnabled: true, canAccess: true } }) },
      getLiveSnapshot: { useQuery: () => ({ data: FIXTURE.payload }) },
    },
  },
}));

// Real hook, wrapped to record the integration boundary (no behavior change).
vi.mock("@/hooks/useRfsnAudioPlayback", async (importOriginal) => {
  const mod: any = await importOriginal();
  return {
    ...mod,
    useRfsnAudioPlayback: (tts: any, status: any, opts: any) => {
      const real = mod.useRfsnAudioPlayback(tts, status, opts);
      return {
        ...real,
        unlockAudio: () => {
          H.events.push({ type: "unlock", ts: H.now() });
          return real.unlockAudio();
        },
        playForCard: (card: any, onEnded: any, onFallback: any) => {
          H.events.push({
            type: "playForCard", card: card.id, ts: H.now(),
            unlocked: real.unlocked, userEnabled: real.userEnabled, state: real.state,
            hasOnEnded: typeof onEnded === "function", hasOnFallback: typeof onFallback === "function",
          });
          const wEnded = () => { H.events.push({ type: "onEnded", card: card.id, ts: H.now() }); return onEnded?.(); };
          const wFallback = () => { H.events.push({ type: "onFallback", card: card.id, ts: H.now() }); return onFallback?.(); };
          return real.playForCard(card, wEnded, wFallback);
        },
      };
    },
  };
});

import { RfsnBroadcastPanel } from "@/components/rfsn/RfsnBroadcastPanel";
import { createRfsnLiveStandbySnapshot } from "@/lib/rfsnLiveState";

function act<T>(fn: () => T): T { return flushSync(fn); }

// ---- audio primitives (deterministic) ----
let pendingCardTag: string | null = null;
const AUDIO_TO_CARD: Record<string, string> = { "aud-A": "A", "aud-B": "B", "aud-C": "C" };

class MockAudio {
  static instances: MockAudio[] = [];
  cardTag: string | null;
  src: string;
  muted = false; volume = 1; currentTime = 0; paused = true; ended = false;
  private listeners: Record<string, Array<() => void>> = {};
  constructor(src?: string) {
    this.src = src ?? "";
    this.cardTag = pendingCardTag;
    MockAudio.instances.push(this);
  }
  addEventListener(ev: string, fn: () => void) { (this.listeners[ev] ||= []).push(fn); }
  removeEventListener() {}
  play() {
    this.paused = false; this.currentTime = 0.01;
    H.events.push({ type: "audioStart", card: this.cardTag, ts: H.now() });
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  emit(ev: string) {
    if (ev === "ended") { this.ended = true; H.events.push({ type: "audioEnded", card: this.cardTag, ts: H.now() }); }
    (this.listeners[ev] || []).slice().forEach((fn) => fn());
  }
}

function installMocks(): void {
  MockAudio.instances = [];
  pendingCardTag = null;
  (globalThis as any).Audio = MockAudio as unknown as typeof Audio;
  (window as any).Audio = MockAudio;
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    const m = String(url).match(/audio\/(aud-[ABC])/);
    const card = m ? AUDIO_TO_CARD[m[1]] : "?";
    pendingCardTag = card;
    H.events.push({ type: "fetch", card, ts: H.now() });
    return { ok: true, blob: async () => new Blob(["RIFFxxxx"], { type: "audio/wav" }) };
  });
  (globalThis as any).URL = { createObjectURL: () => "blob:mock-audio", revokeObjectURL: () => {} };
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---- fixtures: one pick, sequence [A(sofia), B(coach), C(roxanne)] ----
const future = () => new Date(Date.now() + 60_000).toISOString();
function makeSnapshot() {
  return createRfsnLiveStandbySnapshot({
    overallPick: "9.05",
    primary: { id: "A", commentator: "sofia", label: "LEAD", text: "Card A grounded commentary line." },
    secondary: { id: "B", commentator: "coach", label: "DESK", text: "Card B grounded commentary line." },
    ticker: [{ id: "C", commentator: "roxanne", label: "PERS", text: "Card C wrap-up commentary line." }],
  } as any);
}
function audioStatus(bReady: boolean) {
  return {
    enabled: true, draftId: "D", pickId: "P9", pickNumber: 9, updatedAt: "",
    clips: [
      { commentaryId: "A", voice: "sofia", contentType: "audio/wav", expiresAt: future(), status: "ready", audioId: "aud-A" },
      bReady
        ? { commentaryId: "B", voice: "coach", contentType: "audio/wav", expiresAt: future(), status: "ready", audioId: "aud-B" }
        : { commentaryId: "B", voice: "coach", contentType: "audio/wav", expiresAt: future(), status: "pending", audioId: undefined },
      { commentaryId: "C", voice: "roxanne", contentType: "audio/wav", expiresAt: future(), status: "ready", audioId: "aud-C" },
    ],
  };
}

async function settle(): Promise<void> {
  // Advance the booth's 0ms setTimeouts + flush audio microtasks, staying well under
  // the 1.2s retry and 3s text-dwell windows so no timer-driven re-attempt fires.
  for (let i = 0; i < 3; i++) {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => vi.advanceTimersByTime(15));
  }
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

type RunResult = {
  run: number; ok: boolean;
  playForCardCalls: number; fetches: number; starts: number; endeds: number;
  fallbacks: number; audioInstances: number; perCard: Record<string, string>;
  firstMissing?: { card: string; transition: string; cause: string };
  error?: string;
};

const CARDS = ["A", "B", "C"] as const;
const TRANSITIONS = ["playForCard", "fetch", "audioStart", "audioEnded"] as const;
const CAUSE: Record<string, string> = {
  playForCard: "A/C/D — card never became current playable OR controller did not re-evaluate OR playForCard callback missing",
  fetch: "B/C — clip readiness update never reached the hook, or controller did not re-evaluate after readiness/unlock",
  audioStart: "playback hook received play but audio never started (fetch/unlock seam)",
  audioEnded: "G — sequence did not advance after ended",
};

function analyze(run: number): RunResult {
  const ev = H.events;
  const has = (card: string, type: string) => ev.some((e) => e.type === type && e.card === card);
  const perCard: Record<string, string> = {};
  let firstMissing: RunResult["firstMissing"];
  for (const c of CARDS) {
    const flags = TRANSITIONS.map((t) => (has(c, t) ? "1" : "0")).join("");
    perCard[c] = flags;
    if (!firstMissing) {
      const miss = TRANSITIONS.find((t) => !has(c, t));
      if (miss) firstMissing = { card: c, transition: miss, cause: CAUSE[miss] };
    }
  }
  const playForCardCalls = ev.filter((e) => e.type === "playForCard").length;
  const fetches = ev.filter((e) => e.type === "fetch").length;
  const starts = ev.filter((e) => e.type === "audioStart").length;
  const endeds = ev.filter((e) => e.type === "audioEnded").length;
  const fallbacks = ev.filter((e) => e.type === "onFallback").length;
  const audioInstances = MockAudio.instances.length;

  const ok =
    playForCardCalls === 3 && fetches === 3 && starts === 3 && endeds === 3 &&
    fallbacks === 0 && audioInstances === 3 && !firstMissing;

  return { run, ok, playForCardCalls, fetches, starts, endeds, fallbacks, audioInstances, perCard, firstMissing };
}

async function runOnce(run: number): Promise<RunResult> {
  installMocks();
  H.reset();
  const snapshot = makeSnapshot(); // stable ref across the B-readiness flip
  FIXTURE.payload = {
    schemaVersion: 1, sessionState: "commentary_active", snapshot,
    activePickIdentity: { draftId: "D", pickNumber: 9, pickId: "P9" },
    frameStatus: "", generatedAt: null, draftComplete: false, audioStatus: audioStatus(false),
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = () => act(() => root.render(createElement(RfsnBroadcastPanel, {
    leagueId: "L-" + run, draftId: "D-" + run,
  } as any)));

  try {
    render();
    await settle(); // Card A reaches "active" (text mode; not yet playing)

    // Real unlock gesture: click the Enable Sound button in RfsnAudioControls.
    const btn = container.querySelector("button");
    if (!btn) throw new Error("unlock button not rendered");
    await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(); // A plays

    if (MockAudio.instances[0]) act(() => MockAudio.instances[0].emit("ended"));
    await settle(); // A ends -> booth advances -> Card B registered (pending)

    // Clip B becomes ready AFTER unlock; keep snapshot ref stable (booth must not reset).
    FIXTURE.payload = { ...FIXTURE.payload, audioStatus: audioStatus(true) };
    render();
    await settle(); // B auto-plays

    if (MockAudio.instances[1]) act(() => MockAudio.instances[1].emit("ended"));
    await settle(); // B ends -> Card C (wrap-up) registered

    if (MockAudio.instances[2]) act(() => MockAudio.instances[2].emit("ended"));
    await settle(); // C ends -> standby -> complete

    const result = analyze(run);
    act(() => root.unmount());
    container.remove();
    return result;
  } catch (err) {
    try { act(() => root.unmount()); container.remove(); } catch { /* ignore */ }
    const result = analyze(run);
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}

describe("Sprint 8 — RFSN component integration (panel -> controller -> hook)", () => {
  it("drives the A->B->C audio lifecycle through the real panel 20/20 consecutive runs", async () => {
    const RUNS = 20;
    const results: RunResult[] = [];
    for (let i = 1; i <= RUNS; i++) results.push(await runOnce(i));

    const passes = results.filter((r) => r.ok).length;
    const lines = results.map((r) =>
      `run ${String(r.run).padStart(2, "0")}: ${r.ok ? "PASS" : "FAIL"} | ` +
      `pfc=${r.playForCardCalls} fetch=${r.fetches} start=${r.starts} end=${r.endeds} ` +
      `fallback=${r.fallbacks} audio=${r.audioInstances} | A/B/C ${r.perCard.A}/${r.perCard.B}/${r.perCard.C}` +
      (r.firstMissing ? ` | MISSING ${r.firstMissing.card}:${r.firstMissing.transition}` : "") +
      (r.error ? ` | ERR ${r.error}` : ""),
    );
    // eslint-disable-next-line no-console
    console.log(
      "\n===== SPRINT 8 · COMPONENT INTEGRATION · 20-RUN MATRIX =====\n" +
      "(per-card flags = playForCard/fetch/audioStart/audioEnded)\n" +
      lines.join("\n") +
      `\n-----------------------------------------------------------\nRESULT: ${passes}/${RUNS} successful completions\n`,
    );
    const firstFail = results.find((r) => !r.ok);
    if (firstFail) {
      // eslint-disable-next-line no-console
      console.log(
        "FIRST MISSING TRANSITION:",
        firstFail.firstMissing ? `${firstFail.firstMissing.card} · ${firstFail.firstMissing.transition}\n  cause -> ${firstFail.firstMissing.cause}` : "(count mismatch, no missing per-card transition)",
        "\ncounts:", JSON.stringify({ pfc: firstFail.playForCardCalls, fetch: firstFail.fetches, start: firstFail.starts, end: firstFail.endeds, fallback: firstFail.fallbacks, audio: firstFail.audioInstances }),
      );
    }
    // eslint-disable-next-line no-console
    console.log("===========================================================\n");

    expect(passes).toBe(RUNS);
  });
});
