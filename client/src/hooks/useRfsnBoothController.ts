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
import { PLAYBACK_MAX_WATCHDOG_MS } from "@/lib/rfsnPlaybackTerminal";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

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

function audioOwnsBooth(audio: RfsnAudioPlayback | null | undefined): boolean {
  if (!audio) return false;
  if (audio.state === "loading" || audio.state === "playing") return true;
  if (audio.isPlayInFlight?.()) return true;
  if (audio.isPlaying?.()) return true;
  return false;
}

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
  const activeCardRef = useRef(activeCard);
  activeCardRef.current = activeCard;
  const [sequenceIndex, setSequenceIndex] = useState(-1);
  const [consumedTickerIds, setConsumedTickerIds] = useState<Set<string>>(() => new Set());

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceIndexRef = useRef(-1);
  const audioRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCardIdRef = useRef<string | null>(null);

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
    // Never schedule an independent speaker timer while audio owns the card.
    if (audioOwnsBooth(audioRef.current)) return;
    const displayMs = commentaryDisplayMs(text, reducedMotion);
    timerRef.current = setTimeout(() => {
      if (audioOwnsBooth(audioRef.current)) return;
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
        // Competing text exit must not fire under active media — force audio terminal instead.
        if (audioOwnsBooth(audioRef.current)) {
          audioRef.current?.forceTerminalTimedOut?.();
          return;
        }
        fallbackScheduled = true;
        scheduleTextExit(card.commentator, index, card.text);
      };
      const onAudioEnded = () => {
        fallbackScheduled = true;
        clearTimer();
        exitSpeakerRef.current(card.commentator, index, false);
      };
      const tryAudio = () => {
        audioRef.current?.playForCard(card, onAudioEnded, scheduleFallback);
      };
      tryAudio();

      if (!liveAudio.unlocked) return false;
      if (audioOwnsBooth(liveAudio)) return true;

      audioRetryRef.current = setTimeout(() => {
        const a = audioRef.current;
        if (!a) return;
        if (a.state === "loading" || a.state === "ready" || a.state === "playing") tryAudio();
      }, 1200);

      // Pre-play wait only. Once audio owns the card, the holding effect cancels this and
      // any fire while holding routes through forceTerminalTimedOut (never exitSpeaker).
      timerRef.current = setTimeout(() => {
        if (audioOwnsBooth(audioRef.current)) {
          audioRef.current?.forceTerminalTimedOut?.();
          return;
        }
        scheduleFallback();
      }, PLAYBACK_MAX_WATCHDOG_MS);
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
            if (a?.unlocked || audioOwnsBooth(a)) return;
            scheduleTextExit(card.commentator, index, card.text);
          }, PLAYBACK_MAX_WATCHDOG_MS);
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
    // Manual dismiss still stops media; prefer terminal when an attempt is active.
    if (audioOwnsBooth(audioRef.current)) {
      audioRef.current?.forceTerminalTimedOut?.();
      return;
    }
    audioRef.current?.stopCurrent();
    exitSpeakerRef.current(commentator, sequenceIndexRef.current, true);
  }, [activeCommentator, cardStates]);

  const dismissActive = useCallback(() => {
    if (activeCommentator) dismissFor(activeCommentator);
  }, [activeCommentator, dismissFor]);

  const snapshotKey = useMemo(() => {
    const sig = (c: RfsnCommentaryCard | null | undefined) => (c ? `${c.id}~${c.text}` : "");
    // The reset key must change ONLY when the actual commentary sequence changes — never on
    // every pick. overallPick advances each pick while the commentary cards lag behind it, so
    // keying on it tore down the active clip mid-playback on each pick transition (endedEvents=0).
    // Ticker lines are consumed incrementally, so they are intentionally excluded too.
    return [sig(snapshot.primary), sig(snapshot.secondary)].join("|");
  }, [snapshot]);

  useEffect(() => {
    // GUARDRAIL: never tear down an actively-playing clip whose card is still part of the new
    // sequence. Let it finish — the booth advances via onEnded. Reset only when the active card
    // has left the sequence, the sequence is empty, or an explicit/terminal reset occurs.
    const activeId = activeCardRef.current?.id;
    if (activeId && audioRef.current?.isPlaying?.() && sequenceRef.current.some((c) => c.id === activeId)) {
      return;
    }
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

  /**
   * Ownership rule: once audio is loading/playing/in-flight, only completePlayback
   * (via onEnded / forceTerminalTimedOut) may release the speaker.
   * Cancel any pre-play text/fallback timers immediately when playback takes hold.
   */
  useEffect(() => {
    const holding = audioOwnsBooth(audio);
    if (!holding || !activeCard) return;

    clearTimer();
    const expectedCardId = activeCard.id;
    const ceiling = setTimeout(() => {
      if (activeCardIdRef.current !== expectedCardId) return;
      if (!audioOwnsBooth(audioRef.current)) return;
      audioRef.current?.forceTerminalTimedOut?.();
    }, PLAYBACK_MAX_WATCHDOG_MS);
    timerRef.current = ceiling;

    return () => {
      clearTimeout(ceiling);
      if (timerRef.current === ceiling) timerRef.current = null;
    };
  }, [audio?.state, activeCard?.id, clearTimer, audio]);

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
