/**
 * Seeded variation for Live Draft AI picks — deterministic when seed is fixed,
 * fresh randomness on each new draft. Does not bypass ADP caps, position limits,
 * or roster-need filtering; only breaks ties among eligible candidates.
 */

export type LiveDraftRng = () => number;

/** Mulberry32 — fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): LiveDraftRng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeedString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRandomDraftSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! || Date.now();
  }
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

export function formatDraftSeed(seed: number): string {
  return seed.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

export function parseDraftSeed(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 36);
  return Number.isFinite(n) && n > 0 ? n >>> 0 : null;
}

export type AiPickCandidate = {
  name: string;
  position: string;
  adp?: number | null;
  rank?: number | null;
  projectedPoints?: number | null;
  marketValue?: number | null;
  [key: string]: unknown;
};

export type SelectAiPickInput<T extends AiPickCandidate> = {
  pool: readonly T[];
  teamId: number;
  round: number;
  positionCounts: Readonly<Record<string, number>>;
  posCaps: Readonly<Record<string, number>>;
  lateRound: boolean;
  rng: LiveDraftRng;
  /** Top-N ADP window to consider (default 6). */
  windowSize?: number;
};

function byAdp(p: AiPickCandidate): number {
  return p.adp != null ? Number(p.adp) : (p.rank ?? 9999);
}

function eligible<T extends AiPickCandidate>(
  pool: readonly T[],
  input: Omit<SelectAiPickInput<T>, "pool" | "rng" | "windowSize">,
): T[] {
  return pool.filter((p) => {
    if ((p.position === "K" || p.position === "DEF" || p.position === "DP") && !input.lateRound) {
      return false;
    }
    if ((input.positionCounts[p.position] ?? 0) >= (input.posCaps[p.position] ?? 99)) {
      return false;
    }
    return true;
  });
}

/**
 * Pick among the top ADP-eligible window with seeded weights — need positions
 * get a modest boost without overriding ADP order entirely.
 */
export function selectAiPick<T extends AiPickCandidate>(input: SelectAiPickInput<T>): T | null {
  const sorted = [...eligible(input.pool, input)].sort((a, b) => byAdp(a) - byAdp(b));
  if (sorted.length === 0) return null;

  const window = sorted.slice(0, Math.max(1, input.windowSize ?? 6));
  if (window.length === 1) return window[0]!;

  const needBoost = (pos: string) => {
    const have = input.positionCounts[pos] ?? 0;
    const cap = input.posCaps[pos] ?? 99;
    if (cap <= 0) return 0;
    const fill = have / cap;
    return fill < 0.5 ? 1.35 : fill < 0.75 ? 1.15 : 1;
  };

  const weights = window.map((p, i) => {
    const adpWeight = 1 / (1 + i * 0.55);
    const need = needBoost(String(p.position ?? ""));
    const value = p.marketValue != null ? 1 + Math.min(0.25, Number(p.marketValue) / 400) : 1;
    return adpWeight * need * value;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = input.rng() * total;
  for (let i = 0; i < window.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return window[i]!;
  }
  return window[window.length - 1]!;
}
