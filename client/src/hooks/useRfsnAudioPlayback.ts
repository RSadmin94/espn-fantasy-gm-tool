import { useCallback, useEffect, useRef, useState } from "react";
import type { RfsnAudioState, RfsnLiveAudioStatus, RfsnVoiceAudioRef } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import {
  clearWarRoomAudioSession,
  getWarRoomAudioSession,
  setWarRoomAudioSession,
} from "@/lib/rfsnWarRoomAudioSession";

const AUDIO_PREF_KEY = "rfsn-live-audio-enabled";

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
  /** When set, audio + replay survive panel unmount (navigation) until sessionEpoch bumps. */
  persistKey?: string;
  sessionEpoch?: string | number;
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
  const { persistKey, sessionEpoch } = options;
  const restored = persistKey ? getWarRoomAudioSession(persistKey) : undefined;

  const [userEnabled, setUserEnabled] = useState(() => restored?.userEnabled ?? readPref());
  const [unlocked, setUnlocked] = useState(() => restored?.unlocked ?? false);
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

  const stopCurrent = useCallback(() => {
    cleanupAudio();
    setState(userEnabled && unlocked ? "ready" : userEnabled ? "locked" : "disabled");
  }, [cleanupAudio, unlocked, userEnabled]);

  const unlockAudio = useCallback(() => {
    setUserEnabled(true);
    writePref(true);
    setUnlocked(true);
    setState("ready");
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
      lastCardRef.current = card;

      if (!ttsAvailable || !userEnabled) {
        setState("disabled");
        onFallback();
        return;
      }
      if (!unlocked) {
        setState("locked");
        onFallback();
        return;
      }

      if (!audioStatus) {
        setState("loading");
        return;
      }

      const pickKey = `${audioStatus.draftId}:${audioStatus.pickId}:${audioStatus.pickNumber}`;
      if (activePickRef.current && activePickRef.current !== pickKey) {
        cleanupAudio();
      }
      activePickRef.current = pickKey;

      const clip = findClip(audioStatus, card.id);
      if (!clip || clip.status === "failed" || clip.status === "expired") {
        setState("failed");
        onFallback();
        return;
      }
      if (clip.status === "pending" || !clip.audioId) {
      setState("loading");
      playInFlightRef.current = false;
      return;
    }

      lastPlayableRef.current = {
        commentaryId: card.id,
        voice: clip.voice,
        pickId: audioStatus.pickId,
        pickNumber: audioStatus.pickNumber,
        draftId: audioStatus.draftId,
        audioId: clip.audioId,
        status: clip.status,
        expiresAt: clip.expiresAt,
      };
      setLastPlayable(lastPlayableRef.current);

      const url = buildAudioUrl(audioStatus, clip);
      if (!url) {
        setState("loading");
        return;
      }

      cleanupAudio();
      setState("loading");
      playInFlightRef.current = true;

      void (async () => {
        try {
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`audio fetch ${res.status}`);
          const blob = await res.blob();
          if (!blob.size) throw new Error("empty audio");

          const objectUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objectUrl;
          const audio = new Audio(objectUrl);
          audio.muted = muted;
          audio.volume = volume;
          audioRef.current = audio;

          const handleEnded = () => {
            playInFlightRef.current = false;
            setState("ended");
            cleanupAudio();
            onEndedRef.current?.();
          };
          const handleError = () => {
            playInFlightRef.current = false;
            setState("failed");
            cleanupAudio();
            onFallbackRef.current?.();
          };

          audio.addEventListener("ended", handleEnded, { once: true });
          audio.addEventListener("error", handleError, { once: true });

          await audio.play();
          setState("playing");
        } catch {
          playInFlightRef.current = false;
          setState("failed");
          cleanupAudio();
          onFallbackRef.current?.();
        }
      })();
    },
    [audioStatus, cleanupAudio, muted, ttsAvailable, unlocked, userEnabled, volume],
  );

  const replayCurrent = useCallback(() => {
    const card = lastCardRef.current;
    const playable = lastPlayableRef.current;
    if (!card || !playable?.audioId || playable.status !== "ready") return;
    if (!onEndedRef.current || !onFallbackRef.current) return;
    playForCard(card, onEndedRef.current, onFallbackRef.current);
  }, [playForCard]);

  const clearReplay = useCallback(() => {
    lastPlayableRef.current = null;
    lastCardRef.current = null;
    setLastPlayable(null);
    if (persistKeyRef.current) {
      clearWarRoomAudioSession(persistKeyRef.current);
    }
  }, []);

  const playForCardRef = useRef(playForCard);
  playForCardRef.current = playForCard;

  const autoPlayedOnUnlockRef = useRef(false);
  useEffect(() => {
    if (!unlocked) {
      autoPlayedOnUnlockRef.current = false;
      return;
    }
    if (autoPlayedOnUnlockRef.current) return;
    const card = lastCardRef.current;
    if (!card || !onEndedRef.current || !onFallbackRef.current) return;
    if (playInFlightRef.current || stateRef.current === "playing" || stateRef.current === "loading") {
      return;
    }
    autoPlayedOnUnlockRef.current = true;
    playForCardRef.current(card, onEndedRef.current, onFallbackRef.current);
  }, [unlocked]);

  // Clip pending → ready: auto-retry the on-air card (line 2+ after TTS synthesis).
  useEffect(() => {
    const card = lastCardRef.current;
    if (!card || !unlocked || !onEndedRef.current || !onFallbackRef.current) return;
    if (playInFlightRef.current || stateRef.current === "playing") return;
    const clip = findClip(audioStatus, card.id);
    if (!clip || clip.status !== "ready" || !clip.audioId) return;
    playForCardRef.current(card, onEndedRef.current, onFallbackRef.current);
  }, [audioStatus, unlocked]);

  const onSnapshotChange = useCallback(() => {
    stopCurrent();
    activePickRef.current = "";
  }, [stopCurrent]);

  useEffect(() => {
    if (!ttsAvailable || !userEnabled) {
      setState("disabled");
      return;
    }
    if (stateRef.current === "playing") return;
    setState(unlocked ? "ready" : "locked");
  }, [ttsAvailable, unlocked, userEnabled]);

  // Explicit draft reset — clear persisted session + replay.
  const lastEpochRef = useRef(sessionEpoch);
  useEffect(() => {
    if (sessionEpoch === undefined || sessionEpoch === lastEpochRef.current) return;
    lastEpochRef.current = sessionEpoch;
    if (persistKey) clearWarRoomAudioSession(persistKey);
    lastPlayableRef.current = null;
    lastCardRef.current = null;
    setLastPlayable(null);
    cleanupAudio();
  }, [sessionEpoch, persistKey, cleanupAudio]);

  // Navigation away: pause + persist; do not destroy unlock/replay.
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
