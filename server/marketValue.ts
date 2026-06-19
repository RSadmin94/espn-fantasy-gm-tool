/**
 * Market Value Engine — V2.0
 * ----------------------------------------------------------------------------
 * Phase-aware player market value. Replaces the old single-signal model where
 * every trade value collapsed to `avgPoints` (which is 0 in the preseason, so
 * elite players valued to ~0 before any games were played).
 *
 * This is THE value engine. `calcTradeValue` delegates to it. There is no second
 * engine. It is a PURE module: it takes already-resolved inputs and returns
 * values. It does NOT touch the DB, the ESPN cache, or do any ingestion — the
 * caller (tradeAnalyze) resolves inputs (ADP, projection, keeper savings,
 * weekly history via the gm_player_registry crosswalk) and passes them in.
 *
 * v2.0 reliable inputs ONLY:
 *   ADP · ESPN projection · weekly fantasy points history · consistency ·
 *   trend · keeper value · percent-started (as "Market Confidence", not Usage)
 * Explicitly NOT used in v2.0: snap %, target share, air yards, raw volume
 *   statIds, FantasyPros, Vegas, PFR, name-matching joins.
 */

export type ValuationPhase = "preseason" | "weeks1to4" | "weeks5to8" | "week9plus";

export interface PhaseWeights {
  adp: number;
  projection: number;
  production: number; // weekly points + consistency (see PRODUCTION_LEVEL_SHARE)
  historical: number;
  keeper: number;
  trend: number;
  marketConfidence: number; // percent-started; 0-weight in v2.0 (computed + shown, not weighted)
}

/** Approved weighting model. Each row sums to 100 over weighted components. */
export const PHASE_WEIGHTS: Record<ValuationPhase, PhaseWeights> = {
  preseason: { adp: 40, projection: 35, production: 0, historical: 15, keeper: 10, trend: 0, marketConfidence: 0 },
  weeks1to4: { adp: 20, projection: 30, production: 35, historical: 10, keeper: 0, trend: 5, marketConfidence: 0 },
  weeks5to8: { adp: 5, projection: 25, production: 50, historical: 10, keeper: 0, trend: 10, marketConfidence: 0 },
  week9plus: { adp: 0, projection: 20, production: 60, historical: 10, keeper: 0, trend: 10, marketConfidence: 0 },
};

/** Within the Production component, how much is scoring level vs consistency. */
const PRODUCTION_LEVEL_SHARE = 0.75;
const PRODUCTION_CONSISTENCY_SHARE = 0.25;

/** Scales the 0–100 market value into the legacy composite range so picks
 *  (base 3000 curve) and players stay roughly comparable in trade math. */
export const MARKET_VALUE_COMPOSITE_SCALE = 3.0;

/** A rostered player is never worth exactly 0: the worst player in a cohort
 *  lands at percentile 0 on every axis, but a value of 0 is unsafe for trade
 *  ratio math (division) and semantically wrong. Floor the final value. */
const ROSTERED_FLOOR = 1;

export function getValuationPhase(playedWeeks: number): ValuationPhase {
  if (!Number.isFinite(playedWeeks) || playedWeeks <= 0) return "preseason";
  if (playedWeeks <= 4) return "weeks1to4";
  if (playedWeeks <= 8) return "weeks5to8";
  return "week9plus";
}

// ─── Inputs / Outputs ─────────────────────────────────────────────────────────

export interface SeasonHistory {
  season: number;
  avg: number;        // avg fantasy points/week that season (deduped by week)
  stdev: number | null;
  weeks: number;
}

export interface MarketValueInput {
  playerId: number;          // ESPN id
  position: string;          // QB/RB/WR/TE/K/D-ST
  adpRank: number | null;    // PPR draft rank — LOWER is better
  projection: number | null; // ESPN projected points — higher is better
  keeperRoundSavings: number | null; // rounds saved vs ADP (from calcKeeperEfficiency)
  percentStarted: number | null;     // 0–100 market confidence
  currentSeasonWeekly: number[];     // this season's per-week points, deduped; [] preseason
  history: SeasonHistory[];          // prior seasons (any order)
  currentSeason: number;
}

export interface MarketValueComponents {
  adp: number | null;
  projection: number | null;
  production: number | null;
  consistency: number | null;
  trend: number | null;
  historical: number | null;
  keeper: number | null;
  marketConfidence: number | null;
}

export interface MarketValueResult {
  playerId: number;
  position: string;
  phase: ValuationPhase;
  value: number;                       // 0–100 normalized market value
  compositeValue: number;              // value * MARKET_VALUE_COMPOSITE_SCALE
  components: MarketValueComponents;    // each 0–100 within position, or null if absent
  effectiveWeights: Record<string, number>; // weights after degradation (sum→100 over present)
  breakdown: string;                   // human-readable
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Percentile-rank a list of values to 0–100 WITHIN the cohort passed in.
 * nulls stay null. Single present value → neutral 50. Smooth, outlier-robust,
 * and makes otherwise-incomparable signals (rank vs points vs %) comparable.
 */
function percentileScores(vals: (number | null)[], higherIsBetter: boolean): (number | null)[] {
  const present = vals.map((v, i) => ({ v, i })).filter((x) => x.v != null && Number.isFinite(x.v)) as { v: number; i: number }[];
  if (present.length === 0) return vals.map(() => null);
  if (present.length === 1) return vals.map((v) => (v == null ? null : 50));
  const sorted = [...present].sort((a, b) => (higherIsBetter ? a.v - b.v : b.v - a.v));
  const scoreByIndex = new Map<number, number>();
  sorted.forEach((x, rank) => scoreByIndex.set(x.i, (rank / (sorted.length - 1)) * 100));
  return vals.map((v, i) => (v == null ? null : scoreByIndex.get(i) ?? null));
}

// ─── Per-player raw metrics (pre-normalization) ──────────────────────────────

/** Recency-weighted mean of this season's weekly points (later weeks heavier). */
function productionLevel(weekly: number[]): number | null {
  if (!weekly.length) return null;
  let wsum = 0;
  let vsum = 0;
  weekly.forEach((pts, i) => {
    const w = i + 1; // linear recency weight: week N weighted N
    wsum += w;
    vsum += w * pts;
  });
  return wsum > 0 ? vsum / wsum : null;
}

/** Consistency: higher = steadier. 1/(1+CV); needs ≥3 weeks. */
function consistency(weekly: number[]): number | null {
  if (weekly.length < 3) return null;
  const m = mean(weekly);
  const sd = stdev(weekly);
  if (sd == null || m <= 0) return null;
  const cv = sd / m;
  return 1 / (1 + cv);
}

/** Trend: mean(last 3 wks) − mean(earlier wks). Needs ≥4 weeks. */
function trend(weekly: number[]): number | null {
  if (weekly.length < 4) return null;
  const last = weekly.slice(-3);
  const earlier = weekly.slice(0, -3);
  return mean(last) - mean(earlier);
}

/** Recency-weighted historical avg across prior seasons (most recent heaviest). */
function historicalRaw(history: SeasonHistory[], currentSeason: number): number | null {
  const usable = history.filter((h) => h.season < currentSeason && h.weeks > 0);
  if (!usable.length) return null;
  const weightFor = (season: number): number => {
    const back = currentSeason - 1 - season; // 0 = last season
    if (back === 0) return 0.6;
    if (back === 1) return 0.3;
    if (back === 2) return 0.1;
    return 0; // older than 3 seasons: ignored
  };
  let wsum = 0;
  let vsum = 0;
  for (const h of usable) {
    const w = weightFor(h.season);
    if (w <= 0) continue;
    wsum += w;
    vsum += w * h.avg;
  }
  return wsum > 0 ? vsum / wsum : null;
}

// ─── Main engine ─────────────────────────────────────────────────────────────

/**
 * Compute market values for a cohort of players. Normalization is WITHIN
 * POSITION, so the full position group must be passed together. Returns a map
 * keyed by ESPN playerId.
 *
 * @param inputs  every player to value (ideally the whole league roster pool)
 * @param opts.playedWeeks  weeks of real production this season (0 → preseason)
 */
export function computeMarketValues(
  inputs: MarketValueInput[],
  opts?: { playedWeeks?: number }
): Map<number, MarketValueResult> {
  const playedWeeks = opts?.playedWeeks ?? maxPlayedWeeks(inputs);
  const phase = getValuationPhase(playedWeeks);
  const weights = PHASE_WEIGHTS[phase];

  // 1) Raw metrics per player
  const raw = inputs.map((p) => ({
    p,
    adp: p.adpRank,
    projection: p.projection,
    productionLevel: productionLevel(p.currentSeasonWeekly),
    consistency: consistency(p.currentSeasonWeekly),
    trend: trend(p.currentSeasonWeekly),
    historical: historicalRaw(p.history, p.currentSeason),
    keeper: p.keeperRoundSavings,
    marketConfidence: p.percentStarted,
  }));

  // 2) Normalize each metric to 0–100 within position
  const byPos = new Map<string, number[]>();
  raw.forEach((r, i) => {
    const arr = byPos.get(r.p.position) ?? [];
    arr.push(i);
    byPos.set(r.p.position, arr);
  });

  const norm = raw.map(() => ({} as Record<string, number | null>));

  // ADP is an inherently CROSS-POSITIONAL signal: a kicker drafted 180th is not
  // as valuable as the RB drafted 5th. Normalize ADP GLOBALLY so it preserves
  // cross-position magnitude. The points-based components below stay WITHIN
  // position (elite-vs-replacement at that spot), which is correct because raw
  // projection/points are not comparable across positions (QBs out-score RBs).
  const adpGlobal = percentileScores(raw.map((r) => r.adp), false); // lower rank better
  raw.forEach((_, i) => (norm[i].adp = adpGlobal[i]));

  for (const idxs of byPos.values()) {
    const pick = (sel: (r: typeof raw[number]) => number | null) => idxs.map((i) => sel(raw[i]));
    const put = (key: string, scores: (number | null)[]) =>
      idxs.forEach((i, k) => (norm[i][key] = scores[k]));

    put("projection", percentileScores(pick((r) => r.projection), true));
    put("productionLevel", percentileScores(pick((r) => r.productionLevel), true));
    put("consistency", percentileScores(pick((r) => r.consistency), true));
    put("trend", percentileScores(pick((r) => r.trend), true));
    put("historical", percentileScores(pick((r) => r.historical), true));
    put("keeper", percentileScores(pick((r) => r.keeper), true));
    put("marketConfidence", percentileScores(pick((r) => r.marketConfidence), true));
  }

  // 3) Blend + weight per player with graceful degradation
  const out = new Map<number, MarketValueResult>();
  raw.forEach((r, i) => {
    const n = norm[i];
    const production = blendProduction(n.productionLevel, n.consistency);
    const components: MarketValueComponents = {
      adp: n.adp ?? null,
      projection: n.projection ?? null,
      production,
      consistency: n.consistency ?? null,
      trend: n.trend ?? null,
      historical: n.historical ?? null,
      keeper: n.keeper ?? null,
      marketConfidence: n.marketConfidence ?? null,
    };
    const { value, effectiveWeights } = weightAndDegrade(components, weights);
    const floored = Math.max(ROSTERED_FLOOR, value);
    out.set(r.p.playerId, {
      playerId: r.p.playerId,
      position: r.p.position,
      phase,
      value: Math.round(floored * 10) / 10,
      compositeValue: Math.round(floored * MARKET_VALUE_COMPOSITE_SCALE),
      components,
      effectiveWeights,
      breakdown: describe(components, effectiveWeights, phase),
    });
  });
  return out;
}

function maxPlayedWeeks(inputs: MarketValueInput[]): number {
  let max = 0;
  for (const p of inputs) max = Math.max(max, p.currentSeasonWeekly.length);
  return max;
}

function blendProduction(level: number | null, cons: number | null): number | null {
  if (level == null) return null;
  if (cons == null) return level;
  return PRODUCTION_LEVEL_SHARE * level + PRODUCTION_CONSISTENCY_SHARE * cons;
}

// ─── Weighting + graceful degradation ────────────────────────────────────────

/**
 * Apply phase weights to present components, redistributing the weight of any
 * ABSENT component across the present ones (so a player with no history/no
 * production isn't dragged to zero). Components with 0 phase-weight (e.g.
 * marketConfidence in v2.0) never contribute, even when present.
 */
function weightAndDegrade(
  c: MarketValueComponents,
  w: PhaseWeights
): { value: number; effectiveWeights: Record<string, number> } {
  const pairs: { key: keyof PhaseWeights; score: number | null; weight: number }[] = [
    { key: "adp", score: c.adp, weight: w.adp },
    { key: "projection", score: c.projection, weight: w.projection },
    { key: "production", score: c.production, weight: w.production },
    { key: "historical", score: c.historical, weight: w.historical },
    { key: "keeper", score: c.keeper, weight: w.keeper },
    { key: "trend", score: c.trend, weight: w.trend },
    { key: "marketConfidence", score: c.marketConfidence, weight: w.marketConfidence },
  ];

  const present = pairs.filter((p) => p.score != null && p.weight > 0);
  const totalWeight = present.reduce((s, p) => s + p.weight, 0);
  const effectiveWeights: Record<string, number> = {};
  if (totalWeight <= 0) {
    // Nothing weighted/present — fall back to a neutral midpoint rather than 0.
    return { value: 50, effectiveWeights };
  }
  let value = 0;
  for (const p of present) {
    const eff = (p.weight / totalWeight) * 100;
    effectiveWeights[p.key] = Math.round(eff * 10) / 10;
    value += (p.score as number) * (p.weight / totalWeight);
  }
  return { value, effectiveWeights };
}

function describe(
  c: MarketValueComponents,
  eff: Record<string, number>,
  phase: ValuationPhase
): string {
  const labels: Record<string, string> = {
    adp: "ADP",
    projection: "Projection",
    production: "Production",
    historical: "Historical",
    keeper: "Keeper",
    trend: "Trend",
    marketConfidence: "Market Confidence",
  };
  const parts: string[] = [];
  const cRec = c as unknown as Record<string, number | null>;
  for (const key of Object.keys(labels)) {
    const score = cRec[key];
    const w = eff[key];
    if (score == null) continue;
    if (key === "marketConfidence") {
      // Shown for context only — not weighted in v2.0.
      parts.push(`${labels[key]}: ${Math.round(score)} (unweighted)`);
    } else if (w != null) {
      parts.push(`${labels[key]}: ${Math.round(score)} @ ${w}%`);
    }
  }
  return `[${phase}] ${parts.join(" | ")}`;
}
