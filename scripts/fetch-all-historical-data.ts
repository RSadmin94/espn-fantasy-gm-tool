/**
 * One-shot historical ESPN import for league 457622 (seasons 2009–2023).
 *
 * 1) Loads newest active ESPN row from `league_connections` (Railway MySQL via DATABASE_URL).
 * 2) Fetches ESPN JSON using stored SWID + espn_s2 (Cookie header as documented).
 * 3) Merges views, normalizes + persists via `syncEspnCombinedFullPipeline` (sync_runs + caches + GM tables).
 * 4) Writes `scripts/historical-data-report.json` with factual `espnReturned` (HTTP + array lengths).
 *
 * Usage: pnpm fetch:history
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { decryptCredentialsFromDb } from "../server/_core/crypto";
import type { EspnCreds } from "../server/espnService";
import {
  buildEspnFantasyRefererForApi,
  fetchTradeProposals,
  mergeTradeProposalsIntoTransactions,
} from "../server/espnService";
import { syncEspnCombinedFullPipeline } from "../server/espnPersistence";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, "historical-data-report.json");

const LEAGUE_ID = "457622";
const SEASONS = Array.from({ length: 2023 - 2009 + 1 }, (_, i) => 2009 + i);

const FANTASY_API = "https://fantasy.espn.com/apis/v3/games/ffl";

function buildCookieHeader(creds: EspnCreds): string {
  const parts: string[] = [];
  if (creds.swid) parts.push(`SWID=${creds.swid}`);
  if (creds.espnS2) parts.push(`espn_s2=${creds.espnS2}`);
  return parts.join("; ");
}

function leagueBasePath(season: number): string {
  return `${FANTASY_API}/seasons/${season}/segments/0/leagues/${LEAGUE_ID}`;
}

async function fetchEspnJson(
  season: number,
  searchParams: URLSearchParams,
  creds: EspnCreds,
  refererViews: readonly string[],
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const url = `${leagueBasePath(season)}?${searchParams.toString()}`;
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Referer: buildEspnFantasyRefererForApi(season, refererViews, creds),
    Cookie: buildCookieHeader(creds),
  };
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
    if (!res.ok) {
      return { status: res.status, data: null };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return { status: res.status, data };
  } catch (e) {
    console.warn("[fetch-all-historical-data] network error:", url, e);
    return { status: 0, data: null };
  }
}

function scheduleKey(item: Record<string, unknown>): string {
  const home = (item.home as Record<string, unknown>) || {};
  const away = (item.away as Record<string, unknown>) || {};
  const sid = Number(item.scoringPeriodId ?? 0) || 0;
  const hid = Number(home.teamId ?? 0) || 0;
  const aid = Number(away.teamId ?? 0) || 0;
  return `${sid}:${hid}:${aid}`;
}

function rosterEntryCount(data: Record<string, unknown>): number {
  const teams = (data.teams as Record<string, unknown>[]) || [];
  let n = 0;
  for (const t of teams) {
    const entries = ((t.roster as Record<string, unknown>)?.entries as unknown[]) || [];
    if (Array.isArray(entries)) n += entries.length;
  }
  return n;
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

type SeasonHttp = Record<string, number | string>;

/** Counts and statuses straight from ESPN JSON / HTTP — no heuristics or “expected” thresholds. */
type EspnReturned = {
  requestedSeason: number;
  responseSeasonId: number | null;
  leaguePayloadId: string | number | null;
  baseHttpStatus: number;
  teamCount: number;
  memberCount: number;
  rosterEntryCount: number;
  /** After merging per-week `schedule` arrays (deduped by scoring period + teams). */
  scheduleMatchupSlotsMerged: number;
  /** Per-week matchup fetch: HTTP status and how many `schedule` entries that response body contained. */
  matchupWeeks: { week: number; httpStatus: number; scheduleSlotsInBody: number }[];
  transactionsHttpStatus: number;
  transactionRowCount: number;
  tradeProposalSupplementRows: number | null;
  draftHttpStatus: number;
  draftPickCount: number;
  settingsPresent: boolean;
  draftDetailPresent: boolean;
};

type SeasonReport = {
  status: "success" | "failed" | "skipped";
  skipReason?: string;
  http?: SeasonHttp;
  /** What ESPN actually returned (counts / statuses only). */
  espnReturned?: EspnReturned;
  persistError?: string;
  errors: string[];
};

type ReportFile = {
  startedAt: string;
  finishedAt: string;
  leagueId: string;
  credentialSource: {
    connectionId: number | null;
    userId: number | null;
    rowLeagueId: string | null;
    preferred457622: boolean;
  };
  seasons: Record<string, SeasonReport>;
};

async function loadCredentialsFromDb(): Promise<{
  creds: EspnCreds;
  meta: ReportFile["credentialSource"];
}> {
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

  return {
    creds: { leagueId: LEAGUE_ID, swid, espnS2 },
    meta: {
      connectionId: row.id ?? null,
      userId: row.userId ?? null,
      rowLeagueId: row.leagueId ?? null,
      preferred457622: row.leagueId === LEAGUE_ID,
    },
  };
}

async function buildMergedPayload(season: number, creds: EspnCreds): Promise<{
  merged: Record<string, unknown> | null;
  http: SeasonHttp;
  errors: string[];
  aborted401: boolean;
  aborted404: boolean;
  espnReturned: EspnReturned | null;
}> {
  const http: SeasonHttp = {};
  const errors: string[] = [];

  const baseParams = new URLSearchParams();
  for (const v of ["mStandings", "mTeam", "mRoster", "mSettings"]) baseParams.append("view", v);

  const base = await fetchEspnJson(season, baseParams, creds, ["mStandings", "mTeam", "mRoster", "mSettings"]);
  http.base = base.status;
  if (base.status === 401 || base.status === 403) {
    return { merged: null, http, errors, aborted401: true, aborted404: false, espnReturned: null };
  }
  if (base.status === 404) {
    return { merged: null, http, errors, aborted401: false, aborted404: true, espnReturned: null };
  }
  if (!base.data) {
    errors.push(`base fetch failed (HTTP ${base.status})`);
    return { merged: null, http, errors, aborted401: false, aborted404: false, espnReturned: null };
  }

  const merged: Record<string, unknown> = { ...base.data };
  merged.seasonId = (base.data.seasonId as number) ?? season;

  const matchupWeeks: EspnReturned["matchupWeeks"] = [];
  let schedule = (merged.schedule as unknown[]) || [];
  for (let week = 1; week <= 16; week++) {
    const p = new URLSearchParams();
    p.append("view", "mMatchup");
    p.append("view", "mMatchupScore");
    p.set("scoringPeriodId", String(week));
    const wk = await fetchEspnJson(season, p, creds, ["mMatchup", "mMatchupScore"]);
    http[`week_${week}`] = wk.status;
    const slotsInBody = Array.isArray(wk.data?.schedule) ? (wk.data!.schedule as unknown[]).length : 0;
    matchupWeeks.push({ week, httpStatus: wk.status, scheduleSlotsInBody: slotsInBody });
    if (wk.status === 401 || wk.status === 403) {
      errors.push(`credentials rejected on matchup week ${week} (HTTP ${wk.status})`);
      return { merged: null, http, errors, aborted401: true, aborted404: false, espnReturned: null };
    }
    if (wk.status === 404) {
      continue;
    }
    if (wk.data?.schedule) {
      schedule = mergeScheduleSlices(schedule, wk.data.schedule as unknown[]);
      merged.schedule = schedule;
    }
  }

  const txnParams = new URLSearchParams();
  txnParams.append("view", "mTransactions2");
  const txn = await fetchEspnJson(season, txnParams, creds, ["mTransactions2"]);
  http.transactions = txn.status;
  if (txn.status === 401 || txn.status === 403) {
    errors.push(`credentials rejected on transactions (HTTP ${txn.status})`);
    return { merged: null, http, errors, aborted401: true, aborted404: false, espnReturned: null };
  }
  if (txn.status === 200 && txn.data?.transactions) {
    merged.transactions = txn.data.transactions;
  }

  const draftParams = new URLSearchParams();
  draftParams.append("view", "mDraftDetail");
  const draft = await fetchEspnJson(season, draftParams, creds, ["mDraftDetail"]);
  http.draft = draft.status;
  if (draft.status === 401 || draft.status === 403) {
    errors.push(`credentials rejected on draft (HTTP ${draft.status})`);
    return { merged: null, http, errors, aborted401: true, aborted404: false, espnReturned: null };
  }
  if (draft.status === 200 && draft.data?.draftDetail) {
    merged.draftDetail = draft.data.draftDetail;
  }

  if (!Array.isArray(merged.transactions)) merged.transactions = [];
  let tradeProposalSupplementRows: number | null = null;
  try {
    const proposals = await fetchTradeProposals(season, creds);
    tradeProposalSupplementRows = proposals.length;
    Object.assign(
      merged,
      mergeTradeProposalsIntoTransactions(merged as Record<string, unknown>, proposals),
    );
  } catch (e) {
    tradeProposalSupplementRows = null;
    errors.push(`trade proposal supplement fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const sidRaw = merged.seasonId;
  const responseSeasonId =
    typeof sidRaw === "number" && Number.isFinite(sidRaw)
      ? sidRaw
      : typeof sidRaw === "string" && /^\d+$/.test(sidRaw)
        ? Number(sidRaw)
        : null;
  const lidRaw = merged.id;
  let leaguePayloadId: string | number | null = null;
  if (typeof lidRaw === "number" || typeof lidRaw === "string") {
    leaguePayloadId = lidRaw;
  } else if (lidRaw != null) {
    leaguePayloadId = String(lidRaw);
  }

  const teams = (merged.teams as unknown[]) || [];
  const members = (merged.members as unknown[]) || [];
  const draftDetail = (merged.draftDetail as Record<string, unknown>) || {};
  const picks = (draftDetail.picks as unknown[]) || [];

  const espnReturned: EspnReturned = {
    requestedSeason: season,
    responseSeasonId,
    leaguePayloadId,
    baseHttpStatus: base.status,
    teamCount: teams.length,
    memberCount: members.length,
    rosterEntryCount: rosterEntryCount(merged),
    scheduleMatchupSlotsMerged: Array.isArray(merged.schedule) ? (merged.schedule as unknown[]).length : 0,
    matchupWeeks,
    transactionsHttpStatus: txn.status,
    transactionRowCount: ((merged.transactions as unknown[]) || []).length,
    tradeProposalSupplementRows,
    draftHttpStatus: draft.status,
    draftPickCount: Array.isArray(picks) ? picks.length : 0,
    settingsPresent: merged.settings != null && typeof merged.settings === "object",
    draftDetailPresent: merged.draftDetail != null && typeof merged.draftDetail === "object",
  };

  return { merged, http, errors, aborted401: false, aborted404: false, espnReturned };
}

async function main() {
  const startedAt = new Date().toISOString();
  const { creds, meta } = await loadCredentialsFromDb();

  const report: ReportFile = {
    startedAt,
    finishedAt: "",
    leagueId: LEAGUE_ID,
    credentialSource: meta,
    seasons: {},
  };

  for (const season of SEASONS) {
    const key = String(season);
    const seasonReport: SeasonReport = { status: "skipped", errors: [] };

    try {
      const built = await buildMergedPayload(season, creds);
      seasonReport.http = built.http;
      seasonReport.errors.push(...built.errors);
      if (built.espnReturned) seasonReport.espnReturned = built.espnReturned;

      if (built.aborted401) {
        seasonReport.status = "skipped";
        seasonReport.skipReason = `credentials expired for season ${season}`;
        console.warn(seasonReport.skipReason);
        report.seasons[key] = seasonReport;
        continue;
      }
      if (built.aborted404) {
        seasonReport.status = "skipped";
        seasonReport.skipReason = `no data for season ${season}`;
        console.warn(seasonReport.skipReason);
        report.seasons[key] = seasonReport;
        continue;
      }
      if (!built.merged) {
        seasonReport.status = "failed";
        seasonReport.persistError = "merge/build failed";
        report.seasons[key] = seasonReport;
        continue;
      }

      const merged = built.merged;
      merged.seasonId = season;

      try {
        await syncEspnCombinedFullPipeline(LEAGUE_ID, season, merged, {
          pipelineAllOk: true,
          // Persist whatever ESPN returned; do not downgrade sync via heuristic “expected counts”.
          qualityUsable: true,
        });
        seasonReport.status = "success";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        seasonReport.status = "failed";
        seasonReport.persistError = msg;
        console.warn(`[fetch-all-historical-data] persist failed season ${season}:`, msg);
      }
    } catch (e) {
      seasonReport.status = "failed";
      seasonReport.persistError = e instanceof Error ? e.message : String(e);
      console.warn(`[fetch-all-historical-data] season ${season} unexpected:`, seasonReport.persistError);
    }

    report.seasons[key] = seasonReport;
  }

  report.finishedAt = new Date().toISOString();
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
