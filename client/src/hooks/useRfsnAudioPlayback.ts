import { useCallback, useEffect, useRef, useState } from "react";
import type { RfsnAudioState, RfsnLiveAudioStatus, RfsnVoiceAudioRef } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import {
  clipReadiness,
  createPlaybackTracer,
  evaluatePlaybackGate,
} from "@/lib/rfsnPlaybackActivation";
import {
  PLAYBACK_STALL_GRACE_MS,
  computePlaybackWatchdogMs,
  isReasonablePlaybackDurationSec,
  tryMarkPlaybackComplete,
  type PlaybackTerminalReason,
} from "@/lib/rfsnPlaybackTerminal";
import {
  ensureAudioLifecycleProbe,
  probeNoteComplete,
  probeNoteT0,
  probeNoteWatchdogArmed,
  probeNoteWatchdogFire,
} from "@/lib/rfsnAudioLifecycleProbe";
import {
  clearWarRoomAudioSession,
  getWarRoomAudioSession,
  setWarRoomAudioSession,
} from "@/lib/rfsnWarRoomAudioSession";

const AUDIO_PREF_KEY = "rfsn-live-audio-enabled";
const AUDIO_UNLOCK_KEY = "rfsn-live-audio-gesture";

export type RfsnLastPlayableClip = {
  commentaryId: string;
  voice: string;
  pickId: string;
  pickNumber: number;
  draftId: string;
  audioId?: string;
  status: "ready" | "failed" | "expired" | "pending";
  expiresAt?: string;
};

export type RfsnAudioPlaybackOptions = {
  persistKey?: string;
  sessionEpoch?: string | number;
  tracePlayback?: boolean;
  /** Test-only: force watchdog delay after play starts. */
  watchdogMsOverride?: number;
};

export type RfsnAudioPlayback = {
  state: RfsnAudioState;
  userEnabled: boolean;
  muted: boolean;
  volume: number;
  unlocked: boolean;
  lastPlayable: RfsnLastPlayableClip | null;
  replayAvailable: boolean;
  isPlaying: () => boolean;
  /** True while a fetch/play attempt is in flight for the active card. */
  isPlayInFlight: () => boolean;
  unlockAudio: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  stopCurrent: () => void;
  replayCurrent: () => void;
  /**
   * Booth safety ceiling must call this — never exitSpeaker directly while audio owns the card.
   * Converges on completePlayback(cardId, "timed_out").
   */
  forceTerminalTimedOut: () => void;
  playForCard: (
    card: RfsnCommentaryCard,
    onEnded: () => void,
    onFallback: () => void,
  ) => void;
  onSnapshotChange: () => void;
  clearReplay: () => void;
};

function readPref(): boolean {
  try {
    return localStorage.getItem(AUDIO_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

function writePref(enabled: boolean): void {
  try {
    localStorage.setItem(AUDIO_PREF_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

function writeUnlockGesture(): void {
  try {
    sessionStorage.setItem(AUDIO_UNLOCK_KEY, "true");
  } catch {
    // ignore
  }
}

function findClip(
  audioStatus: RfsnLiveAudioStatus | null | undefined,
  commentaryId: string,
): RfsnVoiceAudioRef | null {
  if (!audioStatus?.enabled) return null;
  return audioStatus.clips.find((c) => c.commentaryId === commentaryId) ?? null;
}

function buildAudioUrl(audioStatus: RfsnLiveAudioStatus, clip: RfsnVoiceAudioRef): string | null {
  if (!clip.audioId) return null;
  const params = new URLSearchParams({
    draftId: audioStatus.draftId,
    pickId: audioStatus.pickId,
    pickNumber: String(audioStatus.pickNumber),
    voice: clip.voice,
  });
  return `/api/rfsn/audio/${encodeURIComponent(clip.audioId)}?${params.toString()}`;
}

export function useRfsnAudioPlayback(
  ttsAvailable: boolean,
  audioStatus: RfsnLiveAudioStatus | null | undefined,
  options: RfsnAudioPlaybackOptions = {},
): RfsnAudioPlayback {
  const { persistKey, sessionEpoch, tracePlayback, watchdogMsOverride } = options;
  const restored = persistKey ? getWarRoomAudioSession(persistKey) : undefined;
  const tracer = useRef(createPlaybackTracer(Boolean(tracePlayback)));
  const watchdogMsOverrideRef = useRef(watchdogMsOverride);
  watchdogMsOverrideRef.current = watchdogMsOverride;

  const [userEnabled, setUserEnabled] = useState(() => restored?.userEnabled ?? readPref());
  // Transient media unlock must NOT load from sessionStorage alone — that survives reload and
  // incorrectly skips the gesture button while Chromium autoplay is re-locked.
  // In-memory war-room session (same page / tab remount) may restore unlocked for soft nav.
  const [unlocked, setUnlocked] = useState(() => Boolean(restored?.unlocked));
  const [muted, setMutedState] = useState(() => restored?.muted ?? false);
  const [volume, setVolumeState] = useState(() => restored?.volume ?? 0.85);
  const [state, setState] = useState<RfsnAudioState>(() => {
    if (restored) {
      // Prefer preference+unlock over a stale restored "ready/disabled" label.
      if (!ttsAvailable || !(restored.userEnabled ?? readPref())) return "disabled";
      return restored.unlocked ? "ready" : "locked";
    }
    return ttsAvailable && userEnabled ? "locked" : "disabled";
  });

  const audioRef = useRef<HTMLAudioElement | null>(restored?.audioEl ?? null);
  const objectUrlRef = useRef<string | null>(restored?.objectUrl ?? null);
  const stateRef = useRef<RfsnAudioState>(state);
  stateRef.current = state;
  const onEndedRef = useRef<(() => void) | null>(null);
  const onFallbackRef = useRef<(() => void) | null>(null);
  const lastCardRef = useRef<RfsnCommentaryCard | null>(restored?.lastCard ?? null);
  const lastPlayableRef = useRef<RfsnLastPlayableClip | null>(restored?.lastPlayable ?? null);
  const [lastPlayable, setLastPlayable] = useState<RfsnLastPlayableClip | null>(
    restored?.lastPlayable ?? null,
  );
  const activePickRef = useRef<string>(restored?.activePickKey ?? "");
  const persistKeyRef = useRef(persistKey);
  persistKeyRef.current = persistKey;
  const unlockedRef = useRef(unlocked);
  unlockedRef.current = unlocked;
  const userEnabledRef = useRef(userEnabled);
  userEnabledRef.current = userEnabled;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const playInFlightRef = useRef(false);
  const audioStatusRef = useRef(audioStatus);
  audioStatusRef.current = audioStatus;
  const playbackStartedForCardRef = useRef<string | null>(null);
  const fallbackHandledForCardRef = useRef<string | null>(null);
  const terminalCompletedForCardRef = useRef<string | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAudioTokenRef = useRef<symbol | null>(null);

  const clearPlaybackTimers = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const cleanupAudio = useCallback((revoke = true) => {
    clearPlaybackTimers();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    activeAudioTokenRef.current = null;
    if (revoke && objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, [clearPlaybackTimers]);

  const isPlaying = useCallback(() => {
    const el = audioRef.current;
    return Boolean(el && !el.paused && el.currentTime > 0 && !el.ended);
  }, []);

  const isPlayInFlight = useCallback(() => playInFlightRef.current, []);

  const resetPlaybackAttemptState = useCallback(() => {
    playbackStartedForCardRef.current = null;
    fallbackHandledForCardRef.current = null;
    terminalCompletedForCardRef.current = null;
    playInFlightRef.current = false;
    clearPlaybackTimers();
  }, [clearPlaybackTimers]);

  const stopCurrent = useCallback(() => {
    cleanupAudio();
    playInFlightRef.current = false;
    setState(userEnabled && unlocked ? "ready" : userEnabled ? "locked" : "disabled");
  }, [cleanupAudio, unlocked, userEnabled]);

  /**
   * Single owner of audio termination for the active card.
   * Idempotent: runs once per card → clears timers/listeners (via cleanup), notifies booth.
   * Advances on ended/timed_out; error/abort release via text fallback so the booth never stalls.
   * Replay metadata (lastPlayable) is preserved whenever playback started (not cleared here).
   */
  const completePlayback = useCallback(
    (cardId: string, reason: PlaybackTerminalReason) => {
      const mark = tryMarkPlaybackComplete(terminalCompletedForCardRef.current, cardId);
      if (mark.alreadyComplete) return;
      terminalCompletedForCardRef.current = mark.next;
      clearPlaybackTimers();
      playInFlightRef.current = false;

      const el = audioRef.current;
      probeNoteComplete({
        playInFlightAfter: false,
        token: activeAudioTokenRef.current,
        audio: el,
        reason,
      });
      tracer.current.log(`complete_${reason}`, {
        cardId,
        detail: el
          ? `paused=${el.paused} ended=${el.ended} t=${el.currentTime.toFixed(2)}/` +
            `${Number.isFinite(el.duration) ? el.duration.toFixed(2) : "?"} rs=${el.readyState}`
          : "no-el",
      });

      if (reason === "ended" || reason === "timed_out") {
        setState("ended");
        if (reason === "timed_out") {
          try {
            el?.pause();
            el?.dispatchEvent(new Event("ended"));
          } catch {
            // ignore
          }
        }
        cleanupAudio();
        onEndedRef.current?.();
        return;
      }

      // error | abort — release hold and advance via booth fallback path.
      // lastPlayable stays set so replay metadata is preserved after a started attempt.
      setState("failed");
      playbackStartedForCardRef.current = null;
      cleanupAudio();
      onFallbackRef.current?.();
    },
    [cleanupAudio, clearPlaybackTimers],
  );

  const completePlaybackRef = useRef(completePlayback);
  completePlaybackRef.current = completePlayback;

  /** Arm/re-arm duration watchdog only — listeners attach once before play(). */
  const armWatchdog = useCallback((cardId: string, audio: HTMLAudioElement, token: symbol) => {
    const rawDuration = audio.duration;
    const delay =
      typeof watchdogMsOverrideRef.current === "number" && watchdogMsOverrideRef.current >= 0
        ? watchdogMsOverrideRef.current
        : computePlaybackWatchdogMs(rawDuration);
    const durationTrusted = isReasonablePlaybackDurationSec(rawDuration);
    tracer.current.log("watchdog_arm", {
      cardId,
      detail: `delayMs=${delay} duration=${Number.isFinite(rawDuration) ? rawDuration.toFixed(2) : "?"} trusted=${durationTrusted}`,
    });
    probeNoteWatchdogArmed({
      playInFlight: playInFlightRef.current,
      token,
      audio,
      delayMs: delay,
    });
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    watchdogTimerRef.current = setTimeout(() => {
      const tokenMatches = activeAudioTokenRef.current === token;
      probeNoteWatchdogFire({
        playInFlight: playInFlightRef.current,
        token,
        audio,
        tokenMatches,
        delayMs: delay,
      });
      if (!tokenMatches) return;
      if (terminalCompletedForCardRef.current === cardId) return;
      tracer.current.log("watchdog_fire", { cardId, detail: `ms=${delay}` });
      audio.pause();
      completePlaybackRef.current(cardId, "timed_out");
    }, delay);
  }, []);

  const forceTerminalTimedOut = useCallback(() => {
    const cardId = playbackStartedForCardRef.current ?? lastCardRef.current?.id ?? null;
    if (!cardId) {
      playInFlightRef.current = false;
      clearPlaybackTimers();
      cleanupAudio();
      onFallbackRef.current?.();
      return;
    }
    completePlayback(cardId, "timed_out");
  }, [cleanupAudio, clearPlaybackTimers, completePlayback]);

  const startPlaybackForReadyClip = useCallback(
    (card: RfsnCommentaryCard, liveStatus: RfsnLiveAudioStatus, clip: RfsnVoiceAudioRef) => {
      const pickKey = `${liveStatus.draftId}:${liveStatus.pickId}:${liveStatus.pickNumber}`;
      if (activePickRef.current && activePickRef.current !== pickKey) {
        cleanupAudio();
        resetPlaybackAttemptState();
      }
      activePickRef.current = pickKey;
      playbackStartedForCardRef.current = card.id;
      terminalCompletedForCardRef.current = null;

      lastPlayableRef.current = {
        commentaryId: card.id,
        voice: clip.voice,
        pickId: liveStatus.pickId,
        pickNumber: liveStatus.pickNumber,
        draftId: liveStatus.draftId,
        audioId: clip.audioId,
        status: clip.status,
        expiresAt: clip.expiresAt,
      };
      setLastPlayable(lastPlayableRef.current);

      const url = buildAudioUrl(liveStatus, clip);
      if (!url) {
        setState("loading");
        playbackStartedForCardRef.current = null;
        return;
      }

      cleanupAudio();
      setState("loading");
      playInFlightRef.current = true;
      tracer.current.log("audio_fetch_start", { cardId: card.id, clipStatus: "ready" });

      void (async () => {
        try {
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`audio fetch ${res.status}`);
          const blob = await res.blob();
          if (!blob.size) throw new Error("empty audio");

          const objectUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objectUrl;
          const audio = new Audio(objectUrl);
          const token = Symbol(`audio:${card.id}`);
          activeAudioTokenRef.current = token;
          audio.muted = mutedRef.current;
          audio.volume = volumeRef.current;
          audioRef.current = audio;

          const isActive = () =>
            activeAudioTokenRef.current === token && audioRef.current === audio;

          const handleEnded = () => {
            if (!isActive()) return;
            completePlaybackRef.current(card.id, "ended");
          };
          const handleError = () => {
            if (!isActive()) return;
            completePlaybackRef.current(card.id, "error");
          };
          const handleAbort = () => {
            if (!isActive()) return;
            if (terminalCompletedForCardRef.current === card.id) return;
            completePlaybackRef.current(card.id, "abort");
          };
          const armStallWatch = () => {
            if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
            stallTimerRef.current = setTimeout(() => {
              if (!isActive()) return;
              if (terminalCompletedForCardRef.current === card.id) return;
              if (!audio.paused && audio.currentTime > 0 && !audio.ended) return;
              tracer.current.log("stall_timeout", { cardId: card.id });
              audio.pause();
              completePlaybackRef.current(card.id, "timed_out");
            }, PLAYBACK_STALL_GRACE_MS);
          };

          const onDurationKnown = () => {
            if (!isActive()) return;
            if (terminalCompletedForCardRef.current === card.id) return;
            armWatchdog(card.id, audio, token);
          };

          // Listeners BEFORE play() — required so short clips cannot miss `ended`.
          audio.addEventListener("ended", handleEnded, { once: true });
          audio.addEventListener("error", handleError, { once: true });
          audio.addEventListener("abort", handleAbort, { once: true });
          audio.addEventListener("stalled", armStallWatch);
          audio.addEventListener("loadedmetadata", onDurationKnown);
          audio.addEventListener("durationchange", onDurationKnown);
          audio.addEventListener("waiting", armStallWatch);
          audio.addEventListener(
            "playing",
            () => {
              if (!isActive()) return;
              if (stallTimerRef.current) {
                clearTimeout(stallTimerRef.current);
                stallTimerRef.current = null;
              }
              tracer.current.log("audio_start", {
                cardId: card.id,
                detail: `rs=${audio.readyState} dur=${Number.isFinite(audio.duration) ? audio.duration : "?"}`,
              });
              setState("playing");
              armWatchdog(card.id, audio, token);
            },
            { once: true },
          );

          // Start watchdog even if play()/playing never completes (hung promise / stalled start).
          // loadedmetadata + durationchange re-arm when duration becomes known.
          armWatchdog(card.id, audio, token);
          probeNoteT0({
            playInFlight: playInFlightRef.current,
            token,
            audio,
            watchdogDelayMs: null,
            watchdogFireAtMs: null,
          });

          try {
            await audio.play();
          } catch {
            if (!isActive()) return;
            completePlaybackRef.current(card.id, "error");
            return;
          }
          if (!isActive()) return;
          // playing listener arms/refreshes watchdog; keep a failsafe if it never fires.
          if (stateRef.current !== "playing" && terminalCompletedForCardRef.current !== card.id) {
            setState("playing");
            armWatchdog(card.id, audio, token);
          }
        } catch {
          if (terminalCompletedForCardRef.current === card.id) return;
          playInFlightRef.current = false;
          playbackStartedForCardRef.current = null;
          setState("failed");
          cleanupAudio();
          onFallbackRef.current?.();
        }
      })();
    },
    [armWatchdog, cleanupAudio, resetPlaybackAttemptState],
  );

  const tryActivatePlayback = useCallback(
    (source: string) => {
      const card = lastCardRef.current;
      const cardId = card?.id ?? null;
      const readiness = cardId ? clipReadiness(audioStatusRef.current, cardId) : "missing";
      tracer.current.log("try_activate", {
        cardId: cardId ?? undefined,
        clipStatus: readiness,
        detail: source,
      });

      const gate = evaluatePlaybackGate({
        ttsAvailable,
        userEnabled: userEnabledRef.current,
        unlocked: unlockedRef.current,
        card,
        audioStatus: audioStatusRef.current,
        isPlaying: isPlaying(),
        playInFlight: playInFlightRef.current,
        playbackStartedForCardId: playbackStartedForCardRef.current,
        targetCardId: cardId,
      });

      if (gate.action === "wait") {
        if (gate.reason === "locked") setState("locked");
        else if (gate.reason === "disabled") setState("disabled");
        else if (
          gate.reason === "clip-pending" ||
          gate.reason === "clip-missing" ||
          gate.reason === "no-status"
        ) {
          setState("loading");
        }
        return;
      }

      if (gate.action === "fallback") {
        if (cardId && fallbackHandledForCardRef.current !== cardId) {
          fallbackHandledForCardRef.current = cardId;
          setState("failed");
          tracer.current.log("clip_failed_fallback", { cardId, clipStatus: readiness });
          onFallbackRef.current?.();
        }
        return;
      }

      if (!card || !audioStatusRef.current) return;
      const clip = findClip(audioStatusRef.current, card.id);
      if (!clip) return;
      tracer.current.log("play_for_card", { cardId: card.id, clipStatus: "ready", detail: source });
      startPlaybackForReadyClip(card, audioStatusRef.current, clip);
    },
    [isPlaying, startPlaybackForReadyClip, ttsAvailable],
  );

  const tryActivatePlaybackRef = useRef(tryActivatePlayback);
  tryActivatePlaybackRef.current = tryActivatePlayback;

  const unlockAudio = useCallback(() => {
    tracer.current.log("unlock_click");
    setUserEnabled(true);
    writePref(true);
    writeUnlockGesture();
    setUnlocked(true);
    setState("ready");
    if (persistKeyRef.current) {
      const key = persistKeyRef.current;
      const session = getWarRoomAudioSession(key);
      setWarRoomAudioSession(key, {
        draftId: session?.draftId ?? "",
        audioEl: audioRef.current,
        objectUrl: objectUrlRef.current,
        currentTime: audioRef.current?.currentTime ?? 0,
        wasPlaying: false,
        state: "ready",
        unlocked: true,
        userEnabled: true,
        muted: mutedRef.current,
        volume: volumeRef.current,
        lastPlayable: lastPlayableRef.current,
        lastCard: lastCardRef.current,
        activePickKey: activePickRef.current,
      });
    }
    tryActivatePlaybackRef.current("unlock");
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const playForCard = useCallback(
    (card: RfsnCommentaryCard, onEnded: () => void, onFallback: () => void) => {
      onEndedRef.current = onEnded;
      onFallbackRef.current = onFallback;
      if (lastCardRef.current?.id !== card.id) {
        playbackStartedForCardRef.current = null;
        fallbackHandledForCardRef.current = null;
      }
      lastCardRef.current = card;
      tracer.current.log("card_registered", { cardId: card.id });

      if (!ttsAvailable) {
        setState("disabled");
        onFallback();
        return;
      }
      if (!userEnabledRef.current || !unlockedRef.current) {
        setState("locked");
        return;
      }
      tryActivatePlaybackRef.current("playForCard");
    },
    [ttsAvailable],
  );

  /**
   * Replay the last successfully started clip.
   * Source of truth is lastPlayable (not the live booth card / live audioStatus), so wrap-up
   * remains replayable after the booth returns to standby and after sessionComplete polls prune
   * or replace live clip lists.
   */
  const replayCurrent = useCallback(() => {
    const playable = lastPlayableRef.current;
    if (!playable?.audioId || playable.status !== "ready") return;
    if (!userEnabledRef.current || !unlockedRef.current) return;

    const voice = playable.voice as RfsnVoiceAudioRef["voice"];
    const existing = lastCardRef.current;
    const card: RfsnCommentaryCard =
      existing?.id === playable.commentaryId
        ? existing
        : {
            id: playable.commentaryId,
            commentator: voice,
            label: "REPLAY",
            text: existing?.text ?? "",
          };
    lastCardRef.current = card;

    // Booth may already be in standby after wrap-up — terminal callbacks are optional no-ops.
    if (!onEndedRef.current) onEndedRef.current = () => undefined;
    if (!onFallbackRef.current) onFallbackRef.current = () => undefined;

    cleanupAudio();
    playInFlightRef.current = false;
    playbackStartedForCardRef.current = null;
    terminalCompletedForCardRef.current = null;
    fallbackHandledForCardRef.current = null;

    const live = audioStatusRef.current;
    const liveClip = live ? findClip(live, playable.commentaryId) : null;
    if (live && liveClip?.audioId && liveClip.status === "ready") {
      tracer.current.log("replay_start", {
        cardId: card.id,
        clipStatus: "ready",
        detail: "live-status",
      });
      startPlaybackForReadyClip(card, live, liveClip);
      return;
    }

    // Synthesize status from retained lastPlayable — required after draft_complete when
    // the booth has cleared lastCard and/or live audioStatus no longer lists the clip.
    const synthClip: RfsnVoiceAudioRef = {
      audioId: playable.audioId,
      voice,
      commentaryId: playable.commentaryId,
      contentType: "audio/wav",
      expiresAt: playable.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
      status: "ready",
    };
    const synthStatus: RfsnLiveAudioStatus = {
      enabled: true,
      draftId: playable.draftId,
      pickId: playable.pickId,
      pickNumber: playable.pickNumber,
      updatedAt: new Date().toISOString(),
      clips: [synthClip],
    };
    tracer.current.log("replay_start", {
      cardId: card.id,
      clipStatus: "ready",
      detail: "lastPlayable-synth",
    });
    startPlaybackForReadyClip(card, synthStatus, synthClip);
  }, [cleanupAudio, startPlaybackForReadyClip]);

  const clearReplay = useCallback(() => {
    lastPlayableRef.current = null;
    lastCardRef.current = null;
    resetPlaybackAttemptState();
    setLastPlayable(null);
    if (persistKeyRef.current) {
      clearWarRoomAudioSession(persistKeyRef.current);
    }
  }, [resetPlaybackAttemptState]);

  useEffect(() => {
    const liveStatus = audioStatus;
    if (liveStatus && lastCardRef.current) {
      const pickKey = `${liveStatus.draftId}:${liveStatus.pickId}:${liveStatus.pickNumber}`;
      if (activePickRef.current && activePickRef.current !== pickKey) {
        cleanupAudio();
        resetPlaybackAttemptState();
        activePickRef.current = "";
      }
    }
    tryActivatePlaybackRef.current("effect_unlock_or_status");
  }, [audioStatus, unlocked, cleanupAudio, resetPlaybackAttemptState]);

  const onSnapshotChange = useCallback(() => {
    stopCurrent();
    activePickRef.current = "";
    lastCardRef.current = null;
    resetPlaybackAttemptState();
  }, [resetPlaybackAttemptState, stopCurrent]);

  useEffect(() => {
    if (!ttsAvailable || !userEnabled) {
      setState("disabled");
      return;
    }
    if (stateRef.current === "playing") return;
    setState(unlocked ? "ready" : "locked");
  }, [ttsAvailable, unlocked, userEnabled]);

  const lastEpochRef = useRef(sessionEpoch);
  useEffect(() => {
    if (sessionEpoch === undefined || sessionEpoch === lastEpochRef.current) return;
    lastEpochRef.current = sessionEpoch;
    if (persistKey) clearWarRoomAudioSession(persistKey);
    lastPlayableRef.current = null;
    lastCardRef.current = null;
    resetPlaybackAttemptState();
    setLastPlayable(null);
    cleanupAudio();
  }, [sessionEpoch, persistKey, cleanupAudio, resetPlaybackAttemptState]);

  useEffect(() => {
    if (!persistKey) {
      return () => cleanupAudio();
    }

    const session = getWarRoomAudioSession(persistKey);
    const el = session?.audioEl;
    if (el && session) {
      audioRef.current = el;
      objectUrlRef.current = session.objectUrl;
      const token = Symbol("restored-audio");
      activeAudioTokenRef.current = token;
      if (session.currentTime > 0 && Math.abs(el.currentTime - session.currentTime) > 0.25) {
        el.currentTime = session.currentTime;
      }
      const cardId = session.lastCard?.id ?? session.lastPlayable?.commentaryId;
      const handleEnded = () => {
        if (cardId) completePlaybackRef.current(cardId, "ended");
        else {
          setState("ended");
          cleanupAudio();
          onEndedRef.current?.();
        }
      };
      el.addEventListener("ended", handleEnded, { once: true });
      if (session.wasPlaying) {
        void el.play().catch(() => undefined);
        setState("playing");
        if (cardId) armWatchdog(cardId, el, token);
      }
    }

    return () => {
      clearPlaybackTimers();
      const liveEl = audioRef.current;
      const wasPlaying = isPlaying();
      if (liveEl) liveEl.pause();
      setWarRoomAudioSession(persistKey, {
        draftId: audioStatus?.draftId ?? session?.draftId ?? "",
        audioEl: liveEl,
        objectUrl: objectUrlRef.current,
        currentTime: liveEl?.currentTime ?? 0,
        wasPlaying,
        state: stateRef.current,
        unlocked: unlockedRef.current,
        userEnabled: userEnabledRef.current,
        muted: mutedRef.current,
        volume: volumeRef.current,
        lastPlayable: lastPlayableRef.current,
        lastCard: lastCardRef.current,
        activePickKey: activePickRef.current,
      });
      audioRef.current = null;
      activeAudioTokenRef.current = null;
    };
  }, [persistKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ensureAudioLifecycleProbe(() => ({
      playInFlight: playInFlightRef.current,
      token: activeAudioTokenRef.current,
      audio: audioRef.current,
    }));
  }, []);

  useEffect(() => {
    if (tracePlayback) {
      (window as unknown as { __rfsnPlaybackTrace?: typeof tracer.current.events }).__rfsnPlaybackTrace =
        tracer.current.events;
    }
  }, [tracePlayback, state, audioStatus]);

  return {
    state,
    userEnabled,
    muted,
    volume,
    unlocked,
    lastPlayable,
    replayAvailable: Boolean(
      unlocked && lastPlayable?.audioId && lastPlayable.status === "ready",
    ),
    isPlaying,
    isPlayInFlight,
    unlockAudio,
    setMuted,
    setVolume,
    stopCurrent,
    replayCurrent,
    forceTerminalTimedOut,
    playForCard,
    onSnapshotChange,
    clearReplay,
  };
}
