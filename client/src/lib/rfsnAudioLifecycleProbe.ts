/**
 * CERT-004 diagnostic — records first-play media + watchdog timeline.
 * Enabled only when window.__RFSN_AUDIO_PROBE__ is truthy (harness init script).
 */

export type AudioProbeSample = {
  atMs: number;
  label: string;
  playInFlight: boolean;
  tokenId: string | null;
  duration: number | null;
  currentTime: number;
  paused: boolean | null;
  ended: boolean | null;
  readyState: number | null;
  watchdogDelayMs: number | null;
  watchdogFireAtMs: number | null;
  watchdogTokenMatch: boolean | null;
  completePlaybackCalled: boolean | null;
  completeReason: string | null;
};

type ProbeState = {
  enabled: boolean;
  startedAtMs: number | null;
  samples: AudioProbeSample[];
  tokenSerial: number;
  tokenIds: Map<symbol, string>;
  sampleTimer: ReturnType<typeof setInterval> | null;
  latestWatchdogDelayMs: number | null;
  latestWatchdogFireAtMs: number | null;
  latestToken: symbol | null;
  getSnapshot: (() => {
    playInFlight: boolean;
    token: symbol | null;
    audio: HTMLAudioElement | null;
  }) | null;
};

declare global {
  interface Window {
    __RFSN_AUDIO_PROBE__?: boolean;
    __rfsnAudioProbe?: {
      samples: AudioProbeSample[];
      dump: () => string;
      clear: () => void;
    };
  }
}

const state: ProbeState = {
  enabled: false,
  startedAtMs: null,
  samples: [],
  tokenSerial: 0,
  tokenIds: new Map(),
  sampleTimer: null,
  latestWatchdogDelayMs: null,
  latestWatchdogFireAtMs: null,
  latestToken: null,
  getSnapshot: null,
};

function probeEnabled(): boolean {
  try {
    return Boolean(typeof window !== "undefined" && window.__RFSN_AUDIO_PROBE__);
  } catch {
    return false;
  }
}

function tokenId(token: symbol | null | undefined): string | null {
  if (!token) return null;
  const existing = state.tokenIds.get(token);
  if (existing) return existing;
  state.tokenSerial += 1;
  const id = String(state.tokenSerial);
  state.tokenIds.set(token, id);
  return id;
}

function mediaFields(audio: HTMLAudioElement | null): Pick<
  AudioProbeSample,
  "duration" | "currentTime" | "paused" | "ended" | "readyState"
> {
  if (!audio) {
    return {
      duration: null,
      currentTime: 0,
      paused: null,
      ended: null,
      readyState: null,
    };
  }
  return {
    duration: Number.isFinite(audio.duration) ? audio.duration : null,
    currentTime: audio.currentTime,
    paused: audio.paused,
    ended: audio.ended,
    readyState: audio.readyState,
  };
}

function pushSample(
  label: string,
  partial: Partial<AudioProbeSample> & {
    playInFlight: boolean;
    token: symbol | null;
    audio: HTMLAudioElement | null;
  },
): void {
  if (!state.enabled) return;
  const now = Date.now();
  if (state.startedAtMs == null) state.startedAtMs = now;
  const media = mediaFields(partial.audio);
  state.samples.push({
    atMs: now - state.startedAtMs,
    label,
    playInFlight: partial.playInFlight,
    tokenId: tokenId(partial.token),
    duration: media.duration,
    currentTime: media.currentTime,
    paused: media.paused,
    ended: media.ended,
    readyState: media.readyState,
    watchdogDelayMs: partial.watchdogDelayMs ?? state.latestWatchdogDelayMs,
    watchdogFireAtMs: partial.watchdogFireAtMs ?? state.latestWatchdogFireAtMs,
    watchdogTokenMatch: partial.watchdogTokenMatch ?? null,
    completePlaybackCalled: partial.completePlaybackCalled ?? null,
    completeReason: partial.completeReason ?? null,
  });
  publish();
}

function publish(): void {
  if (typeof window === "undefined") return;
  window.__rfsnAudioProbe = {
    samples: state.samples,
    dump: dumpProbe,
    clear: clearProbe,
  };
}

function stopSampler(): void {
  if (state.sampleTimer) {
    clearInterval(state.sampleTimer);
    state.sampleTimer = null;
  }
}

function startSampler(): void {
  stopSampler();
  state.sampleTimer = setInterval(() => {
    const snap = state.getSnapshot?.();
    if (!snap) return;
    if (!snap.playInFlight && (!snap.audio || snap.audio.paused || snap.audio.ended)) {
      // keep sampling briefly after terminal; stop when idle for next tick after complete
      if (state.samples.some((s) => s.label.startsWith("complete_") || s.label === "watchdog_fire")) {
        stopSampler();
        return;
      }
    }
    pushSample("tick", {
      playInFlight: snap.playInFlight,
      token: snap.token,
      audio: snap.audio,
    });
  }, 1000);
}

export function ensureAudioLifecycleProbe(getSnapshot: ProbeState["getSnapshot"]): void {
  if (!probeEnabled()) return;
  state.enabled = true;
  state.getSnapshot = getSnapshot;
  publish();
}

export function probeNoteT0(input: {
  playInFlight: boolean;
  token: symbol;
  audio: HTMLAudioElement;
  watchdogDelayMs: number | null;
  watchdogFireAtMs: number | null;
}): void {
  if (!probeEnabled()) return;
  state.enabled = true;
  if (state.startedAtMs == null) state.startedAtMs = Date.now();
  state.latestToken = input.token;
  if (input.watchdogDelayMs != null) state.latestWatchdogDelayMs = input.watchdogDelayMs;
  if (input.watchdogFireAtMs != null) state.latestWatchdogFireAtMs = input.watchdogFireAtMs;
  pushSample("t0", {
    playInFlight: input.playInFlight,
    token: input.token,
    audio: input.audio,
    watchdogDelayMs: input.watchdogDelayMs ?? state.latestWatchdogDelayMs,
    watchdogFireAtMs: input.watchdogFireAtMs ?? state.latestWatchdogFireAtMs,
  });
  startSampler();
}

export function probeNoteWatchdogArmed(input: {
  playInFlight: boolean;
  token: symbol;
  audio: HTMLAudioElement;
  delayMs: number;
}): void {
  if (!probeEnabled()) return;
  const fireAt = Date.now() + input.delayMs;
  state.latestToken = input.token;
  state.latestWatchdogDelayMs = input.delayMs;
  state.latestWatchdogFireAtMs = fireAt - (state.startedAtMs ?? Date.now());
  pushSample("watchdog_armed", {
    playInFlight: input.playInFlight,
    token: input.token,
    audio: input.audio,
    watchdogDelayMs: input.delayMs,
    watchdogFireAtMs: state.latestWatchdogFireAtMs,
  });
}

export function probeNoteWatchdogFire(input: {
  playInFlight: boolean;
  token: symbol;
  audio: HTMLAudioElement;
  tokenMatches: boolean;
  delayMs: number;
}): void {
  if (!probeEnabled()) return;
  pushSample("watchdog_fire", {
    playInFlight: input.playInFlight,
    token: input.token,
    audio: input.audio,
    watchdogDelayMs: input.delayMs,
    watchdogFireAtMs: state.latestWatchdogFireAtMs,
    watchdogTokenMatch: input.tokenMatches,
  });
}

export function probeNoteComplete(input: {
  playInFlightAfter: boolean;
  token: symbol | null;
  audio: HTMLAudioElement | null;
  reason: string;
}): void {
  if (!probeEnabled()) return;
  pushSample(`complete_${input.reason}`, {
    playInFlight: input.playInFlightAfter,
    token: input.token,
    audio: input.audio,
    completePlaybackCalled: true,
    completeReason: input.reason,
  });
  // one more second of ticks optional; stop shortly
  setTimeout(() => stopSampler(), 1500);
}

export function clearProbe(): void {
  stopSampler();
  state.samples = [];
  state.startedAtMs = null;
  state.latestWatchdogDelayMs = null;
  state.latestWatchdogFireAtMs = null;
  state.latestToken = null;
  publish();
}

export function dumpProbe(): string {
  if (state.samples.length === 0) return "(no probe samples)";
  const lines: string[] = [];
  for (const s of state.samples) {
    const fire =
      s.watchdogFireAtMs == null
        ? "?"
        : `t=${(s.watchdogFireAtMs / 1000).toFixed(1)}s (delay=${s.watchdogDelayMs ?? "?"}ms)`;
    lines.push(
      [
        `t=${(s.atMs / 1000).toFixed(1)}s [${s.label}]`,
        `playInFlight=${s.playInFlight}`,
        `token=${s.tokenId ?? "?"}`,
        `duration=${s.duration ?? "?"}`,
        `currentTime=${s.currentTime.toFixed(3)}`,
        `paused=${s.paused ?? "?"}`,
        `ended=${s.ended ?? "?"}`,
        `rs=${s.readyState ?? "?"}`,
        `watchdogAt=${fire}`,
        s.watchdogTokenMatch == null ? null : `tokenMatch=${s.watchdogTokenMatch}`,
        s.completePlaybackCalled == null ? null : `completePlayback=${s.completePlaybackCalled}`,
        s.completeReason ? `reason=${s.completeReason}` : null,
      ]
        .filter(Boolean)
        .join("  "),
    );
  }
  return lines.join("\n");
}
