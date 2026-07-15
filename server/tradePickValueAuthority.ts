/**
 * tradePickValueAuthority.ts — single source of truth for draft-pick trade value
 * and deterministic winner comparison.
 *
 * All trade surfaces (proposed analyzer, completed trade aging, pick eval API,
 * executed-trade math) must consume this module — no parallel pick formulas.
 */
import { expPickValueFromSnakeRound, snakeRoundAndPickFromOverall } from "./keeperDraftGeometry";
import { MARKET_VALUE_COMPOSITE_SCALE } from "./marketValue";

export const PICK_VALUE_BASE = 3000;
export const PICK_VALUE_K = 0.028;
/** Raw-scale margin below which a completed trade is "even" (matches tradeAging). */
export const COMPLETED_TRADE_EVEN_MARGIN_RAW = 50;

/** Rescale raw pick value onto the Trade Analyzer player composite scale. */
export const PICK_TO_MARKET_SCALE = (100 * MARKET_VALUE_COMPOSITE_SCALE) / PICK_VALUE_BASE;

export type TradePickSlotSource = "explicit" | "overall" | "unknown";

export interface TradePickSlot {
  round: number;
  pickInRound: number;
  label: string;
  source: TradePickSlotSource;
}

export interface ResolvedTradePick extends TradePickSlot {
  rawValue: number;
  marketValue: number;
}

export type TradeWinner = "A" | "B" | "even";

export interface TradeSideComparison {
  /** Value side A gives (proposed) or received (completed — set by caller). */
  sideA: number;
  /** Value side B gives (proposed) or received (completed — set by caller). */
  sideB: number;
  /** sideA / sideB when both > 0; 1 when sideB is 0. */
  ratio: number;
  /** What side A receives ÷ what side A gives (proposed-trade lens). */
  gainRatioA: number;
  /** What side B receives ÷ what side B gives. */
  gainRatioB: number;
  winner: TradeWinner;
  margin: number;
  fairnessGrade: string;
}

/** True when `overall` is a chronological snake index, not an ESPN pick-slot id. */
export function isChronologicalOverallPick(
  overall: number,
  teamCount: number,
  roundCount = 20,
): boolean {
  if (!Number.isFinite(overall) || overall < 1 || teamCount <= 0) return false;
  const maxOverall = teamCount * Math.max(1, roundCount);
  return overall <= maxOverall;
}

function isValidSnakeSlot(round: number, pickInRound: number, teamCount: number): boolean {
  return round >= 1 && pickInRound >= 1 && pickInRound <= teamCount;
}

function formatPickLabel(round: number, pickInRound: number): string {
  return `${round}.${String(pickInRound).padStart(2, "0")}`;
}

/**
 * Resolve round/slot from ESPN row fields or UI input.
 * Prefers explicit round+pick when valid; uses overall only when chronological.
 */
export function resolveTradePickSlot(args: {
  round?: number | null;
  pickInRound?: number | null;
  overallPickNumber?: number | null;
  teamCount: number;
  roundCount?: number;
}): TradePickSlot {
  const teamCount = args.teamCount;
  const roundCount = args.roundCount ?? 20;
  const roundRaw = Number(args.round ?? 0);
  const pickRaw = Number(args.pickInRound ?? 0);
  const overall = Number(args.overallPickNumber ?? 0);

  if (teamCount > 0 && isValidSnakeSlot(roundRaw, pickRaw, teamCount)) {
    return {
      round: roundRaw,
      pickInRound: pickRaw,
      label: formatPickLabel(roundRaw, pickRaw),
      source: "explicit",
    };
  }

  if (teamCount > 0 && isChronologicalOverallPick(overall, teamCount, roundCount)) {
    const d = snakeRoundAndPickFromOverall(overall, teamCount);
    return {
      round: d.round,
      pickInRound: d.pickInRound,
      label: formatPickLabel(d.round, d.pickInRound),
      source: "overall",
    };
  }

  return {
    round: 0,
    pickInRound: 0,
    label: "?",
    source: "unknown",
  };
}

/** Raw exponential pick value for a resolved slot (0 when unknown / invalid). */
export function tradePickRawValue(
  slot: Pick<TradePickSlot, "round" | "pickInRound" | "source">,
  teamCount: number,
): number {
  if (slot.source === "unknown" || teamCount <= 0) return 0;
  if (!isValidSnakeSlot(slot.round, slot.pickInRound, teamCount)) return 0;
  return expPickValueFromSnakeRound(
    slot.round,
    slot.pickInRound,
    teamCount,
    PICK_VALUE_BASE,
    PICK_VALUE_K,
  );
}

export function resolveAndValueTradePick(args: {
  round?: number | null;
  pickInRound?: number | null;
  overallPickNumber?: number | null;
  teamCount: number;
  roundCount?: number;
  scale?: "raw" | "market";
}): ResolvedTradePick {
  const slot = resolveTradePickSlot(args);
  const rawValue = tradePickRawValue(slot, args.teamCount);
  const marketValue = Math.round(rawValue * PICK_TO_MARKET_SCALE);
  return {
    ...slot,
    rawValue,
    marketValue,
  };
}

export function sumTradePickValues(
  picks: Array<{ round: number; pickInRound?: number; pick?: number }>,
  teamCount: number,
  scale: "raw" | "market" = "raw",
): number {
  if (teamCount <= 0) return 0;
  let sum = 0;
  for (const p of picks) {
    const pickInRound = p.pickInRound ?? p.pick ?? 0;
    const v = resolveAndValueTradePick({
      round: p.round,
      pickInRound,
      teamCount,
      scale,
    });
    sum += scale === "market" ? v.marketValue : v.rawValue;
  }
  return sum;
}

/** Parse "2026 R1.11", "R2.09", "2.09" style labels from transaction copy. */
export function parsePickLabel(label: string): { round: number; pickInRound: number } | null {
  const s = label.trim();
  const m = s.match(/R?(\d+)\.(\d+)/i) ?? s.match(/round\s*(\d+)\s*pick\s*(\d+)/i);
  if (!m) return null;
  const round = Number(m[1]);
  const pickInRound = Number(m[2]);
  if (!Number.isFinite(round) || !Number.isFinite(pickInRound) || round < 1 || pickInRound < 1) {
    return null;
  }
  return { round, pickInRound };
}

export function sumPickLabels(
  labels: string[],
  teamCount: number,
  scale: "raw" | "market" = "raw",
): number {
  let sum = 0;
  for (const label of labels) {
    const parsed = parsePickLabel(label);
    if (!parsed) return NaN; // mixed player + pick — caller handles
    const v = resolveAndValueTradePick({ ...parsed, teamCount, scale });
    sum += scale === "market" ? v.marketValue : v.rawValue;
  }
  return sum;
}

export function fairnessGradeFromGainRatio(gainRatioA: number): string {
  if (gainRatioA >= 0.95 && gainRatioA <= 1.05) return "FAIR";
  if (gainRatioA > 1.05 && gainRatioA <= 1.18) return "SLIGHT EDGE A";
  if (gainRatioA > 1.18 && gainRatioA <= 1.34) return "A WINS";
  if (gainRatioA > 1.34) return "LOPSIDED";
  if (gainRatioA >= 0.85) return "SLIGHT EDGE B";
  if (gainRatioA >= 0.75) return "B WINS";
  return "LOPSIDED";
}

/**
 * Compare proposed trade sides where sideA/sideB are values GIVEN by each team.
 * Winner = who receives more (equivalently: who gives less).
 */
export function compareGivenSideTotals(
  givenA: number,
  givenB: number,
  evenMargin = COMPLETED_TRADE_EVEN_MARGIN_RAW,
): TradeSideComparison {
  const ratio = givenB > 0 ? givenA / givenB : 1;
  const gainRatioA = givenA > 0 ? givenB / givenA : 1;
  const gainRatioB = givenB > 0 ? givenA / givenB : 1;
  const receivedA = givenB;
  const receivedB = givenA;
  const margin = Math.abs(receivedA - receivedB);
  let winner: TradeWinner = "even";
  if (margin >= evenMargin) {
    winner = receivedA > receivedB ? "A" : "B";
  }
  return {
    sideA: givenA,
    sideB: givenB,
    ratio,
    gainRatioA,
    gainRatioB,
    winner,
    margin,
    fairnessGrade: fairnessGradeFromGainRatio(gainRatioA),
  };
}

/**
 * Compare completed trade sides where sideA/sideB are values RECEIVED by each team.
 */
export function compareReceivedSideTotals(
  receivedA: number,
  receivedB: number,
  evenMargin = COMPLETED_TRADE_EVEN_MARGIN_RAW,
): TradeSideComparison {
  const margin = Math.abs(receivedA - receivedB);
  let winner: TradeWinner = "even";
  if (margin >= evenMargin) {
    winner = receivedA > receivedB ? "A" : "B";
  }
  const givenA = receivedB;
  const givenB = receivedA;
  const ratio = givenB > 0 ? givenA / givenB : 1;
  const gainRatioA = givenA > 0 ? givenB / givenA : 1;
  const gainRatioB = givenB > 0 ? givenA / givenB : 1;
  return {
    sideA: receivedA,
    sideB: receivedB,
    ratio,
    gainRatioA,
    gainRatioB,
    winner,
    margin,
    fairnessGrade: fairnessGradeFromGainRatio(gainRatioA),
  };
}

/** Map proposed-trade winner to tradeAging sideA/sideB verdict. */
export function toTradeAgingVerdict(
  winner: TradeWinner,
): "sideA" | "sideB" | "even" {
  if (winner === "A") return "sideA";
  if (winner === "B") return "sideB";
  return "even";
}

/** pickTradeEval verdict from side A's lens (what A gives vs what B gives). */
export function pickPackageVerdictForSideA(
  givenA: number,
  givenB: number,
): "WIN" | "FAIR" | "LOSS" {
  const { gainRatioA } = compareGivenSideTotals(givenA, givenB);
  if (gainRatioA >= 1.1) return "WIN";
  if (gainRatioA >= 0.9) return "FAIR";
  return "LOSS";
}
