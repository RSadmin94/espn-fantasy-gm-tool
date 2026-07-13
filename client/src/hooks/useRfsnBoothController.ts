import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RfsnBroadcastSnapshot, RfsnCommentaryCard, RfsnCommentatorId, RfsnTickerItem } from "@/lib/rfsnPresentation";
import type { RfsnAudioPlayback } from "@/hooks/useRfsnAudioPlayback";
import {
  BOOTH_BETWEEN_SPEAKERS_MS,
  BOOTH_DISMISS_MS,
  BOOTH_ENTER_MS,
  BOOTH_EXIT_MS,
  type BoothCardState,
  buildBoothCommentarySequence,
  commentaryDisplayMs,
  filterTickerForBooth,
  initialCardStates,
  nextBoothSegment,
} from "@/lib/rfsnBoothPresentation";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** Safety cap only — normal advance is audio `ended` or text dwell after onFallback. */
const AUDIO_SAFETY_FALLBACK_MS = 120_000;

export type RfsnBoothController = {
  cardStates: Record<RfsnCommentatorId, BoothCardState>;
  activeCommentator: RfsnCommentatorId | null;
  activeCard: RfsnCommentaryCard | null;
  filteredTicker: RfsnTickerItem[];
  dismissActive: () => void;
  dismissFor: (commentator: RfsnCommentatorId) => void;
  sequenceLength: number;
  sequenceIndex: number;
};

export type RfsnBoothControllerOptions = {
  audio?: RfsnAudioPlayback | null;
};

export function useRfsnBoothController(
  snapshot: RfsnBroadcastSnapshot,
  options: RfsnBoothControllerOptions = {},
): RfsnBoothController {
  const audio = options.audio ?? null;
  const reducedMotion = usePrefersReducedMotion();
  const sequence = useMemo(() => buildBoothCommentarySequence(snapshot), [snapshot]);
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;
  const audioRef = useRef(audio);
  audioRef.current = audio;

  const [cardStates, setCardStates] = useState(initialCardStates);
  const [activeCommentator, setActiveCommentator] = useState<RfsnCommentatorId | null>(null);
  const [activeCard, setActiveCard] = useState<RfsnCommentaryCard | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(-1);
  const [consumedTickerIds, setConsumedTickerIds] = useState<Set<string>>(() => new Set());

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceIndexRef = useRef(-1);
  const audioRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioRetryRef.current) {
      clearTimeout(audioRetryRef.current);
      audioRetryRef.current = null;
    }
  }, []);

  const finishStandby = useCallback(() => {
    clearTimer();
    setActiveCommentator(null);
    setActiveCard(null);
    sequenceIndexRef.current = -1;
    setSequenceIndex(-1);
    setCardStates(initialCardStates());
  }, [clearTimer]);

  const exitSpeakerRef = useRef<(commentator: RfsnCommentatorId, index: number, manual: boolean) => void>(
    () => {},
  );

  const scheduleTextExit = useCallback((commentator: RfsnCommentatorId, index: number, text: string) => {
    const displayMs = commentaryDisplayMs(text, reducedMotion);
    timerRef.current = setTimeout(() => {
      exitSpeakerRef.current(commentator, index, false);
    }, displayMs);
  }, [reducedMotion]);

  const audioAttemptedKeyRef = useRef<string | null>(null);

  const attemptActiveCardAudio = useCallback(
    (index: number, card: RfsnCommentaryCard) => {
      clearTimer();
      const liveAudio = audioRef.current;
      if (!liveAudio?.userEnabled) return false;

      let fallbackScheduled = false;
      const scheduleFallback = () => {
        if (fallbackScheduled) return;
        fallbackScheduled = true;
        scheduleTextExit(card.commentator, index, card.text);
      };
      const onAudioEnded = () => exitSpeakerRef.current(card.commentator, index, false);
      const tryAudio = () => {
        audioRef.current?.playForCard(card, onAudioEnded, scheduleFallback);
      };
      tryAudio();

      if (!liveAudio.unlocked) return false;
      if (liveAudio.isPlaying?.()) return true;
      if (liveAudio.state === "loading") return true;

      audioRetryRef.current = setTimeout(() => {
        const a = audioRef.current;
        if (!a) return;
        if (a.state === "loading" || a.state === "ready") tryAudio();
      }, 1200);
      timerRef.current = setTimeout(() => {
        const a = audioRef.current;
        if (!a) return;
        if (a.isPlaying?.()) return;
        scheduleFallback();
      }, AUDIO_SAFETY_FALLBACK_MS);
      return true;
    },
    [clearTimer, scheduleTextExit],
  );

  const attemptActiveCardAudioRef = useRef(attemptActiveCardAudio);
  attemptActiveCardAudioRef.current = attemptActiveCardAudio;

  const beginSpeaker = useCallback(
    (index: number, card: RfsnCommentaryCard) => {
      clearTimer();
      sequenceIndexRef.current = index;
      setSequenceIndex(index);
      setActiveCommentator(card.commentator);
      setActiveCard(card);
      setCardStates((prev) => ({
        ...prev,
        [card.commentator]: "entering",
      }));

      const enterMs = reducedMotion ? 0 : BOOTH_ENTER_MS;
      timerRef.current = setTimeout(() => {
        setCardStates((prev) => ({
          ...prev,
          [card.commentator]: "active",
        }));

        const liveAudio = audioRef.current;
        if (!liveAudio?.userEnabled) {
          scheduleTextExit(card.commentator, index, card.text);
        } else if (!liveAudio.unlocked) {
          // Preference on but gesture pending — keep card on-air until unlock or safety timeout.
          timerRef.current = setTimeout(() => {
            const a = audioRef.current;
            if (a?.unlocked || a?.isPlaying?.()) return;
            scheduleTextExit(card.commentator, index, card.text);
          }, AUDIO_SAFETY_FALLBACK_MS);
        }
      }, enterMs);
    },
    [clearTimer, reducedMotion, scheduleTextExit],
  );

  const beginSpeakerRef = useRef(beginSpeaker);
  beginSpeakerRef.current = beginSpeaker;

  exitSpeakerRef.current = (commentator, index, manual) => {
    clearTimer();
    audioRef.current?.stopCurrent();
    const card = sequenceRef.current[index];
    if (!card) {
      finishStandby();
      return;
    }

    setCardStates((prev) => ({
      ...prev,
      [commentator]: manual ? "dismissing" : "exiting",
    }));

    setConsumedTickerIds((prev) => new Set(prev).add(card.id));

    const exitMs = reducedMotion ? 0 : manual ? BOOTH_DISMISS_MS : BOOTH_EXIT_MS;
    timerRef.current = setTimeout(() => {
      setCardStates((prev) => ({
        ...prev,
        [commentator]: "standby",
      }));
      setActiveCommentator(null);
      setActiveCard(null);

      const gapMs = reducedMotion ? 0 : BOOTH_BETWEEN_SPEAKERS_MS;
      timerRef.current = setTimeout(() => {
        const next = nextBoothSegment(sequenceRef.current, index);
        if (next.type === "standby") {
          finishStandby();
        } else {
          beginSpeakerRef.current(next.index, next.card);
        }
      }, gapMs);
    }, exitMs);
  };

  const dismissFor = useCallback((commentator: RfsnCommentatorId) => {
    if (activeCommentator !== commentator || sequenceIndexRef.current < 0) return;
    const state = cardStates[commentator];
    if (state !== "active" && state !== "entering") return;
    audioRef.current?.stopCurrent();
    exitSpeakerRef.current(commentator, sequenceIndexRef.current, true);
  }, [activeCommentator, cardStates]);

  const dismissActive = useCallback(() => {
    if (activeCommentator) dismissFor(activeCommentator);
  }, [activeCommentator, dismissFor]);

  const snapshotKey = useMemo(() => {
    const sig = (c: RfsnCommentaryCard | null | undefined) => (c ? `${c.id}~${c.text}` : "");
    // Ticker lines are consumed incrementally during the booth sequence — polling must
    // NOT restart the frame when the ticker array grows or gets new object refs.
    return [snapshot.overallPick, sig(snapshot.primary), sig(snapshot.secondary)].join("|");
  }, [snapshot]);

  useEffect(() => {
    clearTimer();
    audioRef.current?.onSnapshotChange();
    audioAttemptedKeyRef.current = null;
    setConsumedTickerIds(new Set());
    setCardStates(initialCardStates());
    setActiveCommentator(null);
    setActiveCard(null);
    sequenceIndexRef.current = -1;
    setSequenceIndex(-1);

    const seq = sequenceRef.current;
    if (seq.length === 0) return;

    const startMs = reducedMotion ? 0 : 200;
    timerRef.current = setTimeout(() => {
      beginSpeakerRef.current(0, seq[0]!);
    }, startMs);

    return () => {
      clearTimer();
    };
  }, [snapshotKey, clearTimer, reducedMotion]);

  useEffect(() => clearTimer, [clearTimer]);

  // Active speaker + unlocked audio — attempt playback once the card reaches "active".
  useEffect(() => {
    if (!activeCard || activeCommentator == null || sequenceIndexRef.current < 0) return;
    if (cardStates[activeCommentator] !== "active") return;
    attemptActiveCardAudioRef.current(sequenceIndexRef.current, activeCard);
  }, [
    activeCard,
    activeCommentator,
    cardStates,
    audio?.userEnabled,
    audio?.unlocked,
  ]);

  const unlockRetryRef = useRef(false);
  const wasUnlockedRef = useRef(false);
  const activeCardIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeCard?.id !== activeCardIdRef.current) {
      activeCardIdRef.current = activeCard?.id ?? null;
      unlockRetryRef.current = false;
      audioAttemptedKeyRef.current = null;
    }
  }, [activeCard?.id]);

  // User unlocks after a line started in text-only mode — switch the active card to audio.
  useEffect(() => {
    const nowUnlocked = Boolean(audio?.userEnabled && audio?.unlocked);
    const justUnlocked = nowUnlocked && !wasUnlockedRef.current;
    wasUnlockedRef.current = nowUnlocked;
    if (!justUnlocked) return;
    if (!activeCard || activeCommentator == null || sequenceIndexRef.current < 0) return;
    if (cardStates[activeCommentator] !== "active") return;
    if (unlockRetryRef.current) return;
    unlockRetryRef.current = true;
    audioAttemptedKeyRef.current = null;
    clearTimer();
    attemptActiveCardAudioRef.current(sequenceIndexRef.current, activeCard);
  }, [
    audio?.unlocked,
    audio?.userEnabled,
    activeCard,
    activeCommentator,
    cardStates,
    clearTimer,
  ]);

  const filteredTicker = useMemo(
    () => filterTickerForBooth(snapshot.ticker, activeCard, consumedTickerIds),
    [snapshot.ticker, activeCard, consumedTickerIds],
  );

  return {
    cardStates,
    activeCommentator,
    activeCard,
    filteredTicker,
    dismissActive,
    dismissFor,
    sequenceLength: sequence.length,
    sequenceIndex,
  };
}
