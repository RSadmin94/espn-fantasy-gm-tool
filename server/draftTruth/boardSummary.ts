import { classifyDraftPickRawPick } from "./classifySlot";
import { SlotClass } from "./types";

/** Per-season (or any pick list) DraftTruth rollups for certification / UI. */
export type DraftTruthBoardSummary = {
  /** All rows we counted (dedupe caller-side if needed). */
  boardSlots: number;
  /** OPEN / DRAFTED — rows that count toward draft ROI & ADP analytics. */
  openDraftPicks: number;
  /** Strict ESPN keeper flag path (slotClass KEEPER). */
  keeperSlots: number;
  /** Retained-only slots (slotClass RETAINED). */
  retainedSlots: number;
  /** Malformed or non-classifiable rows — excluded from analytics. */
  unknownSlots: number;
  /** Alias of openDraftPicks — rows eligible for draft pick ROI joins. */
  roiRows: number;
};

/**
 * Summarize a list of draft pick payloads (API or DB `rawPick` objects).
 * Each element is passed to {@link classifyDraftPickRawPick}.
 */
export function summarizeDraftTruthBoard(picks: unknown[]): DraftTruthBoardSummary {
  const out: DraftTruthBoardSummary = {
    boardSlots: 0,
    openDraftPicks: 0,
    keeperSlots: 0,
    retainedSlots: 0,
    unknownSlots: 0,
    roiRows: 0,
  };
  for (const pick of picks) {
    out.boardSlots++;
    const t = classifyDraftPickRawPick(pick);
    if (t.slotClass === SlotClass.UNKNOWN) out.unknownSlots++;
    if (t.slotClass === SlotClass.KEEPER) out.keeperSlots++;
    if (t.slotClass === SlotClass.RETAINED) out.retainedSlots++;
    if (t.draftedForAnalytics) out.openDraftPicks++;
  }
  out.roiRows = out.openDraftPicks;
  return out;
}
