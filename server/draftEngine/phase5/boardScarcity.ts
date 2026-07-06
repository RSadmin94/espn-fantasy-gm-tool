/**
 * Precomputed per-position scarcity — avoids scanning the full board each candidate.
 */

import { normalizePosition } from "../phase1/types";
import type { ScarcityByPos } from "../phase3/driveFeatures";
import type { SimPlayer } from "./weather";

export function buildScarcityByPos(available: SimPlayer[]): ScarcityByPos {
  const acc = new Map<string, { avail: number; t12: number }>();
  for (const p of available) {
    const pos = normalizePosition(p.position);
    const cur = acc.get(pos) ?? { avail: 0, t12: 0 };
    cur.avail += 1;
    if (p.tier === "T1" || p.tier === "T2") cur.t12 += 1;
    acc.set(pos, cur);
  }
  const out: ScarcityByPos = new Map();
  for (const [pos, v] of acc) {
    out.set(pos, { availCount: v.avail, tier12Remaining: v.t12 });
  }
  return out;
}
