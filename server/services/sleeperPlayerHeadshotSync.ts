/**
 * Sync Sleeper NFL player IDs onto gm_player_registry so Rivals can resolve
 * Sleeper CDN headshots (and enrich missing ESPN ids when Sleeper provides them).
 *
 * Source: GET https://api.sleeper.app/v1/players/nfl (≤1×/day recommended).
 * Match: sleeper.espn_id → registry.espnPlayerId (primary).
 */
import { eq, sql } from "drizzle-orm";
import { gmPlayerRegistry } from "../../drizzle/schema";
import { getDb } from "../db";

const SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";

export type SleeperNflPlayerRow = {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  espn_id?: string | number | null;
  status?: string | null;
  active?: boolean | null;
  fantasy_positions?: string[] | null;
};

export type UnmatchedCategory =
  | "missing_espn_id_on_registry"
  | "sleeper_missing_espn_id"
  | "defense_or_team_id"
  | "inactive_or_retired"
  | "no_sleeper_match"
  | "other";

export type SleeperHeadshotSyncResult = {
  ok: boolean;
  sleeperPlayersScanned: number;
  /** Registry rows that already had the correct sleeperPlayerId. */
  alreadyMatched: number;
  /** Registry rows that need a write (matched by ESPN id, id differs or empty). */
  toUpdate: number;
  sleeperIdsWritten: number;
  espnIdsFilled: number;
  /** Sleeper catalog rows with no usable espn_id. */
  sleeperSkippedNoEspn: number;
  /** Registry rows with espn id but no sleeper map hit. */
  registryUnmatched: number;
  coveragePercent: number | null;
  unmatchedSample: Array<{
    registryId: number;
    fullName?: string;
    position?: string;
    espnPlayerId: string | null;
    category: UnmatchedCategory;
  }>;
  unmatchedByCategory: Record<UnmatchedCategory, number>;
  errors: string[];
};

let catalogCache: { at: number; data: Record<string, SleeperNflPlayerRow> } | null = null;
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export function __clearSleeperHeadshotCatalogCacheForTests(): void {
  catalogCache = null;
}

export async function fetchSleeperNflPlayerCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, SleeperNflPlayerRow>> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.data;
  }
  const resp = await fetchImpl(SLEEPER_PLAYERS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`sleeper_players_nfl_${resp.status}`);
  }
  const data = (await resp.json()) as Record<string, SleeperNflPlayerRow>;
  catalogCache = { at: now, data };
  return data;
}

export function buildEspnIdToSleeperIdMap(
  catalog: Record<string, SleeperNflPlayerRow>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [rawId, row] of Object.entries(catalog)) {
    const sleeperId = String(row.player_id ?? rawId).trim();
    if (!sleeperId) continue;
    const espnRaw = row.espn_id;
    if (espnRaw == null || espnRaw === "") continue;
    const espnId = String(espnRaw).trim();
    if (!/^\d+$/.test(espnId)) continue;
    // First wins — Sleeper catalog is 1:1 for active NFL skill players.
    if (!map.has(espnId)) map.set(espnId, sleeperId);
  }
  return map;
}

export function isDefenseOrTeamSleeperId(sleeperId: string): boolean {
  return /^[A-Z]{2,3}$/.test(sleeperId);
}

/**
 * Pure match planner for tests — given registry rows + Sleeper espn→sleeper map.
 * Skips rows that already have the correct sleeperPlayerId (idempotent).
 */
export function planSleeperIdUpdates(args: {
  registry: Array<{
    id: number;
    espnPlayerId: string | null;
    sleeperPlayerId: string | null;
  }>;
  espnToSleeper: Map<string, string>;
}): {
  updates: Array<{ id: number; sleeperPlayerId: string }>;
  alreadyMatched: number;
  unmatchedEspnIds: string[];
} {
  const updates: Array<{ id: number; sleeperPlayerId: string }> = [];
  let alreadyMatched = 0;
  const unmatchedEspnIds: string[] = [];

  for (const row of args.registry) {
    const espn = String(row.espnPlayerId ?? "").trim();
    if (!espn) continue;
    const sleeperId = args.espnToSleeper.get(espn);
    if (!sleeperId) {
      unmatchedEspnIds.push(espn);
      continue;
    }
    if (String(row.sleeperPlayerId ?? "").trim() === sleeperId) {
      alreadyMatched += 1;
      continue;
    }
    updates.push({ id: row.id, sleeperPlayerId: sleeperId });
  }
  return { updates, alreadyMatched, unmatchedEspnIds };
}

export function categorizeUnmatchedRegistryRow(args: {
  espnPlayerId: string | null;
  position?: string | null;
  fullName?: string | null;
  espnToSleeper: Map<string, string>;
  catalogByEspn: Map<string, SleeperNflPlayerRow>;
}): UnmatchedCategory {
  const espn = String(args.espnPlayerId ?? "").trim();
  if (!espn) return "missing_espn_id_on_registry";

  if (args.espnToSleeper.has(espn)) return "other";

  const pos = String(args.position ?? "").toUpperCase();
  if (pos === "DEF" || pos === "DST" || pos === "D/ST") return "defense_or_team_id";

  // No Sleeper row with this ESPN id at all.
  return "no_sleeper_match";
}

function emptyUnmatchedCounts(): Record<UnmatchedCategory, number> {
  return {
    missing_espn_id_on_registry: 0,
    sleeper_missing_espn_id: 0,
    defense_or_team_id: 0,
    inactive_or_retired: 0,
    no_sleeper_match: 0,
    other: 0,
  };
}

export async function syncSleeperPlayerHeadshotIds(
  opts?: { fetchImpl?: typeof fetch; dryRun?: boolean },
): Promise<SleeperHeadshotSyncResult> {
  const errors: string[] = [];
  const unmatchedByCategory = emptyUnmatchedCounts();
  const result: SleeperHeadshotSyncResult = {
    ok: false,
    sleeperPlayersScanned: 0,
    alreadyMatched: 0,
    toUpdate: 0,
    sleeperIdsWritten: 0,
    espnIdsFilled: 0,
    sleeperSkippedNoEspn: 0,
    registryUnmatched: 0,
    coveragePercent: null,
    unmatchedSample: [],
    unmatchedByCategory,
    errors,
  };

  let catalog: Record<string, SleeperNflPlayerRow>;
  try {
    catalog = await fetchSleeperNflPlayerCatalog(opts?.fetchImpl ?? fetch);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  result.sleeperPlayersScanned = Object.keys(catalog).length;
  const espnToSleeper = buildEspnIdToSleeperIdMap(catalog);
  result.sleeperSkippedNoEspn = result.sleeperPlayersScanned - espnToSleeper.size;

  const db = await getDb();
  if (!db) {
    errors.push("no_db");
    return result;
  }

  const registry = await db
    .select({
      id: gmPlayerRegistry.id,
      fullName: gmPlayerRegistry.fullName,
      position: gmPlayerRegistry.position,
      espnPlayerId: gmPlayerRegistry.espnPlayerId,
      sleeperPlayerId: gmPlayerRegistry.sleeperPlayerId,
    })
    .from(gmPlayerRegistry);

  const { updates, alreadyMatched, unmatchedEspnIds } = planSleeperIdUpdates({
    registry,
    espnToSleeper,
  });
  result.alreadyMatched = alreadyMatched;
  result.toUpdate = updates.length;

  // Categorize unmatched registry rows (no sleeper id after plan).
  for (const row of registry) {
    const espn = String(row.espnPlayerId ?? "").trim();
    const sleeper = String(row.sleeperPlayerId ?? "").trim();
    if (sleeper) continue;
    const category = categorizeUnmatchedRegistryRow({
      espnPlayerId: espn || null,
      position: row.position,
      fullName: row.fullName,
      espnToSleeper,
      catalogByEspn: new Map(),
    });
    unmatchedByCategory[category] += 1;
    if (result.unmatchedSample.length < 25) {
      result.unmatchedSample.push({
        registryId: row.id,
        fullName: row.fullName,
        position: row.position,
        espnPlayerId: espn || null,
        category,
      });
    }
  }
  result.registryUnmatched = Object.values(unmatchedByCategory).reduce((a, b) => a + b, 0);
  // Silence unused for now — unmatchedEspnIds informs no_sleeper_match count via loop above
  void unmatchedEspnIds;

  const withEspn = registry.filter((r) => String(r.espnPlayerId ?? "").trim()).length;
  const withSleeperAfterPlan = alreadyMatched + updates.length;
  result.coveragePercent =
    withEspn > 0
      ? Math.round((withSleeperAfterPlan / withEspn) * 1000) / 10
      : null;

  if (opts?.dryRun) {
    result.ok = true;
    return result;
  }

  // Only update rows whose sleeperPlayerId differs — never rewrite already-correct rows.
  for (const u of updates) {
    try {
      await db
        .update(gmPlayerRegistry)
        .set({ sleeperPlayerId: u.sleeperPlayerId })
        .where(eq(gmPlayerRegistry.id, u.id));
      result.sleeperIdsWritten += 1;
    } catch (err) {
      // Likely unique collision if another row already owns this sleeper id.
      errors.push(
        `id=${u.id} sleeper=${u.sleeperPlayerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  result.ok = errors.length === 0 || result.sleeperIdsWritten > 0;
  return result;
}

/** Coverage helper for admin UI. */
export async function getSleeperHeadshotCoverage(): Promise<{
  registryTotal: number;
  withEspnId: number;
  withSleeperId: number;
  withBoth: number;
  coveragePercent: number | null;
}> {
  const db = await getDb();
  if (!db) {
    return {
      registryTotal: 0,
      withEspnId: 0,
      withSleeperId: 0,
      withBoth: 0,
      coveragePercent: null,
    };
  }
  const rows = await db
    .select({
      registryTotal: sql<number>`COUNT(*)`.mapWith(Number),
      withEspnId: sql<number>`SUM(CASE WHEN ${gmPlayerRegistry.espnPlayerId} IS NOT NULL AND ${gmPlayerRegistry.espnPlayerId} <> '' THEN 1 ELSE 0 END)`.mapWith(Number),
      withSleeperId: sql<number>`SUM(CASE WHEN ${gmPlayerRegistry.sleeperPlayerId} IS NOT NULL AND ${gmPlayerRegistry.sleeperPlayerId} <> '' THEN 1 ELSE 0 END)`.mapWith(Number),
      withBoth: sql<number>`SUM(CASE WHEN ${gmPlayerRegistry.espnPlayerId} IS NOT NULL AND ${gmPlayerRegistry.espnPlayerId} <> '' AND ${gmPlayerRegistry.sleeperPlayerId} IS NOT NULL AND ${gmPlayerRegistry.sleeperPlayerId} <> '' THEN 1 ELSE 0 END)`.mapWith(Number),
    })
    .from(gmPlayerRegistry);
  const row = rows[0] ?? {
    registryTotal: 0,
    withEspnId: 0,
    withSleeperId: 0,
    withBoth: 0,
  };
  return {
    ...row,
    coveragePercent:
      row.withEspnId > 0
        ? Math.round((row.withBoth / row.withEspnId) * 1000) / 10
        : null,
  };
}
