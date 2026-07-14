/**
 * RFSN analyst booth — presentation state and sequencing (frontend only).
 */
import type {
  RfsnBroadcastSnapshot,
  RfsnCommentaryCard,
  RfsnCommentatorId,
  RfsnTickerItem,
} from "./rfsnPresentation";
import { COMMENTATOR_META } from "./rfsnPresentation";

export type BoothCardState =
  | "standby"
  | "entering"
  | "active"
  | "dismissing"
  | "exiting";

export const BOOTH_ANALYST_ORDER: readonly RfsnCommentatorId[] = [
  "sofia",
  "coach",
  "roxanne",
] as const;

export const BOOTH_ENTER_MS = 400;
export const BOOTH_EXIT_MS = 450;
export const BOOTH_BETWEEN_SPEAKERS_MS = 400;
export const BOOTH_DISMISS_MS = 400;
export const BOOTH_MIN_DISPLAY_MS = 6000;
export const BOOTH_MAX_DISPLAY_MS = 12000;
export const BOOTH_MS_PER_CHAR = 50;

/**
 * Written-broadcast default. When false, RFSN runs as a written booth: voice/TTS is a
 * disabled experimental feature — audio controls, replay, and the speaking equalizer are
 * hidden and the booth advances on text timers only, never waiting for audio.
 */
export const RFSN_VOICE_BETA = false;

export const BOOTH_INACTIVE_OPACITY = 0.72;

export const BOOTH_PORTRAIT_WIDTH_PCT = 42;

export function boothStandbyLine(commentator: RfsnCommentatorId): string {
  const meta = COMMENTATOR_META[commentator];
  return `${meta.role} · On standby`;
}

/** Desktop card min-heights — mock desk proportions (standby 160–180px, active up to 280px). */
export function boothCardMinHeight(
  commentator: RfsnCommentatorId,
  isActiveSpeaker: boolean,
): string {
  if (commentator === "sofia") {
    return isActiveSpeaker ? "min-h-[17.5rem]" : "min-h-[11rem]";
  }
  if (commentator === "coach") {
    return isActiveSpeaker ? "min-h-[14rem]" : "min-h-[10.5rem]";
  }
  return isActiveSpeaker ? "min-h-[13rem]" : "min-h-[10rem]";
}

/** Minimum portrait column height inside card body. */
export function boothPortraitMinHeight(
  commentator: RfsnCommentatorId,
  isActiveSpeaker: boolean,
): string {
  if (commentator === "sofia") {
    return isActiveSpeaker ? "min-h-[11.5rem]" : "min-h-[9.5rem]";
  }
  if (commentator === "coach") {
    return isActiveSpeaker ? "min-h-[10.5rem]" : "min-h-[8.75rem]";
  }
  return isActiveSpeaker ? "min-h-[9.75rem]" : "min-h-[8.25rem]";
}

export function commentaryDisplayMs(text: string, reducedMotion = false): number {
  if (reducedMotion) return BOOTH_MIN_DISPLAY_MS;
  const byLength = text.length * BOOTH_MS_PER_CHAR;
  return Math.min(BOOTH_MAX_DISPLAY_MS, Math.max(BOOTH_MIN_DISPLAY_MS, byLength));
}

function commentaryKey(card: Pick<RfsnCommentaryCard, "commentator" | "text" | "id">): string {
  return `${card.commentator}:${card.id}:${card.text}`;
}

/** Ordered on-air sequence: primary → secondary → non-duplicate ticker lines (max 3). */
export function buildBoothCommentarySequence(
  snapshot: RfsnBroadcastSnapshot,
): RfsnCommentaryCard[] {
  const seq: RfsnCommentaryCard[] = [];
  const seen = new Set<string>();

  const add = (card: RfsnCommentaryCard) => {
    const key = commentaryKey(card);
    if (seen.has(key)) return;
    seen.add(key);
    seq.push(card);
  };

  if (snapshot.primary) add(snapshot.primary);
  if (snapshot.secondary) add(snapshot.secondary);

  for (const item of snapshot.ticker) {
    add(tickerItemToCard(item));
  }

  return seq.slice(0, 3);
}

export function tickerItemToCard(item: RfsnTickerItem): RfsnCommentaryCard {
  return {
    id: item.id,
    commentator: item.commentator,
    label: COMMENTATOR_META[item.commentator].role,
    text: item.text,
  };
}

/** Remove ticker lines consumed by the booth or matching active commentary. */
export function filterTickerForBooth(
  ticker: readonly RfsnTickerItem[],
  activeCard: RfsnCommentaryCard | null,
  consumedIds: ReadonlySet<string>,
): RfsnTickerItem[] {
  return ticker.filter((item) => {
    if (consumedIds.has(item.id)) return false;
    if (!activeCard) return true;
    if (item.id === activeCard.id) return false;
    if (
      item.commentator === activeCard.commentator &&
      item.text === activeCard.text
    ) {
      return false;
    }
    return true;
  });
}

export function initialCardStates(): Record<RfsnCommentatorId, BoothCardState> {
  return {
    sofia: "standby",
    coach: "standby",
    roxanne: "standby",
  };
}

export function isCommentaryVisibleState(state: BoothCardState): boolean {
  return state === "active" || state === "dismissing";
}

export function analystOpacity(
  commentator: RfsnCommentatorId,
  activeCommentator: RfsnCommentatorId | null,
  cardState: BoothCardState,
): number {
  if (cardState === "active" || cardState === "entering" || cardState === "dismissing") {
    return 1;
  }
  if (activeCommentator && activeCommentator !== commentator) {
    return BOOTH_INACTIVE_OPACITY;
  }
  return 1;
}

export function isAnalystActiveSpeaker(
  commentator: RfsnCommentatorId,
  activeCommentator: RfsnCommentatorId | null,
): boolean {
  return activeCommentator === commentator;
}

export function boothDismissLabel(commentator: RfsnCommentatorId): string {
  const name = COMMENTATOR_META[commentator].displayName;
  return `Dismiss ${name} commentary`;
}

export type BoothSequenceAdvance =
  | { type: "standby" }
  | { type: "play"; index: number; card: RfsnCommentaryCard };

/** Next segment after current index finishes or is dismissed. */
export function nextBoothSegment(
  sequence: readonly RfsnCommentaryCard[],
  currentIndex: number,
): BoothSequenceAdvance {
  const nextIndex = currentIndex + 1;
  if (nextIndex >= sequence.length) {
    return { type: "standby" };
  }
  const card = sequence[nextIndex];
  if (!card) return { type: "standby" };
  return { type: "play", index: nextIndex, card };
}

export function cardStateForAnalyst(
  commentator: RfsnCommentatorId,
  activeCommentator: RfsnCommentatorId | null,
  states: Record<RfsnCommentatorId, BoothCardState>,
): BoothCardState {
  if (activeCommentator === commentator) {
    return states[commentator];
  }
  return "standby";
}
