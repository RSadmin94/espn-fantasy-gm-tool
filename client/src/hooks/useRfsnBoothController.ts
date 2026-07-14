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

/** While audio is still playing after min dwell, re-check ownership briefly. */
const AUDIO_OWNED_POLL_MS = 500;

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
  const cardStartedAtRef = useRef(0);

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
    const tryExit = () => {
      const elapsed = Date.now() - cardStartedAtRef.current;
      const remainingMin = displayMs - elapsed;
      // Readable dwell: never leave before BOOTH_MIN_DISPLAY_MS (via commentaryDisplayMs).
      if (remainingMin > 0) {
        timerRef.current = setTimeout(tryExit, remainingMin);
        return;
      }
      // Written path owns advance unless audio is still playing (do not cut mid-clip).
      if (audioRef.current?.isPlaying?.()) {
        timerRef.current = setTimeout(tryExit, AUDIO_OWNED_POLL_MS);
        return;
      }
      exitSpeakerRef.current(commentator, index, false);
    };
    timerRef.current = setTimeout(tryExit, displayMs);
  }, [reducedMotion]);

  const audioAttemptedKeyRef = useRef<string | null>(null);

  const attemptActiveCardAudio = useCallback(
    (index: number, card: RfsnCommentaryCard) => {
      // Never clearTimer here — written dwell must keep running. Audio end respects min dwell.
      const liveAudio = audioRef.current;
      if (!liveAudio?.userEnabled) return false;

      const displayMs = commentaryDisplayMs(card.text, reducedMotion);
      let fallbackScheduled = false;
      const scheduleFallback = () => {
        if (fallbackScheduled) return;
        fallbackScheduled = true;
        if (!timerRef.current) scheduleTextExit(card.commentator, index, card.text);
      };
      const onAudioEnded = () => {
        const elapsed = Date.now() - cardStartedAtRef.current;
        const remaining = Math.max(0, displayMs - elapsed);
        if (remaining > 0) {
          if (!timerRef.current) {
            timerRef.current = setTimeout(() => {
              exitSpeakerRef.current(card.commentator, index, false);
            }, remaining);
          }
          return;
        }
        exitSpeakerRef.current(card.commentator, index, false);
      };
      const tryAudio = () => {
        audioRef.current?.playForCard(card, onAudioEnded, scheduleFallback);
      };
      tryAudio();

      if (!liveAudio.unlocked) return false;

      // Clip pending / lock / not playing — keep written text dwell (already scheduled).
      if (!timerRef.current) scheduleTextExit(card.commentator, index, card.text);
      audioRetryRef.current = setTimeout(() => {
        const a = audioRef.current;
        if (!a) return;
        if (a.state === "loading" || a.state === "ready") tryAudio();
      }, 1200);
      return Boolean(liveAudio.isPlaying?.());
    },
    [reducedMotion, scheduleTextExit],
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
      cardStartedAtRef.current = Date.now();
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
        cardStartedAtRef.current = Date.now();
        // Written commentary always starts text dwell immediately — never gated on
        // Enable Sound, unlock, clip readiness, or TTS availability.
        scheduleTextExit(card.commentator, index, card.text);
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

  // Attempt playback once a card reaches "active". Unlock transitions are owned by the
  // dedicated "just unlocked" effect below — so unlocked/userEnabled are intentionally NOT
  // deps here. Including them made this effect re-fire on unlock and issue a second
  // playForCard for the already-active card (harmless via the hook's idempotent gate, but
  // a redundant double-attempt). One attempt per activation; the unlock effect owns re-attempts.
  useEffect(() => {
    if (!activeCard || activeCommentator == null || sequenceIndexRef.current < 0) return;
    if (cardStates[activeCommentator] !== "active") return;
    attemptActiveCardAudioRef.current(sequenceIndexRef.current, activeCard);
  }, [
    activeCard,
    activeCommentator,
    cardStates,
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
    // Do not clearTimer — written dwell must keep running until audio actually plays
    // or the text timer advances the booth.
    attemptActiveCardAudioRef.current(sequenceIndexRef.current, activeCard);
  }, [
    audio?.unlocked,
    audio?.userEnabled,
    activeCard,
    activeCommentator,
    cardStates,
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
