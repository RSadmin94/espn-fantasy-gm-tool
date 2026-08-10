import { afterEach, describe, expect, it } from "vitest";
import {
  __setEspnOffenseAdpDurableDriverForTests,
  createMemoryEspnOffenseAdpDurableDriver,
} from "./espnOffenseAdpDurableStore";
import {
  __resetSameSeasonEspnOffenseMemoryForTests,
  __setSameSeasonEspnOffenseFetchForTests,
  ensureSameSeasonEspnOffenseAdp,
} from "./espnOffenseAdpSameSeason";

afterEach(() => {
  __setSameSeasonEspnOffenseFetchForTests(null);
  __resetSameSeasonEspnOffenseMemoryForTests();
  __setEspnOffenseAdpDurableDriverForTests(null);
});

function eliteBoard(year: number) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: 1000 + i,
    player: { ownership: { averageDraftPosition: i + 1 } },
  }));
}

describe("ensureSameSeasonEspnOffenseAdp", () => {
  it("persists a healthy exact-season feed and does not fetch another year", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    __setEspnOffenseAdpDurableDriverForTests(mem);
    const fetched: number[] = [];
    __setSameSeasonEspnOffenseFetchForTests(async (year) => {
      fetched.push(year);
      return year === 2024 ? eliteBoard(year) : [];
    });

    const map = await ensureSameSeasonEspnOffenseAdp(2024);
    expect(fetched).toEqual([2024]);
    expect(map?.get("1000")?.adp).toBe(1);
    expect(mem.store.get(2024)?.get("1000")?.adp).toBe(1);

    fetched.length = 0;
    const again = await ensureSameSeasonEspnOffenseAdp(2024);
    expect(fetched).toEqual([]);
    expect(again?.get("1003")?.adp).toBe(4);
  });

  it("does not persist sentinel ADP or fall back to another season", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    __setEspnOffenseAdpDurableDriverForTests(mem);
    __setSameSeasonEspnOffenseFetchForTests(async (year) => {
      if (year === 2025) {
        return Array.from({ length: 80 }, (_, i) => ({
          id: 2000 + i,
          player: { ownership: { averageDraftPosition: 170 } },
        }));
      }
      return eliteBoard(year);
    });

    const map = await ensureSameSeasonEspnOffenseAdp(2025);
    expect(map).toBeNull();
    expect(mem.store.has(2025)).toBe(false);
    expect(mem.store.has(2024)).toBe(false);
  });
});
