/**
 * RFSN-031 — Durable last-good offense ADP acceptance tests.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  __forceExpireEspnPlayerInfoCacheForTests,
  __resetEspnPlayerInfoCacheForTests,
  __setEspnOffenseFetchForTests,
  getEspnOffenseAdpSource,
  getEspnPlayerInfoMap,
  isEspnOffenseAdpDegraded,
  shouldPersistEspnOffenseCache,
} from "./playerStatsRouter";
import {
  __setEspnOffenseAdpDurableDriverForTests,
  createMemoryEspnOffenseAdpDurableDriver,
} from "./espnOffenseAdpDurableStore";

afterEach(() => {
  __setEspnOffenseFetchForTests(null);
  __setEspnOffenseAdpDurableDriverForTests(null);
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

describe("RFSN-031 durable offense ADP", () => {
  it("1: warm durable, cold memory, ESPN offense empty → serves durable last-good", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    const calendarYear = new Date().getFullYear();
    await mem.save(
      calendarYear,
      new Map([
        ["4426387", { adp: 1.2, projection: 300, percentStarted: 99 }], // Chase
        ["3929630", { adp: 2.1, projection: 280, percentStarted: 98 }], // CMC-ish
        ["3116406", { adp: 169.7, projection: 40, percentStarted: 5 }], // Bellore-ish
      ]),
    );
    __setEspnOffenseAdpDurableDriverForTests(mem);
    __setEspnOffenseFetchForTests(async () => []);

    const map = await getEspnPlayerInfoMap();
    expect(map.get("4426387")?.adp).toBe(1.2);
    expect(map.get("3116406")?.adp).toBe(169.7);
    expect(map.get("4426387")!.adp!).toBeLessThan(map.get("3116406")!.adp!);
    expect(getEspnOffenseAdpSource()).toBe("durable");
    expect(isEspnOffenseAdpDegraded()).toBe(true);
  });

  it("2: DP-only/empty live feed does not overwrite good durable offense", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    const calendarYear = new Date().getFullYear();
    __setEspnOffenseAdpDurableDriverForTests(mem);

    __setEspnOffenseFetchForTests(async () => [fakeEntry("111", 1.5)]);
    await getEspnPlayerInfoMap();
    expect(mem.store.get(calendarYear)?.get("111")?.adp).toBe(1.5);

    __resetEspnPlayerInfoCacheForTests();
    __setEspnOffenseFetchForTests(async () => []); // empty / DP-only offense
    const after = await getEspnPlayerInfoMap();
    expect(after.get("111")?.adp).toBe(1.5);
    expect(mem.store.get(calendarYear)?.size).toBe(1);
    expect(shouldPersistEspnOffenseCache(0)).toBe(false);
  });

  it("3: non-empty live offense feed write-through; cold start seeds from durable", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    const calendarYear = new Date().getFullYear();
    __setEspnOffenseAdpDurableDriverForTests(mem);

    __setEspnOffenseFetchForTests(async (year) => {
      if (year === calendarYear) return [fakeEntry("555", 4.4), fakeEntry("556", 5.5)];
      return [];
    });
    const live = await getEspnPlayerInfoMap();
    expect(live.size).toBe(2);
    expect(getEspnOffenseAdpSource()).toBe("live");
    expect(isEspnOffenseAdpDegraded()).toBe(false);

    // Allow async write-through
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(mem.store.get(calendarYear)?.get("555")?.adp).toBe(4.4);

    __resetEspnPlayerInfoCacheForTests();
    __setEspnOffenseFetchForTests(async () => []);
    const cold = await getEspnPlayerInfoMap();
    expect(cold.get("555")?.adp).toBe(4.4);
    expect(getEspnOffenseAdpSource()).toBe("durable");
  });

  it("4: no durable + ESPN empty → empty degraded, does not crash", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    __setEspnOffenseAdpDurableDriverForTests(mem);
    __setEspnOffenseFetchForTests(async () => []);

    const map = await getEspnPlayerInfoMap();
    expect(map.size).toBe(0);
    expect(getEspnOffenseAdpSource()).toBe("empty");
    expect(isEspnOffenseAdpDegraded()).toBe(true);
  });

  it("5: retry — first empty then good yields real ADP", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    __setEspnOffenseAdpDurableDriverForTests(mem);
    const calendarYear = new Date().getFullYear();
    let calls = 0;
    __setEspnOffenseFetchForTests(async (year) => {
      if (year !== calendarYear) return [];
      calls += 1;
      if (calls === 1) return [];
      return [fakeEntry("777", 7.7)];
    });

    const map = await getEspnPlayerInfoMap();
    expect(map.get("777")?.adp).toBe(7.7);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(getEspnOffenseAdpSource()).toBe("live");
  });

  it("6: healthy feed regression — real ADP ordered, not overwritten by empty", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    __setEspnOffenseAdpDurableDriverForTests(mem);
    const calendarYear = new Date().getFullYear();
    __setEspnOffenseFetchForTests(async (year) => {
      if (year !== calendarYear) return [];
      return [
        fakeEntry("chase", 1.1),
        fakeEntry("allen", 2.2),
        fakeEntry("cmc", 3.3),
        fakeEntry("bellore", 169.7),
      ];
    });
    const map = await getEspnPlayerInfoMap();
    expect(map.get("chase")?.adp).toBe(1.1);
    expect(map.get("bellore")?.adp).toBe(169.7);
    expect(map.get("chase")!.adp!).toBeLessThan(map.get("bellore")!.adp!);

    __forceExpireEspnPlayerInfoCacheForTests();
    __setEspnOffenseFetchForTests(async () => []);
    const after = await getEspnPlayerInfoMap();
    expect(after.get("chase")?.adp).toBe(1.1);
    expect(after.get("bellore")?.adp).toBe(169.7);
  });
});
