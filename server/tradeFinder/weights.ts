/**
 * Centralized Trade Finder weights, bounds, and fairness bands.
 * Do not scatter magic numbers across the engine.
 */

export const TRADE_FINDER_WEIGHTS = {
  userGain: 0.3,
  partnerGain: 0.2,
  fairness: 0.2,
  userNeedFit: 0.1,
  partnerNeedFit: 0.1,
  depthStability: 0.1,
  /** Optional history modifier. Must not dominate v1. */
  behavior: 0.04,
} as const;

export const TRADE_FINDER_NEED_WEIGHTS = {
  slotFill: 0.25,
  starterQuality: 0.5,
  depth: 0.15,
  injury: 0.1,
} as const;

export const TRADE_FINDER_SURPLUS_WEIGHTS = {
  extraStarters: 0.45,
  depthQuality: 0.35,
  redundancy: 0.2,
} as const;

export const TRADE_FINDER_BOUNDS = {
  maxPartners: 5,
  maxGivePool: 8,
  maxGetPool: 8,
  maxCandidates: 160,
  defaultTopN: 5,
  maxTopN: 10,
  maxAssetsPerSide: 2,
  /** Combinations of 2 from a pool of 5 = 10 pairs per side for 2-for-2. */
  maxPairPool: 5,
  maxPerShape: 32,
} as const;

/** Gain-ratio windows by risk preference (user received / user given). */
export const TRADE_FINDER_VALUE_BANDS = {
  conservative: { min: 0.85, max: 1.12 },
  balanced: { min: 0.75, max: 1.28 },
  aggressive: { min: 0.68, max: 1.42 },
} as const;

export const TRADE_FINDER_REJECT = {
  /** Drop starting-lineup weekly projection beyond this → reject. */
  userLineupDropPpg: 0.75,
  /** Partner becoming unable to field a legal skill lineup → reject. */
  partnerUnfilledStarter: true,
  /** Remaining playable bodies at a dedicated slot position after the trade. */
  minPlayableAtDedicated: 1,
} as const;

export const TRADE_FINDER_CLASSIFY = {
  needMin: 40,
  surplusMin: 40,
  /** Need must beat surplus by this margin to be labeled NEED (and vice versa). */
  labelMargin: 8,
} as const;

export const TRADE_FINDER_BEHAVIOR = {
  minTradesForSignal: 3,
  moderateShare: 0.35,
  strongShare: 0.5,
} as const;

/**
 * Discovery / ranking multiplier. Does not change roster needScore,
 * player tradeValue, or fairness grades.
 * Explicit TARGET=K or TARGET=DST overrides to 1.00 in priority.ts.
 */
export const TRADE_FINDER_PRIORITY_MULTIPLIER = {
  QB: 1,
  RB: 1,
  WR: 1,
  TE: 1,
  K: 0.2,
  DST: 0.2,
  /** IDP: full priority when the league starts IDP (see tradePriorityMultiplier). */
  DP: 1,
} as const;
