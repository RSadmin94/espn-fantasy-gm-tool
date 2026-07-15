/**
 * Phase 5 - data-driven position timing.
 * Learns, per roster position, WHEN it is historically drafted (round mean/sd/min/max)
 * from the league's own draft history, and exposes a smooth 0..1 "draftability" ramp
 * around that window. Replaces the hardcoded K/DP/DST round gate in moment.ts so the
 * late-roster slots spread across their real historical window instead of a robotic wall.
 * Pure + isolated: depends only on the position normalizer (no rosterConstruction import,
 * so rosterConstruction can consume the ramp without a circular dependency).
 */
import { normalizePosition } from "../phase1/types";
import type { RosterPosition } from "./leagueRosterRules";

// Local roster-position mapper (mirrors rosterConstruction.simPositionToRosterPos) kept here so
// this module stays dependency-free of rosterConstruction and can be imported by it.
const IDP_POSITIONS = new Set(["DL", "LB", "DB", "S", "CB", "DE", "DT", "DP"]);
function toRosterPos(pos: string): RosterPosition | null {
  const p = normalizePosition(pos);
  if (p === "K") return "K";
  if (p === "DST") return "DST";
  if (IDP_POSITIONS.has(p)) return "DP";
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE") return p;
  return null;
}

export type PositionTiming = { mean: number; sd: number; min: number; max: number; n: number };
export type PositionTimingProfile = Partial<Record<RosterPosition, PositionTiming>>;

const MIN_TIMING_SAMPLES = 6;
const MIN_SD = 0.8;

// League-agnostic fallback windows for the late slots when a league lacks enough history.
// Anchored to league 457622's observed history (K R7-16, IDP/DP R3-14, D/ST wide).
export const DEFAULT_LATE_TIMING: Record<"K" | "DP" | "DST", PositionTiming> = {
  K: { mean: 12.3, sd: 2.1, min: 7, max: 16, n: 0 },
  DP: { mean: 10.8, sd: 2.7, min: 3, max: 14, n: 0 },
  DST: { mean: 9.8, sd: 3.8, min: 3, max: 16, n: 0 },
};

export function buildPositionTimingProfile(
  rows: Array<{ position: string; round: number }>,
): PositionTimingProfile {
  const byPos = new Map<RosterPosition, number[]>();
  for (const r of rows) {
    const pos = toRosterPos(r.position);
    if (!pos) continue;
    if (!Number.isFinite(r.round) || r.round <= 0) continue;
    const arr = byPos.get(pos) ?? [];
    arr.push(r.round);
    byPos.set(pos, arr);
  }

  const out: PositionTimingProfile = {};
  for (const [pos, arr] of byPos) {
    const n = arr.length;
    if (n === 0) continue;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.max(Math.sqrt(variance), MIN_SD);
    out[pos] = { mean, sd, min: Math.min(...arr), max: Math.max(...arr), n };
  }

  // Backfill the late slots from defaults when the league's own history is too thin.
  for (const pos of ["K", "DP", "DST"] as Array<"K" | "DP" | "DST">) {
    const cur = out[pos];
    if (!cur || cur.n < MIN_TIMING_SAMPLES) {
      out[pos] = cur && cur.n > 0
        ? { ...DEFAULT_LATE_TIMING[pos], mean: (cur.mean + DEFAULT_LATE_TIMING[pos].mean) / 2, n: cur.n }
        : DEFAULT_LATE_TIMING[pos];
    }
  }
  return out;
}

/**
 * Smooth 0..1 readiness ramp for a position at a given round.
 * ~0 well before the historical mean, 0.5 near it, ~1 after. `earliness` shifts the
 * midpoint earlier (in rounds) so a position can start appearing before its mean.
 */
export function timingDraftability(
  timing: PositionTiming | undefined,
  round: number,
  earliness = 1.0,
): number {
  if (!timing) return 0;
  const mid = timing.mean - (earliness - 1);
  const spread = Math.max(timing.sd, MIN_SD);
  const z = (round - mid) / spread;
  // Gentle logistic slope (1.2): a wider transition band so late slots spread across more rounds
  // (closer to their historical sd) rather than snapping in over a single round.
  const d = 1 / (1 + Math.exp(-1.2 * z));
  return d < 0 ? 0 : d > 1 ? 1 : d;
}
