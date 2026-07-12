import { useCallback, useEffect, useRef, useState } from "react";
import type { RfsnAudioState, RfsnLiveAudioStatus, RfsnVoiceAudioRef } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";

const AUDIO_PREF_KEY = "rfsn-live-audio-enabled";

export type RfsnAudioPlayback = {
  state: RfsnAudioState;
  userEnabled: boolean;
  muted: boolean;
  volume: number;
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
): RfsnAudioPlayback {
  const [userEnabled, setUserEnabled] = useState(() => readPref());
  const [unlocked, setUnlocked] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(0.85);
  const [state, setState] = useState<RfsnAudioState>(() =>
    ttsAvailable && userEnabled ? "locked" : "disabled",
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const onEndedRef = useRef<(() => void) | null>(null);
  const onFallbackRef = useRef<(() => void) | null>(null);
  const lastCardRef = useRef<RfsnCommentaryCard | null>(null);
  const activePickRef = useRef<string>("");

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
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
        return;
      }

      const url = buildAudioUrl(audioStatus, clip);
      if (!url) {
        setState("loading");
        return;
      }

      cleanupAudio();
      setState("loading");

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
            setState("ended");
            cleanupAudio();
            onEndedRef.current?.();
          };
          const handleError = () => {
            setState("failed");
            cleanupAudio();
            onFallbackRef.current?.();
          };

          audio.addEventListener("ended", handleEnded, { once: true });
          audio.addEventListener("error", handleError, { once: true });

          await audio.play();
          setState("playing");
        } catch {
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
    if (!card || !onEndedRef.current || !onFallbackRef.current) return;
    playForCard(card, onEndedRef.current, onFallbackRef.current);
  }, [playForCard]);

  const onSnapshotChange = useCallback(() => {
    stopCurrent();
    activePickRef.current = "";
  }, [stopCurrent]);

  useEffect(() => {
    if (!ttsAvailable || !userEnabled) {
      setState("disabled");
      return;
    }
    setState(unlocked ? "ready" : "locked");
  }, [ttsAvailable, unlocked, userEnabled]);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  return {
    state,
    userEnabled,
    muted,
    volume,
    unlockAudio,
    setMuted,
    setVolume,
    stopCurrent,
    replayCurrent,
    playForCard,
    onSnapshotChange,
  };
}
