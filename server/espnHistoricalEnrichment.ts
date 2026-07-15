/**
 * Targeted ESPN fetches for missing historical draft / matchups / transactions only.
 * Does not refresh or overwrite `combined` cache; does not delete normalized rows.
 */
import { and, count, eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import type { AppDb } from "./espnPersistence";
import {
  createSyncRun,
  finishSyncRun,
  getDbConn,
  upsertDraftPicks,
  upsertMatchups,
  upsertRawEspnCache,
  upsertTransactions,
} from "./espnPersistence";
import {
  buildCookieStringFor,
  buildEspnFantasyRefererForApi,
  fetchDraftRecapSeason,
  type EspnCreds,
} from "./espnService";

const FANTASY_API = "https://fantasy.espn.com/apis/v3/games/ffl";

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

async function countRows(
  db: AppDb,
  table:
    | typeof schema.gmDraftPicks
    | typeof schema.gmMatchups
    | typeof schema.gmTransactions,
  leagueId: string,
  season: number
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const t = table as typeof schema.gmDraftPicks;
  const [r] = await db
    .select({ c: count() })
    .from(t)
    .where(and(eq(t.leagueId, lid), eq(t.season, yr)));
  return Number(r?.c ?? 0);
}

/**
 * GET JSON with 429 exponential backoff. Does not retry 401/403/404.
 */
async function fetchEspnJsonWithRetry(
  url: string,
  headers: Record<string, string>,
  opts?: { timeoutMs?: number }
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  let backoff = 1200;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 && attempt < 5) {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 20_000);
        continue;
      }
      if (!res.ok) {
        return { status: res.status, data: null };
      }
      const data = (await res.json()) as Record<string, unknown>;
      return { status: res.status, data };
    } catch {
      if (attempt < 5) {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 20_000);
        continue;
      }
      return { status: 0, data: null };
    }
  }
  return { status: 0, data: null };
}

async function fetchDraftRecapWithRetry(
  season: number,
  creds: EspnCreds
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  let backoff = 1200;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetchDraftRecapSeason(season, creds);
    if (r.status === 429 && attempt < 5) {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 20_000);
      continue;
    }
    return r;
  }
  return { status: 0, data: null };
}

function leagueFantasyUrl(season: number, leagueId: string): string {
  const lid = encodeURIComponent(String(leagueId).trim());
  const yr = Math.floor(Number(season));
  return `${FANTASY_API}/seasons/${yr}/segments/0/leagues/${lid}`;
}

export type HistoricalEnrichmentStepHttp = {
  httpStatus: number;
  saved: number;
  skipped: boolean;
  error?: string;
};

export type HistoricalEnrichmentSeasonResult = {
  season: number;
  status: "success" | "partial" | "failed" | "skipped";
  draft: HistoricalEnrichmentStepHttp;
  matchups: HistoricalEnrichmentStepHttp & { weeksFetched?: number };
  transactions: HistoricalEnrichmentStepHttp;
  /** Short summary for UI (e.g. HTTP codes per step). */
  httpSummary: string;
  errors: string[];
};

export async function runHistoricalEnrichment(
  leagueId: string,
  seasons: number[],
  creds: EspnCreds,
  opts?: { force?: boolean }
): Promise<HistoricalEnrichmentSeasonResult[]> {
  const db = await getDbConn();
  if (!db) throw new Error("Database unavailable");
  const lid = String(leagueId).slice(0, 32);
  const force = opts?.force === true;
  const results: HistoricalEnrichmentSeasonResult[] = [];

  const baseHeaders = (): Record<string, string> => ({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Cookie: buildCookieStringFor(creds),
  });

  for (const season of seasons) {
    const yr = Math.floor(Number(season));
    const errors: string[] = [];
    const draft: HistoricalEnrichmentStepHttp = { httpStatus: 0, saved: 0, skipped: true };
    const matchups: HistoricalEnrichmentStepHttp & { weeksFetched?: number } = {
      httpStatus: 0,
      saved: 0,
      skipped: true,
      weeksFetched: 0,
    };
    const transactions: HistoricalEnrichmentStepHttp = { httpStatus: 0, saved: 0, skipped: true };

    const emptyStep = (): HistoricalEnrichmentSeasonResult => ({
      season: yr,
      status: "failed",
      draft,
      matchups,
      transactions,
      httpSummary: "",
      errors,
    });

    const syncRunId = await createSyncRun(lid, yr);
    let rawViewsWritten = 0;
    let authAbort = false;

    try {
      const draftCount = await countRows(db, schema.gmDraftPicks, lid, yr);
      const matchupCount = await countRows(db, schema.gmMatchups, lid, yr);
      const txnCount = await countRows(db, schema.gmTransactions, lid, yr);

      // ── Draft (mDraftDetail) ─────────────────────────────────────────────
      if (force || draftCount === 0) {
        draft.skipped = false;
        const dRes = await fetchDraftRecapWithRetry(yr, { ...creds, leagueId: lid });
        draft.httpStatus = dRes.status;
        if (dRes.status === 401 || dRes.status === 403) {
          errors.push("draft: ESPN credentials expired (401/403)");
          authAbort = true;
        } else if (dRes.status === 404) {
          errors.push("draft: season unavailable (404)");
        } else if (dRes.data && payloadDraftPickLen(dRes.data) > 0) {
          const payload = { ...dRes.data, seasonId: dRes.data.seasonId ?? yr };
          await upsertRawEspnCache(lid, yr, "mDraftDetail", payload);
          rawViewsWritten++;
          draft.saved = await upsertDraftPicks(db, lid, yr, payload);
        } else if (dRes.status === 200 && dRes.data) {
          errors.push("draft: empty board in ESPN response");
        } else if (dRes.status !== 0) {
          errors.push(`draft: HTTP ${dRes.status}`);
        } else {
          errors.push("draft: network error");
        }
      }

      // ── Matchups (per-week mMatchup + mMatchupScore) ─────────────────────
      if (!authAbort && (force || matchupCount === 0)) {
        matchups.skipped = false;
        let merged: Record<string, unknown>[] = [];
        let lastStatus = 0;
        let weeksOk = 0;
        for (let week = 1; week <= 16; week++) {
          const url = `${leagueFantasyUrl(yr, lid)}?view=mMatchup&view=mMatchupScore&scoringPeriodId=${week}`;
          const headers = {
            ...baseHeaders(),
            Referer: buildEspnFantasyRefererForApi(yr, ["mMatchup", "mMatchupScore"], { ...creds, leagueId: lid }),
          };
          const wk = await fetchEspnJsonWithRetry(url, headers);
          lastStatus = wk.status;
          if (wk.status === 401 || wk.status === 403) {
            errors.push("matchups: ESPN credentials expired (401/403)");
            authAbort = true;
            break;
          }
          if (wk.status === 404) {
            continue;
          }
          if (wk.status === 200 && wk.data?.schedule) {
            merged = mergeScheduleSlices(merged, wk.data.schedule as unknown[]);
            weeksOk++;
          }
        }
        matchups.httpStatus = lastStatus;
        matchups.weeksFetched = weeksOk;
        if (!authAbort && merged.length > 0) {
          const matchPayload: Record<string, unknown> = { seasonId: yr, schedule: merged };
          await upsertRawEspnCache(lid, yr, "mMatchup", matchPayload);
          rawViewsWritten++;
          matchups.saved = await upsertMatchups(db, lid, yr, matchPayload);
        } else if (!authAbort && weeksOk === 0 && !errors.some((e) => e.includes("matchups:"))) {
          errors.push("matchups: no schedule data merged from weeks 1–16");
        }
      }

      // ── Transactions (mTransactions2) ─────────────────────────────────────
      if (!authAbort && (force || txnCount === 0)) {
        transactions.skipped = false;
        const url = `${leagueFantasyUrl(yr, lid)}?view=mTransactions2`;
        const headers = {
          ...baseHeaders(),
          Referer: buildEspnFantasyRefererForApi(yr, ["mTransactions2"], { ...creds, leagueId: lid }),
        };
        const tx = await fetchEspnJsonWithRetry(url, headers);
        transactions.httpStatus = tx.status;
        if (tx.status === 401 || tx.status === 403) {
          errors.push("transactions: ESPN credentials expired (401/403)");
          authAbort = true;
        } else if (tx.status === 404) {
          errors.push("transactions: season unavailable (404)");
        } else if (tx.data && Array.isArray(tx.data.transactions) && (tx.data.transactions as unknown[]).length > 0) {
          const payload = { ...tx.data, seasonId: tx.data.seasonId ?? yr };
          await upsertRawEspnCache(lid, yr, "mTransactions2", payload);
          rawViewsWritten++;
          transactions.saved = await upsertTransactions(db, lid, yr, payload);
        } else if (tx.status === 200 && tx.data) {
          errors.push("transactions: empty feed in ESPN response");
        } else if (tx.status !== 0) {
          errors.push(`transactions: HTTP ${tx.status}`);
        } else {
          errors.push("transactions: network error");
        }
      }

      const httpSummary = [
        `draft=${draft.httpStatus}`,
        `matchups=${matchups.httpStatus}`,
        `txn=${transactions.httpStatus}`,
      ].join(";");

      let status: HistoricalEnrichmentSeasonResult["status"] = "success";
      if (authAbort) status = "failed";
      else if (errors.length > 0) status = "partial";
      else if (draft.skipped && matchups.skipped && transactions.skipped) status = "skipped";

      await finishSyncRun(
        syncRunId,
        status === "failed" ? "failed" : status === "partial" ? "partial" : "success",
        {
          rawViewsSaved: rawViewsWritten,
          teamsSaved: 0,
          matchupsSaved: matchups.saved,
          draftPicksSaved: draft.saved,
          transactionsSaved: transactions.saved,
          rosterEntriesSaved: 0,
          playersSaved: 0,
          standingsSaved: 0,
        },
        errors.length ? `${httpSummary} | ${errors.join("; ")}` : httpSummary || null
      );

      results.push({
        season: yr,
        status,
        draft,
        matchups,
        transactions,
        httpSummary,
        errors,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      await finishSyncRun(
        syncRunId,
        "failed",
        {
          rawViewsSaved: rawViewsWritten,
          teamsSaved: 0,
          matchupsSaved: matchups.saved,
          draftPicksSaved: draft.saved,
          transactionsSaved: transactions.saved,
          rosterEntriesSaved: 0,
          playersSaved: 0,
          standingsSaved: 0,
        },
        msg
      );
      const r = emptyStep();
      r.status = "failed";
      r.errors = errors;
      r.httpSummary = "";
      results.push(r);
    }
  }

  return results;
}

function payloadDraftPickLen(data: Record<string, unknown>): number {
  const draft = (data.draftDetail as Record<string, unknown>) || {};
  const picks = draft.picks as unknown[] | undefined;
  return Array.isArray(picks) ? picks.length : 0;
}
