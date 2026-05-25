/**
 * GM War Room extension — background service worker.
 * Reads ESPN cookies + gmwarroom session cookies, discovers 2026 leagues via ESPN profile API,
 * POSTs espn.saveCredentials per selected league. War Room cookies are injected via DNR
 * (fetch cannot set a Cookie header from a SW). ESPN historical JSON is fetched via a
 * fantasy.espn.com content script proxy (credentials: "include"); SW fetch cannot send ESPN cookies.
 */

const WAR_ROOM_ORIGIN = "https://gmwarroom.online";
const TRPC_SAVE_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.saveCredentials`;
const SYNC_AUTOSYNC_URL = `${WAR_ROOM_ORIGIN}/sync?autoSync=2026`;
/**
 * ESPN Fantasy web draft recap (same query shape the server uses as Referer for historical mDraftDetail).
 * Example: https://fantasy.espn.com/football/league/draftrecap?seasonId=2024&leagueId=457622
 */
function buildEspnDraftRecapUrl(seasonId, leagueId) {
  const lid = String(leagueId ?? "").trim();
  const y = Number(seasonId);
  if (!lid || !Number.isFinite(y) || y < 1999) return "";
  return `https://fantasy.espn.com/football/league/draftrecap?seasonId=${y}&leagueId=${encodeURIComponent(lid)}`;
}
/** User profile / teams for 2026 — more reliable than the leagues list endpoint for some accounts. */
const ESPN_PROFILE_DISCOVER_URL =
  "https://fantasy.espn.com/apis/v3/games/ffl/seasons/2026?view=proTeam";

const MSG_DISCOVER_LEAGUES = "GMWR_DISCOVER_LEAGUES_2026";
const MSG_SYNC_SELECTED_LEAGUES = "GMWR_SYNC_SELECTED_LEAGUES";

/** Session rules: inject Cookie only for matching requests, then removed. */
const DNR_SAVE_COOKIE_RULE_ID = 8844201;
const DNR_ESPN_PROFILE_RULE_ID = 8844202;

const ESPN_COOKIE_BASE_URLS = ["https://fantasy.espn.com/", "https://www.espn.com/"];

async function getEspnCookieValues() {
  let swid = "";
  let espnS2 = "";
  for (const url of ESPN_COOKIE_BASE_URLS) {
    const [swidRow, s2Row] = await Promise.all([
      chrome.cookies.get({ url, name: "SWID" }),
      chrome.cookies.get({ url, name: "espn_s2" }),
    ]);
    if (!swid && swidRow?.value) swid = swidRow.value;
    if (!espnS2 && s2Row?.value) espnS2 = s2Row.value;
    if (swid && espnS2) break;
  }
  return { swid, espnS2 };
}

function buildEspnCookieHeader(swid, espnS2) {
  return `SWID=${swid}; espn_s2=${espnS2}`;
}

/** Cookies scoped to GM War Room (host cookies only for this URL). */
async function getWarRoomCookieHeaderString() {
  const rows = await chrome.cookies.getAll({ url: `${WAR_ROOM_ORIGIN}/` });
  return rows.map((c) => `${c.name}=${c.value}`).join("; ");
}

function hasTrpcError(json) {
  return Boolean(json && (json.error || (Array.isArray(json) && json[0]?.error)));
}

function trpcErrorText(json) {
  if (!json || typeof json !== "object") return "";
  if (Array.isArray(json) && json[0]?.error?.json?.message) {
    return String(json[0].error.json.message);
  }
  if (json[0]?.error?.message) return String(json[0].error.message);
  if (json.error?.json?.message) return String(json.error.json.message);
  if (json.error?.message) return String(json.error.message);
  try {
    return JSON.stringify(json).slice(0, 500);
  } catch {
    return "";
  }
}

function safeErrorSummary(status, json) {
  const fromTrpc = trpcErrorText(json).trim();
  if (fromTrpc && fromTrpc.length <= 400) return fromTrpc;
  if (status) return `HTTP ${status}`;
  return "Request failed";
}

function dedupeLeaguesById(leagues) {
  const map = new Map();
  for (const L of leagues) {
    if (L?.id && !map.has(L.id)) map.set(L.id, L);
  }
  return [...map.values()];
}

/**
 * Parse ESPN discover payload: prefers top-level array of league objects with id + settings.name;
 * also handles { leagues: [...] }, single league object, or record-of-league objects.
 */
function extractLeaguesFromDiscoverJson(data) {
  const out = [];

  function pushLeague(obj) {
    if (!obj || typeof obj !== "object") return;
    const rawId = obj.id ?? obj.leagueId;
    if (rawId === undefined || rawId === null || rawId === "") return;
    const id = String(rawId).trim();
    if (!id) return;
    const settings = obj.settings && typeof obj.settings === "object" ? obj.settings : null;
    let name = "";
    if (settings) {
      if (settings.name) name = String(settings.name);
      else if (settings.leagueName) name = String(settings.leagueName);
    }
    if (!name && obj.name) name = String(obj.name);
    if (!name) name = `League ${id}`;
    out.push({ id, name });
  }

  if (Array.isArray(data)) {
    for (const item of data) pushLeague(item);
    return dedupeLeaguesById(out);
  }

  if (data && typeof data === "object") {
    if (Array.isArray(data.leagues)) {
      for (const item of data.leagues) pushLeague(item);
    }
    if (Array.isArray(data.leagueSummaries)) {
      for (const item of data.leagueSummaries) pushLeague(item);
    }
    pushLeague(data);
    const vals = Object.values(data);
    const looksLikeLeagueMap =
      vals.length > 0 &&
      vals.every((v) => v && typeof v === "object" && (v.id != null || v.leagueId != null));
    if (looksLikeLeagueMap && !Array.isArray(data)) {
      for (const v of vals) pushLeague(v);
    }
  }

  return dedupeLeaguesById(out);
}

/** Pull league ids from proTeam-style payload (teams map, member teams, etc.). */
function extractLeaguesFromProTeamPayload(data) {
  const fromGeneric = extractLeaguesFromDiscoverJson(data);
  if (fromGeneric.length > 0) return fromGeneric;

  const out = [];
  function pushLeague(obj) {
    if (!obj || typeof obj !== "object") return;
    const rawId = obj.leagueId ?? obj.league_id;
    if (rawId === undefined || rawId === null || rawId === "") return;
    const id = String(rawId).trim();
    if (!id || !/^\d+$/.test(id)) return;
    const settings = obj.settings && typeof obj.settings === "object" ? obj.settings : null;
    let name = "";
    if (settings?.name) name = String(settings.name);
    if (!name && obj.name) name = String(obj.name);
    if (!name && obj.location && obj.nickname) name = `${obj.location} ${obj.nickname}`.trim();
    if (!name) name = `League ${id}`;
    out.push({ id, name });
  }

  if (data?.teams && typeof data.teams === "object") {
    for (const t of Object.values(data.teams)) pushLeague(t);
  }
  if (Array.isArray(data?.memberTeams)) {
    for (const t of data.memberTeams) pushLeague(t);
  }
  if (Array.isArray(data?.teams)) {
    for (const t of data.teams) pushLeague(t);
  }

  return dedupeLeaguesById(out);
}

/** leagueId from fantasy.espn.com league/team/draftrecap URLs. */
function extractLeagueIdFromEspnFantasyUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr);
    const qp = u.searchParams.get("leagueId") || u.searchParams.get("league_id");
    if (qp && /^\d+$/.test(String(qp).trim())) return String(qp).trim();
    const pathMatch = u.pathname.match(/\/leagues\/(\d+)/i);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    /* fall through */
  }
  const m =
    urlStr.match(/[?&]leagueId=(\d+)/i) ||
    urlStr.match(/[?&]league_id=(\d+)/i) ||
    urlStr.match(/\/leagues\/(\d+)/i);
  return m?.[1] ?? null;
}

/** seasonId query param from draft recap (and similar) ESPN URLs. */
function extractSeasonIdFromEspnFantasyUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr);
    const s = u.searchParams.get("seasonId") || u.searchParams.get("season_id");
    if (s && /^\d{4}$/.test(String(s).trim())) return Number(s.trim());
  } catch {
    /* ignore */
  }
  const m = urlStr.match(/[?&]seasonId=(\d{4})/i) || urlStr.match(/[?&]season_id=(\d{4})/i);
  return m?.[1] ? Number(m[1]) : null;
}

async function getLeagueIdFromActiveEspnTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;
    if (!url || typeof url !== "string") return null;
    if (!url.includes("espn.com")) return null;
    const leagueId = extractLeagueIdFromEspnFantasyUrl(url);
    if (leagueId && (url.includes("draftrecap") || url.includes("/draft"))) {
      const seasonId = extractSeasonIdFromEspnFantasyUrl(url);
      const recap = buildEspnDraftRecapUrl(seasonId ?? new Date().getFullYear() - 1, leagueId);
      if (recap) console.info("[GMWR] ESPN draft context tab", { leagueId, seasonId, recap });
    }
    return leagueId;
  } catch {
    return null;
  }
}

async function applyEspnProfileDiscoverCookieRule(cookieHeader) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_ESPN_PROFILE_RULE_ID],
    addRules: [
      {
        id: DNR_ESPN_PROFILE_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: cookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasy.espn.com/apis/v3/games/ffl/seasons/2026*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
    ],
  });
}

async function removeEspnProfileDiscoverCookieRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_ESPN_PROFILE_RULE_ID],
    });
  } catch {
    /* ignore */
  }
}

/**
 * GET profile (proTeam) for 2026; on empty/failed parse, fall back to leagueId from active ESPN tab URL.
 */
async function discoverLeaguesWithEspnCookie(espnCookieHeader) {
  const tabLeagueId = await getLeagueIdFromActiveEspnTab();

  await applyEspnProfileDiscoverCookieRule(espnCookieHeader);
  let httpStatus = 0;
  let parsed = null;
  try {
    const res = await fetch(ESPN_PROFILE_DISCOVER_URL, {
      method: "GET",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Referer: "https://fantasy.espn.com/",
      },
    });
    httpStatus = res.status;
    const ct = res.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) {
        parsed = await res.json();
      } else {
        await res.text();
      }
    } catch {
      /* ignore */
    }

    let leagues = [];
    if (res.ok && parsed) {
      leagues = extractLeaguesFromProTeamPayload(parsed);
    }

    console.info("[GMWR] ESPN profile discovery", {
      httpStatus,
      leagueCount: leagues.length,
      tabLeagueIdPresent: Boolean(tabLeagueId),
    });

    if (leagues.length === 0 && tabLeagueId) {
      leagues = [{ id: tabLeagueId, name: `League ${tabLeagueId}` }];
    }

    if (leagues.length === 0 && !tabLeagueId) {
      return {
        ok: false,
        leagues: [],
        tabLeagueId: null,
        error: res.ok
          ? "No leagues found from ESPN profile or your current tab URL."
          : safeErrorSummary(httpStatus, parsed),
        httpStatus,
      };
    }

    return { ok: true, leagues, tabLeagueId, httpStatus };
  } finally {
    await removeEspnProfileDiscoverCookieRule();
  }
}

async function applySaveCredentialsCookieRule(cookieHeader) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_SAVE_COOKIE_RULE_ID],
    addRules: [
      {
        id: DNR_SAVE_COOKIE_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: cookieHeader }],
        },
        condition: {
          urlFilter: `${TRPC_SAVE_URL}*`,
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
    ],
  });
}

async function removeSaveCredentialsCookieRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_SAVE_COOKIE_RULE_ID],
    });
  } catch {
    /* ignore */
  }
}

// ─── Historical league import (browser ESPN session → War Room tRPC) ───
const TRPC_INGEST_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.ingestHistoricalSeasonPayload`;
const TRPC_HIST_STATUS_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.historicalImportStatus`;
const DNR_TRPC_HIST_RULE_ID = 8844210;

const MSG_HIST_DISCOVER = "GMWR_HIST_DISCOVER";
const MSG_HIST_TEST = "GMWR_HIST_TEST";
const MSG_HIST_FULL = "GMWR_HIST_FULL";
const MSG_HIST_STATUS = "GMWR_HIST_STATUS";
/** Page (gmwarroom) → background: credentialed GET to fantasy.espn.com for browser-session sync. */
const MSG_PAGE_ESPN_FETCH = "GMWR_PAGE_ESPN_FETCH";

function trpcResultJson(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.result?.data?.json !== undefined) return parsed.result.data.json;
  if (Array.isArray(parsed) && parsed[0]?.result?.data?.json !== undefined) {
    return parsed[0].result.data.json;
  }
  return null;
}

async function applyWarRoomTrpcHistRule(warRoomCookieHeader) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_TRPC_HIST_RULE_ID, DNR_TRPC_HIST_RULE_ID + 1],
    addRules: [
      {
        id: DNR_TRPC_HIST_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://gmwarroom.online/api/trpc/espn.ingestHistoricalSeasonPayload*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
      {
        id: DNR_TRPC_HIST_RULE_ID + 1,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://gmwarroom.online/api/trpc/espn.historicalImportStatus*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
    ],
  });
}

async function removeWarRoomTrpcHistRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_TRPC_HIST_RULE_ID, DNR_TRPC_HIST_RULE_ID + 1],
    });
  } catch {
    /* ignore */
  }
}

/**
 * ESPN seasons we may attempt to import: fixed window [2009, current calendar year].
 * No HTML/API discovery — avoids phantom future years (e.g. 2027+) and duplicate years from page scraping.
 */
function buildEspnSeasonDiscoveryList() {
  const currentYear = new Date().getFullYear();
  const minYear = 2009;
  if (currentYear < minYear) return [];
  const seasons = [];
  for (let y = minYear; y <= currentYear; y++) {
    seasons.push(y);
  }
  return seasons;
}

function scheduleLen(data) {
  const s = data?.schedule;
  return Array.isArray(s) ? s.length : 0;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/** League id for API path: digits only (avoids pasted URLs / query junk corrupting the path). */
function normalizeEspnLeagueIdForPath(leagueId) {
  const raw = String(leagueId ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    const fromUrl = extractLeagueIdFromEspnFantasyUrl(raw);
    if (fromUrl) return fromUrl;
  }
  if (/^\d+$/.test(raw)) return raw;
  const m = raw.match(/\b(\d{4,12})\b/);
  return m ? m[1] : "";
}

/** Integer season year for API path only. */
function sanitizeEspnHistoricalSeasonYear(season) {
  const y = Math.floor(Number(season));
  if (!Number.isFinite(y) || y < 1999 || y > 2100) return NaN;
  return y;
}

/**
 * Combined league payload URL — path is strictly `/seasons/{int}/segments/0/leagues/{leagueId}`;
 * views are query only via URLSearchParams.append("view", …).
 */
function buildCombinedLeagueUrl(leagueId, season) {
  const lid = normalizeEspnLeagueIdForPath(leagueId);
  const y = sanitizeEspnHistoricalSeasonYear(season);
  if (!lid || Number.isNaN(y)) return "";
  const params = new URLSearchParams();
  for (const view of ["mTeam", "mStandings", "mDraftDetail", "mTransactions2", "mSettings"]) {
    params.append("view", view);
  }
  return `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${y}/segments/0/leagues/${encodeURIComponent(lid)}?${params.toString()}`;
}

function buildMatchupWeekUrl(leagueId, season, week) {
  const lid = normalizeEspnLeagueIdForPath(leagueId);
  const y = sanitizeEspnHistoricalSeasonYear(season);
  const w = Math.floor(Number(week));
  if (!lid || Number.isNaN(y) || !Number.isFinite(w) || w < 1 || w > 25) return "";
  const params = new URLSearchParams();
  params.append("view", "mMatchup");
  params.append("view", "mMatchupScore");
  params.append("scoringPeriodId", String(w));
  return `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${y}/segments/0/leagues/${encodeURIComponent(lid)}?${params.toString()}`;
}

/** User-visible hint when no `https://fantasy.espn.com/football/*` tab exists (content script + same-origin fetch). */
const MSG_NO_ESPN_FOOTBALL_TAB = "Open your ESPN fantasy league page first, then retry.";

/** Message type handled by `content.js` on fantasy.espn.com/football (credentials: include fetch). */
const MSG_FETCH_ESPN_IN_PAGE = "GMWR_FETCH_ESPN";

const ESPN_FOOTBALL_TAB_MATCH = "https://fantasy.espn.com/football/*";

function isEspnFootballFantasyTabUrl(u) {
  if (typeof u !== "string") return false;
  return (
    u.startsWith("https://fantasy.espn.com/football/") ||
    u === "https://fantasy.espn.com/football" ||
    u.startsWith("https://fantasy.espn.com/football?")
  );
}

/** Tab under `/football` so the FFL API is same-origin and `content.js` is injected. */
async function findEspnFootballFantasyTab() {
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const u = active?.url;
    if (active?.id != null && isEspnFootballFantasyTabUrl(u)) {
      return { tabId: active.id, tabUrl: u };
    }
  } catch {
    /* ignore */
  }
  try {
    const tabs = await chrome.tabs.query({ url: ESPN_FOOTBALL_TAB_MATCH });
    const t = tabs.find((x) => x.id != null);
    if (t?.id != null && typeof t.url === "string") return { tabId: t.id, tabUrl: t.url };
  } catch {
    /* ignore */
  }
  return null;
}

/** Map content-script payload `{ ok, status, json, errorType }` into SW fetch result shape. */
function normalizeGmwrEspnContentResponse(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      status: 0,
      error: "empty_tab_response",
      errorType: "empty_tab_response",
      data: null,
    };
  }
  const status = typeof raw.status === "number" ? raw.status : 0;
  const et = raw.errorType != null ? String(raw.errorType) : "";
  if (raw.ok === true) {
    return {
      ok: true,
      status: status || 200,
      error: null,
      errorType: null,
      data: raw.json,
    };
  }
  const typeToLegacy = {
    espn_login_expired: "ESPN login expired",
    unavailable: "not_found",
    rate_limited: "rate_limited",
    cors_or_network_blocked: "cors_or_network_blocked",
    network_error: "network_error",
    espn_html_not_json: "espn_html_not_json",
    invalid_url: "invalid_url",
    invalid_json: "invalid_json",
    http_error: "http_error",
  };
  const error = typeToLegacy[et] || et || "tab_fetch_failed";
  return { ok: false, status, error, errorType: et || "unknown", data: null };
}

async function fetchEspnJsonViaContentScriptOnce(url, label, attempt) {
  const tab = await findEspnFootballFantasyTab();
  if (!tab) {
    console.warn("[GMWR] ESPN fetch no football fantasy tab", {
      url,
      label,
      attempt,
      hint: MSG_NO_ESPN_FOOTBALL_TAB,
    });
    return {
      ok: false,
      status: 0,
      error: MSG_NO_ESPN_FOOTBALL_TAB,
      errorType: "no_espn_football_tab",
      data: null,
    };
  }
  const { tabId, tabUrl } = tab;
  let fetchOrigin = "";
  try {
    fetchOrigin = new URL(tabUrl).origin;
  } catch {
    fetchOrigin = "";
  }
  try {
    const raw = await chrome.tabs.sendMessage(tabId, { type: MSG_FETCH_ESPN_IN_PAGE, url });
    const norm = normalizeGmwrEspnContentResponse(raw);
    const payloadKeys =
      norm.ok && norm.data && typeof norm.data === "object" && !Array.isArray(norm.data)
        ? Object.keys(norm.data).slice(0, 50)
        : [];
    console.info("[GMWR] ESPN content-script fetch", {
      tabId,
      tabUrl,
      fetchOrigin,
      url,
      status: norm.status,
      label,
      attempt,
      ok: norm.ok,
      errorType: norm.errorType ?? raw?.errorType ?? null,
      payloadKeys,
    });
    return norm;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dead =
      /Receiving end does not exist|Could not establish connection/i.test(msg) ||
      msg.includes("The message port closed");
    console.warn("[GMWR] ESPN tabs.sendMessage failed", {
      tabId,
      tabUrl,
      fetchOrigin,
      url,
      label,
      attempt,
      error: msg,
    });
    return {
      ok: false,
      status: 0,
      error: dead ? "no_espn_content_script" : msg,
      errorType: dead ? "no_espn_content_script" : "network_error",
      data: null,
    };
  }
}

/** Serialize ESPN fantasy API fetches (backoff / gentler on rate limits). */
let __gmwrEspnHistFetchQueue = Promise.resolve();

async function fetchEspnJsonWithBackoff(url, opts) {
  const next = __gmwrEspnHistFetchQueue.then(() => fetchEspnJsonWithBackoffUnlocked(url, opts));
  __gmwrEspnHistFetchQueue = next.catch(() => undefined);
  return next;
}

async function fetchEspnJsonWithBackoffUnlocked(url, { label }) {
  let attempt = 0;
  let delay = 500;
  while (attempt < 6) {
    const r = await fetchEspnJsonViaContentScriptOnce(url, label, attempt);
    const status = r.status ?? 0;
    console.info("[GMWR] historical ESPN", { url, label, status, attempt, via: "content_script" });

    if (!r.ok) {
      if (
        r.errorType === "no_espn_football_tab" ||
        r.error === MSG_NO_ESPN_FOOTBALL_TAB ||
        r.error === "no_espn_tab" ||
        r.error === "no_espn_content_script"
      ) {
        return { ok: false, status: 0, error: r.error || MSG_NO_ESPN_FOOTBALL_TAB, data: null };
      }
      if (r.error === "cors_or_network_blocked" || r.errorType === "cors_or_network_blocked") {
        console.warn("[GMWR] ESPN fetch blocked (CORS/network)", { url, label, attempt });
        return { ok: false, status: 0, error: "cors_or_network_blocked", data: null };
      }
      if (r.error === "network_error" || r.errorType === "network_error") {
        console.warn("[GMWR] ESPN fetch network error", { url, label, attempt });
        return { ok: false, status: 0, error: "network_error", data: null };
      }
      if (r.error === "ESPN login expired" || status === 401 || status === 403) {
        console.warn("[GMWR] ESPN fetch failed", {
          url,
          httpStatus: status,
          label,
          attempt,
          error: "ESPN login expired",
        });
        return { ok: false, status: status || 401, error: "ESPN login expired", data: null };
      }
      if (r.error === "not_found" || status === 404) {
        console.warn("[GMWR] ESPN fetch failed", { url, httpStatus: status, label, attempt, error: "not_found" });
        return { ok: false, status: status || 404, error: "not_found", data: null };
      }
      if (status === 429 || r.error === "rate_limited") {
        attempt += 1;
        console.warn("[GMWR] ESPN fetch rate limited, retrying", {
          url,
          httpStatus: status,
          label,
          attempt,
          delayMs: delay,
        });
        await sleep(delay);
        delay = Math.min(delay * 2, 8000);
        continue;
      }
      console.warn("[GMWR] ESPN fetch failed", {
        url,
        httpStatus: status,
        label,
        attempt,
        error: r.error || "request_failed",
      });
      return { ok: false, status, error: r.error || `HTTP ${status}`, data: null };
    }

    if (r.data == null) {
      console.warn("[GMWR] ESPN fetch empty or non-JSON body", { url, httpStatus: status, label, attempt });
      return { ok: false, status, error: "empty_json", data: null };
    }
    return { ok: true, status, error: null, data: r.data };
  }
  console.warn("[GMWR] ESPN fetch failed after retries", { url, httpStatus: 429, label, error: "rate_limited" });
  return { ok: false, status: 429, error: "rate_limited", data: null };
}

async function fetchWeeklyMatchupsIfNeeded(leagueId, season, combined) {
  const matchupPayloads = [];
  if (scheduleLen(combined) > 0) return matchupPayloads;
  for (let week = 1; week <= 17; week++) {
    await sleep(500);
    const url = buildMatchupWeekUrl(leagueId, season, week);
    if (!url) continue;
    const r = await fetchEspnJsonWithBackoff(url, { label: `mMatchup_${season}_${week}` });
    if (!r.ok) {
      if (r.status === 404) continue;
      if (r.error === "ESPN login expired") return { error: r.error, matchupPayloads };
      if (
        r.error === "no_espn_tab" ||
        r.error === "no_espn_content_script" ||
        r.error === MSG_NO_ESPN_FOOTBALL_TAB ||
        r.error === "cors_or_network_blocked" ||
        r.error === "network_error"
      ) {
        return { error: r.error, matchupPayloads };
      }
      continue;
    }
    if (r.data && scheduleLen(r.data) > 0) {
      matchupPayloads.push({ week, payload: r.data });
    }
  }
  return { error: null, matchupPayloads };
}

async function postTrpcHistJson(url, warRoomCookieHeader, jsonInput) {
  const body = JSON.stringify({ json: jsonInput });
  await applyWarRoomTrpcHistRule(warRoomCookieHeader);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include",
    });
    const status = res.status;
    let parsed = null;
    const ct = res.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) parsed = await res.json();
      else await res.text();
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      return { ok: false, status, error: safeErrorSummary(status, parsed), parsed };
    }
    if (hasTrpcError(parsed)) {
      return { ok: false, status, error: safeErrorSummary(status, parsed), parsed };
    }
    return { ok: true, status, parsed };
  } finally {
    await removeWarRoomTrpcHistRule();
  }
}

async function runHistoricalImportOneSeason({
  leagueId,
  season,
  warRoomCookieHeader,
  force,
}) {
  const combinedUrl = buildCombinedLeagueUrl(leagueId, season);
  if (!combinedUrl) {
    console.warn("[GMWR] historical combined URL invalid", { leagueId, season });
    return { ok: false, error: "invalid_league_or_season", season };
  }
  const combinedRes = await fetchEspnJsonWithBackoff(combinedUrl, {
    label: `combined_${season}`,
  });
  if (!combinedRes.ok && combinedRes.error === "ESPN login expired") {
    return { ok: false, error: "ESPN login expired", season };
  }
  if (!combinedRes.ok || !combinedRes.data) {
    console.warn("[GMWR] historical combined fetch failed", {
      leagueId,
      season,
      url: combinedUrl,
      httpStatus: combinedRes.status ?? null,
      error: combinedRes.error || "combined_fetch_failed",
    });
    return { ok: false, error: combinedRes.error || "combined_fetch_failed", season };
  }
  const combined = combinedRes.data;
  const weekly = await fetchWeeklyMatchupsIfNeeded(leagueId, season, combined);
  const weeklyErr = Array.isArray(weekly) ? null : weekly.error;
  if (weeklyErr) {
    return { ok: false, error: weeklyErr, season };
  }
  const matchupPayloads = Array.isArray(weekly) ? weekly : weekly.matchupPayloads || [];
  const matchupsExplicitlyUnavailable =
    scheduleLen(combined) === 0 && matchupPayloads.length === 0;
  const ingestBody = {
    leagueId: String(leagueId).trim(),
    season,
    source: "chrome_extension_espn_api",
    combinedPayload: combined,
    matchupPayloads,
    force: Boolean(force),
    matchupsExplicitlyUnavailable,
  };
  const post = await postTrpcHistJson(TRPC_INGEST_URL, warRoomCookieHeader, ingestBody);
  if (!post.ok) {
    return { ok: false, error: post.error || "ingest_failed", season, httpStatus: post.status };
  }
  const resultJson = trpcResultJson(post.parsed);
  return { ok: true, season, result: resultJson };
}

async function openOrFocusSyncTab() {
  const tabs = await chrome.tabs.query({ url: "https://gmwarroom.online/*" });
  const existing = tabs.find((t) => t.id != null) ?? null;
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { url: SYNC_AUTOSYNC_URL, active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: SYNC_AUTOSYNC_URL, active: true });
}

/**
 * POST saveCredentials. Cookie header is applied via DNR (SW fetch forbids Cookie).
 */
async function postSaveCredentials({ swid, espnS2, leagueId, warRoomCookieHeader }) {
  const json = { swid, espnS2, leagueId: String(leagueId).trim() };
  const body = JSON.stringify({ json });

  await applySaveCredentialsCookieRule(warRoomCookieHeader);
  try {
    const res = await fetch(TRPC_SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include",
    });

    const status = res.status;
    let parsed = null;
    const ct = res.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) {
        parsed = await res.json();
      } else {
        await res.text();
      }
    } catch {
      /* ignore body parse errors */
    }

    if (!res.ok) {
      return { ok: false, status, error: safeErrorSummary(status, parsed) };
    }
    if (hasTrpcError(parsed)) {
      return { ok: false, status, error: safeErrorSummary(status, parsed) };
    }
    console.info("[GMWR] saveCredentials OK", { leagueId: json.leagueId, httpStatus: status });
    return { ok: true, status };
  } finally {
    await removeSaveCredentialsCookieRule();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const t = message?.type;

  if (t === MSG_PAGE_ESPN_FETCH) {
    (async () => {
      const url = String(message?.url || "").trim();
      if (!url.startsWith("https://fantasy.espn.com/")) {
        sendResponse({ ok: false, status: 0, error: "invalid_espn_url", result: null, bodyText: "" });
        return;
      }
      const r = await fetchEspnJsonWithBackoff(url, { label: "page_bridge" });
      if (!r.ok || r.data == null) {
        const err =
          r.error === "not_found"
            ? "not_found"
            : r.error === "ESPN login expired"
              ? "ESPN login expired"
              : r.error === "no_espn_tab" ||
                  r.error === "no_espn_content_script" ||
                  r.error === MSG_NO_ESPN_FOOTBALL_TAB ||
                  r.error === "cors_or_network_blocked" ||
                  r.error === "network_error"
                ? r.error
                : r.error || "fetch_failed";
        sendResponse({
          ok: false,
          status: r.status ?? 0,
          error: err,
          result: null,
          bodyText: "",
        });
        return;
      }
      const bodyText = JSON.stringify(r.data);
      sendResponse({ ok: true, status: r.status ?? 200, error: "", result: r.data, bodyText });
    })().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      sendResponse({ ok: false, status: 0, error: msg, result: null, bodyText: "" });
    });
    return true;
  }

  if (t === MSG_DISCOVER_LEAGUES) {
    (async () => {
      const { swid, espnS2 } = await getEspnCookieValues();
      const hasSwid = Boolean(swid);
      const hasS2 = Boolean(espnS2);
      if (!hasSwid || !hasS2) {
        console.info("[GMWR] ESPN league discovery skipped", { reason: "missing_espn_cookies" });
        sendResponse({
          ok: false,
          leagues: [],
          error:
            "ESPN cookies not found. Open fantasy.espn.com (or espn.com), sign in, then try again.",
        });
        return;
      }
      const espnCookieHeader = buildEspnCookieHeader(swid, espnS2);
      const result = await discoverLeaguesWithEspnCookie(espnCookieHeader);
      sendResponse(result);
    })().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.info("[GMWR] ESPN league discovery failed", { error: msg });
      sendResponse({ ok: false, leagues: [], error: msg });
    });
    return true;
  }

  if (t === MSG_SYNC_SELECTED_LEAGUES) {
    (async () => {
      const rawIds = message?.leagueIds;
      const leagueIds = Array.isArray(rawIds)
        ? rawIds.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (leagueIds.length === 0) {
        sendResponse({ ok: false, error: "No leagues selected." });
        return;
      }

      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        sendResponse({
          ok: false,
          error: "ESPN cookies not found. Sign in at ESPN, then try again.",
        });
        return;
      }

      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({
          ok: false,
          error:
            "GM War Room session not found. Sign in at gmwarroom.online in this browser, then try again.",
        });
        return;
      }

      for (const leagueId of leagueIds) {
        const result = await postSaveCredentials({
          swid,
          espnS2,
          leagueId,
          warRoomCookieHeader,
        });
        if (!result.ok) {
          console.info("[GMWR] saveCredentials failed", {
            leagueId,
            httpStatus: result.status ?? null,
            error: result.error ?? null,
          });
          sendResponse({
            ok: false,
            error: result.error || "Save failed.",
            failedLeagueId: leagueId,
            httpStatus: result.status,
          });
          return;
        }
      }

      await openOrFocusSyncTab();
      sendResponse({ ok: true });
    })().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.info("[GMWR] sync selected leagues failed", { error: msg });
      sendResponse({ ok: false, error: msg });
    });
    return true;
  }

  if (t === MSG_HIST_DISCOVER) {
    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const currentYear = new Date().getFullYear();
      const seasons = buildEspnSeasonDiscoveryList();
      const skipped = [];
      console.info("[GMWR] historical discover (fixed range)", {
        leagueId,
        minYear: 2009,
        currentYear,
        seasonCount: seasons.length,
      });
      sendResponse({ ok: true, seasons, skipped, httpStatus: 200 });
    })().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, seasons: [], error: msg });
    });
    return true;
  }

  if (t === MSG_HIST_TEST) {
    (async () => {
      const espnTab = await findEspnFootballFantasyTab();
      if (espnTab == null) {
        sendResponse({
          ok: false,
          error: MSG_NO_ESPN_FOOTBALL_TAB,
          details: "no_espn_football_tab",
        });
        return;
      }
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({ ok: false, error: "GM War Room session not found. Sign in at gmwarroom.online." });
        return;
      }
      const leagueId = String(message?.leagueId || "457622").trim();
      const r = await runHistoricalImportOneSeason({
        leagueId,
        season: 2010,
        warRoomCookieHeader,
        force: Boolean(message?.force),
      });
      sendResponse(r);
    })().catch((err) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }

  if (t === MSG_HIST_FULL) {
    (async () => {
      const espnTab = await findEspnFootballFantasyTab();
      if (espnTab == null) {
        sendResponse({
          ok: false,
          error: MSG_NO_ESPN_FOOTBALL_TAB,
          results: [],
          details: "no_espn_football_tab",
        });
        return;
      }
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({ ok: false, error: "GM War Room session not found.", results: [] });
        return;
      }
      const leagueId = String(message?.leagueId || "457622").trim();
      const rawSeasons = Array.isArray(message?.seasons) ? message.seasons : [];
      const currentYear = new Date().getFullYear();
      const uniq = [...new Set(rawSeasons)]
        .map((x) => Math.floor(Number(x)))
        .filter((y) => Number.isFinite(y) && y >= 2009 && y <= currentYear)
        .sort((a, b) => a - b);
      const ordered = uniq.includes(2010) ? [2010, ...uniq.filter((s) => s !== 2010)] : uniq;
      const results = [];
      let consecFail = 0;
      for (const season of ordered) {
        await sleep(500);
        const r = await runHistoricalImportOneSeason({
          leagueId,
          season,
          warRoomCookieHeader,
          force: Boolean(message?.force),
        });
        results.push(r);
        const skipped = Boolean(r.result?.skipped);
        const okSeason = r.ok && (skipped || r.result?.success === true);
        if (!okSeason) consecFail += 1;
        else consecFail = 0;
        if (consecFail >= 2) {
          sendResponse({ ok: true, results, aborted: true, reason: "two_consecutive_failures" });
          return;
        }
      }
      sendResponse({ ok: true, results, aborted: false });
    })().catch((err) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err), results: [] });
    });
    return true;
  }

  if (t === MSG_HIST_STATUS) {
    (async () => {
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({ ok: false, error: "GM War Room session not found." });
        return;
      }
      const leagueId = message?.leagueId ? String(message.leagueId).trim() : undefined;
      const post = await postTrpcHistJson(TRPC_HIST_STATUS_URL, warRoomCookieHeader, { leagueId });
      if (!post.ok) {
        sendResponse({ ok: false, error: post.error || "status_failed" });
        return;
      }
      sendResponse({ ok: true, data: trpcResultJson(post.parsed) });
    })().catch((err) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }

  return false;
});
