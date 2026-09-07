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

/**
 * Hard sanity boundary (RFSN-061C). Not the normal fairness band.
 * A 25% overpay is still a trade. Only radically absurd packages are noise.
 * Ratio = user received tradeValue / user given tradeValue.
 */
export const TRADE_FINDER_SANITY = {
  minGainRatio: 0.35,
  maxGainRatio: 2.85,
} as const;

/**
 * Trade Approach maps onto the existing `risk` filter.
 * BEST VALUE = conservative, NEED A STARTER = balanced, MUST MAKE A MOVE = aggressive.
 * Discovery width only — ranking still prefers better tiers.
 */
export const TRADE_FINDER_APPROACH = {
  conservative: { maxPartners: 5, maxGivePool: 8, maxGetPool: 8, maxCandidates: 160, maxPairPool: 5 },
  balanced: { maxPartners: 5, maxGivePool: 8, maxGetPool: 8, maxCandidates: 160, maxPairPool: 5 },
  aggressive: { maxPartners: 6, maxGivePool: 10, maxGetPool: 10, maxCandidates: 200, maxPairPool: 6 },
} as const;

/** Soft ranking windows (not hard rejects). Kept for documentation / BEST VALUE preference. */
export const TRADE_FINDER_VALUE_BANDS = {
  conservative: { min: 0.85, max: 1.12 },
  balanced: { min: 0.75, max: 1.28 },
  aggressive: { min: 0.68, max: 1.42 },
} as const;

export const TRADE_FINDER_REJECT = {
  /**
   * @deprecated RFSN-061C: negative userDelta is a quality signal, not a hard reject.
   * Retained so callers can still read the historical threshold.
   */
  userLineupDropPpg: 0.75,
  /** Partner becoming unable to field a legal skill lineup → hard invalid. */
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

/**
 * Partner-rationality gate (RFSN-061B). Recommendation ranking only.
 * Does not change player tradeValue or fairness grades.
 */
export const TRADE_FINDER_RATIONALITY = {
  /** Partner starter-point drop that requires a compensating roster benefit. */
  materialDropPpg: 1.5,
  /** Canonical needScore (not trade-priority) that counts as a real NEED. */
  needFloor: 40,
  /** Canonical needScore that counts as a severe weakness. */
  severeNeedScore: 50,
  /** Partner received-value / given-value that counts as a clear premium. */
  valuePremiumRatio: 1.15,
} as const;
