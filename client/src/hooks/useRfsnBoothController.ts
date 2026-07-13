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
  const audioActive = Boolean(audio && audio.userEnabled && audio.state !== "disabled");
  const reducedMotion = usePrefersReducedMotion();
  const sequence = useMemo(() => buildBoothCommentarySequence(snapshot), [snapshot]);
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;
  // useRfsnAudioPlayback returns a NEW object every render; keep it in a ref so the
  // activation effect can reach the latest audio without listing it as a dependency.
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

        if (audioActive && audio) {
          let fallbackScheduled = false;
          const scheduleFallback = () => {
            if (fallbackScheduled) return;
            fallbackScheduled = true;
            scheduleTextExit(card.commentator, index, card.text);
          };
          const tryAudio = () => {
            audio.playForCard(
              card,
              () => exitSpeakerRef.current(card.commentator, index, false),
              scheduleFallback,
            );
          };
          tryAudio();
          audioRetryRef.current = setTimeout(() => {
            if (audio.state === "loading" || audio.state === "ready") tryAudio();
          }, 1200);
          timerRef.current = setTimeout(() => {
            if (audio.state !== "playing") scheduleFallback();
          }, 8000);
          return;
        }

        scheduleTextExit(card.commentator, index, card.text);
      }, enterMs);
    },
    [audio, audioActive, clearTimer, reducedMotion, scheduleTextExit],
  );

  const beginSpeakerRef = useRef(beginSpeaker);
  beginSpeakerRef.current = beginSpeaker;

  exitSpeakerRef.current = (commentator, index, manual) => {
    clearTimer();
    audio?.stopCurrent();
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
    audio?.stopCurrent();
    exitSpeakerRef.current(commentator, sequenceIndexRef.current, true);
  }, [activeCommentator, audio, cardStates]);

  const dismissActive = useCallback(() => {
    if (activeCommentator) dismissFor(activeCommentator);
  }, [activeCommentator, dismissFor]);

  // Semantic identity of the current commentary frame. The activation effect keys off
  // THIS — not the snapshot / sequence / audio object references — because 2s polling
  // hands us new object references for identical data, and useRfsnAudioPlayback returns a
  // fresh `audio` object every render. Depending on those references re-ran this effect on
  // every render, tearing an active speaker back to standby (and stopping audio) before
  // beginSpeaker could fire — leaving valid commentary permanently in standby.
  //
  // The key includes card TEXT, not just ids: card ids are structural
  // (`${pickId}:${commentator}:${slot}`) and stay constant when a line is re-generated or
  // corrected for the same pick, so a text-only revision must still restart the booth.
  // (Audio-clip URL / status corrections live in audioStatus and are driven separately by
  // useRfsnAudioPlayback.)
  const snapshotKey = useMemo(() => {
    const sig = (c: RfsnCommentaryCard | null | undefined) => (c ? `${c.id}~${c.text}` : "");
    return [
      snapshot.overallPick,
      sig(snapshot.primary),
      sig(snapshot.secondary),
      snapshot.ticker.map((t) => `${t.id}~${t.text}`).join(","),
    ].join("|");
  }, [snapshot]);

  useEffect(() => {
    clearTimer();
    audioRef.current?.onSnapshotChange();
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
