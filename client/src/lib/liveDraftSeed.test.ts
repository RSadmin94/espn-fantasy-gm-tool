import { describe, expect, it } from "vitest";
import {
  createRandomDraftSeed,
  formatDraftSeed,
  mulberry32,
  parseDraftSeed,
  selectAiPick,
  type AiPickCandidate,
} from "./liveDraftSeed";

const caps = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1, DP: 1 };

function pool(): AiPickCandidate[] {
  return Array.from({ length: 20 }, (_, i) => ({
    name: `Player ${i + 1}`,
    position: i < 8 ? "RB" : "WR",
    adp: i + 1,
    marketValue: 50 - i,
  }));
}

function runDraft(seed: number, picks = 24): string[] {
  const rng = mulberry32(seed);
  const taken = new Set<string>();
  const out: string[] = [];
  for (let pick = 1; pick <= picks; pick++) {
    const remaining = pool().filter((p) => !taken.has(p.name));
    const counts: Record<string, number> = {};
    for (const n of out) {
      const pos = pool().find((p) => p.name === n)?.position ?? "WR";
      counts[pos] = (counts[pos] ?? 0) + 1;
    }
    const chosen = selectAiPick({
      pool: remaining,
      teamId: ((pick - 1) % 14) + 1,
      round: Math.ceil(pick / 14),
      positionCounts: counts,
      posCaps: caps,
      lateRound: pick > 20,
      rng,
    });
    if (!chosen) break;
    taken.add(chosen.name);
    out.push(chosen.name);
  }
  return out;
}

describe("liveDraftSeed", () => {
  it("same explicit seed produces identical draft", () => {
    const a = runDraft(42_001);
    const b = runDraft(42_001);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it("different seeds produce materially different picks", () => {
    const a = runDraft(1001);
    const b = runDraft(9001);
    const same = a.filter((p, i) => p === b[i]).length;
    expect(same).toBeLessThan(a.length * 0.85);
  });

  it("format and parse round-trip", () => {
    const seed = 1_234_567;
    const fmt = formatDraftSeed(seed);
    expect(parseDraftSeed(fmt)).toBe(seed);
  });

  it("createRandomDraftSeed returns positive integers", () => {
    expect(createRandomDraftSeed()).toBeGreaterThan(0);
  });

  it("respects position caps", () => {
    const rng = mulberry32(99);
    const counts = { RB: 6, WR: 0 };
    const pick = selectAiPick({
      pool: pool(),
      teamId: 1,
      round: 8,
      positionCounts: counts,
      posCaps: caps,
      lateRound: false,
      rng,
    });
    expect(pick?.position).not.toBe("RB");
  });
});
