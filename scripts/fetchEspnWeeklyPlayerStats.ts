/**
 * scripts/fetchEspnWeeklyPlayerStats.ts
 * Fetch per-week player lineup + scoring data from ESPN and store in espn_raw_cache.
 *
 * ESPN endpoint used:
 *   GET /seasons/{season}/segments/0/leagues/{leagueId}
 *       ?view=mMatchupScore&scoringPeriodId={week}&matchupPeriodId={week}
 *
 * The mMatchupScore view returns schedule entries where each team object contains
 * schedule[].home.rosterForCurrentScoringPeriod.entries[] with per-player
 * lineupSlotId and appliedStatTotal (points scored that week).
 *
 * Stored in espn_raw_cache as viewName = "playerStats:{week}" per season.
 *
 * Usage:
 *   npx tsx scripts/fetchEspnWeeklyPlayerStats.ts
 *   npx tsx scripts/fetchEspnWeeklyPlayerStats.ts --season=2024
 *   npx tsx scripts/fetchEspnWeeklyPlayerStats.ts --season=2024 --week=7
 *   npx tsx scripts/fetchEspnWeeklyPlayerStats.ts --skip-existing   (skip already-cached weeks)
 *
 * Guardrails:
 *   - 401/403: log season+week, continue to next week
 *   - 404: log as "no data for season", skip remaining weeks for that season
 *   - Empty roster entries: skip silently (no fabrication)
 *   - 500ms minimum delay between requests
 *   - All stored in espn_raw_cache; no gm_* writes here
 */

import "dotenv/config";
import { and, desc, eq, sql as drizzleSql } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { decryptCredentialsFromDb } from "../server/_core/crypto";
import { upsertRawEspnCache } from "../server/espnPersistence";
import {
  buildCookieStringFor,
  buildEspnFantasyRefererForApi,
  type EspnCreds,
} from "../server/espnService";
import { getDbConn } from "../server/espnPersistence";

const LEAGUE_ID   = "457622";
const API_BASE    = "https://fantasy.espn.com/apis/v3/games/ffl";
const REQ_DELAY   = 600; // ms between requests to avoid rate limiting

// Seasons to fetch: 2018–2025 (ESPN API is reliable for these)
// 2009–2017 may work but data quality is lower; include them
const DEFAULT_SEASON_START = 2018;
const DEFAULT_SEASON_END   = 2025;

// NFL regular season is 17 weeks; add a buffer for playoff scoring periods
const MAX_WEEK = 18;

// ── CLI args ───────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  })
);

const TARGET_SEASON    = args.season   ? Number(args.season)   : undefined;
const TARGET_WEEK      = args.week     ? Number(args.week)     : undefined;
const SKIP_EXISTING    = args["skip-existing"] === "true";
const SEASON_START     = args["from"]  ? Number(args["from"])  : DEFAULT_SEASON_START;
const SEASON_END       = args["to"]    ? Number(args["to"])    : DEFAULT_SEASON_END;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJson(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; data: Record<string, unknown> | null; error?: string }> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(40_000) });
      lastStatus = res.status;
      if (res.status === 429) { await sleep(1000); continue; }
      if (!res.ok) return { status: res.status, data: null };
      const data = await res.json() as Record<string, unknown>;
      return { status: res.status, data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < 3) { await sleep(500); continue; }
      return { status: lastStatus, data: null, error: msg };
    }
  }
  return { status: lastStatus, data: null };
}

function buildHeaders(creds: EspnCreds, season: number): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Referer: buildEspnFantasyRefererForApi(season, ["mMatchupScore"], creds),
    Cookie: buildCookieStringFor(creds),
  };
}

async function loadCreds(
  db: NonNullable<Awaited<ReturnType<typeof getDbConn>>>
): Promise<EspnCreds> {
  const preferred = await db.select()
    .from(schema.leagueConnections)
    .where(and(
      eq(schema.leagueConnections.provider, "espn"),
      eq(schema.leagueConnections.isActive, true),
      eq(schema.leagueConnections.leagueId, LEAGUE_ID),
    ))
    .orderBy(desc(schema.leagueConnections.updatedAt))
    .limit(1);

  const fallback = preferred.length === 0
    ? await db.select()
        .from(schema.leagueConnections)
        .where(and(
          eq(schema.leagueConnections.provider, "espn"),
          eq(schema.leagueConnections.isActive, true),
        ))
        .orderBy(desc(schema.leagueConnections.updatedAt))
        .limit(1)
    : preferred;

  const row = fallback[0];
  if (!row) throw new Error("No active ESPN league_connections row found.");

  const raw = decryptCredentialsFromDb(row.credentials) as Record<string, string> | null;
  const swid   = raw?.swid?.trim()   ?? process.env.ESPN_SWID   ?? "";
  const espnS2 = raw?.espnS2?.trim() ?? process.env.ESPN_S2     ?? "";

  if (!swid || !espnS2) {
    throw new Error("Cannot decrypt SWID/espn_s2 from league_connections. Check DATABASE_URL and encryption keys.");
  }

  return { leagueId: LEAGUE_ID, swid, espnS2 };
}

/** Load already-cached viewNames for a season to support --skip-existing */
async function loadCachedViewNames(
  db: NonNullable<Awaited<ReturnType<typeof getDbConn>>>,
  season: number
): Promise<Set<string>> {
  const rows = await db
    .select({ viewName: schema.espnRawCache.viewName })
    .from(schema.espnRawCache)
    .where(and(
      eq(schema.espnRawCache.leagueId, LEAGUE_ID),
      eq(schema.espnRawCache.season, season),
    ))
    .limit(500);
  return new Set(rows.map(r => r.viewName));
}

/** Count roster entries extracted from a payload for logging */
function countPlayerEntries(data: Record<string, unknown>): number {
  let count = 0;
  const schedule = Array.isArray(data.schedule) ? data.schedule as Record<string, unknown>[] : [];
  for (const matchup of schedule) {
    if (!matchup || typeof matchup !== "object") continue;
    const m = matchup as Record<string, unknown>;
    for (const side of ["home", "away"] as const) {
      const team = m[side] as Record<string, unknown> | undefined;
      if (!team) continue;
      const entries = (
        (team.rosterForCurrentScoringPeriod as Record<string, unknown>)?.entries ??
        (team.rosterForMatchupPeriod as Record<string, unknown>)?.entries ??
        []
      );
      count += Array.isArray(entries) ? entries.length : 0;
    }
  }
  return count;
}

// ── Per-season fetcher ─────────────────────────────────────────────────────────

type WeekResult = {
  week:         number;
  status:       "ok" | "skipped_existing" | "skipped_auth" | "skipped_no_data" | "skipped_empty" | "error";
  playerCount:  number;
  bytes?:       number;
  detail?:      string;
};

async function fetchSeason(
  db:     NonNullable<Awaited<ReturnType<typeof getDbConn>>>,
  season: number,
  creds:  EspnCreds
): Promise<WeekResult[]> {
  const existing = SKIP_EXISTING ? await loadCachedViewNames(db, season) : new Set<string>();
  const headers  = buildHeaders(creds, season);
  const results: WeekResult[] = [];

  const weeks = TARGET_WEEK !== undefined ? [TARGET_WEEK] : Array.from({ length: MAX_WEEK }, (_, i) => i + 1);

  for (const week of weeks) {
    const viewName = `playerStats:${week}`;

    if (existing.has(viewName)) {
      results.push({ week, status: "skipped_existing", playerCount: 0 });
      continue;
    }

    const url = `${API_BASE}/seasons/${season}/segments/0/leagues/${LEAGUE_ID}` +
      `?view=mMatchupScore&scoringPeriodId=${week}&matchupPeriodId=${week}`;

    await sleep(REQ_DELAY);
    const { status, data, error } = await fetchJson(url, headers);

    if (status === 401 || status === 403) {
      console.warn(`  [${season}] w${week}: HTTP ${status} — credentials expired. Stopping this season.`);
      results.push({ week, status: "skipped_auth", playerCount: 0, detail: String(status) });
      break; // no point continuing for this season
    }

    if (status === 404) {
      console.warn(`  [${season}] w${week}: HTTP 404 — no data. Skipping rest of season.`);
      results.push({ week, status: "skipped_no_data", playerCount: 0, detail: "404" });
      break;
    }

    if (!data || status !== 200) {
      console.warn(`  [${season}] w${week}: HTTP ${status}${error ? ` (${error})` : ""}`);
      results.push({ week, status: "error", playerCount: 0, detail: `HTTP ${status}` });
      continue;
    }

    // Tag with season and week so the ingestion script can read it back
    const enriched = { ...data, seasonId: season, _fetchedWeek: week };
    const playerCount = countPlayerEntries(data);

    if (playerCount === 0) {
      console.warn(`  [${season}] w${week}: 0 player entries in payload — skipping cache write`);
      results.push({ week, status: "skipped_empty", playerCount: 0 });
      continue;
    }

    try {
      const { payloadBytes } = await upsertRawEspnCache(LEAGUE_ID, season, viewName, enriched);
      results.push({ week, status: "ok", playerCount, bytes: payloadBytes });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  [${season}] w${week}: cache write failed: ${msg}`);
      results.push({ week, status: "error", playerCount, detail: msg });
    }
  }

  return results;
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function run() {
  const db = await getDbConn();
  if (!db) {
    console.error("[fetch] Cannot connect. Check DATABASE_URL.");
    process.exit(1);
  }

  let creds: EspnCreds;
  try {
    creds = await loadCreds(db);
    console.log(`[fetch] Credentials loaded for league ${creds.leagueId}`);
  } catch (e) {
    console.error("[fetch] Credentials error:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const seasons = TARGET_SEASON !== undefined
    ? [TARGET_SEASON]
    : Array.from({ length: SEASON_END - SEASON_START + 1 }, (_, i) => SEASON_START + i);

  console.log(`[fetch] Seasons: ${seasons.join(", ")} | SkipExisting=${SKIP_EXISTING}`);

  const report: Record<number, { ok: number; skipped: number; errors: number; players: number }> = {};

  for (const season of seasons) {
    console.log(`\n[fetch] Season ${season}...`);
    const results = await fetchSeason(db, season, creds);
    const ok      = results.filter(r => r.status === "ok").length;
    const skipped = results.filter(r => r.status.startsWith("skipped")).length;
    const errors  = results.filter(r => r.status === "error").length;
    const players = results.reduce((s, r) => s + r.playerCount, 0);
    report[season] = { ok, skipped, errors, players };
    console.log(`  Season ${season}: ${ok} weeks fetched, ${skipped} skipped, ${errors} errors, ${players} player entries`);
  }

  console.log("\n── Fetch complete ──────────────────────────────────────────────");
  console.log(`${"Season".padEnd(8)} ${"Weeks OK".padEnd(12)} ${"Skipped".padEnd(10)} ${"Errors".padEnd(10)} ${"Player entries"}`);
  for (const [season, r] of Object.entries(report)) {
    console.log(`${String(season).padEnd(8)} ${String(r.ok).padEnd(12)} ${String(r.skipped).padEnd(10)} ${String(r.errors).padEnd(10)} ${r.players}`);
  }

  console.log("\nNext step: pnpm player:ingest");
}

run().catch(err => {
  console.error("[fetch] Fatal:", err);
  process.exit(1);
});
