/**
 * Fetch historical matchup + standings data from ESPN (league 457622) using Railway MySQL credentials.
 *
 * 1) `DATABASE_URL` → newest active `league_connections` ESPN row for league 457622 (fallback: any active ESPN).
 * 2) Decrypt with `decryptCredentialsFromDb`.
 * 3) Per season 2009–2025: weeks 1–16 scoreboard API → merge schedule → `upsertMatchups`.
 * 4) Per season: standings + team views → `upsertTeams`.
 * 5) `sync_runs` per season with counts.
 * 6) 401/403: skip season (log expired); 404: skip season (no data); 500ms between requests; 429 retries with 500ms delay.
 *
 * Usage: pnpm fetch:matchups
 */
import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { decryptCredentialsFromDb } from "../server/_core/crypto";
import {
  createSyncRun,
  finishSyncRun,
  getDbConn,
  upsertMatchups,
  upsertTeams,
} from "../server/espnPersistence";
import {
  buildCookieStringFor,
  buildEspnFantasyRefererForApi,
  type EspnCreds,
} from "../server/espnService";

const LEAGUE_ID = "457622";
const SEASON_START = 2009;
const SEASON_END = 2025;
const WEEKS = 16;
const API_BASE = "https://fantasy.espn.com/apis/v3/games/ffl";
const REQ_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function scheduleKey(item: Record<string, unknown>): string {
  const home = (item.home as Record<string, unknown>) || {};
  const away = (item.away as Record<string, unknown>) || {};
  const sid = Number(item.scoringPeriodId ?? 0) || 0;
  const hid = Number(home.teamId ?? 0) || 0;
  const aid = Number(away.teamId ?? 0) || 0;
  return `${sid}:${hid}:${aid}`;
}

function mergeScheduleSlices(
  existing: unknown[] | undefined,
  add: unknown[] | undefined,
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const x of [...(existing || []), ...(add || [])]) {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const row = x as Record<string, unknown>;
      map.set(scheduleKey(row), row);
    }
  }
  return [...map.values()].sort(
    (a, b) => (Number(a.scoringPeriodId) || 0) - (Number(b.scoringPeriodId) || 0),
  );
}

/**
 * `upsertMatchups` treats winner as numeric team id. ESPN may send HOME/AWAY or omit winner;
 * for past seasons, infer winner from scores when needed.
 */
function enrichScheduleWinnersFromScores(schedule: Record<string, unknown>[], season: number): void {
  const calendarYear = new Date().getFullYear();
  const treatAsComplete = season < calendarYear;
  for (const item of schedule) {
    const home = (item.home as Record<string, unknown>) || {};
    const away = (item.away as Record<string, unknown>) || {};
    const hid = Number(home.teamId);
    const aid = Number(away.teamId);
    const hs = Number(home.totalPoints ?? 0);
    const as = Number(away.totalPoints ?? 0);
    const w = item.winner;
    if (w === "HOME" && Number.isFinite(hid)) {
      item.winner = hid;
    } else if (w === "AWAY" && Number.isFinite(aid)) {
      item.winner = aid;
    } else if (typeof w === "string" && w !== "UNDECIDED") {
      const n = Number(w);
      if (Number.isFinite(n)) item.winner = n;
    }
    const cur = Number(item.winner);
    if (treatAsComplete && (!Number.isFinite(cur) || cur <= 0)) {
      if (hs > as && Number.isFinite(hid)) item.winner = hid;
      else if (as > hs && Number.isFinite(aid)) item.winner = aid;
      else if (hs === as && hs > 0 && Number.isFinite(hid)) item.winner = hid;
    }
  }
}

async function fetchEspnJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(45_000),
      });
      lastStatus = res.status;
      if (res.status === 429) {
        await sleep(500);
        continue;
      }
      if (!res.ok) {
        return { status: res.status, data: null };
      }
      const data = (await res.json()) as Record<string, unknown>;
      return { status: res.status, data };
    } catch {
      await sleep(500);
    }
  }
  return { status: lastStatus, data: null };
}

function buildHeaders(creds: EspnCreds, season: number, views: readonly string[]): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Referer: buildEspnFantasyRefererForApi(season, views, creds),
    Cookie: buildCookieStringFor(creds),
  };
}

type SeasonSummary = {
  season: number;
  teamsFetched: number;
  matchupsFetched: number;
  status: string;
  detail?: string;
};

async function loadCreds(db: NonNullable<Awaited<ReturnType<typeof getDbConn>>>): Promise<EspnCreds> {
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

  const row =
    preferred[0] ??
    (
      await db
        .select()
        .from(schema.leagueConnections)
        .where(and(eq(schema.leagueConnections.provider, "espn"), eq(schema.leagueConnections.isActive, true)))
        .orderBy(desc(schema.leagueConnections.updatedAt))
        .limit(1)
    )[0];

  if (!row) {
    throw new Error("No active ESPN league_connections row found.");
  }

  const raw = decryptCredentialsFromDb(row.credentials) as Record<string, string> | EspnCreds | null;
  const swid = typeof raw === "object" && raw && "swid" in raw ? String(raw.swid ?? "").trim() : "";
  const espnS2 = typeof raw === "object" && raw && "espnS2" in raw ? String(raw.espnS2 ?? "").trim() : "";
  if (!swid || !espnS2) {
    throw new Error("league_connections row has no decryptable swid / espnS2.");
  }
  return { leagueId: LEAGUE_ID, swid, espnS2 };
}

async function runSeason(
  db: NonNullable<Awaited<ReturnType<typeof getDbConn>>>,
  season: number,
  creds: EspnCreds,
): Promise<SeasonSummary> {
  const viewsStandings = ["mStandings", "mTeam"] as const;
  const viewsMatchup = ["mMatchup", "mMatchupScore"] as const;

  const syncRunId = await createSyncRun(LEAGUE_ID, season);
  let teamsSaved = 0;
  let matchupsSaved = 0;
  let errMsg: string | null = null;
  let finishStatus: "success" | "partial" | "failed" = "success";

  const finish = async () => {
    await finishSyncRun(syncRunId, finishStatus, {
      rawViewsSaved: 0,
      teamsSaved,
      matchupsSaved,
      draftPicksSaved: 0,
      transactionsSaved: 0,
      rosterEntriesSaved: 0,
      playersSaved: 0,
      standingsSaved: 0,
    }, errMsg);
  };

  try {
    const standingsUrl = `${API_BASE}/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?view=mStandings&view=mTeam`;
    await sleep(REQ_DELAY_MS);
    const stRes = await fetchEspnJson(standingsUrl, buildHeaders(creds, season, viewsStandings));

    if (stRes.status === 401 || stRes.status === 403) {
      console.warn(`[${season}] HTTP ${stRes.status}: credentials expired or forbidden — skipping season.`);
      finishStatus = "partial";
      errMsg = "credentials_expired_or_forbidden";
      await finish();
      return { season, teamsFetched: 0, matchupsFetched: 0, status: "skipped_auth", detail: String(stRes.status) };
    }
    if (stRes.status === 404) {
      console.warn(`[${season}] HTTP 404: no league data — skipping season.`);
      finishStatus = "partial";
      errMsg = "no_data_404_standings";
      await finish();
      return { season, teamsFetched: 0, matchupsFetched: 0, status: "skipped_no_data", detail: "404" };
    }
    if (!stRes.data) {
      console.warn(`[${season}] Standings fetch failed (HTTP ${stRes.status}) — skipping season.`);
      finishStatus = "partial";
      errMsg = `standings_http_${stRes.status}`;
      await finish();
      return {
        season,
        teamsFetched: 0,
        matchupsFetched: 0,
        status: "skipped_fetch",
        detail: String(stRes.status),
      };
    }

    const standingsPayload = { ...stRes.data, seasonId: Number(stRes.data.seasonId ?? season) || season };
    try {
      teamsSaved = await upsertTeams(db, LEAGUE_ID, season, standingsPayload);
    } catch (e) {
      console.warn(`[${season}] upsertTeams:`, e);
      finishStatus = "partial";
      errMsg = `upsertTeams: ${e instanceof Error ? e.message : String(e)}`;
    }

    let mergedSchedule: Record<string, unknown>[] = [];
    let aborted401 = false;

    for (let week = 1; week <= WEEKS; week++) {
      const scoreboardUrl =
        `${API_BASE}/seasons/${season}/segments/0/leagues/${LEAGUE_ID}` +
        `?view=mMatchup&view=mMatchupScore&scoringPeriodId=${week}&matchupPeriodId=${week}`;
      await sleep(REQ_DELAY_MS);
      const mRes = await fetchEspnJson(scoreboardUrl, buildHeaders(creds, season, viewsMatchup));

      if (mRes.status === 401 || mRes.status === 403) {
        console.warn(`[${season}] week ${week} HTTP ${mRes.status}: credentials expired — stopping matchups for season.`);
        aborted401 = true;
        break;
      }
      if (mRes.status === 404) {
        console.warn(`[${season}] week ${week} HTTP 404 — skipping season matchups (no data).`);
        finishStatus = "partial";
        errMsg = errMsg ?? "no_data_404_matchup";
        break;
      }
      if (!mRes.data) {
        console.warn(`[${season}] week ${week} empty body (HTTP ${mRes.status}) — continuing.`);
        continue;
      }

      const sched = (mRes.data.schedule as unknown[]) || [];
      mergedSchedule = mergeScheduleSlices(mergedSchedule, sched);
    }

    if (aborted401) {
      finishStatus = "partial";
      errMsg = errMsg ?? "credentials_expired_during_matchups";
    }

    enrichScheduleWinnersFromScores(mergedSchedule, season);
    const matchupPayload: Record<string, unknown> = {
      seasonId: season,
      schedule: mergedSchedule,
    };

    try {
      matchupsSaved = await upsertMatchups(db, LEAGUE_ID, season, matchupPayload);
    } catch (e) {
      console.warn(`[${season}] upsertMatchups:`, e);
      finishStatus = "partial";
      errMsg = (errMsg ? `${errMsg}; ` : "") + `upsertMatchups: ${e instanceof Error ? e.message : String(e)}`;
    }

    await finish();
    return {
      season,
      teamsFetched: teamsSaved,
      matchupsFetched: matchupsSaved,
      status: finishStatus === "success" ? "ok" : "partial",
      detail: errMsg ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[${season}] unexpected:`, msg);
    finishStatus = "failed";
    errMsg = msg;
    await finish();
    return { season, teamsFetched: teamsSaved, matchupsFetched: matchupsSaved, status: "error", detail: msg };
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required.");
    process.exitCode = 1;
    return;
  }

  const db = await getDbConn();
  if (!db) {
    console.error("Database unavailable (getDbConn returned null).");
    process.exitCode = 1;
    return;
  }

  let creds: EspnCreds;
  try {
    creds = await loadCreds(db);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }

  const summaries: SeasonSummary[] = [];

  for (let season = SEASON_START; season <= SEASON_END; season++) {
    try {
      const row = await runSeason(db, season, creds);
      summaries.push(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[${season}] runSeason outer catch:`, msg);
      summaries.push({
        season,
        teamsFetched: 0,
        matchupsFetched: 0,
        status: "error",
        detail: msg,
      });
    }
  }

  console.log("\n========== Historical matchup + standings fetch summary ==========\n");
  for (const s of summaries) {
    const extra = s.detail ? ` (${s.detail})` : "";
    console.log(
      `  ${s.season}: teams=${s.teamsFetched}, matchups=${s.matchupsFetched}, status=${s.status}${extra}`,
    );
  }
  console.log("\n====================================================================\n");
}

main().catch((e) => {
  console.error("[fetch-historical-matchups] fatal:", e);
  process.exitCode = 1;
});
