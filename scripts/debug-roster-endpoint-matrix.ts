/**
 * Authenticated matrix: mRoster via seasons/ (lm-api-reads) vs leagueHistory/ (fantasy.espn.com).
 * Credentials: same as fetch-all-historical-data.ts — DATABASE_URL + league_connections + decrypt.
 *
 * Run: pnpm exec tsx scripts/debug-roster-endpoint-matrix.ts
 * Or: node scripts/debug-roster-endpoint-matrix.mjs
 */
import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { decryptCredentialsFromDb } from "../server/_core/crypto";
import {
  buildEspnFantasyRefererForApi,
  type EspnCreds,
} from "../server/espnService";

const LEAGUE_ID = "457622";
const SEASONS = [2010, 2013, 2015, 2017];

function buildCookieHeader(creds: EspnCreds): string {
  const parts: string[] = [];
  if (creds.swid) parts.push(`SWID=${creds.swid}`);
  if (creds.espnS2) parts.push(`espn_s2=${creds.espnS2}`);
  return parts.join("; ");
}

async function loadCredentialsFromDb(): Promise<EspnCreds> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = drizzle(url, { schema, mode: "default" });

  const preferred = await db
    .select()
    .from(schema.leagueConnections)
    .where(
      and(
        eq(schema.leagueConnections.provider, "espn"),
        eq(schema.leagueConnections.isActive, true),
        eq(schema.leagueConnections.leagueId, LEAGUE_ID),
      ),
    )
    .orderBy(desc(schema.leagueConnections.updatedAt))
    .limit(1);

  const fallback =
    preferred[0] != null
      ? preferred
      : await db
          .select()
          .from(schema.leagueConnections)
          .where(and(eq(schema.leagueConnections.provider, "espn"), eq(schema.leagueConnections.isActive, true)))
          .orderBy(desc(schema.leagueConnections.updatedAt))
          .limit(1);

  const row = fallback[0];
  if (!row) {
    console.error("No active ESPN league_connections row found.");
    process.exit(1);
  }

  const raw = decryptCredentialsFromDb(row.credentials) as Record<string, string> | null;
  const swid = raw?.swid?.trim();
  const espnS2 = raw?.espnS2?.trim();
  if (!swid || !espnS2) {
    console.error("league_connections row has no decryptable swid / espnS2.");
    process.exit(1);
  }

  return { leagueId: LEAGUE_ID, swid, espnS2 };
}

function teamsArray(payload: Record<string, unknown>): Record<string, unknown>[] {
  const t = payload.teams;
  if (!t) return [];
  if (Array.isArray(t)) return t as Record<string, unknown>[];
  if (typeof t === "object") return Object.values(t as Record<string, Record<string, unknown>>);
  return [];
}

function unwrapLeagueBody(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return first as Record<string, unknown>;
    }
    return null;
  }
  if (typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  return null;
}

function rosterEntriesCount(teams: Record<string, unknown>[]): number {
  let n = 0;
  for (const team of teams) {
    const roster = team.roster as Record<string, unknown> | undefined;
    const entries = roster?.entries as unknown[] | undefined;
    if (Array.isArray(entries)) n += entries.length;
  }
  return n;
}

function teamIdPresence(teams: Record<string, unknown>[]): boolean {
  if (teams.length === 0) return false;
  for (const t of teams) {
    const id = Number(t.id);
    if (!Number.isFinite(id) || id <= 0) return false;
  }
  return true;
}

function playerIdPresence(teams: Record<string, unknown>[]): boolean {
  for (const team of teams) {
    const roster = team.roster as Record<string, unknown> | undefined;
    const entries = roster?.entries as Record<string, unknown>[] | undefined;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const pool = (entry.playerPoolEntry as Record<string, unknown>) || {};
      const player = (pool.player as Record<string, unknown>) || {};
      const pid = player.id ?? pool.id;
      const n = Number(pid);
      if (Number.isFinite(n) && n > 0) return true;
    }
  }
  return false;
}

async function fetchJson(
  url: string,
  season: number,
  creds: EspnCreds,
): Promise<{ httpStatus: number; data: unknown; error?: string }> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Referer: buildEspnFantasyRefererForApi(season, ["mRoster"], creds),
    Cookie: buildCookieHeader(creds),
    "X-Fantasy-Source": "kona",
    "X-Fantasy-Platform": "kona-PROD-m.fantasy.espn.com",
  };
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
    const httpStatus = res.status;
    let data: unknown = null;
    let error: string | undefined;
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) data = await res.json();
      else await res.text();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (!res.ok && !error) error = `HTTP ${httpStatus}`;
    return { httpStatus, data, error };
  } catch (e) {
    return { httpStatus: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function analyzeRow(
  season: number,
  endpointLabel: "seasons_lm_api_reads" | "leagueHistory_fantasy_espn",
  url: string,
  httpStatus: number,
  body: unknown,
  fetchError?: string,
) {
  const base = {
    season,
    endpoint: endpointLabel,
    url,
    status: httpStatus,
    teamsCount: 0,
    rosterEntriesCount: 0,
    playerIdPresence: false,
    teamIdPresence: false,
    error: fetchError ?? null,
  };

  if (httpStatus === 0 || fetchError) {
    if (!base.error) base.error = "network_or_unknown";
    return base;
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    if (!base.error) base.error = `HTTP ${httpStatus}`;
    return base;
  }

  const payload = unwrapLeagueBody(body);
  if (!payload) {
    return { ...base, error: "unwrap_failed_or_empty_json" };
  }

  const teams = teamsArray(payload);
  base.teamsCount = teams.length;
  base.rosterEntriesCount = rosterEntriesCount(teams);
  base.playerIdPresence = playerIdPresence(teams);
  base.teamIdPresence = teamIdPresence(teams);
  return base;
}

async function main() {
  const creds = await loadCredentialsFromDb();
  const matrix: unknown[] = [];

  for (const season of SEASONS) {
    const urlSeasons = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=mRoster`;
    const urlHistory = `https://fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?seasonId=${season}&view=mRoster`;

    const a = await fetchJson(urlSeasons, season, creds);
    matrix.push(
      analyzeRow(season, "seasons_lm_api_reads", urlSeasons, a.httpStatus, a.data, a.error),
    );

    const b = await fetchJson(urlHistory, season, creds);
    matrix.push(
      analyzeRow(season, "leagueHistory_fantasy_espn", urlHistory, b.httpStatus, b.data, b.error),
    );
  }

  console.log(JSON.stringify(matrix, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
