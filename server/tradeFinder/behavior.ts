import type { BehaviorFit, ManagerBehaviorEvidence, TradeFinderAsset } from "./types";
import { TRADE_FINDER_BEHAVIOR } from "./weights";

/**
 * Grounded only in completed-trade counts already reconstructed for the league.
 * No psychology. No invented tendencies.
 */
export function behaviorFitForTrade(
  evidence: ManagerBehaviorEvidence | undefined,
  theyReceive: TradeFinderAsset[],
): { fit: BehaviorFit; note: string | null } {
  if (!evidence || evidence.completedTrades <= 0) {
    return { fit: "NONE", note: null };
  }
  if (evidence.completedTrades < TRADE_FINDER_BEHAVIOR.minTradesForSignal) {
    return { fit: "WEAK", note: null };
  }
  const pos = evidence.mostAcquiredPos;
  if (!pos || pos === "?" || pos === "PICK") {
    return { fit: "WEAK", note: null };
  }
  const hits = theyReceive.some((a) => a.position === pos);
  if (!hits) return { fit: "NONE", note: null };
  const shareGuess =
    evidence.completedTrades >= 6 ? TRADE_FINDER_BEHAVIOR.strongShare : TRADE_FINDER_BEHAVIOR.moderateShare;
  const fit: BehaviorFit = shareGuess >= TRADE_FINDER_BEHAVIOR.strongShare ? "STRONG" : "MODERATE";
  return {
    fit,
    note: `In ${evidence.completedTrades} completed league trades, most acquired position is ${pos}.`,
  };
}

export function evidenceFromCompleted(args: {
  completedTrades: number;
  mostAcquiredPos: string | null;
  mostTradedAwayPos: string | null;
  twoForOneCount?: number;
  pickReceiptCount?: number;
}): ManagerBehaviorEvidence {
  return {
    completedTrades: args.completedTrades,
    mostAcquiredPos: args.mostAcquiredPos,
    mostTradedAwayPos: args.mostTradedAwayPos,
    twoForOneCount: args.twoForOneCount ?? 0,
    pickReceiptCount: args.pickReceiptCount ?? 0,
  };
}
