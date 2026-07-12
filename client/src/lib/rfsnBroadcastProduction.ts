/**
 * RFSN broadcast production — focus, pacing, and TV-style presentation helpers.
 * Frontend only; no orchestration or adapter logic.
 */
import type { RfsnCommentatorId } from "./rfsnPresentation";
import type { BoothCardState } from "./rfsnBoothPresentation";

export type BroadcastFocusState = "ambient" | "commentary";

export const PHRASE_REVEAL_MIN_MS = 400;
export const PHRASE_REVEAL_MAX_MS = 700;
export const CLOCK_URGENCY_THRESHOLD_SEC = 15;
export const CLOCK_TOTAL_SEC = 90;

/** Split commentary into natural phrase chunks for staged reveal. */
export function splitCommentaryPhrases(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) return sentences;

  const clauses = trimmed.split(/,\s+/).filter(Boolean);
  if (clauses.length > 1) {
    return clauses.map((c, i) => (i < clauses.length - 1 ? `${c},` : c));
  }

  const words = trimmed.split(/\s+/);
  if (words.length <= 6) return [trimmed];

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 5) {
    chunks.push(words.slice(i, i + 5).join(" "));
  }
  return chunks;
}

/** Per-phrase interval targeting 400–700 ms total reveal. */
export function phraseRevealIntervalMs(phraseCount: number, reducedMotion = false): number {
  if (reducedMotion || phraseCount <= 1) return 0;
  const total = Math.min(
    PHRASE_REVEAL_MAX_MS,
    Math.max(PHRASE_REVEAL_MIN_MS, phraseCount * 110),
  );
  return Math.floor(total / phraseCount);
}

export function resolveBroadcastFocus(
  activeCommentator: RfsnCommentatorId | null,
  cardStates: Record<RfsnCommentatorId, BoothCardState>,
): BroadcastFocusState {
  if (!activeCommentator) return "ambient";
  const state = cardStates[activeCommentator];
  if (state === "entering" || state === "active" || state === "dismissing") {
    return "commentary";
  }
  return "ambient";
}

export function isOnClockRowLive(
  focus: BroadcastFocusState,
  isOnClock: boolean,
): boolean {
  return focus === "commentary" && isOnClock;
}

export function clockProgress(clockSeconds: number): number {
  return Math.min(1, Math.max(0, clockSeconds / CLOCK_TOTAL_SEC));
}

export function clockUrgencyLevel(clockSeconds: number): "normal" | "urgent" {
  return clockSeconds <= CLOCK_URGENCY_THRESHOLD_SEC ? "urgent" : "normal";
}

export function contextGraphicDelay(index: number, reducedMotion = false): string {
  if (reducedMotion) return "0ms";
  return `${120 + index * 90}ms`;
}

export const CONTEXT_GRAPHIC_ANIM_CLASS = "rfsn-context-graphic-in";

export const BOOTH_ENTER_ANIM_CLASS = "rfsn-broadcast-enter";

export function analystLiveIndicatorVisible(
  isActiveSpeaker: boolean,
  cardState: BoothCardState,
): boolean {
  return isActiveSpeaker && (cardState === "active" || cardState === "entering");
}
