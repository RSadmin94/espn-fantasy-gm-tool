import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  __forceExpireEspnPlayerInfoCacheForTests,
  __resetEspnPlayerInfoCacheForTests,
  __setEspnOffenseFetchForTests,
  espnOffenseSeasonsToTry,
  getEspnPlayerInfoMap,
  shouldPersistEspnOffenseCache,
} from "./playerStatsRouter";
import {
  FALLBACK_ADP_CEILING,
  FALLBACK_ADP_FLOOR,
  HEALTHY_OFFENSE_SKILL_FLOOR,
  SKILL_STARVED_MAX_OFFENSE_SKILL,
  SKILL_STARVED_MIN_DP,
  buildSkillStarvationSoftIncludes,
  countDpPlayers,
  countOffenseSkillPlayers,
  fallbackAdpForEspnPlayerId,
  isSkillStarvedMergedPool,
} from "./mockDraftPoolResilience";
import { selectAiPick } from "../client/src/lib/liveDraftSeed";

afterEach(() => {
  __setEspnOffenseFetchForTests(null);
  __resetEspnPlayerInfoCacheForTests();
});

function fakeEntry(id: string, adp: number) {
  return {
    id,
    player: {
      ownership: { averageDraftPosition: adp, percentStarted: 50 },
      stats: [],
    },
  };
}

describe("ESPN offense feed — season fallback + cache safety", () => {
  it("C: tries requested season then season − 1", () => {
    expect(espnOffenseSeasonsToTry(2026)).toEqual([2026, 2025]);
    expect(espnOffenseSeasonsToTry(2025)).toEqual([2025, 2024]);
  });

  it("A/B: empty offense is not persisted; non-empty is", () => {
    expect(shouldPersistEspnOffenseCache(0)).toBe(false);
    expect(shouldPersistEspnOffenseCache(new Map().size)).toBe(false);
    expect(shouldPersistEspnOffenseCache(1025)).toBe(true);
  });

  it("A: empty offense result is not written into the process cache", async () => {
    let calls = 0;
    __setEspnOffenseFetchForTests(async () => {
      calls += 1;
      return [];
    });
    const first = await getEspnPlayerInfoMap();
    expect(first.size).toBe(0);
    // Second call must re-fetch (empty was not TTL-cached).
    const second = await getEspnPlayerInfoMap();
    expect(second.size).toBe(0);
    expect(calls).toBeGreaterThanOrEqual(4); // 2 seasons × 2 attempts
  });

  it("B: non-empty offense result is cached across subsequent calls", async () => {
    let calls = 0;
    __setEspnOffenseFetchForTests(async (year) => {
      calls += 1;
      if (year === new Date().getFullYear()) return [fakeEntry("111", 1.5)];
      return [];
    });
    const first = await getEspnPlayerInfoMap();
    expect(first.size).toBe(1);
    expect(first.get("111")?.adp).toBe(1.5);
    const second = await getEspnPlayerInfoMap();
    expect(second.get("111")?.adp).toBe(1.5);
    expect(calls).toBe(1); // served from TTL cache
  });

  it("D: empty requested season + non-empty prior season returns prior-season map", async () => {
    const yearsTried: number[] = [];
    const calendarYear = new Date().getFullYear();
    __setEspnOffenseFetchForTests(async (year) => {
      yearsTried.push(year);
      if (year === calendarYear) return [];
      if (year === calendarYear - 1) return [fakeEntry("222", 12.3)];
      return [];
    });
    const map = await getEspnPlayerInfoMap();
    expect(yearsTried[0]).toBe(calendarYear);
    expect(yearsTried).toContain(calendarYear - 1);
    expect(map.size).toBe(1);
    expect(map.get("222")?.adp).toBe(12.3);
  });

  it("E: failed requested season + successful prior season returns prior-season map", async () => {
    const calendarYear = new Date().getFullYear();
    __setEspnOffenseFetchForTests(async (year) => {
      if (year === calendarYear) throw new Error("boom");
      return [fakeEntry("333", 8.1)];
    });
    const map = await getEspnPlayerInfoMap();
    expect(map.get("333")?.adp).toBe(8.1);
  });

  it("F: existing valid non-empty cache is not overwritten by an empty fetch", async () => {
    __setEspnOffenseFetchForTests(async () => [fakeEntry("444", 3.2)]);
    const warm = await getEspnPlayerInfoMap();
    expect(warm.get("444")?.adp).toBe(3.2);

    __forceExpireEspnPlayerInfoCacheForTests();
    __setEspnOffenseFetchForTests(async () => []);
    const afterEmpty = await getEspnPlayerInfoMap();
    expect(afterEmpty.get("444")?.adp).toBe(3.2);
    expect(afterEmpty.size).toBe(1);
  });
});

describe("Skill-starvation soft-include", () => {
  const IDP_POSITIONS = new Set(["DL", "LB", "DB", "S", "CB", "DE", "DT"]);
  const normalizeDraftPos = (pos: string) => (IDP_POSITIONS.has(pos) ? "DP" : pos);

  it("exposes the explicit starvation threshold (≤2 skill + ≥40 DP)", () => {
    expect(SKILL_STARVED_MAX_OFFENSE_SKILL).toBe(2);
    expect(SKILL_STARVED_MIN_DP).toBe(40);
    expect(HEALTHY_OFFENSE_SKILL_FLOOR).toBeGreaterThan(SKILL_STARVED_MAX_OFFENSE_SKILL);
  });

  it("gate-1: ≤2/≥40 is the offense-missing band — healthy IDP-heavy boards never fire", () => {
    // Legitimate IDP / dynasty shape when offense feed is healthy: lots of skill + lots of DP.
    const idpHeavyHealthy = [
      ...Array.from({ length: HEALTHY_OFFENSE_SKILL_FLOOR }, (_, i) => ({
        position: (["QB", "RB", "WR", "TE"] as const)[i % 4]!,
      })),
      ...Array.from({ length: 150 }, () => ({ position: "DP" })),
    ];
    expect(countOffenseSkillPlayers(idpHeavyHealthy)).toBe(HEALTHY_OFFENSE_SKILL_FLOOR);
    expect(countDpPlayers(idpHeavyHealthy)).toBe(150);
    expect(isSkillStarvedMergedPool(idpHeavyHealthy)).toBe(false);

    // Mid-band alternatives (5/30, 10/50) would still be false for healthy boards —
    // we stay at ≤2 for specificity: only the proven empty-offense contamination band.
    const midFalsePositiveRisk = [
      ...Array.from({ length: 8 }, () => ({ position: "RB" })),
      ...Array.from({ length: 35 }, () => ({ position: "DP" })),
    ];
    expect(isSkillStarvedMergedPool(midFalsePositiveRisk)).toBe(false);

    // Proven failure shape still fires.
    const failure = [
      ...Array.from({ length: 143 }, () => ({ position: "DP" })),
      { position: "RB" },
      { position: "WR" },
    ];
    expect(isSkillStarvedMergedPool(failure)).toBe(true);
  });

  it("G/H: empty offense + populated IDP activates fallback across QB/RB/WR/TE/K", () => {
    const merged = Array.from({ length: 143 }, (_, i) => ({
      name: `Defender ${i}`,
      position: "DP",
      espnId: String(9000 + i),
    })).concat([
      { name: "Nick Bellore", position: "RB", espnId: "15971" },
      { name: "Lonely WR", position: "WR", espnId: "2" },
    ]);
    expect(countOffenseSkillPlayers(merged)).toBe(2);
    expect(isSkillStarvedMergedPool(merged)).toBe(true);

    const seen = new Set(merged.map((p) => p.name.toLowerCase()));
    const reg = [
      { fullName: "Elite QB", position: "QB", espnPlayerId: "101" },
      { fullName: "Elite RB", position: "RB", espnPlayerId: "102" },
      { fullName: "Elite WR", position: "WR", espnPlayerId: "103" },
      { fullName: "Elite TE", position: "TE", espnPlayerId: "104" },
      { fullName: "Elite K", position: "K", espnPlayerId: "105" },
      { fullName: "Defender 0", position: "DL", espnPlayerId: "9000" },
      { fullName: "Another DL", position: "DL", espnPlayerId: "9999" },
    ];
    const soft = buildSkillStarvationSoftIncludes(reg, seen, normalizeDraftPos);
    const positions = new Set(soft.map((p) => p.position));
    expect(positions.has("QB")).toBe(true);
    expect(positions.has("RB")).toBe(true);
    expect(positions.has("WR")).toBe(true);
    expect(positions.has("TE")).toBe(true);
    expect(positions.has("K")).toBe(true);
    expect(soft.some((p) => p.position === "DP")).toBe(false);
    expect(soft.length).toBeGreaterThanOrEqual(5);
  });

  it("I: healthy offense map does not activate the fallback", () => {
    const healthy = [
      ...Array.from({ length: 100 }, (_, i) => ({ position: i % 2 ? "RB" : "WR" })),
      ...Array.from({ length: 50 }, () => ({ position: "DP" })),
    ];
    expect(countOffenseSkillPlayers(healthy)).toBeGreaterThan(SKILL_STARVED_MAX_OFFENSE_SKILL);
    expect(isSkillStarvedMergedPool(healthy)).toBe(false);
  });

  it("J: healthy pool retains ESPN-backed elite ADP ahead of soft-include floor", () => {
    const elite = [
      { name: "Jahmyr Gibbs", position: "RB", adp: 1.91 },
      { name: "Ja'Marr Chase", position: "WR", adp: 4.64 },
    ];
    expect(isSkillStarvedMergedPool([
      ...elite,
      ...Array.from({ length: 200 }, () => ({ position: "RB" })),
      ...Array.from({ length: 50 }, () => ({ position: "DP" })),
    ])).toBe(false);
    expect(FALLBACK_ADP_FLOOR).toBeGreaterThan(elite[0]!.adp);
    expect(FALLBACK_ADP_FLOOR).toBeGreaterThan(elite[1]!.adp);
  });

  it("gate-2: healthy drafts never soft-include — fallback ADP cannot enter the candidate band", () => {
    // Live-shaped healthy board: many real-ADP skill players below the fallback floor.
    const healthy: Array<{ name: string; position: string; adp: number }> = [];
    for (let i = 0; i < 180; i++) {
      healthy.push({
        name: `Skill ${i}`,
        position: (["QB", "RB", "WR", "TE"] as const)[i % 4]!,
        adp: 1 + i * 0.9, // 1 .. ~162
      });
    }
    for (let i = 0; i < 100; i++) {
      healthy.push({ name: `DP ${i}`, position: "DP", adp: 50 + i });
    }
    expect(isSkillStarvedMergedPool(healthy)).toBe(false);

    // Soft-include does not run on a healthy board (primary invariant).
    // Secondary: even if wrongly merged, early selectAiPick stays on real ADP (< floor).
    const rogueSoft = buildSkillStarvationSoftIncludes(
      [
        { fullName: "Fallback RB", position: "RB", espnPlayerId: "900001" },
        { fullName: "Fallback WR", position: "WR", espnPlayerId: "900002" },
      ],
      new Set(),
    );
    expect(Math.min(...rogueSoft.map((p) => p.adp))).toBeGreaterThanOrEqual(FALLBACK_ADP_FLOOR);

    const wronglyMerged = [...healthy, ...rogueSoft];
    for (let i = 0; i < 100; i++) {
      const skillBelowFloor = wronglyMerged.filter(
        (p) => p.position !== "DP" && p.adp < FALLBACK_ADP_FLOOR,
      );
      if (skillBelowFloor.length === 0) break;
      const chosen = selectAiPick({
        pool: wronglyMerged,
        teamId: 1,
        round: 1,
        positionCounts: {},
        posCaps: { QB: 3, RB: 8, WR: 8, TE: 3, K: 1, DEF: 0, DP: 2 },
        lateRound: false,
        rng: () => 0,
      });
      expect(chosen).not.toBeNull();
      expect(Number(chosen!.adp)).toBeLessThan(FALLBACK_ADP_FLOOR);
      const idx = wronglyMerged.findIndex((p) => p.name === chosen!.name);
      expect(idx).toBeGreaterThanOrEqual(0);
      wronglyMerged.splice(idx, 1);
    }
  });

  it("K: fallback ADP is espnId-stable and cannot place a fringe player at 1.01", () => {
    const a = fallbackAdpForEspnPlayerId("4429795");
    const b = fallbackAdpForEspnPlayerId("4429795");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(FALLBACK_ADP_FLOOR);
    expect(a).toBeLessThanOrEqual(FALLBACK_ADP_CEILING);

    // Registry walk order must not change ADP for the same espnId.
    const regA = [
      { fullName: "B Player", position: "RB", espnPlayerId: "500" },
      { fullName: "A Player", position: "WR", espnPlayerId: "100" },
    ];
    const regB = [...regA].reverse();
    const softA = buildSkillStarvationSoftIncludes(regA, new Set());
    const softB = buildSkillStarvationSoftIncludes(regB, new Set());
    const adpByIdA = Object.fromEntries(softA.map((p) => [p.espnId, p.adp]));
    const adpByIdB = Object.fromEntries(softB.map((p) => [p.espnId, p.adp]));
    expect(adpByIdA).toEqual(adpByIdB);
    expect(Math.min(...softA.map((p) => p.adp))).toBeGreaterThan(60);

    expect(fallbackAdpForEspnPlayerId("")).toBeGreaterThanOrEqual(FALLBACK_ADP_FLOOR);
    expect(fallbackAdpForEspnPlayerId("not-a-number")).toBeGreaterThanOrEqual(FALLBACK_ADP_FLOOR);
  });

  it("gate-3: soft-include list order is espnId-sorted; ADP ignores SQL/registry shuffle", () => {
    const shuffled = [
      { fullName: "Zed", position: "QB", espnPlayerId: "300" },
      { fullName: "Ann", position: "RB", espnPlayerId: "100" },
      { fullName: "Mo", position: "WR", espnPlayerId: "200" },
    ];
    const soft = buildSkillStarvationSoftIncludes(shuffled, new Set());
    expect(soft.map((p) => p.espnId)).toEqual(["100", "200", "300"]);
    expect(soft.map((p) => p.adp)).toEqual([
      fallbackAdpForEspnPlayerId("100"),
      fallbackAdpForEspnPlayerId("200"),
      fallbackAdpForEspnPlayerId("300"),
    ]);
  });

  it("empty merged pool (both feeds unavailable) also activates soft-include", () => {
    expect(isSkillStarvedMergedPool([])).toBe(true);
    const soft = buildSkillStarvationSoftIncludes(
      [
        { fullName: "QB One", position: "QB", espnPlayerId: "1" },
        { fullName: "RB One", position: "RB", espnPlayerId: "2" },
      ],
      new Set(),
    );
    expect(soft).toHaveLength(2);
  });
});

describe("Lifecycle documentation + untouched selection surface", () => {
  it("L: New Random Draft still only reseeds — does not rebuild availablePool", () => {
    const src = readFileSync(resolve(__dirname, "../client/src/pages/DraftWarRoom.tsx"), "utf8");
    const start = src.indexOf("function newRandomDraft");
    const end = src.indexOf("function replayCurrentSeed");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fn = src.slice(start, end);
    expect(fn).toMatch(/createRandomDraftSeed/);
    expect(fn).toMatch(/reset\(/);
    expect(fn).not.toMatch(/refetch|getDraftWarRoomData|availablePool\s*=/);
  });

  it("M: selectAiPick candidate / late-round DP gate unchanged (no ordering redesign)", () => {
    const pool = [
      { name: "Gibbs", position: "RB", adp: 1.9 },
      { name: "Chase", position: "WR", adp: 4.6 },
      { name: "Early DP", position: "DP", adp: 2.0 },
    ];
    const pick = selectAiPick({
      pool,
      teamId: 1,
      round: 1,
      positionCounts: {},
      posCaps: { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 0, DP: 1 },
      lateRound: false,
      rng: () => 0,
    });
    expect(pick?.name).toBe("Gibbs");
    expect(pick?.position).not.toBe("DP");
  });
});
