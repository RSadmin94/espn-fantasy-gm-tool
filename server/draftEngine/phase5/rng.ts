/**
 * Phase 5 — mulberry32 PRNG for stochastic but reproducible drafts.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gumbelNoise(rng: Rng): number {
  const u = Math.max(1e-10, Math.min(1 - 1e-10, rng()));
  return -Math.log(-Math.log(u));
}
