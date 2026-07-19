/**
 * RFSN-031 live durability checklist (preview).
 * Run: DATABASE_URL=... npx tsx scripts/rfsn031-durability-check.mts
 */
import { eq } from "drizzle-orm";
import { fantasyDataCache } from "../drizzle/schema";
import {
  countEspnOffenseEliteAdp,
  espnOffenseSeasonsToTry,
  shouldPersistEspnOffenseCache,
  type EspnPlayerInfo,
} from "../server/playerStatsRouter";
import {
  espnOffenseAdpCacheKey,
  saveDurableEspnOffenseAdp,
  loadDurableEspnOffenseAdp,
} from "../server/espnOffenseAdpDurableStore";

/** Preferred ESPN ids; resolved from live feed names when present. */
const TARGET_IDS: Record<string, string> = {
  chase: "4362628", // Ja'Marr Chase (2026 ESPN)
  daniels: "4426348", // Jayden Daniels
  barkley: "3929630", // Saquon Barkley
};

const TARGET_NAME_HINTS: Record<string, RegExp> = {
  chase: /ja.?marr\s+chase/i,
  daniels: /jayden\s+daniels/i,
  barkley: /saquon\s+barkley/i,
};

async function fetchOffense(year: number): Promise<any[]> {
  const filter = JSON.stringify({
    players: {
      limit: 1500,
      sortAdp: { sortPriority: 1, sortAsc: true },
      filterRanksForScoringPeriodIds: { value: [1] },
      filterRanksForRankTypes: { value: ["PPR"] },
      filterSlotIds: { value: [0, 2, 4, 6, 17, 16, 23] },
    },
  });
  const resp = await fetch(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=1`,
    { headers: { "X-Fantasy-Filter": filter } },
  );
  if (!resp.ok) return [];
  const d = await resp.json();
  return Array.isArray(d?.players) ? d.players : [];
}

function parseMap(players: any[], usedYear: number): Map<string, EspnPlayerInfo> {
  const cache = new Map<string, EspnPlayerInfo>();
  for (const entry of players) {
    const id = String(entry?.id ?? "").trim();
    if (!id) continue;
    const own = entry?.player?.ownership ?? {};
    const adpRaw = own.averageDraftPosition;
    const adp =
      typeof adpRaw === "number" && adpRaw > 0 && adpRaw < 500
        ? Math.round(adpRaw * 100) / 100
        : null;
    const psRaw = own.percentStarted;
    const percentStarted =
      typeof psRaw === "number" && psRaw >= 0 ? Math.round(psRaw * 10) / 10 : null;
    let projection: number | null = null;
    const stats = Array.isArray(entry?.player?.stats) ? entry.player.stats : [];
    for (const s of stats) {
      if (s?.statSourceId === 1 && Number(s?.scoringPeriodId) === 0) {
        const at = Number(s?.appliedTotal);
        if (Number.isFinite(at)) {
          projection = Math.round(at * 10) / 10;
          break;
        }
      }
    }
    cache.set(id, { adp, projection, percentStarted });
  }
  return cache;
}

function resolveTargetIds(players: any[]): Record<string, string> {
  const ids = { ...TARGET_IDS };
  for (const entry of players) {
    const id = String(entry?.id ?? "").trim();
    const name = String(entry?.player?.fullName ?? "").trim();
    if (!id || !name) continue;
    for (const [label, re] of Object.entries(TARGET_NAME_HINTS)) {
      if (re.test(name)) ids[label] = id;
    }
  }
  return ids;
}

function summarizeTargets(
  map: Map<string, EspnPlayerInfo>,
  ids: Record<string, string>,
) {
  const out: Record<string, number | null> = {};
  for (const [label, id] of Object.entries(ids)) {
    out[label] = map.get(id)?.adp ?? null;
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const year = new Date().getFullYear();
  const years = espnOffenseSeasonsToTry(year);
  console.log(JSON.stringify({ step: "seasons", years }, null, 2));

  let usedYear = year;
  let players: any[] = [];
  for (const y of years) {
    const batch = await fetchOffense(y);
    console.log(JSON.stringify({ step: "espn_fetch", year: y, count: batch.length }));
    if (batch.length > 0) {
      players = batch;
      usedYear = y;
      break;
    }
  }

  const targetIds = resolveTargetIds(players);
  const liveMap = parseMap(players, usedYear);
  const elites = countEspnOffenseEliteAdp(liveMap);
  const healthy = shouldPersistEspnOffenseCache(liveMap);
  const liveTargets = summarizeTargets(liveMap, targetIds);
  console.log(
    JSON.stringify(
      {
        step: "1_live_espn",
        usedYear,
        size: liveMap.size,
        elites,
        healthy,
        targetIds,
        targets: liveTargets,
        sampleAdps: [...liveMap.values()]
          .map((v) => v.adp)
          .filter((a): a is number => a != null)
          .slice(0, 15),
      },
      null,
      2,
    ),
  );

  if (!healthy) {
    console.log(JSON.stringify({ step: "ABORT", reason: "live_espn_unhealthy_cannot_warm" }));
    process.exit(2);
  }

  // Use real durable store path — but it calls getDb() from server/db.
  // Write directly with same schema for this checklist, then verify via loadDurable.
  process.env.DATABASE_URL = url;
  // Dynamic import after env set so getDb picks it up
  const { getDb } = await import("../server/db");
  const db = await getDb();
  if (!db) throw new Error("getDb() returned null");

  await saveDurableEspnOffenseAdp(usedYear, liveMap);
  console.log(JSON.stringify({ step: "2_write_durable", key: espnOffenseAdpCacheKey(usedYear) }));

  const rows = await db
    .select({
      cacheKey: fantasyDataCache.cacheKey,
      fetchedAt: fantasyDataCache.fetchedAt,
      updatedAt: fantasyDataCache.updatedAt,
      payload: fantasyDataCache.payload,
    })
    .from(fantasyDataCache)
    .where(eq(fantasyDataCache.cacheKey, espnOffenseAdpCacheKey(usedYear)))
    .limit(1);

  if (!rows[0]) {
    console.log(JSON.stringify({ step: "2_FAIL", reason: "row_missing" }));
    process.exit(3);
  }

  const payload = JSON.parse(rows[0].payload) as {
    season: number;
    fetchedAt: string;
    players: Record<string, EspnPlayerInfo>;
  };
  const rowTargets: Record<string, number | null> = {};
  for (const [label, id] of Object.entries(targetIds)) {
    rowTargets[label] = payload.players[id]?.adp ?? null;
  }
  const payloadBytes = rows[0].payload.length;
  console.log(
    JSON.stringify(
      {
        step: "2_db_row",
        cacheKey: rows[0].cacheKey,
        fetchedAt: rows[0].fetchedAt,
        updatedAt: rows[0].updatedAt,
        playerCount: Object.keys(payload.players).length,
        payloadBytes,
        targets: rowTargets,
      },
      null,
      2,
    ),
  );

  // 3 — real ADPs (not undrafted sentinel ~169–171). Chase/Barkley early; Daniels may be mid-round.
  function isRealAdp(a: number | null, max = 120): boolean {
    return typeof a === "number" && Number.isFinite(a) && a > 0 && a < max && !(a >= 165 && a <= 175);
  }
  const ok3 =
    isRealAdp(rowTargets.chase, 40) &&
    isRealAdp(rowTargets.barkley, 40) &&
    isRealAdp(rowTargets.daniels, 120);
  console.log(JSON.stringify({ step: "3_targets_real_adp", ok: ok3, targets: rowTargets }));

  // 7–8 simulate sentinel overwrite attempt
  const sentinel = new Map<string, EspnPlayerInfo>();
  for (let i = 0; i < 250; i++) {
    sentinel.set(String(i), { adp: 170, projection: null, percentStarted: null });
  }
  sentinel.set(targetIds.chase, { adp: 170, projection: null, percentStarted: null });
  const sentinelHealthy = shouldPersistEspnOffenseCache(sentinel);
  if (sentinelHealthy) {
    console.log(JSON.stringify({ step: "8_FAIL", reason: "sentinel_would_persist" }));
    process.exit(4);
  }
  // Attempt save would be skipped by caller; prove we do not call save when unhealthy
  const beforeUpdated = String(rows[0].updatedAt);
  if (shouldPersistEspnOffenseCache(sentinel)) {
    await saveDurableEspnOffenseAdp(usedYear, sentinel);
  }
  const rows2 = await db
    .select({
      updatedAt: fantasyDataCache.updatedAt,
      payload: fantasyDataCache.payload,
    })
    .from(fantasyDataCache)
    .where(eq(fantasyDataCache.cacheKey, espnOffenseAdpCacheKey(usedYear)))
    .limit(1);
  const payload2 = JSON.parse(rows2[0]!.payload) as typeof payload;
  const afterChase = payload2.players[targetIds.chase]?.adp ?? null;
  console.log(
    JSON.stringify(
      {
        step: "8_sentinel_rejected",
        sentinelHealthy,
        updatedAtUnchanged: String(rows2[0]!.updatedAt) === beforeUpdated,
        chaseStill: afterChase,
        chaseNot170: afterChase !== 170,
      },
      null,
      2,
    ),
  );

  // Reload via durable loader (simulates cold memory)
  const reloaded = await loadDurableEspnOffenseAdp(usedYear);
  const reloadTargets = summarizeTargets(reloaded ?? new Map(), targetIds);
  console.log(
    JSON.stringify(
      {
        step: "6_reload_from_db",
        size: reloaded?.size ?? 0,
        targets: reloadTargets,
        no170: [reloadTargets.chase, reloadTargets.daniels, reloadTargets.barkley].every(
          (a) => isRealAdp(a, 120),
        ),
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ step: "DONE", usedYear, ok3 }));
  process.exit(ok3 ? 0 : 5);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
