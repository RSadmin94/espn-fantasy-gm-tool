/**
 * Post-redeploy verify: read fantasy_data_cache only (no write).
 * DATABASE_URL via railway run.
 */
import { eq } from "drizzle-orm";
import { fantasyDataCache } from "../drizzle/schema";
import { espnOffenseAdpCacheKey, loadDurableEspnOffenseAdp } from "../server/espnOffenseAdpDurableStore";

const TARGETS = {
  chase: "4362628",
  daniels: "4426348",
  barkley: "3929630",
};

function isRealAdp(a: number | null, max = 120): boolean {
  return typeof a === "number" && Number.isFinite(a) && a > 0 && a < max && !(a >= 165 && a <= 175);
}

async function main() {
  const season = Number(process.env.SEASON || new Date().getFullYear());
  const { getDb } = await import("../server/db");
  const db = await getDb();
  if (!db) throw new Error("getDb null");

  const key = espnOffenseAdpCacheKey(season);
  const rows = await db
    .select({
      cacheKey: fantasyDataCache.cacheKey,
      fetchedAt: fantasyDataCache.fetchedAt,
      updatedAt: fantasyDataCache.updatedAt,
      payload: fantasyDataCache.payload,
    })
    .from(fantasyDataCache)
    .where(eq(fantasyDataCache.cacheKey, key))
    .limit(1);

  if (!rows[0]) {
    console.log(JSON.stringify({ ok: false, reason: "missing_row", key }));
    process.exit(2);
  }

  const payload = JSON.parse(rows[0].payload) as {
    players: Record<string, { adp: number | null }>;
  };
  const targets: Record<string, number | null> = {};
  for (const [k, id] of Object.entries(TARGETS)) {
    targets[k] = payload.players[id]?.adp ?? null;
  }

  const fromLoader = await loadDurableEspnOffenseAdp(season);
  const loaderTargets: Record<string, number | null> = {};
  for (const [k, id] of Object.entries(TARGETS)) {
    loaderTargets[k] = fromLoader?.get(id)?.adp ?? null;
  }

  const ok =
    isRealAdp(targets.chase, 40) &&
    isRealAdp(targets.barkley, 40) &&
    isRealAdp(targets.daniels, 120) &&
    JSON.stringify(targets) === JSON.stringify(loaderTargets);

  console.log(
    JSON.stringify(
      {
        ok,
        key,
        fetchedAt: rows[0].fetchedAt,
        updatedAt: rows[0].updatedAt,
        playerCount: Object.keys(payload.players).length,
        targets,
        loaderTargets,
        noSentinel170: [targets.chase, targets.daniels, targets.barkley].every(
          (a) => !(typeof a === "number" && a >= 165 && a <= 175),
        ),
      },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
