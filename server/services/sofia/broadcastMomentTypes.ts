/**
 * Generic broadcast moment — orchestrator input independent of event source.
 * Draft, trade, waiver, and recap events adapt into this shape via bridges.
 */
import type { BroadcastContext, BroadcastMomentIdentity, BroadcastSignificance } from "./broadcastFrameContract";
import type { FactPacket } from "./broadcastVoice";
import type { EditorialPlanId } from "./editorialPlans";

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
};
