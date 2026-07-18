/**
 * Generic broadcast moment — orchestrator input independent of event source.
 * Draft, trade, waiver, and recap events adapt into this shape via bridges.
 */
import type { BroadcastContext, BroadcastMomentIdentity, BroadcastSignificance } from "./broadcastFrameContract";
import type { FactPacket } from "./broadcastVoice";
import type { EditorialPlanId } from "./editorialPlans";
import type { ReachClassification } from "../draftMoments/reachClassification";
import type { HistoricalContext } from "../rfsn/historicalContext";

export type BroadcastMomentReceipt = {
  readonly id: string;
  readonly type: string;
};

export type BroadcastMoment = {
  readonly identity: BroadcastMomentIdentity;
  readonly momentType: string;
  readonly significance: BroadcastSignificance;
  readonly headline: string | null;
  readonly context: BroadcastContext;
  readonly factPacket: FactPacket;
  readonly commentaryBudget: { enabled: boolean; maxSentences: number; maxWords: number };
  readonly signals: readonly string[];
  readonly storylines: readonly string[];
  readonly receipts: readonly BroadcastMomentReceipt[];
  readonly primaryStoryline: string | null;
  /** Upstream may pin a plan; otherwise the editorial director resolves one. */
  readonly editorialPlanId?: EditorialPlanId;
  /** Back-to-back exceptional moments bypass decompression silence. */
  readonly overrideDecompression?: boolean;
  /** Stable keys for callback deduplication (storyline ids, receipt ids). */
  readonly callbackKeys?: readonly string[];
  /** Centralized pick-vs-ADP reach classification (when available). */
  readonly reachClassification?: ReachClassification | null;
  /**
   * RFSN-005 — aired HistoricalContext from the League Context Engine (optional, additive).
   * Facts already merged into factPacket.verifiedFacts when present.
   */
  readonly leagueContext?: readonly HistoricalContext[];
};
