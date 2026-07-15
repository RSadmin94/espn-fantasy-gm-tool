import { useCallback, useEffect, useRef, useState } from "react";
import type { RfsnAudioState, RfsnLiveAudioStatus, RfsnVoiceAudioRef } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import {
  clipReadiness,
  createPlaybackTracer,
  evaluatePlaybackGate,
} from "@/lib/rfsnPlaybackActivation";
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
  unlockAudio: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  stopCurrent: () => void;
  replayCurrent: () => void;
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

function readUnlockGesture(): boolean {
  try {
    return sessionStorage.getItem(AUDIO_UNLOCK_KEY) === "true";
  } catch {
    return false;
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
  const { persistKey, sessionEpoch, tracePlayback } = options;
  const restored = persistKey ? getWarRoomAudioSession(persistKey) : undefined;
  const tracer = useRef(createPlaybackTracer(Boolean(tracePlayback)));

  const [userEnabled, setUserEnabled] = useState(() => restored?.userEnabled ?? readPref());
  const [unlocked, setUnlocked] = useState(() => restored?.unlocked ?? readUnlockGesture());
  const [muted, setMutedState] = useState(() => restored?.muted ?? false);
  const [volume, setVolumeState] = useState(() => restored?.volume ?? 0.85);
  const [state, setState] = useState<RfsnAudioState>(() => {
    if (restored) return restored.state;
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

  const cleanupAudio = useCallback((revoke = true) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (revoke && objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const isPlaying = useCallback(() => {
    const el = audioRef.current;
    return Boolean(el && !el.paused && el.currentTime > 0 && !el.ended);
  }, []);

  const resetPlaybackAttemptState = useCallback(() => {
    playbackStartedForCardRef.current = null;
    fallbackHandledForCardRef.current = null;
    playInFlightRef.current = false;
  }, []);

  const stopCurrent = useCallback(() => {
    cleanupAudio();
    playInFlightRef.current = false;
    setState(userEnabled && unlocked ? "ready" : userEnabled ? "locked" : "disabled");
  }, [cleanupAudio, unlocked, userEnabled]);

  const startPlaybackForReadyClip = useCallback(
    (card: RfsnCommentaryCard, liveStatus: RfsnLiveAudioStatus, clip: RfsnVoiceAudioRef) => {
      const pickKey = `${liveStatus.draftId}:${liveStatus.pickId}:${liveStatus.pickNumber}`;
      if (activePickRef.current && activePickRef.current !== pickKey) {
        cleanupAudio();
        resetPlaybackAttemptState();
      }
      activePickRef.current = pickKey;
      playbackStartedForCardRef.current = card.id;

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
          audio.muted = mutedRef.current;
          audio.volume = volumeRef.current;
          audioRef.current = audio;

          const handleEnded = () => {
            playInFlightRef.current = false;
            setState("ended");
            tracer.current.log("audio_ended", { cardId: card.id });
            cleanupAudio();
            onEndedRef.current?.();
          };
          const handleError = () => {
            playInFlightRef.current = false;
            setState("failed");
            playbackStartedForCardRef.current = null;
            cleanupAudio();
            onFallbackRef.current?.();
          };

          audio.addEventListener("ended", handleEnded, { once: true });
          audio.addEventListener("error", handleError, { once: true });

          await audio.play();
          tracer.current.log("audio_start", { cardId: card.id });
          setState("playing");
        } catch {
          playInFlightRef.current = false;
          playbackStartedForCardRef.current = null;
          setState("failed");
          cleanupAudio();
          onFallbackRef.current?.();
        }
      })();
    },
    [cleanupAudio, resetPlaybackAttemptState],
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

  const replayCurrent = useCallback(() => {
    const card = lastCardRef.current;
    const playable = lastPlayableRef.current;
    if (!card || !playable?.audioId || playable.status !== "ready") return;
    if (!onEndedRef.current || !onFallbackRef.current) return;
    cleanupAudio();
    playInFlightRef.current = false;
    playbackStartedForCardRef.current = null;
    tryActivatePlaybackRef.current("replay");
  }, [cleanupAudio]);

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
        // Do not truncate active speech when a faster draft advances audioStatus.
        // Booth deferral + gate keep the new frame waiting; stop only via ended /
        // stopCurrent / onSnapshotChange / intentional new playForCard.
        const el = audioRef.current;
        const stillPlaying = Boolean(el && !el.paused && el.currentTime > 0 && !el.ended);
        if (!stillPlaying && !playInFlightRef.current) {
          cleanupAudio();
          resetPlaybackAttemptState();
          activePickRef.current = "";
        }
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
      if (session.currentTime > 0 && Math.abs(el.currentTime - session.currentTime) > 0.25) {
        el.currentTime = session.currentTime;
      }
      const handleEnded = () => {
        setState("ended");
        cleanupAudio();
        onEndedRef.current?.();
      };
      el.addEventListener("ended", handleEnded, { once: true });
      if (session.wasPlaying) {
        void el.play().catch(() => undefined);
        setState("playing");
      }
    }

    return () => {
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
    };
  }, [persistKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    unlockAudio,
    setMuted,
    setVolume,
    stopCurrent,
    replayCurrent,
    playForCard,
    onSnapshotChange,
    clearReplay,
  };
}
