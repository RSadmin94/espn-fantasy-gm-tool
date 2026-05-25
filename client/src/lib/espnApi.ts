/**
 * ESPN Fantasy API helpers for in-browser session sync (same-origin cookies on fantasy.espn.com).
 * Falls back to the GM War Room Chrome extension via `postMessage` when ESPN blocks credentialed fetches.
 */

const FANTASY_FFL = "https://fantasy.espn.com/apis/v3/games/ffl";

export const ESPN_COMBINED_VIEWS = [
  "mStandings",
  "mTeam",
  "mSettings",
  "mDraftDetail",
  "mTransactions2",
] as const;

export type EspnJsonOk = { ok: true; status: number; data: unknown };
export type EspnJsonErr =
  | { ok: false; kind: "cors_or_network"; message: string }
  | { ok: false; kind: "auth"; status: 401 | 403 }
  | { ok: false; kind: "not_found"; status: 404 }
  | { ok: false; kind: "http"; status: number; message?: string };

export type EspnJsonResult = EspnJsonOk | EspnJsonErr;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function isGmWarRoomExtensionPresent(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement;
  return (
    el.dataset.gmwrExtension === "1" || el.getAttribute("data-gmwr-extension") === "1"
  );
}

/** Ask the extension background to GET an ESPN URL with `credentials: "include"`. */
export function fetchEspnUrlViaExtension(url: string, timeoutMs = 120_000): Promise<EspnJsonResult> {
  return new Promise((resolve) => {
    const id = randomId();
    const to = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve({ ok: false, kind: "cors_or_network", message: "Extension request timed out" });
    }, timeoutMs);

    function onMsg(ev: MessageEvent) {
      if (ev.source !== window) return;
      const d = ev.data as Record<string, unknown> | null;
      if (!d || d.type !== "GMWR_ESPN_FETCH_REPLY" || d.id !== id) return;
      window.clearTimeout(to);
      window.removeEventListener("message", onMsg);
      const status = Number(d.status) || 0;
      if (d.error != null && d.error !== "") {
        if (status === 401 || status === 403) resolve({ ok: false, kind: "auth", status: status as 401 | 403 });
        else if (status === 404) resolve({ ok: false, kind: "not_found", status: 404 });
        else resolve({ ok: false, kind: "http", status: status || 0, message: String(d.error) });
        return;
      }
      if (status === 401 || status === 403) {
        resolve({ ok: false, kind: "auth", status: status as 401 | 403 });
        return;
      }
      if (status === 404) {
        resolve({ ok: false, kind: "not_found", status: 404 });
        return;
      }
      if (status < 200 || status >= 300) {
        resolve({ ok: false, kind: "http", status, message: `HTTP ${status}` });
        return;
      }
      const raw = d.bodyText;
      if (typeof raw !== "string" || raw.length === 0) {
        resolve({ ok: false, kind: "http", status, message: "Empty extension response" });
        return;
      }
      try {
        const data = JSON.parse(raw) as unknown;
        resolve({ ok: true, status, data });
      } catch {
        resolve({ ok: false, kind: "http", status, message: "Invalid JSON from extension" });
      }
    }

    window.addEventListener("message", onMsg);
    window.postMessage({ type: "GMWR_ESPN_FETCH", id, payload: { url } }, "*");
  });
}

function scheduleLen(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const s = (data as Record<string, unknown>).schedule;
  return Array.isArray(s) ? s.length : 0;
}

async function fetchDirect(url: string): Promise<EspnJsonResult> {
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const status = res.status;
    if (status === 401 || status === 403) return { ok: false, kind: "auth", status: status as 401 | 403 };
    if (status === 404) return { ok: false, kind: "not_found", status: 404 };
    if (!res.ok) return { ok: false, kind: "http", status, message: `HTTP ${status}` };
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, kind: "http", status, message: "Invalid JSON" };
    }
    return { ok: true, status, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, kind: "cors_or_network", message: msg };
  }
}

const MAX_HTTP_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 600;

/**
 * Fetch ESPN JSON with 429 exponential backoff. Tries direct `fetch` first, then extension when
 * `tryExtensionOnBlocked` and the failure is CORS/network or auth (extension may still succeed).
 */
export async function fetchEspnJsonWithRetry(
  url: string,
  opts?: {
    tryExtensionOnBlocked?: boolean;
    onTryingExtension?: () => void;
  },
): Promise<EspnJsonResult> {
  const tryExt = opts?.tryExtensionOnBlocked !== false;
  let delay = INITIAL_BACKOFF_MS;

  async function oneAttempt(
    impl: (u: string) => Promise<EspnJsonResult>,
  ): Promise<EspnJsonResult> {
    for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt++) {
      const r = await impl(url);
      if (r.ok) return r;
      if (r.kind === "http" && r.status === 429) {
        await sleep(delay);
        delay = Math.min(delay * 2, 8000);
        continue;
      }
      return r;
    }
    return { ok: false, kind: "http", status: 429, message: "Too many requests after retries" };
  }

  const direct = await oneAttempt(fetchDirect);
  if (direct.ok) return direct;

  const blockedLike =
    direct.kind === "cors_or_network" ||
    (direct.kind === "http" && (direct.status === 0 || direct.status >= 500));

  if (tryExt && blockedLike && isGmWarRoomExtensionPresent()) {
    opts?.onTryingExtension?.();
    return oneAttempt(fetchEspnUrlViaExtension);
  }

  return direct;
}

export function buildEspnCombinedLeagueUrl(leagueId: string, season: number): string {
  const params = new URLSearchParams();
  for (const v of ESPN_COMBINED_VIEWS) params.append("view", v);
  const lid = encodeURIComponent(String(leagueId).trim());
  return `${FANTASY_FFL}/seasons/${season}/segments/0/leagues/${lid}?${params.toString()}`;
}

export function buildEspnMatchupWeekUrl(leagueId: string, season: number, scoringPeriodId: number): string {
  const params = new URLSearchParams();
  params.append("view", "mMatchup");
  params.append("view", "mMatchupScore");
  params.append("scoringPeriodId", String(scoringPeriodId));
  const lid = encodeURIComponent(String(leagueId).trim());
  return `${FANTASY_FFL}/seasons/${season}/segments/0/leagues/${lid}?${params.toString()}`;
}

/** Same merge semantics as `mergeScheduleIntoCombinedPayload` on the server (for client-side checks). */
export function mergeScheduleIntoCombinedPayloadClient(
  combined: Record<string, unknown>,
  matchupPayloads: { week: number; payload: Record<string, unknown> }[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...combined };
  const base = (out.schedule as Record<string, unknown>[]) ?? [];
  const merged: Record<string, unknown>[] = [...base];
  const keyOf = (item: Record<string, unknown>) => {
    const home = (item.home as Record<string, unknown> | undefined)?.teamId;
    const away = (item.away as Record<string, unknown> | undefined)?.teamId;
    const sp = item.scoringPeriodId;
    return `${String(sp)}|${String(home)}|${String(away)}`;
  };
  const seen = new Set(merged.map((x) => keyOf(x)));
  for (const { payload } of matchupPayloads) {
    const sch = (payload.schedule as Record<string, unknown>[]) ?? [];
    for (const item of sch) {
      const k = keyOf(item);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(item);
      }
    }
  }
  out.schedule = merged;
  return out;
}

function payloadTeamLen(p: Record<string, unknown>): number {
  const t = p.teams;
  return Array.isArray(t) ? t.length : 0;
}

function payloadDraftPickLen(p: Record<string, unknown>): number {
  const dd = p.draftDetail as Record<string, unknown> | undefined;
  const picks = dd?.picks;
  return Array.isArray(picks) ? picks.length : 0;
}

function payloadTxnLen(p: Record<string, unknown>): number {
  const t = p.transactions;
  return Array.isArray(t) ? t.length : 0;
}

function payloadHasRosterEntries(p: Record<string, unknown>): boolean {
  for (const tm of (p.teams as Record<string, unknown>[]) || []) {
    const ent = (tm.roster as Record<string, unknown> | undefined)?.entries;
    if (Array.isArray(ent) && ent.length > 0) return true;
  }
  return false;
}

export function validateMergedEspnPayloadClient(
  merged: Record<string, unknown>,
  opts?: { matchupsExplicitlyUnavailable?: boolean },
): boolean {
  return clientMergedPayloadLooksViable(merged, opts);
}

export function clientMergedPayloadLooksViable(
  merged: Record<string, unknown>,
  opts?: { matchupsExplicitlyUnavailable?: boolean },
): boolean {
  if (payloadTeamLen(merged) <= 0) return false;
  if (opts?.matchupsExplicitlyUnavailable) return true;
  return (
    scheduleLen(merged) > 0 ||
    payloadDraftPickLen(merged) > 0 ||
    payloadTxnLen(merged) > 0 ||
    payloadHasRosterEntries(merged)
  );
}

export type BrowserGatherOk = {
  ok: true;
  combinedPayload: Record<string, unknown>;
  matchupPayloads: Array<{ week: number; payload: Record<string, unknown> }>;
  matchupsExplicitlyUnavailable: boolean;
  usedExtension: boolean;
};

export type BrowserGatherErr = {
  ok: false;
  message: string;
  usedExtension: boolean;
  kind?: string;
};

export type BrowserGatherResult = BrowserGatherOk | BrowserGatherErr;

const WEEKS = 17;
const WEEK_GAP_MS = 350;

/**
 * Combined + weeks 1–17. Tries credentialed browser `fetch` first; on block uses extension when present.
 */
export async function gatherEspnBrowserSessionBundle(
  leagueId: string,
  season: number,
  opts?: {
    onExtensionFallback?: () => void;
    /** `"auto"` (default): extension on CORS/5xx. `"never"`: browser-only (for phased sync UI). */
    extensionMode?: "auto" | "never";
  },
): Promise<BrowserGatherResult> {
  let usedExtension = false;
  let notifiedFallback = false;
  const tryExtensionOnBlocked = opts?.extensionMode !== "never";
  const markExtension = () => {
    usedExtension = true;
    if (!notifiedFallback) {
      notifiedFallback = true;
      opts?.onExtensionFallback?.();
    }
  };

  const combinedUrl = buildEspnCombinedLeagueUrl(leagueId, season);
  const combinedRes = await fetchEspnJsonWithRetry(combinedUrl, {
    tryExtensionOnBlocked,
    onTryingExtension: markExtension,
  });

  if (!combinedRes.ok) {
    if (combinedRes.kind === "auth") {
      return {
        ok: false,
        usedExtension,
        kind: "auth",
        message: "ESPN login expired or forbidden (401/403). Sign in at fantasy.espn.com.",
      };
    }
    if (combinedRes.kind === "not_found") {
      return { ok: false, usedExtension, kind: "not_found", message: "Season unavailable (404)." };
    }
    if (combinedRes.kind === "cors_or_network") {
      return {
        ok: false,
        usedExtension,
        kind: "cors_or_network",
        message: usedExtension
          ? `Extension fetch failed: ${combinedRes.message}`
          : "Browser fetch blocked (CORS or network). Install the GM War Room extension or try again from a context that can reach ESPN.",
      };
    }
    return {
      ok: false,
      usedExtension,
      kind: combinedRes.kind,
      message: combinedRes.message ?? `HTTP ${combinedRes.status}`,
    };
  }

  const combinedPayload = combinedRes.data as Record<string, unknown>;
  const matchupPayloads: Array<{ week: number; payload: Record<string, unknown> }> = [];

  for (let week = 1; week <= WEEKS; week++) {
    const weekUrl = buildEspnMatchupWeekUrl(leagueId, season, week);
    const r = await fetchEspnJsonWithRetry(weekUrl, {
      tryExtensionOnBlocked,
      onTryingExtension: markExtension,
    });
    if (!r.ok) {
      if (r.kind === "not_found") continue;
      if (r.kind === "auth") {
        return {
          ok: false,
          usedExtension,
          kind: "auth",
          message: "ESPN session expired during weekly fetch (401/403).",
        };
      }
      await sleep(WEEK_GAP_MS);
      continue;
    }
    if (scheduleLen(r.data) > 0) {
      matchupPayloads.push({ week, payload: r.data as Record<string, unknown> });
    }
    await sleep(WEEK_GAP_MS);
  }

  const baseSch = scheduleLen(combinedPayload);
  const matchupsExplicitlyUnavailable = baseSch === 0 && matchupPayloads.length === 0;

  const merged = mergeScheduleIntoCombinedPayloadClient(
    { ...combinedPayload, seasonId: combinedPayload.seasonId ?? season },
    matchupPayloads,
  );
  if (!clientMergedPayloadLooksViable(merged, { matchupsExplicitlyUnavailable })) {
    return {
      ok: false,
      usedExtension,
      kind: "empty_payload",
      message:
        "ESPN payloads had no importable teams plus schedule, draft, transactions, or rosters. Check league/season and ESPN login.",
    };
  }

  return {
    ok: true,
    combinedPayload: combinedPayload as Record<string, unknown>,
    matchupPayloads,
    matchupsExplicitlyUnavailable,
    usedExtension,
  };
}

/** Extension-only fetch of the combined league URL (background `credentials: "include"`). */
export function fetchEspnCombinedViaExtension(
  leagueId: string,
  season: number,
): Promise<EspnJsonResult> {
  return fetchEspnUrlViaExtension(buildEspnCombinedLeagueUrl(leagueId, season));
}

/** Extension-only fetch for one scoring period (`mMatchup` + `mMatchupScore`). */
export function fetchEspnWeekViaExtension(
  leagueId: string,
  season: number,
  week: number,
): Promise<EspnJsonResult> {
  return fetchEspnUrlViaExtension(buildEspnMatchupWeekUrl(leagueId, season, week));
}

/**
 * Combined + scoring periods 1–17 using **only** the Chrome extension (same JSON shape as browser gather).
 */
export async function fetchEspnCombinedAndWeekliesViaExtension(
  leagueId: string,
  season: number,
): Promise<BrowserGatherResult> {
  if (!isGmWarRoomExtensionPresent()) {
    return {
      ok: false,
      usedExtension: false,
      kind: "no_extension",
      message: "GM War Room extension is not active on this page (missing data-gmwr-extension).",
    };
  }
  const usedExtension = true;
  const combinedRes = await fetchEspnUrlViaExtension(buildEspnCombinedLeagueUrl(leagueId, season));
  if (!combinedRes.ok) {
    if (combinedRes.kind === "auth") {
      return {
        ok: false,
        usedExtension,
        kind: "auth",
        message: "ESPN login expired or forbidden (401/403). Sign in at fantasy.espn.com.",
      };
    }
    if (combinedRes.kind === "not_found") {
      return { ok: false, usedExtension, kind: "not_found", message: "Season unavailable (404)." };
    }
    return {
      ok: false,
      usedExtension,
      kind: combinedRes.kind,
      message:
        combinedRes.kind === "cors_or_network"
          ? combinedRes.message
          : combinedRes.message ?? `HTTP ${combinedRes.status}`,
    };
  }
  const combinedPayload = combinedRes.data as Record<string, unknown>;
  const matchupPayloads: Array<{ week: number; payload: Record<string, unknown> }> = [];
  for (let week = 1; week <= WEEKS; week++) {
    const r = await fetchEspnUrlViaExtension(buildEspnMatchupWeekUrl(leagueId, season, week));
    if (!r.ok) {
      if (r.kind === "not_found") continue;
      if (r.kind === "auth") {
        return {
          ok: false,
          usedExtension,
          kind: "auth",
          message: "ESPN session expired during weekly fetch (401/403).",
        };
      }
      await sleep(WEEK_GAP_MS);
      continue;
    }
    if (scheduleLen(r.data) > 0) {
      matchupPayloads.push({ week, payload: r.data as Record<string, unknown> });
    }
    await sleep(WEEK_GAP_MS);
  }
  const merged = mergeScheduleIntoCombinedPayloadClient(
    { ...combinedPayload, seasonId: combinedPayload.seasonId ?? season },
    matchupPayloads,
  );
  if (!clientMergedPayloadLooksViable(merged)) {
    return {
      ok: false,
      usedExtension,
      kind: "empty_payload",
      message:
        "ESPN payloads had no importable teams plus schedule, draft, transactions, or rosters. Check league/season and ESPN login.",
    };
  }
  const baseSch = scheduleLen(combinedPayload);
  const matchupsExplicitlyUnavailable = baseSch === 0 && matchupPayloads.length === 0;
  return {
    ok: true,
    combinedPayload: combinedPayload as Record<string, unknown>,
    matchupPayloads,
    matchupsExplicitlyUnavailable,
    usedExtension,
  };
}

/** Browser `fetch` first (no extension); on CORS/5xx/429 call `onBrowserBlocked`, then extension-only gather if available. */
export async function fetchEspnSeasonBundleBrowserOrExtension(args: {
  leagueId: string;
  season: number;
  onBrowserBlocked?: () => void;
}): Promise<BrowserGatherResult> {
  const browserOnly = await gatherEspnBrowserSessionBundle(args.leagueId, args.season, {
    extensionMode: "never",
  });
  if (browserOnly.ok) return browserOnly;
  const msg = browserOnly.message;
  const tryExt =
    browserOnly.kind === "cors_or_network" ||
    (browserOnly.kind === "http" &&
      (/HTTP 5\d\d/.test(msg) || /HTTP 429/.test(msg) || /Too many requests/i.test(msg)));
  if (tryExt && isGmWarRoomExtensionPresent()) {
    args.onBrowserBlocked?.();
    return fetchEspnCombinedAndWeekliesViaExtension(args.leagueId, args.season);
  }
  return browserOnly;
}
