/**
 * DB draft_picks row → DraftTruth fields for Draft War Room (read-only; no classifier edits).
 */
import { classifyDraftPickRawPick } from "./draftTruth";

export type EnrichedDraftPickDbRow = {
  teamId: number;
  roundId: number;
  roundPick: number;
  overallPick: number;
  playerName: string;
  position: string;
  isKeeper: number;
  rawPick: string | null;
  keeperSlot: boolean;
  draftedForAnalytics: boolean;
  retained: boolean;
  isManualOverride?: boolean;
};

export function draftTruthFromDraftPickDbRow(row: {
  rawPick?: unknown;
  isKeeper?: number | string | null;
}): { keeperSlot: boolean; draftedForAnalytics: boolean; retained: boolean } {
  const rawStr = row.rawPick;
  if (rawStr != null && typeof rawStr === "string") {
    const s = rawStr.trim();
    if (s !== "" && s !== "{}") {
      try {
        const parsed = JSON.parse(s) as unknown;
        const c = classifyDraftPickRawPick(parsed);
        return {
          keeperSlot: c.keeperSlot,
          draftedForAnalytics: c.draftedForAnalytics,
          retained: c.retained,
        };
      } catch {
        /* fall through */
      }
    }
  }
  const legacyKeeper = Number(row.isKeeper) === 1;
  return {
    keeperSlot: legacyKeeper,
    draftedForAnalytics: !legacyKeeper,
    retained: false,
  };
}

/** Attach DraftTruth flags to a draft_picks SQL row (full board preserved). */
export function enrichDraftPickDbRow(row: Record<string, unknown>): EnrichedDraftPickDbRow {
  const t = draftTruthFromDraftPickDbRow(row as { rawPick?: string; isKeeper?: number });
  return {
    teamId: Number(row.teamId ?? 0),
    roundId: Number(row.roundId ?? 0),
    roundPick: Number(row.roundPick ?? 0),
    overallPick: Number(row.overallPick ?? 0),
    playerName: String(row.playerName ?? ""),
    position: String(row.position ?? ""),
    isKeeper: Number(row.isKeeper ?? 0),
    rawPick: row.rawPick != null ? String(row.rawPick) : null,
    keeperSlot: t.keeperSlot,
    draftedForAnalytics: t.draftedForAnalytics,
    retained: t.retained,
    isManualOverride: row.isManualOverride === true,
  };
}

export function summarizeDraftBoardCounts(rows: Pick<EnrichedDraftPickDbRow, "keeperSlot" | "draftedForAnalytics" | "retained">[]) {
  return {
    boardSlotCount: rows.length,
    openDraftPickCount: rows.filter((r) => r.draftedForAnalytics).length,
    keeperSlotCount: rows.filter((r) => r.keeperSlot).length,
    retainedSlotCount: rows.filter((r) => r.retained).length,
  };
}
