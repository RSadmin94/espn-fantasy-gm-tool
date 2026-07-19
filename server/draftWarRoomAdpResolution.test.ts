/**
 * Draft War Room ADP resolution — undrafted-sentinel ~170 must not masquerade as real ADP.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetEspnPlayerInfoCacheForTests,
  __setEspnOffenseFetchForTests,
  countEspnOffenseEliteAdp,
  getEspnPlayerInfoMap,
  nullEspnOffenseAdps,
  shouldPersistEspnOffenseCache,
} from "./playerStatsRouter";
import {
  __setEspnOffenseAdpDurableDriverForTests,
  createMemoryEspnOffenseAdpDurableDriver,
} from "./espnOffenseAdpDurableStore";
import { formatLiveDraftPoolAdp, formatLiveDraftValueVsMarket } from "../client/src/lib/liveDraftUx";
import {
  compareLiveDraftAdpOrdering,
  isLiveDraftRealAdp,
} from "../client/src/lib/liveDraftPoolPresentation";
import { buildSkillStarvationSoftIncludes } from "./mockDraftPoolResilience";

afterEach(() => {
  __setEspnOffenseFetchForTests(null);
  __setEspnOffenseAdpDurableDriverForTests(null);
  __resetEspnPlayerInfoCacheForTests();
});

const CHASE_ID = "4426387";
const DANIELS_ID = "4430807"; // approximate; tests use string keys we control
const BARKLEY_ID = "3929630";
const BELLORE_ID = "3116406";

function fakeEntry(id: string, adp: number | null) {
  return {
    id,
    player: {
      ownership: {
        averageDraftPosition: adp == null ? undefined : adp,
        percentStarted: 50,
      },
      stats: [],
    },
  };
}

function sentinelOffenseFeed() {
  // Full-looking offense list, all parked at ESPN undrafted sentinel ~170.
  return [
    fakeEntry(CHASE_ID, 170),
    fakeEntry(DANIELS_ID, 170),
    fakeEntry(BARKLEY_ID, 170),
    fakeEntry(BELLORE_ID, 169.7),
    ...Array.from({ length: 200 }, (_, i) => fakeEntry(String(10_000 + i), 170)),
  ];
}

function healthyOffenseFeed() {
  return [
    fakeEntry(CHASE_ID, 1.2),
    fakeEntry(DANIELS_ID, 12.4),
    fakeEntry(BARKLEY_ID, 2.1),
    fakeEntry(BELLORE_ID, 169.7),
    ...Array.from({ length: 30 }, (_, i) => fakeEntry(String(20_000 + i), 20 + i)),
  ];
}

describe("Draft War Room ADP resolution (sentinel ~170)", () => {
  it("rejects undrafted-sentinel feeds (no elite ADP)", () => {
    const map = new Map(
      sentinelOffenseFeed().map((e) => [
        String(e.id),
        { adp: e.player.ownership.averageDraftPosition as number, projection: null, percentStarted: 50 },
      ]),
    );
    expect(countEspnOffenseEliteAdp(map)).toBe(0);
    expect(shouldPersistEspnOffenseCache(map)).toBe(false);
  });

  it("Ja'Marr Chase / Jayden Daniels / Saquon do not resolve to fallback ADP 170", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    __setEspnOffenseAdpDurableDriverForTests(mem);
    const calendarYear = new Date().getFullYear();

    // Warm durable with real ADP
    __setEspnOffenseFetchForTests(async (year) => (year === calendarYear ? healthyOffenseFeed() : []));
    const warm = await getEspnPlayerInfoMap();
    expect(warm.get(CHASE_ID)?.adp).toBe(1.2);
    expect(warm.get(DANIELS_ID)?.adp).toBe(12.4);
    expect(warm.get(BARKLEY_ID)?.adp).toBe(2.1);

    // Cold memory + sentinel live feed → durable last-good, not 170
    __resetEspnPlayerInfoCacheForTests();
    __setEspnOffenseFetchForTests(async () => sentinelOffenseFeed());
    const after = await getEspnPlayerInfoMap();
    expect(after.get(CHASE_ID)?.adp).toBe(1.2);
    expect(after.get(DANIELS_ID)?.adp).toBe(12.4);
    expect(after.get(BARKLEY_ID)?.adp).toBe(2.1);
    expect(after.get(CHASE_ID)?.adp).not.toBe(170);
  });

  it("missing / sentinel-only with no durable → null ADP, not 170", async () => {
    const mem = createMemoryEspnOffenseAdpDurableDriver();
    __setEspnOffenseAdpDurableDriverForTests(mem);
    __setEspnOffenseFetchForTests(async () => sentinelOffenseFeed());

    const map = await getEspnPlayerInfoMap();
    expect(map.get(CHASE_ID)?.adp).toBeNull();
    expect(map.get(DANIELS_ID)?.adp).toBeNull();
    expect(map.get(BARKLEY_ID)?.adp).toBeNull();
    expect(map.get(CHASE_ID)?.adp).not.toBe(170);

    const stripped = nullEspnOffenseAdps(
      new Map([[CHASE_ID, { adp: 170, projection: 300, percentStarted: 99 }]]),
    );
    expect(stripped.get(CHASE_ID)?.adp).toBeNull();
    expect(stripped.get(CHASE_ID)?.projection).toBe(300);
  });

  it("soft-include never invents numeric ADP", () => {
    const soft = buildSkillStarvationSoftIncludes(
      [
        { fullName: "Ja'Marr Chase", position: "WR", espnPlayerId: CHASE_ID },
        { fullName: "Jayden Daniels", position: "QB", espnPlayerId: DANIELS_ID },
        { fullName: "Saquon Barkley", position: "RB", espnPlayerId: BARKLEY_ID },
      ],
      new Set(),
    );
    expect(soft.every((p) => p.adp == null)).toBe(true);
  });

  it("market difference is suppressed when ADP is null", () => {
    expect(formatLiveDraftValueVsMarket(null, 1)).toBeNull();
    expect(formatLiveDraftValueVsMarket(undefined, 1)).toBeNull();
    expect(formatLiveDraftPoolAdp(null).label).toBe("ADP unavailable");
    expect(formatLiveDraftPoolAdp(null).isReal).toBe(false);
    expect(isLiveDraftRealAdp(null)).toBe(false);
  });

  it("ADP sorting puts nulls after real elite ADP", () => {
    const rows = [
      { name: "Nick Bellore", adp: null, marketValue: 20 },
      { name: "Ja'Marr Chase", adp: 1.2, marketValue: 95 },
      { name: "Jayden Daniels", adp: 12.4, marketValue: 88 },
      { name: "Saquon Barkley", adp: 2.1, marketValue: 92 },
      { name: "Chase McLaughlin", adp: null, marketValue: 15 },
    ];
    const sorted = [...rows].sort(compareLiveDraftAdpOrdering);
    expect(sorted.map((r) => r.name)).toEqual([
      "Ja'Marr Chase",
      "Saquon Barkley",
      "Jayden Daniels",
      "Nick Bellore",
      "Chase McLaughlin",
    ]);
  });
});
