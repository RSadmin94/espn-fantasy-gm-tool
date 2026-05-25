/**
 * GM War Room extension — background service worker.
 * Reads ESPN cookies + gmwarroom session cookies, discovers 2026 leagues via ESPN profile API,
 * POSTs espn.saveCredentials per selected league. War Room cookies are injected via DNR
 * (fetch cannot set a Cookie header from a SW); ESPN discovery uses the same for SWID/espn_s2.
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
const DNR_ESPN_HIST_API_RULE_ID = 8844211;

const MSG_HIST_DISCOVER = "GMWR_HIST_DISCOVER";
const MSG_HIST_TEST = "GMWR_HIST_TEST";
const MSG_HIST_FULL = "GMWR_HIST_FULL";
const MSG_HIST_STATUS = "GMWR_HIST_STATUS";

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

async function applyEspnHistApiCookieRule(espnCookieHeader) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_ESPN_HIST_API_RULE_ID],
    addRules: [
      {
        id: DNR_ESPN_HIST_API_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: espnCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasy.espn.com/apis/v3/games/ffl/*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
    ],
  });
}

async function removeEspnHistApiCookieRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_ESPN_HIST_API_RULE_ID],
    });
  } catch {
    /* ignore */
  }
}

async function applyEspnHistHtmlCookieRule(espnCookieHeader) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [8844212],
    addRules: [
      {
        id: 8844212,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: espnCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasy.espn.com/football/league/history*",
          resourceTypes: ["xmlhttprequest", "main_frame", "sub_frame", "other"],
        },
      },
    ],
  });
}

async function removeEspnHistHtmlCookieRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [8844212] });
  } catch {
    /* ignore */
  }
}

function parseSeasonsFromHistoryHtml(html, leagueId) {
  const seasons = new Set();
  const reYear = /\b(20[0-2]\d)\b/g;
  let m;
  while ((m = reYear.exec(html)) !== null) {
    const y = Number(m[1]);
    if (y >= 2010 && y <= 2100) seasons.add(y);
  }
  for (const mm of html.matchAll(/seasonId[=:](\d{4})/gi)) seasons.add(Number(mm[1]));
  for (const mm of html.matchAll(/"season"\s*:\s*(\d{4})/g)) seasons.add(Number(mm[1]));
  seasons.delete(2009);
  return [...seasons].sort((a, b) => a - b);
}

function scheduleLen(data) {
  const s = data?.schedule;
  return Array.isArray(s) ? s.length : 0;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchEspnJsonWithBackoff(url, { espnCookieHeader, label }) {
  let attempt = 0;
  let delay = 500;
  while (attempt < 6) {
    await applyEspnHistApiCookieRule(espnCookieHeader);
    let res;
    try {
      res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Referer: "https://fantasy.espn.com/",
        },
      });
    } finally {
      await removeEspnHistApiCookieRule();
    }
    const status = res.status;
    console.info("[GMWR] historical ESPN", { label, status, attempt });
    if (status === 401 || status === 403) {
      return { ok: false, status, error: "ESPN login expired", data: null };
    }
    if (status === 404) {
      return { ok: false, status, error: "not_found", data: null };
    }
    if (status === 429) {
      attempt += 1;
      await sleep(delay);
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    if (!res.ok) {
      return { ok: false, status, error: `HTTP ${status}`, data: null };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: true, status, error: null, data };
  }
  return { ok: false, status: 429, error: "rate_limited", data: null };
}

function buildCombinedLeagueUrl(leagueId, season) {
  const lid = encodeURIComponent(String(leagueId).trim());
  const y = Number(season);
  const views = ["mTeam", "mStandings", "mSettings", "mDraftDetail", "mTransactions2"];
  const qs = views.map((v) => `view=${v}`).join("&");
  return `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${y}/segments/0/leagues/${lid}?${qs}`;
}

function buildMatchupWeekUrl(leagueId, season, week) {
  const lid = encodeURIComponent(String(leagueId).trim());
  const y = Number(season);
  return `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${y}/segments/0/leagues/${lid}?view=mMatchup&view=mMatchupScore&scoringPeriodId=${week}`;
}

async function fetchWeeklyMatchupsIfNeeded(leagueId, season, combined, espnCookieHeader) {
  const matchupPayloads = [];
  if (scheduleLen(combined) > 0) return matchupPayloads;
  for (let week = 1; week <= 17; week++) {
    await sleep(500);
    const url = buildMatchupWeekUrl(leagueId, season, week);
    const r = await fetchEspnJsonWithBackoff(url, { espnCookieHeader, label: `mMatchup_${season}_${week}` });
    if (!r.ok) {
      if (r.status === 404) continue;
      if (r.error === "ESPN login expired") return { error: r.error, matchupPayloads };
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
  espnCookieHeader,
  warRoomCookieHeader,
  force,
}) {
  const combinedUrl = buildCombinedLeagueUrl(leagueId, season);
  const combinedRes = await fetchEspnJsonWithBackoff(combinedUrl, {
    espnCookieHeader,
    label: `combined_${season}`,
  });
  if (!combinedRes.ok && combinedRes.error === "ESPN login expired") {
    return { ok: false, error: "ESPN login expired", season };
  }
  if (!combinedRes.ok || !combinedRes.data) {
    return { ok: false, error: combinedRes.error || "combined_fetch_failed", season };
  }
  const combined = combinedRes.data;
  const weekly = await fetchWeeklyMatchupsIfNeeded(leagueId, season, combined, espnCookieHeader);
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
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        sendResponse({ ok: false, seasons: [], error: "ESPN login expired", details: "missing_cookies" });
        return;
      }
      const espnCookieHeader = buildEspnCookieHeader(swid, espnS2);
      const histUrl = `https://fantasy.espn.com/football/league/history?leagueId=${encodeURIComponent(leagueId)}`;
      await applyEspnHistHtmlCookieRule(espnCookieHeader);
      let status = 0;
      let html = "";
      try {
        const res = await fetch(histUrl, {
          method: "GET",
          credentials: "omit",
          headers: { Accept: "text/html,application/xhtml+xml", Referer: "https://fantasy.espn.com/" },
        });
        status = res.status;
        html = await res.text();
      } finally {
        await removeEspnHistHtmlCookieRule();
      }
      if (status === 401 || status === 403) {
        sendResponse({ ok: false, seasons: [], error: "ESPN login expired" });
        return;
      }
      const seasons = parseSeasonsFromHistoryHtml(html, leagueId).filter((y) => y !== 2009);
      const skipped = [];
      console.info("[GMWR] historical discover", { leagueId, httpStatus: status, seasonCount: seasons.length });
      sendResponse({ ok: true, seasons, skipped, httpStatus: status });
    })().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, seasons: [], error: msg });
    });
    return true;
  }

  if (t === MSG_HIST_TEST) {
    (async () => {
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        sendResponse({ ok: false, error: "ESPN login expired", details: "missing_cookies" });
        return;
      }
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({ ok: false, error: "GM War Room session not found. Sign in at gmwarroom.online." });
        return;
      }
      const leagueId = String(message?.leagueId || "457622").trim();
      const espnCookieHeader = buildEspnCookieHeader(swid, espnS2);
      const r = await runHistoricalImportOneSeason({
        leagueId,
        season: 2010,
        espnCookieHeader,
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
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        sendResponse({ ok: false, error: "ESPN login expired", results: [] });
        return;
      }
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({ ok: false, error: "GM War Room session not found.", results: [] });
        return;
      }
      const leagueId = String(message?.leagueId || "457622").trim();
      const espnCookieHeader = buildEspnCookieHeader(swid, espnS2);
      const uniq = [...new Set(seasons)]
        .map((x) => Math.floor(Number(x)))
        .filter((y) => Number.isFinite(y) && y >= 1990 && y !== 2009)
        .sort((a, b) => a - b);
      const ordered = uniq.includes(2010) ? [2010, ...uniq.filter((s) => s !== 2010)] : uniq;
      const results = [];
      let consecFail = 0;
      for (const season of ordered) {
        await sleep(500);
        const r = await runHistoricalImportOneSeason({
          leagueId,
          season,
          espnCookieHeader,
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
