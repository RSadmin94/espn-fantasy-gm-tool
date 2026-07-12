import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RfsnBroadcastSnapshot, RfsnCommentaryCard, RfsnCommentatorId, RfsnTickerItem } from "@/lib/rfsnPresentation";
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

export function useRfsnBoothController(snapshot: RfsnBroadcastSnapshot): RfsnBoothController {
  const reducedMotion = usePrefersReducedMotion();
  const sequence = useMemo(() => buildBoothCommentarySequence(snapshot), [snapshot]);
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;

  const [cardStates, setCardStates] = useState(initialCardStates);
  const [activeCommentator, setActiveCommentator] = useState<RfsnCommentatorId | null>(null);
  const [activeCard, setActiveCard] = useState<RfsnCommentaryCard | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(-1);
  const [consumedTickerIds, setConsumedTickerIds] = useState<Set<string>>(() => new Set());

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotKeyRef = useRef("");
  const sequenceIndexRef = useRef(-1);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
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

        const displayMs = commentaryDisplayMs(card.text, reducedMotion);
        timerRef.current = setTimeout(() => {
          exitSpeakerRef.current(card.commentator, index, false);
        }, displayMs);
      }, enterMs);
    },
    [clearTimer, reducedMotion],
  );

  const beginSpeakerRef = useRef(beginSpeaker);
  beginSpeakerRef.current = beginSpeaker;

  exitSpeakerRef.current = (commentator, index, manual) => {
    clearTimer();
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
    exitSpeakerRef.current(commentator, sequenceIndexRef.current, true);
  }, [activeCommentator, cardStates]);

  const dismissActive = useCallback(() => {
    if (activeCommentator) dismissFor(activeCommentator);
  }, [activeCommentator, dismissFor]);

  useEffect(() => {
    const key = `${snapshot.overallPick}:${snapshot.primary?.id ?? ""}:${snapshot.secondary?.id ?? ""}:${snapshot.ticker.map((t) => t.id).join(",")}`;
    if (key === snapshotKeyRef.current) return;
    snapshotKeyRef.current = key;

    clearTimer();
    setConsumedTickerIds(new Set());
    setCardStates(initialCardStates());
    setActiveCommentator(null);
    setActiveCard(null);
    sequenceIndexRef.current = -1;
    setSequenceIndex(-1);

    if (sequence.length === 0) return;

    const startMs = reducedMotion ? 0 : 200;
    timerRef.current = setTimeout(() => {
      beginSpeakerRef.current(0, sequence[0]!);
    }, startMs);

    return () => {
      clearTimer();
      snapshotKeyRef.current = "";
    };
  }, [snapshot, sequence, clearTimer, reducedMotion]);

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
