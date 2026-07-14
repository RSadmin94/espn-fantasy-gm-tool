import type { RfsnCommentatorId } from "@/lib/rfsnPresentation";

export type RfsnCommentaryLogEntry = {
  id: string;
  pickLabel: string;
  commentator: RfsnCommentatorId;
  text: string;
};

/** Keep recent written lines; never store blanks; dedupe by commentator+text. */
export function appendCommentaryLogEntry(
  prev: readonly RfsnCommentaryLogEntry[],
  next: RfsnCommentaryLogEntry,
  maxEntries = 24,
): RfsnCommentaryLogEntry[] {
  const text = next.text.trim();
  if (!text) return [...prev];
  const key = `${next.commentator}:${text.toLowerCase()}`;
  if (prev.some((e) => `${e.commentator}:${e.text.trim().toLowerCase()}` === key)) {
    return [...prev];
  }
  if (prev.some((e) => e.id === next.id)) return [...prev];
  return [...prev, { ...next, text }].slice(-maxEntries);
}
