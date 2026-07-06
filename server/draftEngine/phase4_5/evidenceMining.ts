/**
 * Phase 4.5 — mine choice-ledger evidence for decision-rule support counts.
 */

import { normalizePlayerKey, normalizePosition, type ChoiceRecord } from "../phase1/types";

export type EvidenceBundle = {
  totalChoices: number;
  draftSeasons: number;
  seasonRange: [number, number];
  earlyRb: { count: number; seasons: number[] };
  earlyWr: { count: number; seasons: number[] };
  legacyEarlyRb: { count: number; seasons: number[] };
  modernEarlyWr: { count: number; seasons: number[] };
  runJoin: { count: number; seasons: number[] };
  runFade: { count: number; seasons: number[] };
  comfortReDraft: { count: number; seasons: number[] };
  needFill: { count: number; seasons: number[] };
  tierUrgency: { count: number; seasons: number[] };
};

const ROSTER_TARGET: Record<string, number> = { RB: 5, WR: 6, QB: 1, TE: 2 };

function seasonSet(records: ChoiceRecord[], pred: (r: ChoiceRecord) => boolean): number[] {
  return [...new Set(records.filter(pred).map((r) => r.season))].sort((a, b) => a - b);
}

export function mineLedgerEvidence(records: ChoiceRecord[]): EvidenceBundle {
  const sorted = [...records].sort((a, b) => a.season - b.season || a.overallPick - b.overallPick);
  const seasons = [...new Set(sorted.map((r) => r.season))].sort((a, b) => a - b);
  const rosterBySeason = new Map<number, Record<string, number>>();
  const priorKeys = new Set<string>();

  let runJoin = 0;
  let runFade = 0;
  let comfortReDraft = 0;
  let needFill = 0;
  let tierUrgency = 0;

  const runJoinSeasons = new Set<number>();
  const runFadeSeasons = new Set<number>();
  const comfortSeasons = new Set<number>();
  const needSeasons = new Set<number>();
  const urgencySeasons = new Set<number>();

  for (const rec of sorted) {
    const roster = { ...(rosterBySeason.get(rec.season) ?? { RB: 0, WR: 0, QB: 0, TE: 0 }) };
    const pos = normalizePosition(rec.chosenPlayer.position);
    const key = normalizePlayerKey(rec.chosenPlayer.playerName);

    const target = ROSTER_TARGET[pos] ?? 1;
    const have = roster[pos] ?? 0;
    if (have < target) {
      needFill++;
      needSeasons.add(rec.season);
    }

    if (priorKeys.has(key)) {
      comfortReDraft++;
      comfortSeasons.add(rec.season);
    }

    const run = rec.roomState.runInProgress?.position ?? null;
    if (run) {
      if (run === pos) {
        runJoin++;
        runJoinSeasons.add(rec.season);
      } else if (["RB", "WR", "QB", "TE"].includes(pos)) {
        runFade++;
        runFadeSeasons.add(rec.season);
      }
    }

    const wrRem = rec.roomState.tierByPosition.WR?.remaining ?? 10;
    const rbRem = rec.roomState.tierByPosition.RB?.remaining ?? 10;
    if (rec.round >= 10 && have < target * 0.5) {
      tierUrgency++;
      urgencySeasons.add(rec.season);
    } else if (rec.round <= 2 && wrRem > rbRem + 5 && pos === "WR") {
      tierUrgency++;
      urgencySeasons.add(rec.season);
    }

    roster[pos] = (roster[pos] ?? 0) + 1;
    rosterBySeason.set(rec.season, roster);
    priorKeys.add(key);
  }

  const earlyRbRecords = sorted.filter((r) => r.round <= 2 && normalizePosition(r.chosenPlayer.position) === "RB");
  const earlyWrRecords = sorted.filter((r) => r.round <= 2 && normalizePosition(r.chosenPlayer.position) === "WR");
  const legacyEarlyRb = earlyRbRecords.filter((r) => r.season < 2023);
  const modernEarlyWr = earlyWrRecords.filter((r) => r.season >= 2023);

  return {
    totalChoices: sorted.length,
    draftSeasons: seasons.length,
    seasonRange: [seasons[0] ?? 0, seasons[seasons.length - 1] ?? 0],
    earlyRb: { count: earlyRbRecords.length, seasons: seasonSet(sorted, (r) => r.round <= 2 && normalizePosition(r.chosenPlayer.position) === "RB") },
    earlyWr: { count: earlyWrRecords.length, seasons: seasonSet(sorted, (r) => r.round <= 2 && normalizePosition(r.chosenPlayer.position) === "WR") },
    legacyEarlyRb: { count: legacyEarlyRb.length, seasons: seasonSet(sorted, (r) => r.season < 2023 && r.round <= 2 && normalizePosition(r.chosenPlayer.position) === "RB") },
    modernEarlyWr: { count: modernEarlyWr.length, seasons: seasonSet(sorted, (r) => r.season >= 2023 && r.round <= 2 && normalizePosition(r.chosenPlayer.position) === "WR") },
    runJoin: { count: runJoin, seasons: [...runJoinSeasons].sort((a, b) => a - b) },
    runFade: { count: runFade, seasons: [...runFadeSeasons].sort((a, b) => a - b) },
    comfortReDraft: { count: comfortReDraft, seasons: [...comfortSeasons].sort((a, b) => a - b) },
    needFill: { count: needFill, seasons: [...needSeasons].sort((a, b) => a - b) },
    tierUrgency: { count: tierUrgency, seasons: [...urgencySeasons].sort((a, b) => a - b) },
  };
}
