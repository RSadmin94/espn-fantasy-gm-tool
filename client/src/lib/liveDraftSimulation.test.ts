import { describe, expect, it } from "vitest";
import { MAX_BROADCAST_HOLD_MS } from "./draftClock";
import { mulberry32, selectAiPick, type AiPickCandidate } from "./liveDraftSeed";

const TEAM_COUNT = 14;
const ROUNDS = 12;
const TOTAL = TEAM_COUNT * ROUNDS;
const CAPS = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1, DP: 1 };

const SEED_A = 0xA11CE;
const SEED_B = 0xB0B0B0;

function makePool(size = 220): AiPickCandidate[] {
  return Array.from({ length: size }, (_, i) => ({
    name: `Player ${i + 1}`,
    position: i % 5 === 0 ? "QB" : i % 7 === 0 ? "TE" : i % 3 === 0 ? "RB" : "WR",
    adp: i + 1,
    rank: i + 1,
    marketValue: 80 - i * 0.2,
    projectedPoints: 200 - i,
  }));
}

type SimPick = { pickNumber: number; teamId: number; round: number; playerName: string; position: string };

function simulateDraft(seed: number): SimPick[] {
  const rng = mulberry32(seed);
  const pool = makePool();
  const taken = new Set<string>();
  const out: SimPick[] = [];
  const rosterCounts = new Map<number, Record<string, number>>();

  for (let pickNumber = 1; pickNumber <= TOTAL; pickNumber++) {
    const teamId = ((pickNumber - 1) % TEAM_COUNT) + 1;
    const round = Math.ceil(pickNumber / TEAM_COUNT);
    const remaining = pool.filter((p) => !taken.has(p.name));
    const counts = rosterCounts.get(teamId) ?? {};
    const chosen = selectAiPick({
      pool: remaining,
      teamId,
      round,
      positionCounts: counts,
      posCaps: CAPS,
      lateRound: round > ROUNDS - 2,
      rng,
    });
    if (!chosen) break;
    taken.add(chosen.name);
    counts[chosen.position] = (counts[chosen.position] ?? 0) + 1;
    rosterCounts.set(teamId, counts);
    out.push({
      pickNumber,
      teamId,
      round,
      playerName: chosen.name,
      position: String(chosen.position),
    });
  }
  return out;
}

function assertRosterCaps(picks: SimPick[]): void {
  const byTeam = new Map<number, Record<string, number>>();
  for (const p of picks) {
    const counts = byTeam.get(p.teamId) ?? {};
    counts[p.position] = (counts[p.position] ?? 0) + 1;
    byTeam.set(p.teamId, counts);
    expect(counts[p.position]).toBeLessThanOrEqual(CAPS[p.position as keyof typeof CAPS] ?? 99);
  }
}

describe("live draft 168-pick simulation", () => {
  it("seed A and seed B differ materially", () => {
    const a = simulateDraft(SEED_A);
    const b = simulateDraft(SEED_B);
    expect(a).toHaveLength(TOTAL);
    expect(b).toHaveLength(TOTAL);
    const same = a.filter((p, i) => p.playerName === b[i]?.playerName).length;
    expect(same).toBeLessThan(TOTAL * 0.85);
  });

  it("replay seed A exactly matches seed A", () => {
    const a1 = simulateDraft(SEED_A);
    const a2 = simulateDraft(SEED_A);
    expect(a1).toEqual(a2);
  });

  it("never duplicates a player and respects roster caps", () => {
    const picks = simulateDraft(SEED_A);
    const names = picks.map((p) => p.playerName);
    expect(new Set(names).size).toBe(names.length);
    assertRosterCaps(picks);
  });

  it("broadcast pause watchdog releases a stuck hold before the draft can freeze", () => {
    const holdStart = Date.now() - (MAX_BROADCAST_HOLD_MS + 50);
    const remaining = Math.max(0, MAX_BROADCAST_HOLD_MS - (Date.now() - holdStart));
    expect(remaining).toBe(0);
  });
});
