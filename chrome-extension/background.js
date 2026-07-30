/**
 * GM War Room extension — background service worker.
 * Reads ESPN cookies + gmwarroom session cookies, discovers 2026 leagues via ESPN profile API
 * (union with the leagueId from the active ESPN fantasy tab when ESPN omits a league from the payload),
 * POSTs espn.saveCredentials per selected league. War Room cookies are injected via DNR
 * (fetch cannot set a Cookie header from a SW). ESPN historical JSON is fetched from the
 * service worker with `credentials: "include"` plus session-rule DNR (Cookie + Kona headers).
 * Historical draft recap: scrape the rendered draftrecap page in a background tab (no ESPN draft JSON API).
 */

const WAR_ROOM_ORIGIN = "https://fantasyfootballrivals.com";
const TRPC_SAVE_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.saveCredentials`;
const TRPC_ME_URL = `${WAR_ROOM_ORIGIN}/api/trpc/auth.me`;
/** Server runs full onboarding sync; land on dashboard when leagues are linked. */
const POST_CONNECT_URL = `${WAR_ROOM_ORIGIN}/dashboard?espnConnected=1`;
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
// Fan API: lists ALL fantasy leagues for the signed-in SWID (used to auto-detect leagues).
const ESPN_FAN_API_BASE = "https://fan.api.espn.com/apis/v2/fans/";

const MSG_DISCOVER_LEAGUES = "GMWR_DISCOVER_LEAGUES_2026";
const MSG_SYNC_SELECTED_LEAGUES = "GMWR_SYNC_SELECTED_LEAGUES";
const MSG_IS_ADMIN = "GMWR_IS_ADMIN";

/** Session rules: inject Cookie only for matching requests, then removed. */
const DNR_SAVE_COOKIE_RULE_ID = 8844201;
const DNR_ME_COOKIE_RULE_ID = 8844230;
const DNR_ESPN_PROFILE_RULE_ID = 8844202;

const ESPN_COOKIE_BASE_URLS = [
  "https://fantasy.espn.com/",
  "https://www.espn.com/",
  "https://lm-api-reads.fantasy.espn.com/",
];

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
  return { swid, espnS2, hasSwid: Boolean(swid), hasEspnS2: Boolean(espnS2) };
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
function extractLeaguesFromFanApi(data) {
  const out = [];
  const prefs = Array.isArray(data && data.preferences) ? data.preferences : [];
  for (const pref of prefs) {
    const entry = pref && pref.metaData && pref.metaData.entry;
    if (!entry || typeof entry !== "object") continue;
    const abbrev = String(entry.abbrev || "").toUpperCase();
    const isFootball = abbrev.includes("FFL") || entry.gameId === 1;
    if (!isFootball) continue;
    const groups = Array.isArray(entry.groups) ? entry.groups : [];
    for (const g of groups) {
      const rawId = g && (g.groupId != null ? g.groupId : g.id != null ? g.id : g.leagueId);
      if (rawId == null) continue;
      const id = String(rawId).trim();
      if (!/^\d+$/.test(id)) continue;
      const name = String((g && (g.groupName || g.name)) || ("League " + id)).trim();
      out.push({ id, name });
    }
  }
  if (out.length === 0 && data && typeof data === "object") {
    const stack = [data];
    let guard = 0;
    while (stack.length && guard < 5000) {
      guard++;
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      const gid = node.groupId;
      if (gid != null && /^\d+$/.test(String(gid))) {
        out.push({ id: String(gid), name: String(node.groupName || node.name || ("League " + gid)).trim() });
      }
      for (const v of Object.values(node)) if (v && typeof v === "object") stack.push(v);
    }
  }
  return dedupeLeaguesById(out);
}

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
          urlFilter: "https://fan.api.espn.com/apis/v2/fans/*",
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
 * GET profile (proTeam) for 2026; always unions in leagueId from the active ESPN fantasy tab URL
 * (deduped) so leagues missing from the profile payload still appear in Discover.
 */
async function discoverLeaguesWithEspnCookie(espnCookieHeader, swid) {
  const tabLeagueId = await getLeagueIdFromActiveEspnTab();

  await applyEspnProfileDiscoverCookieRule(espnCookieHeader);
  let httpStatus = 0;
  let parsed = null;
  try {
    const fanUrl = ESPN_FAN_API_BASE + encodeURIComponent(swid) + "?displayHiddenPrefs=true&context=fantasy&source=ESPN.com";
    const res = await fetch(fanUrl, {
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
      leagues = extractLeaguesFromFanApi(parsed);
    }
    console.info("[GMWR] Fan API discovery", { httpStatus, leagueCount: leagues.length, sample: leagues.slice(0, 15) });

    // Union: ESPN profile may omit a league the user is viewing; active-tab leagueId is always merged (deduped).
    if (tabLeagueId) {
      const tabId = String(tabLeagueId).trim();
      if (tabId && /^\d+$/.test(tabId)) {
        const seen = new Set(leagues.map((L) => String(L?.id ?? "").trim()));
        if (!seen.has(tabId)) {
          leagues.push({ id: tabId, name: `League ${tabId}` });
        }
      }
    }
    leagues = dedupeLeaguesById(leagues);

    console.info("[GMWR] ESPN profile discovery", {
      httpStatus,
      leagueCount: leagues.length,
      tabLeagueIdPresent: Boolean(tabLeagueId),
    });

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

async function applyMeCookieRule(cookieHeader) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_ME_COOKIE_RULE_ID],
    addRules: [
      {
        id: DNR_ME_COOKIE_RULE_ID,
        priority: 1,
        action: { type: "modifyHeaders", requestHeaders: [{ header: "Cookie", operation: "set", value: cookieHeader }] },
        condition: { urlFilter: `${TRPC_ME_URL}*`, resourceTypes: ["xmlhttprequest", "other"] },
      },
    ],
  });
}

async function removeMeCookieRule() {
  try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [DNR_ME_COOKIE_RULE_ID] }); } catch { /* ignore */ }
}

async function fetchIsAdmin(warRoomCookieHeader) {
  if (!warRoomCookieHeader) return { ok: false, isAdmin: false, error: "no_session" };
  await applyMeCookieRule(warRoomCookieHeader);
  try {
    const res = await fetch(TRPC_ME_URL, { method: "GET", headers: { Accept: "application/json" }, credentials: "include" });
    let parsed = null;
    try { parsed = await res.json(); } catch { /* ignore */ }
    let user = parsed && parsed.result ? parsed.result.data : null;
    if (user && typeof user === "object" && "json" in user) user = user.json;
    const isAdmin = Boolean(user && user.role === "admin");
    console.info("[GMWR] auth.me", { httpStatus: res.status, role: user && user.role, isAdmin });
    return { ok: true, isAdmin };
  } finally {
    await removeMeCookieRule();
  }
}

// ─── Historical league import (War Room tRPC) ───
const TRPC_PARSED_DRAFT_INGEST_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.ingestParsedDraftPicks`;
const TRPC_LEGACY_DRAFT_INGEST_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.ingestLegacyDraftRecap`;
const TRPC_SEASON_ROSTER_INGEST_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.ingestSeasonRosters`;
// ─── P2 player stats (uses playerStatsCache tRPC router) ───
const TRPC_SAVE_PLAYER_STATS_URL   = `${WAR_ROOM_ORIGIN}/api/trpc/playerStatsCache.saveWeeklyPlayerStats`;
const TRPC_PLAYER_STATS_STATUS_URL = `${WAR_ROOM_ORIGIN}/api/trpc/playerStatsCache.getPlayerStatsCacheStatus`;
const TRPC_SYNC_PLAYERS_URL      = `${WAR_ROOM_ORIGIN}/api/trpc/playerStatsCache.syncPlayersFromCache`;
const TRPC_SAVE_ROSTER_URL       = `${WAR_ROOM_ORIGIN}/api/trpc/playerStatsCache.saveRosterPlayers`;
const MSG_SYNC_PLAYER_STATS        = "GMWR_SYNC_PLAYER_STATS";
const MSG_SYNC_TRENDS              = "GMWR_SYNC_TRENDS";
const TRPC_IMPORT_DRAFT_API_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.importDraftFromEspnApi`;
const TRPC_HIST_STATUS_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.historicalImportStatus`;
const DNR_TRPC_HIST_RULE_ID = 8844210;

const MSG_HIST_DISCOVER = "GMWR_HIST_DISCOVER";
const MSG_HIST_TEST = "GMWR_HIST_TEST";
const MSG_HIST_FULL = "GMWR_HIST_FULL";
const MSG_HIST_STATUS = "GMWR_HIST_STATUS";
/** Temporary debug: probe historical roster URLs with browser ESPN cookies (no persist). */
const MSG_ROSTER_MATRIX_TEST = "GMWR_ROSTER_MATRIX_TEST";
/** POC: 2017 league rosters DOM scrape — JSON only, no persist. */
const MSG_ROSTER_2017_POC = "GMWR_ROSTER_2017_POC";
/** Full historical roster capture: scrape ESPN League Rosters page for every season and ingest. */
const MSG_ROSTER_FULL = "GMWR_ROSTER_FULL";
const MSG_HIST_STANDINGS = "GMWR_HIST_STANDINGS";
const MSG_HIST_MATCHUPS = "GMWR_HIST_MATCHUPS";
const MSG_LEAGUE_HISTORY_MEDALS = "GMWR_LEAGUE_HISTORY_MEDALS";
/** Page (gmwarroom) → background: credentialed GET to fantasy.espn.com for browser-session sync. */
const MSG_PAGE_ESPN_FETCH = "GMWR_PAGE_ESPN_FETCH";
const MSG_CAPTURE_WEEKLY_STATS = "GMWR_CAPTURE_WEEKLY_STATS";

/** RFSN-030C — FantasyPros solo mock connector (extension relay). */
const MSG_FP_MOCK_ARM = "GMWR_FP_MOCK_ARM";
const MSG_FP_MOCK_DISARM = "GMWR_FP_MOCK_DISARM";
const MSG_FP_MOCK_PICK_BATCH = "GMWR_FP_MOCK_PICK_BATCH";
const MSG_FP_MOCK_STATUS = "GMWR_FP_MOCK_STATUS";
const MSG_FP_MOCK_SESSION_RESET = "GMWR_FP_MOCK_SESSION_RESET";
const MSG_FP_MOCK_PING = "GMWR_FP_MOCK_PING";
const MSG_FP_MOCK_GET_STATE = "GMWR_FP_MOCK_GET_STATE";
const FP_MOCK_FFR_ORIGINS = [
  "https://fantasyfootballrivals.com",
  "https://www.fantasyfootballrivals.com",
  "https://gmwarroom.online",
  "http://localhost",
  "http://127.0.0.1",
];
/** @type {{ armed: boolean, config: object|null, lastStatus: object|null, lastPickAt: string|null, picksEmitted: number, picksObserved: number, armedAt: string|null, sessionId: string|null }} */
let fpMockConnectorState = {
  armed: false,
  config: null,
  lastStatus: null,
  lastPickAt: null,
  /** True PICK_BATCH pick count this session (not STATUS inflation). */
  picksEmitted: 0,
  /** Alias of picksEmitted for older popup readers. */
  picksObserved: 0,
  armedAt: null,
  sessionId: null,
};

/** Drop stale in-memory session after SW sleep / long idle (does not persist to disk). */
const FP_MOCK_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function isFfrTabUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (FP_MOCK_FFR_ORIGINS.some((origin) => url.startsWith(origin))) return true;
  // Preview / env subdomains: https://sprint-8-preview.fantasyfootballrivals.com/...
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return (
      u.hostname === "fantasyfootballrivals.com" ||
      u.hostname.endsWith(".fantasyfootballrivals.com")
    );
  } catch {
    return false;
  }
}

function newFpMockSessionId() {
  return `fp-sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function expireFpMockSessionIfStale(now = Date.now()) {
  if (!fpMockConnectorState.armedAt && fpMockConnectorState.picksEmitted === 0) return;
  const anchor = fpMockConnectorState.lastPickAt || fpMockConnectorState.armedAt;
  if (!anchor) return;
  const t = Date.parse(anchor);
  if (!Number.isFinite(t)) return;
  if (now - t <= FP_MOCK_SESSION_TTL_MS) return;
  fpMockConnectorState = {
    armed: false,
    config: null,
    lastStatus: { status: "session_expired", reason: "ttl" },
    lastPickAt: null,
    picksEmitted: 0,
    picksObserved: 0,
    armedAt: null,
    sessionId: null,
  };
}

function setFpMockEmittedCount(n) {
  const v = Math.max(0, Math.floor(Number(n)) || 0);
  fpMockConnectorState.picksEmitted = v;
  fpMockConnectorState.picksObserved = v;
}

function isFantasyProsTabUrl(url) {
  return typeof url === "string" && url.startsWith("https://draftwizard.fantasypros.com/");
}

async function broadcastToFfrTabs(message) {
  const tabs = await chrome.tabs.query({});
  let tabCount = 0;
  let reached = 0;
  for (const tab of tabs) {
    if (!tab.id || !isFfrTabUrl(tab.url || "")) continue;
    tabCount += 1;
    try {
      await chrome.tabs.sendMessage(tab.id, message);
      reached += 1;
    } catch {
      /* tab may not have content script */
    }
  }
  return { tabCount, reached };
}

async function broadcastToFantasyProsTabs(message) {
  const tabs = await chrome.tabs.query({ url: "https://draftwizard.fantasypros.com/*" });
  let reached = 0;
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, message);
      reached += 1;
    } catch {
      /* ignore */
    }
  }
  return { tabCount: tabs.length, reached };
}

/** RFSN Phase 2 — ESPN bookmarklet transport (route only; separate from FP). */
const MSG_ESPN_BM_ARM = "GMWR_ESPN_BM_ARM";
const MSG_ESPN_BM_DISARM = "GMWR_ESPN_BM_DISARM";
const MSG_ESPN_BM_PICK_BATCH = "GMWR_ESPN_BM_PICK_BATCH";
const MSG_ESPN_BM_STATUS = "GMWR_ESPN_BM_STATUS";
const MSG_ESPN_BM_SESSION_RESET = "GMWR_ESPN_BM_SESSION_RESET";
const MSG_ESPN_BM_PING = "GMWR_ESPN_BM_PING";
const MSG_ESPN_BM_PONG = "GMWR_ESPN_BM_PONG";
const MSG_ESPN_BM_GET_STATE = "GMWR_ESPN_BM_GET_STATE";
const MSG_ESPN_BM_REPLAY_REQUEST = "GMWR_ESPN_BM_REPLAY_REQUEST";
const MSG_ESPN_BM_SET_AUTO_INJECT = "GMWR_ESPN_BM_SET_AUTO_INJECT";
const MSG_ESPN_BM_DRAFT_AVAILABILITY = "GMWR_ESPN_BM_DRAFT_AVAILABILITY";
const MSG_ESPN_BM_TELEMETRY = "GMWR_ESPN_BM_TELEMETRY";

/** @type {{ armed: boolean, config: object|null, lastStatus: object|null, lastPickAt: string|null, batchesRelayed: number, armedAt: string|null, sessionNonce: string|null, autoInjectEnabled: boolean, draftRooms: Record<string, object>, lastTelemetry: object|null, diagnostics: object }} */
let espnBmConnectorState = {
  armed: false,
  config: null,
  lastStatus: null,
  lastPickAt: null,
  batchesRelayed: 0,
  armedAt: null,
  sessionNonce: null,
  autoInjectEnabled: false,
  draftRooms: {},
  lastTelemetry: null,
  diagnostics: {
    extensionVersion: chrome.runtime.getManifest?.()?.version ?? null,
    lastHeartbeat: null,
    lastBatchRevision: null,
    lastSuccessfulPick: null,
    lastReplayRequest: null,
    lastError: null,
    featureFlagState: false,
  },
};

const ESPN_BM_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function isEspnFantasyTabUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname === "fantasy.espn.com" || u.hostname.endsWith(".espn.com");
  } catch {
    return false;
  }
}

function expireEspnBmSessionIfStale(now = Date.now()) {
  if (!espnBmConnectorState.armedAt && espnBmConnectorState.batchesRelayed === 0) return;
  const anchor = espnBmConnectorState.lastPickAt || espnBmConnectorState.armedAt;
  if (!anchor) return;
  const t = Date.parse(anchor);
  if (!Number.isFinite(t)) return;
  if (now - t <= ESPN_BM_SESSION_TTL_MS) return;
  espnBmConnectorState = {
    ...espnBmConnectorState,
    armed: false,
    config: null,
    lastStatus: { status: "session_expired", reason: "ttl" },
    lastPickAt: null,
    batchesRelayed: 0,
    armedAt: null,
    sessionNonce: null,
  };
}

async function broadcastToEspnFantasyTabs(message) {
  const tabs = await chrome.tabs.query({});
  let tabCount = 0;
  let reached = 0;
  for (const tab of tabs) {
    if (!tab.id || !isEspnFantasyTabUrl(tab.url || "")) continue;
    tabCount += 1;
    try {
      await chrome.tabs.sendMessage(tab.id, message);
      reached += 1;
    } catch {
      /* tab may not have content script */
    }
  }
  return { tabCount, reached };
}

/**
 * Phase 4 — when an ESPN tab finishes loading and the connector is armed,
 * re-push ARM so a refreshed content script can accept PICK_BATCH again.
 * Event-driven (tabs.onUpdated); not a poll loop.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!espnBmConnectorState.armed || !espnBmConnectorState.config) return;
  if (!tab?.url || !isEspnFantasyTabUrl(tab.url)) return;
  void chrome.tabs
    .sendMessage(tabId, {
      type: MSG_ESPN_BM_ARM,
      config: espnBmConnectorState.config,
    })
    .catch(() => {});
});

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
    removeRuleIds: [DNR_TRPC_HIST_RULE_ID, DNR_TRPC_HIST_RULE_ID + 1, DNR_TRPC_HIST_RULE_ID + 2, DNR_TRPC_HIST_RULE_ID + 3, DNR_TRPC_HIST_RULE_ID + 4, DNR_TRPC_HIST_RULE_ID + 5, DNR_TRPC_HIST_RULE_ID + 6],
    addRules: [
      {
        id: DNR_TRPC_HIST_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasyfootballrivals.com/api/trpc/espn.ingestParsedDraftPicks*",
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
          urlFilter: "https://fantasyfootballrivals.com/api/trpc/espn.importDraftFromEspnApi*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
      {
        id: DNR_TRPC_HIST_RULE_ID + 2,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasyfootballrivals.com/api/trpc/espn.historicalImportStatus*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
      {
        id: DNR_TRPC_HIST_RULE_ID + 3,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasyfootballrivals.com/api/trpc/espn.ingestLegacyDraftRecap*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
      {
        id: DNR_TRPC_HIST_RULE_ID + 4,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasyfootballrivals.com/api/trpc/espn.ingestSeasonRosters*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
      {
        id: DNR_TRPC_HIST_RULE_ID + 5,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasyfootballrivals.com/api/trpc/playerStatsCache.saveWeeklyPlayerStats*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
      {
        id: DNR_TRPC_HIST_RULE_ID + 6,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://fantasyfootballrivals.com/api/trpc/playerStatsCache.getPlayerStatsCacheStatus*",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
    ],
  });
}

async function removeWarRoomTrpcHistRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_TRPC_HIST_RULE_ID, DNR_TRPC_HIST_RULE_ID + 1, DNR_TRPC_HIST_RULE_ID + 2, DNR_TRPC_HIST_RULE_ID + 3, DNR_TRPC_HIST_RULE_ID + 4, DNR_TRPC_HIST_RULE_ID + 5, DNR_TRPC_HIST_RULE_ID + 6],
    });
  } catch {
    /* ignore */
  }
}

/** DNR: inject ESPN session + API headers for SW `fetch` to fantasy/lm-api-reads (Cookie not set on fetch()). */
const DNR_ESPN_HIST_FETCH_RULE_FANTASY = 8844215;
const DNR_ESPN_HIST_FETCH_RULE_LM = 8844216;

async function applyEspnHistoricalFetchDnr(cookieHeader) {
  const requestHeaders = [
    { header: "Cookie", operation: "set", value: cookieHeader },
    { header: "Accept", operation: "set", value: "application/json" },
    { header: "X-Fantasy-Source", operation: "set", value: "kona" },
    { header: "X-Fantasy-Platform", operation: "set", value: "kona" },
  ];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_ESPN_HIST_FETCH_RULE_FANTASY, DNR_ESPN_HIST_FETCH_RULE_LM],
    addRules: [
      {
        id: DNR_ESPN_HIST_FETCH_RULE_FANTASY,
        priority: 1,
        action: { type: "modifyHeaders", requestHeaders },
        condition: {
          urlFilter: "https://fantasy.espn.com/apis/v3/games/ffl",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
      {
        id: DNR_ESPN_HIST_FETCH_RULE_LM,
        priority: 1,
        action: { type: "modifyHeaders", requestHeaders },
        condition: {
          urlFilter: "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl",
          resourceTypes: ["xmlhttprequest", "other"],
        },
      },
    ],
  });
}

async function removeEspnHistoricalFetchDnr() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_ESPN_HIST_FETCH_RULE_FANTASY, DNR_ESPN_HIST_FETCH_RULE_LM],
    });
  } catch {
    /* ignore */
  }
}

function logEspnFetchDiagnostics(payload) {
  console.info("[GMWR] ESPN fetch diagnostics", payload);
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Wait until the tab finishes its primary navigation (`status === "complete"`).
 * @param {number} tabId
 * @param {number} timeoutMs
 */
async function waitForTabComplete(tabId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    if (Date.now() >= deadline) {
      throw new Error("tab_load_timeout");
    }
    await sleep(150);
  }
}

/**
 * Scrape ESPN Draft Recap by opening a hidden background tab, waiting for load,
 * injecting the scraper, then closing the tab.
 * @param {string} leagueId
 * @param {number} season
 */
async function scrapeDraftRecapPage(leagueId, season) {
  const lid = String(leagueId ?? "").trim();
  const y = Math.floor(Number(season));
  const targetUrl = `https://fantasy.espn.com/football/league/draftrecap?leagueId=${encodeURIComponent(lid)}&seasonId=${y}`;

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = tab.id;
    console.info("[GMWR] scrapeDraftRecap: opened background tab", { tabId, season: y });

    await waitForTabComplete(tabId, 30000);
    console.info("[GMWR] scrapeDraftRecap: tab loaded", { tabId, season: y });
    await sleep(6000);
    console.info("[GMWR] scrapeDraftRecap: executing script", { tabId, season: y });

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      // DOM-structured scrape: reads .draftRecapTable.byRound sections directly.
      // Each round section has a .Table__Title ("Round N") and Table__TR--sm rows with 3 TD cells:
      //   [0] pick number in round, [1] "PlayerName NFL_ABBR, POS", [2] fantasy team name.
      // Falls back to scanning all <tr> rows if the round sections are absent.
      func: () => {
        const picks = [];

        // Primary: .draftRecapTable.byRound sections (2014-present layout)
        const roundSections = document.querySelectorAll(".draftRecapTable.byRound");
        roundSections.forEach((section) => {
          const titleEl = section.querySelector(".Table__Title");
          const titleText = titleEl ? titleEl.innerText.trim() : "";
          const roundMatch = titleText.match(/^Round\s+(\d+)$/i);
          const roundNum = roundMatch ? parseInt(roundMatch[1], 10) : null;
          if (!roundNum) return;

          section.querySelectorAll("tr.Table__TR--sm").forEach((row) => {
            const cells = row.querySelectorAll("td.Table__TD");
            if (cells.length < 3) return;
            const pickNum = parseInt(cells[0].innerText.trim(), 10) || 0;
            const playerCell = cells[1].innerText.trim();
            const fantasyTeam = cells[2].innerText.trim();
            if (!playerCell || !fantasyTeam) return;

            // "Player Name ABBR, POS"  e.g. "Dez Bryant Dal, WR" or "Aaron Rodgers GB, QB"
            const m = playerCell.match(/^(.+?)\s+([A-Za-z]{2,5}(?:\/[A-Za-z]{1,5})?),\s*([A-Za-z\/]+)\s*$/);
            const playerName = m ? m[1].trim() : playerCell;
            const nflTeam    = m ? m[2] : "";
            const posRaw     = m ? m[3].toUpperCase() : "";
            const position   = (posRaw === "DST" || posRaw === "DEF") ? "D/ST" : posRaw;
            picks.push({ round: roundNum, pickInRound: pickNum, playerName, nflTeam, position, fantasyTeam });
          });
        });

        // Fallback: scan all table rows (older ESPN page layout / "By Team" view fallback)
        if (picks.length === 0) {
          let currentRound = 1;
          let lastPickNum = 0;
          document.querySelectorAll("tr").forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 3) return;
            const c0 = cells[0].innerText.trim();
            const c1 = cells[1].innerText.trim();
            const c2 = cells[2].innerText.trim();
            if (!c0 || !c1 || !c2) return;
            if (/^(no\.?|#)$/i.test(c0) || c0.toLowerCase() === "player") return; // header

            const pickNum = parseInt(c0, 10);
            if (!Number.isFinite(pickNum) || pickNum < 1 || pickNum > 30) return;

            // Detect round boundary: pick number resets to 1 after going higher
            if (pickNum < lastPickNum && lastPickNum > 1) currentRound++;
            lastPickNum = pickNum;

            const m = c1.match(/^(.+?)\s+([A-Za-z]{2,5}(?:\/[A-Za-z]{1,5})?),\s*([A-Za-z\/]+)\s*$/);
            const playerName = m ? m[1].trim() : c1;
            const nflTeam    = m ? m[2] : "";
            const posRaw     = m ? m[3].toUpperCase() : "";
            const position   = (posRaw === "DST" || posRaw === "DEF") ? "D/ST" : posRaw;
            picks.push({ round: currentRound, pickInRound: pickNum, playerName, nflTeam, position, fantasyTeam: c2 });
          });
        }

        const draftType = (() => {
          const el = document.querySelector("[class*='draftType'], .draft-type");
          if (el) return el.innerText.trim();
          const bodyText = document.body.innerText || "";
          const m = bodyText.match(/Type:\s*(Offline|Online|Autopick)/i);
          return m ? m[1] : "";
        })();

        return {
          ok: picks.length > 0,
          url: location.href,
          title: document.title,
          picks,
          pickCount: picks.length,
          draftType,
        };
      },
    });
    const scrapeResult = results?.[0]?.result || { ok: false, error: "scrape_failed" };
    console.info("[GMWR] scrapeDraftRecap: script done", {
      ok: scrapeResult.ok,
      pickCount: scrapeResult.pickCount,
      draftType: scrapeResult.draftType,
      title: scrapeResult.title,
    });
    return scrapeResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[GMWR] scrapeDraftRecap: caught error", msg);
    return { ok: false, error: "scrape_failed", message: msg };
  } finally {
    if (tabId != null) {
      chrome.tabs.remove(tabId).catch(() => { /* tab may already be closed */ });
    }
  }
}

/**
 * Scrape League Rosters (fantasy.espn.com) — same tab pattern as draft recap: background tab,
 * waitForTabComplete, fixed settle delay, executeScript in MAIN, close tab.
 * Returns compact JSON only (no persist). Tuned for multi-team roster layouts (Table__* / tables).
 * @param {string} leagueId
 * @param {number} season
 */
async function scrapeLeagueRostersPage(leagueId, season) {
  const lid = String(leagueId ?? "").trim();
  const y = Math.floor(Number(season));
  const targetUrl = `https://fantasy.espn.com/football/league/rosters?leagueId=${encodeURIComponent(lid)}&seasonId=${y}`;

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = tab.id;
    console.info("[GMWR] scrapeLeagueRosters: opened background tab", { tabId, season: y, leagueId: lid });

    await waitForTabComplete(tabId, 30000);
    console.info("[GMWR] scrapeLeagueRosters: tab loaded", { tabId, season: y });
    await sleep(6000);
    console.info("[GMWR] scrapeLeagueRosters: executing script", { tabId, season: y });

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [lid, y],
      func: (leagueIdArg, seasonArg) => {
        const debugNotes = [];
        const playerLineRe =
          /^(.+?)\s+([A-Za-z]{2,5}(?:\/[A-Za-z]{1,5})?),\s*([A-Za-z\/]+)\s*$/;
        const junkTitles = /^(starters|bench|slot|scoring|roster|opponent|proj|status|player|pos|team)$/i;

        /**
         * @param {string} raw
         */
        function parsePlayerCell(raw) {
          const s = String(raw || "").replace(/\s+/g, " ").trim();
          if (!s) return null;
          const m = s.match(playerLineRe);
          if (m) {
            let playerName = m[1].trim();
            const nflTeam = m[2].trim();
            let position = m[3].toUpperCase().trim();
            if (position === "DST" || position === "DEF") position = "D/ST";
            if (/(D\/ST|DEF)$/i.test(playerName)) {
              playerName = playerName.replace(/\s+(D\/ST|DEF)\s*$/i, "").trim();
              return { playerName, nflTeam: nflTeam || "", position: "D/ST" };
            }
            return { playerName, nflTeam, position };
          }
          return { playerName: s, nflTeam: "", position: "" };
        }

        /**
         * @param {HTMLTableRowElement} row
         */
        function rowPlayerAnchorHref(row) {
          const a = row.querySelector('a[href*="players/"], a[href*="playerId"]');
          return a ? String(a.getAttribute("href") || "") : "";
        }

        /**
         * @param {HTMLTableRowElement} row
         */
        function extractRow(row) {
          const cells = Array.from(row.querySelectorAll("td.Table__TD, td"));
          if (cells.length < 2) return null;
          const texts = cells.map((c) => (c.innerText || "").replace(/\s+/g, " ").trim());
          let slot = "";
          let playerCell = "";
          if (cells.length >= 3) {
            slot = texts[0] || "";
            playerCell = texts[1] || "";
          } else {
            playerCell = texts[0] || "";
          }
          if (!playerCell || junkTitles.test(playerCell)) return null;
          if (/^(no\.?|#|rank)$/i.test(slot) && cells.length >= 4) {
            slot = texts[1] || "";
            playerCell = texts[2] || "";
          }
          if (!playerCell || junkTitles.test(playerCell)) return null;
          const parsed = parsePlayerCell(playerCell);
          if (!parsed || !parsed.playerName) return null;
          if (/^(add|drop|trade|waiver|faab)$/i.test(parsed.playerName)) return null;
          return {
            slot: slot || "",
            playerName: parsed.playerName,
            position: parsed.position || "",
            nflTeam: parsed.nflTeam || "",
            playerLinkHref: rowPlayerAnchorHref(row),
          };
        }

        /** @type {Map<string, { teamName: string, players: ReturnType<typeof extractRow>[] }>} */
        const teamMap = new Map();

        function addTeamBlock(teamNameRaw, tableEl) {
          let teamName = String(teamNameRaw || "").replace(/\s+/g, " ").trim();
          if (!teamName || teamName.length > 80 || junkTitles.test(teamName)) return;
          if (!teamMap.has(teamName)) {
            teamMap.set(teamName, { teamName, players: [] });
          }
          const bucket = teamMap.get(teamName);
          tableEl.querySelectorAll("tr.Table__TR--sm, tr.Table__TR, tr").forEach((row) => {
            const ex = extractRow(row);
            if (ex) bucket.players.push(ex);
          });
        }

        // Primary: Table__Title immediately followed by (or near) a roster table (per-team blocks).
        document.querySelectorAll(".Table__Title, [class*='Table__Title']").forEach((titleEl) => {
          const titleText = (titleEl.textContent || "").trim();
          if (!titleText || junkTitles.test(titleText)) return;
          let walk = titleEl.parentElement;
          for (let depth = 0; depth < 8 && walk; depth++) {
            const tbl = walk.querySelector("table");
            if (tbl) {
              addTeamBlock(titleText, tbl);
              return;
            }
            walk = walk.parentElement;
          }
        });

        if (teamMap.size === 0) {
          debugNotes.push("no_team_blocks_from_Table__Title");
          // Fallback: one table per team — find tables whose nearest heading-like text looks like a team.
          document.querySelectorAll("table").forEach((tbl, tblIdx) => {
            let teamGuess = "";
            let n = tbl;
            for (let i = 0; i < 12 && n; i++) {
              n = n.previousElementSibling;
              if (!n) break;
              const t = (n.textContent || "").trim();
              if (t && t.length > 2 && t.length < 80 && !junkTitles.test(t)) {
                const h = n.querySelector("h1, h2, h3, h4, .Table__Title");
                teamGuess = (h ? h.textContent : t).trim().split("\n")[0].trim();
                if (teamGuess) break;
              }
            }
            if (!teamGuess) teamGuess = `table_${tblIdx}`;
            const before = teamMap.get(teamGuess)?.players.length ?? 0;
            addTeamBlock(teamGuess, tbl);
            const after = teamMap.get(teamGuess)?.players.length ?? 0;
            if (after > before) debugNotes.push(`fallback_table_${tblIdx}_team_${teamGuess.slice(0, 24)}`);
          });
        }

        const teams = Array.from(teamMap.values()).map((t) => ({
          teamName: t.teamName,
          players: t.players,
        }));

        let playerCount = 0;
        for (const t of teams) playerCount += t.players.length;

        const finalTeams = teams.filter((t) => t.players.length > 0);
        const ok = finalTeams.length > 0 && playerCount > 0;

        return {
          ok,
          leagueId: leagueIdArg,
          season: seasonArg,
          url: location.href,
          title: document.title,
          teams: finalTeams,
          meta: {
            teamCount: finalTeams.length,
            playerCount,
            debugNotes,
          },
        };
      },
    });

    const scrapeResult = results?.[0]?.result || { ok: false, error: "scrape_failed" };
    console.info("[GMWR] scrapeLeagueRosters: script done", {
      ok: scrapeResult.ok,
      teamCount: scrapeResult.meta?.teamCount,
      playerCount: scrapeResult.meta?.playerCount,
    });
    return scrapeResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[GMWR] scrapeLeagueRosters: caught error", msg);
    return { ok: false, error: "scrape_failed", message: msg, leagueId: lid, season: y, teams: [] };
  } finally {
    if (tabId != null) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

function playerIdFromEspnPlayerHref(href) {
  const h = String(href || "");
  const m = h.match(/(?:\/players\/(?:full\/)?|playerId=)(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Public JSON for GMWR_ROSTER_2017_POC (no internal scrape fields).
 * @param {Record<string, unknown>} snapshot
 */
function buildRoster2017PocResponsePayload(snapshot) {
  const teams = Array.isArray(snapshot?.teams)
    ? snapshot.teams.map((t) => ({
        teamName: String(t.teamName || ""),
        players: (Array.isArray(t.players) ? t.players : []).map((p) => {
          /** @type {Record<string, unknown>} */
          const row = {
            slot: String(p.slot || ""),
            playerName: String(p.playerName || ""),
            position: String(p.position || ""),
            nflTeam: String(p.nflTeam || ""),
          };
          const pid = playerIdFromEspnPlayerHref(p.playerLinkHref);
          if (pid != null) row.playerId = pid;
          return row;
        }),
      }))
    : [];
  let playerCount = 0;
  for (const tm of teams) playerCount += tm.players.length;
  const ok = Boolean(snapshot?.ok);
  return {
    poc: MSG_ROSTER_2017_POC,
    ok,
    leagueId: String(snapshot?.leagueId ?? ""),
    season: Number(snapshot?.season) || 2017,
    url: String(snapshot?.url ?? ""),
    title: String(snapshot?.title ?? ""),
    teams,
    meta: {
      teamCount: teams.length,
      playerCount,
      debugNotes: Array.isArray(snapshot?.meta?.debugNotes) ? snapshot.meta.debugNotes : [],
    },
    error: ok ? null : String(snapshot?.error || snapshot?.message || "scrape_failed"),
  };
}

/**
 * Open a hidden tab for the ESPN league standings page, wait for render, scrape table rows, close tab.
 * Returns { ok, tableRows: [{tblIdx, rowIdx, cells}], bodyLength, url, title } or { ok: false, error }.
 */
async function scrapeStandingsPage(leagueId, season) {
  const lid = String(leagueId ?? "").trim();
  const y = Math.floor(Number(season));
  const targetUrl = `https://fantasy.espn.com/football/league/standings?leagueId=${encodeURIComponent(lid)}&seasonId=${y}`;
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = tab.id;
    console.info("[GMWR] scrapeStandings: opened tab", { tabId, season: y });
    await waitForTabComplete(tabId, 30000);
    await sleep(6000);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const bodyText = document.body.innerText || "";
        const tableRows = [];
        document.querySelectorAll("table").forEach((tbl, tblIdx) => {
          tbl.querySelectorAll("tr").forEach((row, rowIdx) => {
            const cells = Array.from(row.querySelectorAll("td, th")).map((c) => (c.innerText || "").trim());
            if (cells.length > 1 && cells.some((c) => c.length > 0)) {
              tableRows.push({ tblIdx, rowIdx, cells });
            }
          });
        });
        return { ok: true, url: location.href, title: document.title, bodyLength: bodyText.length, tableRows };
      },
    });
    return results?.[0]?.result || { ok: false, error: "scrape_failed" };
  } catch (err) {
    return { ok: false, error: "scrape_failed", message: err instanceof Error ? err.message : String(err) };
  } finally {
    if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
  }
}

/**
 * Parse `scrapeStandingsPage` result into standings row objects.
 * Detects column positions from header row; falls back to ESPN's typical 8-column order.
 */
function parseStandingsRows(scrapeResult) {
  const parseErrors = [];
  const rows = [];
  if (!scrapeResult?.ok || !Array.isArray(scrapeResult.tableRows)) {
    return { rows, parseErrors: ["scrape_not_ok"] };
  }
  const tableRows = scrapeResult.tableRows;
  if (tableRows.length === 0) return { rows, parseErrors: ["no_table_rows"] };

  // Find header row: must have distinct "W" and "L" cells
  let headerIdx = -1;
  let wCol = -1, lCol = -1, tCol = -1, pfCol = -1, paCol = -1, teamCol = 1;
  for (let i = 0; i < tableRows.length; i++) {
    const norm = tableRows[i].cells.map((c) => c.toUpperCase().trim());
    const wi = norm.findIndex((c) => c === "W" || c === "WINS");
    const li = norm.findIndex((c) => c === "L" || c === "LOSSES");
    if (wi >= 0 && li >= 0 && wi !== li) {
      headerIdx = i;
      wCol = wi; lCol = li;
      tCol = norm.findIndex((c) => c === "T" || c === "TIES");
      pfCol = norm.findIndex((c) => c === "PF" || c === "POINTS FOR" || c === "PTS");
      paCol = norm.findIndex((c) => c === "PA" || c === "POINTS AGAINST");
      const rankIdx = norm.findIndex((c) => c === "#" || c === "RANK");
      // Team column: first non-rank cell before W
      teamCol = norm.findIndex((c, idx) => idx !== rankIdx && idx < wi && c.length > 0 && !/^\d+$/.test(c));
      if (teamCol < 0) teamCol = rankIdx >= 0 ? rankIdx + 1 : 1;
      break;
    }
  }

  // Positional fallback: ESPN typical = [rank(0), team(1), PF(2), PA(3), STRK(4), W(5), L(6), T(7)]
  if (headerIdx < 0) {
    parseErrors.push("no_header_detected_using_positional_fallback");
    const sample = tableRows.find((r) => r.cells.length >= 6);
    if (sample) {
      if (sample.cells.length >= 8) {
        teamCol = 1; pfCol = 2; paCol = 3; wCol = 5; lCol = 6; tCol = 7;
      } else {
        teamCol = 1; wCol = 2; lCol = 3; tCol = 4; pfCol = 5; paCol = 6;
      }
    }
  }

  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  let rank = 0;
  for (let i = startIdx; i < tableRows.length; i++) {
    const cells = tableRows[i].cells;
    if (cells.length < 3) continue;
    const nonEmpty = cells.filter((c) => c.trim().length > 0);
    if (nonEmpty.length < 3) continue; // division header / spacer row

    rank++;
    const rawTeamCell = teamCol < cells.length ? cells[teamCol] : cells[1] || "";
    const lines = rawTeamCell.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const teamName = lines[0] || `Team ${rank}`;
    const ownerName = lines[1] || teamName;

    if (/^(team\s*name|team)$/i.test(teamName)) continue;

    const getNum = (col) => (col >= 0 && col < cells.length ? parseFloat(cells[col].replace(/,/g, "")) : NaN);
    const wins = getNum(wCol);
    const losses = getNum(lCol);
    if (isNaN(wins) || isNaN(losses)) {
      parseErrors.push(`row_${i}: W/L parse failed cells=${JSON.stringify(cells)}`);
      continue;
    }
    const ties = isNaN(getNum(tCol)) ? 0 : getNum(tCol);
    const pf = isNaN(getNum(pfCol)) ? 0 : getNum(pfCol);
    const pa = isNaN(getNum(paCol)) ? 0 : getNum(paCol);

    rows.push({
      rank,
      teamName,
      ownerName,
      wins: Math.floor(wins),
      losses: Math.floor(losses),
      ties: Math.floor(ties),
      pointsFor: pf,
      pointsAgainst: pa,
    });
  }
  return { rows, parseErrors };
}

/**
 * Open a hidden tab for the ESPN season schedule page, wait for render, collect lines + table rows, close tab.
 */
async function scrapeSchedulePage(leagueId, season) {
  const lid = String(leagueId ?? "").trim();
  const y = Math.floor(Number(season));
  const targetUrl = `https://fantasy.espn.com/football/league/schedule?leagueId=${encodeURIComponent(lid)}&seasonId=${y}`;
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = tab.id;
    console.info("[GMWR] scrapeSchedule: opened tab", { tabId, season: y });
    await waitForTabComplete(tabId, 30000);
    await sleep(6000);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const bodyText = document.body.innerText || "";
        const tableRows = [];
        document.querySelectorAll("table").forEach((tbl, tblIdx) => {
          tbl.querySelectorAll("tr").forEach((row, rowIdx) => {
            const cells = Array.from(row.querySelectorAll("td, th")).map((c) => (c.innerText || "").trim());
            if (cells.length > 1 && cells.some((c) => c.length > 0)) {
              tableRows.push({ tblIdx, rowIdx, cells });
            }
          });
        });
        const lines = bodyText.split(/\n/).map((s) => s.trim()).filter((s) => s.length > 0);
        return {
          ok: true,
          url: location.href,
          title: document.title,
          bodyLength: bodyText.length,
          bodyPreview: bodyText.slice(0, 8000),
          tableRows,
          lines: lines.slice(0, 3000),
        };
      },
    });
    return results?.[0]?.result || { ok: false, error: "scrape_failed" };
  } catch (err) {
    return { ok: false, error: "scrape_failed", message: err instanceof Error ? err.message : String(err) };
  } finally {
    if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
  }
}

/**
 * Open a hidden tab for the ESPN league history page, wait for SPA render, scrape season medal data, close tab.
 * Scrapes once for all seasons (the page shows full history). Returns { ok, bodyLines, tableRows, cards, ... }.
 */
async function scrapeLeagueHistoryPage(leagueId) {
  const lid = String(leagueId ?? "").trim();
  const targetUrl = `https://fantasy.espn.com/football/league/history?leagueId=${encodeURIComponent(lid)}`;
  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = tab.id;
    console.info("[GMWR] scrapeLeagueHistory: opened tab", { tabId, leagueId: lid });
    await waitForTabComplete(tabId, 30000);
    await sleep(6000);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const bodyText = document.body.innerText || "";
        const bodyLines = bodyText.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);

        const tableRows = [];
        document.querySelectorAll("table").forEach((tbl, tblIdx) => {
          tbl.querySelectorAll("tr").forEach((row, rowIdx) => {
            const cells = Array.from(row.querySelectorAll("td, th")).map((c) => (c.innerText || "").trim());
            if (cells.length > 0 && cells.some((c) => c.length > 0)) {
              tableRows.push({ tblIdx, rowIdx, cells });
            }
          });
        });

        // DOM card extraction: look for history/season/placement/medal containers that contain a year
        const cards = [];
        const currentYear = new Date().getFullYear();
        const yearRe = /\b(20[0-9]{2})\b/;
        const seenEls = new Set();

        const selectors = [
          "[class*='history']", "[class*='History']",
          "[class*='season']",  "[class*='Season']",
          "[class*='champion']","[class*='Champion']",
          "[class*='placement']","[class*='Placement']",
          "[class*='trophy']",  "[class*='Trophy']",
          "[class*='medal']",   "[class*='Medal']",
        ];

        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              if (seenEls.has(el)) return;
              const txt = el.innerText || "";
              if (!yearRe.test(txt) || txt.length > 50000) return;
              seenEls.add(el);
              const yearMatch = txt.match(/\b(20[0-9]{2})\b/);
              if (!yearMatch) return;
              const year = parseInt(yearMatch[1], 10);
              if (year < 2009 || year > currentYear) return;
              const lines = txt.split("\n").map((s) => s.trim()).filter(Boolean);
              cards.push({ year, lines: lines.slice(0, 30), textPreview: txt.slice(0, 300) });
            });
          } catch { /* invalid selector — ignore */ }
        }

        return {
          ok: true,
          url: location.href,
          title: document.title,
          bodyLength: bodyText.length,
          bodyPreview: bodyText.slice(0, 8000),
          bodyLines: bodyLines.slice(0, 5000),
          tableRows: tableRows.slice(0, 500),
          cards: cards.slice(0, 100),
        };
      },
    });
    return results?.[0]?.result || { ok: false, error: "scrape_failed" };
  } catch (err) {
    return { ok: false, error: "scrape_failed", message: err instanceof Error ? err.message : String(err) };
  } finally {
    if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
  }
}

/**
 * Parse `scrapeLeagueHistoryPage` result into medal rows.
 *
 * Per-season text-window approach:
 *   1. Split bodyLines into windows bounded by year lines (2009–currentYear).
 *   2. Within each window, find position-marker lines ("Champion", "Second Place", "Third Place").
 *   3. Take the first valid team-name line immediately after each marker.
 *   Never picks the "next N non-junk" globally — each position is anchored by its marker.
 *
 * Returns { medals: [{ season, championOwner, runnerUpOwner, thirdPlaceOwner }], debug: [...] }.
 */
function parseLeagueHistoryMedals(scrapeResult) {
  if (!scrapeResult?.ok) return { medals: [], debug: [] };

  const currentYear = new Date().getFullYear();
  const medals = [];
  const debug = [];

  const yearLineRe = /^(20[0-9]{2})$/;

  // Position markers: these lines identify which role the NEXT team name plays.
  const championMarkerRe = /^(champion|1st\s*place|first\s*place|gold)$/i;
  const runnerUpMarkerRe = /^(second\s*place|2nd\s*place|runner.?up|silver)$/i;
  const thirdMarkerRe    = /^(third\s*place|3rd\s*place|bronze)$/i;

  // Lines that are definitely not team names (ESPN UI text, nav links, position labels).
  const notTeamRe = /^(espn|fantasy\s*football|fantasy|league\s*office|league\s*history|show\s*full.*|view\s*score.*|view\s*sco.*|draft\s*recap|regular\s*season|schedule|standings|draft|trade|roster|settings|members?|message\s*board|waiver|free\s*agent|powered\s*by|terms.*|privacy.*|©|home|sign\s*in|log\s*in|menu|navigation|skip|loading|playoff|playoffs|bracket|champion|second\s*place|third\s*place|first\s*place|1st\s*place|2nd\s*place|3rd\s*place|runner.?up|silver|gold|bronze|more|less)$/i;

  function isValidTeamName(line) {
    const s = String(line || "").trim();
    if (s.length < 2 || s.length > 80) return false;
    if (yearLineRe.test(s)) return false;
    if (notTeamRe.test(s)) return false;
    if (/^https?:/i.test(s)) return false;
    if (/^\d+$/.test(s)) return false;
    return true;
  }

  // Scan up to 5 lines ahead of fromIdx for the next valid team name.
  function findNextValidName(lines, fromIdx) {
    for (let m = fromIdx; m < lines.length && m < fromIdx + 5; m++) {
      if (isValidTeamName(lines[m])) return lines[m];
    }
    return "";
  }

  const bodyLines = Array.isArray(scrapeResult.bodyLines) ? scrapeResult.bodyLines : [];
  if (bodyLines.length === 0) return { medals, debug };

  // Collect all year-line positions.
  const yearIndices = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const l = bodyLines[i].trim();
    if (!yearLineRe.test(l)) continue;
    const year = parseInt(l, 10);
    if (year >= 2009 && year <= currentYear) yearIndices.push({ year, idx: i });
  }

  for (let k = 0; k < yearIndices.length; k++) {
    const { year, idx: startIdx } = yearIndices[k];
    const endIdx = k + 1 < yearIndices.length ? yearIndices[k + 1].idx : bodyLines.length;

    const sectionLines = bodyLines
      .slice(startIdx + 1, endIdx)
      .map((l) => l.trim())
      .filter(Boolean);

    let champion = "";
    let runnerUp = "";
    let thirdPlace = "";

    for (let j = 0; j < sectionLines.length; j++) {
      const line = sectionLines[j];
      if (championMarkerRe.test(line) && !champion) {
        champion = findNextValidName(sectionLines, j + 1);
      } else if (runnerUpMarkerRe.test(line) && !runnerUp) {
        runnerUp = findNextValidName(sectionLines, j + 1);
      } else if (thirdMarkerRe.test(line) && !thirdPlace) {
        thirdPlace = findNextValidName(sectionLines, j + 1);
      }
    }

    debug.push({
      season: year,
      rawSectionLines: sectionLines,
      parsedChampion: champion,
      parsedRunnerUp: runnerUp,
      parsedThird: thirdPlace,
    });

    if (champion) {
      medals.push({ season: year, championOwner: champion, runnerUpOwner: runnerUp, thirdPlaceOwner: thirdPlace });
    }
  }

  medals.sort((a, b) => a.season - b.season);
  return { medals, debug };
}

/** True if a text string looks like a fantasy football score (0–400, up to 2 decimal places). */
function isScoreLine(s) {
  const t = String(s).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return false;
  const n = parseFloat(t);
  return n >= 0 && n <= 400;
}

/** Return week number from a text line, or 0 if not detected. */
function getWeekNumber(s) {
  const m = String(s).match(/\bweek\s*(\d+)\b/i) || String(s).match(/\bwk\.?\s*(\d+)\b/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Parse schedule page scrape result into weekly matchup rows.
 * Tries 4-line pattern (name/score/name/score), inline "Name Score" pairs, then table fallback.
 */
function parseMatchupRows(scrapeResult) {
  const rows = [];
  const parseErrors = [];
  if (!scrapeResult?.ok) return { rows, parseErrors: ["scrape_not_ok"] };
  const lines = Array.isArray(scrapeResult.lines) ? scrapeResult.lines : [];
  if (lines.length === 0) return { rows, parseErrors: ["no_lines"] };

  let currentWeek = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const w = getWeekNumber(line);
    if (w > 0) { currentWeek = w; i++; continue; }
    if (currentWeek <= 0) { i++; continue; }

    // Pattern 1: 4-line block — name / score / name / score
    if (
      i + 3 < lines.length &&
      !isScoreLine(line) && line.length > 1 &&
      isScoreLine(lines[i + 1]) &&
      !isScoreLine(lines[i + 2]) && lines[i + 2].length > 1 &&
      isScoreLine(lines[i + 3])
    ) {
      const name1 = line.trim();
      const s1 = parseFloat(lines[i + 1]);
      const name2 = lines[i + 2].trim();
      const s2 = parseFloat(lines[i + 3]);
      if (name1 !== name2) {
        rows.push({ week: currentWeek, awayTeam: name1, homeTeam: name2, awayScore: s1, homeScore: s2,
          winner: s1 > s2 ? name1 : s2 > s1 ? name2 : null });
        i += 4; continue;
      }
    }

    // Pattern 2: inline "Name Score" on two consecutive lines
    const m1 = line.match(/^(.+?)\s+(\d+(?:\.\d{1,2})?)$/);
    if (m1 && i + 1 < lines.length) {
      const m2 = lines[i + 1].match(/^(.+?)\s+(\d+(?:\.\d{1,2})?)$/);
      if (m2) {
        const name1 = m1[1].trim(); const s1 = parseFloat(m1[2]);
        const name2 = m2[1].trim(); const s2 = parseFloat(m2[2]);
        if (s1 >= 0 && s1 <= 400 && s2 >= 0 && s2 <= 400 && name1 !== name2 && name1.length > 1 && name2.length > 1) {
          rows.push({ week: currentWeek, awayTeam: name1, homeTeam: name2, awayScore: s1, homeScore: s2,
            winner: s1 > s2 ? name1 : s2 > s1 ? name2 : null });
          i += 2; continue;
        }
      }
    }
    i++;
  }

  // Table fallback when line parsing finds nothing
  if (rows.length === 0 && Array.isArray(scrapeResult.tableRows)) {
    let wk = 0;
    for (const { cells } of scrapeResult.tableRows) {
      const w2 = getWeekNumber(cells[0] || "") || getWeekNumber(cells.join(" "));
      if (w2 > 0) { wk = w2; continue; }
      if (wk <= 0) continue;
      const scoreIdxs = cells.reduce((acc, c, ci) => (isScoreLine(c) ? [...acc, ci] : acc), []);
      if (scoreIdxs.length >= 2) {
        const si1 = scoreIdxs[0]; const si2 = scoreIdxs[1];
        const name1 = cells.slice(0, si1).join(" ").trim();
        const name2 = cells.slice(si1 + 1, si2).join(" ").trim();
        const s1 = parseFloat(cells[si1]); const s2 = parseFloat(cells[si2]);
        if (name1 && name2 && name1 !== name2) {
          rows.push({ week: wk, awayTeam: name1, homeTeam: name2, awayScore: s1, homeScore: s2,
            winner: s1 > s2 ? name1 : s2 > s1 ? name2 : null });
        }
      }
    }
    if (rows.length > 0) parseErrors.push("used_table_fallback");
  }

  return { rows, parseErrors };
}

function gmwrNormalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function orderedLinesFromDraftCandidates(candidates) {
  const lines = [];
  let prev = null;
  for (const c of candidates || []) {
    const chunks = String(c.text || "").split(/\r?\n/);
    for (const raw of chunks) {
      const t = raw.trim();
      if (t.length < 2 || t.length > 220) continue;
      if (t === prev) continue;
      lines.push(t);
      prev = t;
    }
  }
  return lines;
}

function isJunkDraftRecapLine(line) {
  const lower = line.toLowerCase();
  if (lower.startsWith("http")) return true;
  if (lower.includes("download the app")) return true;
  if (lower.includes("terms of use") || lower.includes("privacy policy")) return true;
  if (/^pick\s*#?\s*\d+$/i.test(line)) return true;
  return false;
}

function parseRoundHeaderFromLine(line) {
  const m1 = line.match(/^round\s*[:\s-]*(\d{1,2})\b/i);
  if (m1) return Number(m1[1]);
  const m2 = line.match(/^(\d{1,2})(?:st|nd|rd|th)\s+round\b/i);
  if (m2) return Number(m2[1]);
  if (line.length < 56) {
    const m3 = line.match(/\bround\s+(\d{1,2})\b/i);
    if (m3) return Number(m3[1]);
  }
  return null;
}

/**
 * Pick line: "<player> <nflTeamAbbr>, <POS>" (comma before position).
 * @returns {{ playerName: string, nflTeam: string, position: string } | null}
 */
function tryParseDraftPickPlayerLine(line) {
  const m = line.match(/^(.+),\s*(QB|RB|WR|TE|K|D\/ST|DST|DEF)\s*$/i);
  if (!m) return null;
  const left = m[1].trim();
  const posRaw = String(m[2]).toUpperCase();
  const position = posRaw === "DST" || posRaw === "DEF" ? "D/ST" : posRaw;
  const lastSpace = left.lastIndexOf(" ");
  if (lastSpace <= 0) return null;
  const nflTeam = left.slice(lastSpace + 1).trim();
  const playerName = left.slice(0, lastSpace).trim();
  if (!playerName || !nflTeam) return null;
  if (playerName.length > 80 || nflTeam.length > 40) return null;
  return { playerName, nflTeam, position };
}

/**
 * @param {unknown[]} candidates scrape.candidates
 * @param {string} leagueId
 * @param {number} season
 * @returns {{ picks: object[], parseErrors: string[] }}
 */
function parseDraftRecapCandidatesToPicks(candidates, leagueId, season) {
  const parseErrors = [];
  const lines = orderedLinesFromDraftCandidates(candidates);
  let currentRound = 1;
  let roundPick = 0;
  let overall = 0;
  /** @type {string | null} */
  let prevLine = null;
  const picks = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isJunkDraftRecapLine(line)) continue;

    const rh = parseRoundHeaderFromLine(line);
    if (rh != null && Number.isFinite(rh) && rh >= 1 && rh <= 30) {
      currentRound = rh;
      roundPick = 0;
      prevLine = null;
      continue;
    }

    const parsedPick = tryParseDraftPickPlayerLine(line);
    if (parsedPick) {
      roundPick += 1;
      overall += 1;
      const ownerLine = prevLine && !parseRoundHeaderFromLine(prevLine) ? prevLine : "";
      const teamName = ownerLine.trim();
      picks.push({
        leagueId: String(leagueId).trim(),
        season,
        overallPick: overall,
        roundId: currentRound,
        roundPick,
        teamName,
        playerName: parsedPick.playerName,
        nflTeam: parsedPick.nflTeam,
        position: parsedPick.position,
        rawPick: {
          source: "draft_recap_html",
          teamName,
          nflTeam: parsedPick.nflTeam,
          ownerName: "",
        },
      });
      prevLine = line;
      continue;
    }

    prevLine = line;
  }

  if (picks.length === 0) parseErrors.push("no_pick_rows_detected");
  return { picks, parseErrors };
}

/**
 * Convert DOM-scraped draft picks (from scrapeDraftRecapPage) into the full pick payload format
 * expected by parseDraftRecapCandidatesToPicks / picksPayloadForIngestParsedDraft.
 * Adds leagueId, season, and computes overallPick sequentially across rounds.
 *
 * @param {{ ok: boolean, picks: Array, pickCount: number }} domResult  — from scrapeDraftRecapPage
 * @param {string} leagueId
 * @param {number} season
 * @returns {{ picks: object[], parseErrors: string[] }}
 */
function parseDraftRecapDomResult(domResult, leagueId, season) {
  const parseErrors = [];
  if (!domResult?.ok || !Array.isArray(domResult.picks) || domResult.picks.length === 0) {
    parseErrors.push(domResult?.ok === false ? (domResult?.error || "scrape_not_ok") : "no_dom_picks");
    return { picks: [], parseErrors };
  }

  const picks = [];
  let overall = 0;
  for (const p of domResult.picks) {
    overall++;
    const posRaw = String(p.position || "").toUpperCase().trim();
    picks.push({
      leagueId: String(leagueId).trim(),
      season,
      overallPick: overall,
      roundId: p.round,
      roundPick: p.pickInRound,
      teamName: p.fantasyTeam || "",
      playerName: p.playerName || "",
      nflTeam: p.nflTeam || "",
      position: posRaw,
      rawPick: {
        source: "draft_recap_dom",
        teamName: p.fantasyTeam || "",
        nflTeam: p.nflTeam || "",
        ownerName: "",
      },
    });
  }

  if (picks.length === 0) parseErrors.push("picks_empty_after_conversion");
  return { picks, parseErrors };
}

function validateDraftRecap2010ParsedPicks(picks) {
  if (!Array.isArray(picks) || picks.length < 50) {
    return { ok: false, reason: `parsed_count_too_low:${picks?.length ?? 0}` };
  }
  const head = picks.slice(0, 25);
  if (!head.some((p) => String(p.playerName || "").includes("Dez Bryant"))) {
    return { ok: false, reason: "dez_bryant_not_in_first_25_rows" };
  }
  const last = picks[picks.length - 1];
  if (!last || !String(last.playerName || "").trim()) {
    return { ok: false, reason: "last_pick_missing" };
  }
  return { ok: true };
}

/**
 * Single ESPN GET from the service worker: DNR injects `Cookie` + API headers (never set `Cookie` on fetch()).
 */
async function fetchEspnJsonOnceWithDnr(url, label, attempt) {
  const { swid, espnS2 } = await getEspnCookieValues();
  const hasSwid = Boolean(swid);
  const hasEspnS2 = Boolean(espnS2);
  let dnrRuleInstalled = false;
  /** @type {Response | null} */
  let res = null;
  let responsePreviewFirst100 = "";

  if (!hasSwid || !hasEspnS2) {
    logEspnFetchDiagnostics({
      url,
      status: 0,
      ok: false,
      contentType: "",
      hasSwid,
      hasEspnS2,
      dnrRuleInstalled: false,
      responsePreviewFirst100: "",
      label,
      attempt,
      errorType: "espn_login_expired",
    });
    return { ok: false, status: 401, error: "ESPN login expired", data: null };
  }

  try {
    await applyEspnHistoricalFetchDnr(buildEspnCookieHeader(swid, espnS2));
    dnrRuleInstalled = true;

    try {
      res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "X-Fantasy-Source": "kona",
          "X-Fantasy-Platform": "kona",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEspnFetchDiagnostics({
        url,
        status: 0,
        ok: false,
        contentType: "",
        hasSwid,
        hasEspnS2,
        dnrRuleInstalled: true,
        responsePreviewFirst100: msg.slice(0, 100),
        label,
        attempt,
        errorType: "extension_fetch_blocked",
      });
      return { ok: false, status: 0, error: "extension_fetch_blocked", data: null };
    }

    const status = res.status;
    const ok = res.ok;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    try {
      responsePreviewFirst100 = (await res.clone().text()).slice(0, 100);
    } catch {
      responsePreviewFirst100 = "";
    }

    if (status === 401 || status === 403) {
      logEspnFetchDiagnostics({
        url,
        status,
        ok,
        contentType,
        hasSwid,
        hasEspnS2,
        dnrRuleInstalled: true,
        responsePreviewFirst100,
        label,
        attempt,
        errorType: "espn_login_expired",
      });
      return { ok: false, status, error: "ESPN login expired", data: null };
    }
    if (status === 404) {
      logEspnFetchDiagnostics({
        url,
        status,
        ok,
        contentType,
        hasSwid,
        hasEspnS2,
        dnrRuleInstalled: true,
        responsePreviewFirst100,
        label,
        attempt,
        errorType: "unavailable",
      });
      return { ok: false, status: 404, error: "unavailable", data: null };
    }
    if (status === 429) {
      logEspnFetchDiagnostics({
        url,
        status,
        ok,
        contentType,
        hasSwid,
        hasEspnS2,
        dnrRuleInstalled: true,
        responsePreviewFirst100,
        label,
        attempt,
        errorType: "rate_limited",
      });
      return { ok: false, status: 429, error: "rate_limited", data: null };
    }
    if (!ok) {
      logEspnFetchDiagnostics({
        url,
        status,
        ok,
        contentType,
        hasSwid,
        hasEspnS2,
        dnrRuleInstalled: true,
        responsePreviewFirst100,
        label,
        attempt,
        errorType: "http_error",
      });
      return { ok: false, status, error: `HTTP ${status}`, data: null };
    }
    if (contentType.includes("text/html")) {
      logEspnFetchDiagnostics({
        url,
        status,
        ok,
        contentType,
        hasSwid,
        hasEspnS2,
        dnrRuleInstalled: true,
        responsePreviewFirst100,
        label,
        attempt,
        errorType: "espn_html_not_json",
      });
      return { ok: false, status, error: "espn_html_not_json", data: null };
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      logEspnFetchDiagnostics({
        url,
        status,
        ok,
        contentType,
        hasSwid,
        hasEspnS2,
        dnrRuleInstalled: true,
        responsePreviewFirst100,
        label,
        attempt,
        errorType: "invalid_json",
      });
      return { ok: false, status, error: "invalid_json", data: null };
    }

    try {
      responsePreviewFirst100 = JSON.stringify(data).slice(0, 100);
    } catch {
      responsePreviewFirst100 = "";
    }
    const payloadKeys =
      data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data).slice(0, 50) : [];
    logEspnFetchDiagnostics({
      url,
      status,
      ok: true,
      contentType,
      hasSwid,
      hasEspnS2,
      dnrRuleInstalled: true,
      responsePreviewFirst100,
      payloadKeys,
      label,
      attempt,
      errorType: null,
    });
    return { ok: true, status, error: null, data };
  } finally {
    await removeEspnHistoricalFetchDnr();
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
    const r = await fetchEspnJsonOnceWithDnr(url, label, attempt);
    const status = r.status ?? 0;
    console.info("[GMWR] historical ESPN", { url, label, status, attempt, via: "service_worker_dnr" });

    if (!r.ok) {
      if (r.error === "extension_fetch_blocked") {
        return { ok: false, status: 0, error: "extension_fetch_blocked", data: null };
      }
      if (r.error === "espn_html_not_json" || r.error === "invalid_json") {
        return { ok: false, status: status || 0, error: r.error, data: null };
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
      if (r.error === "not_found" || r.error === "unavailable" || status === 404) {
        console.warn("[GMWR] ESPN fetch failed", {
          url,
          httpStatus: status,
          label,
          attempt,
          error: r.error || "not_found",
        });
        return { ok: false, status: status || 404, error: r.error || "not_found", data: null };
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

const ROSTER_MATRIX_DEBUG_LEAGUE_ID = "457622";
const ROSTER_MATRIX_DEBUG_SEASONS = [2010, 2013, 2015, 2017];

function rosterMatrixTeamsFromPayload(payload) {
  const t = payload?.teams;
  return Array.isArray(t) ? t : [];
}

function rosterMatrixCountEntries(teams) {
  let n = 0;
  for (const team of teams) {
    const entries = team?.roster?.entries;
    if (Array.isArray(entries)) n += entries.length;
  }
  return n;
}

function rosterMatrixFirstTeamDisplayName(team) {
  if (!team || typeof team !== "object") return "";
  if (typeof team.name === "string" && team.name.trim()) return team.name.trim();
  const loc = typeof team.location === "string" ? team.location.trim() : "";
  const nick = typeof team.nickname === "string" ? team.nickname.trim() : "";
  const joined = [loc, nick].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (typeof team.abbrev === "string" && team.abbrev.trim()) return team.abbrev.trim();
  return "";
}

function rosterMatrixFirstPlayerFromTeams(teams) {
  for (const team of teams) {
    const entries = team?.roster?.entries;
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const e = entries[0];
    const pool = e?.playerPoolEntry;
    const player = pool?.player;
    const pid =
      e?.playerId ??
      pool?.id ??
      (player && typeof player.id === "number" ? player.id : player?.id != null ? Number(player.id) : null);
    const pname =
      (typeof player?.fullName === "string" && player.fullName.trim()) ||
      (typeof player?.lastName === "string" && player.lastName.trim()) ||
      "";
    return {
      firstRosterPlayerId: Number.isFinite(Number(pid)) ? Number(pid) : pid,
      firstRosterPlayerName: typeof pname === "string" ? pname : String(pname || ""),
    };
  }
  return { firstRosterPlayerId: null, firstRosterPlayerName: "" };
}

/**
 * One matrix row for a single GET result (same fetch path as historical ESPN import).
 * @param {number} season
 * @param {"seasons_lm_api_reads"|"leagueHistory_fantasy_espn"} endpointType
 * @param {{ ok: boolean, status?: number, error?: string | null, data: unknown }} r
 */
function buildRosterMatrixRow(season, endpointType, r) {
  /** @type {{ season: number, endpointType: string, httpStatus: number, isArray: boolean, teamsCount: number, rosterEntriesCount: number, firstTeamId: number | string | null, firstTeamName: string, firstRosterPlayerId: number | string | null, firstRosterPlayerName: string, hasRosterEntries: boolean, error: string | null }} */
  const row = {
    season,
    endpointType,
    httpStatus: r.status ?? 0,
    isArray: false,
    teamsCount: 0,
    rosterEntriesCount: 0,
    firstTeamId: null,
    firstTeamName: "",
    firstRosterPlayerId: null,
    firstRosterPlayerName: "",
    hasRosterEntries: false,
    error: null,
  };
  if (!r.ok) {
    row.error = r.error || `HTTP_${row.httpStatus}`;
    return row;
  }
  const raw = r.data;
  row.isArray = Array.isArray(raw);
  if (raw == null) {
    row.error = r.error || "empty_json";
    return row;
  }
  const payload =
    Array.isArray(raw) && raw.length > 0 && raw[0] != null && typeof raw[0] === "object" ? raw[0] : raw;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    row.error = "unexpected_payload_shape";
    return row;
  }
  const teams = rosterMatrixTeamsFromPayload(payload);
  row.teamsCount = teams.length;
  if (teams.length > 0) {
    const ft = teams[0];
    row.firstTeamId = ft?.id ?? ft?.teamId ?? null;
    row.firstTeamName = rosterMatrixFirstTeamDisplayName(ft);
    row.rosterEntriesCount = rosterMatrixCountEntries(teams);
    const { firstRosterPlayerId, firstRosterPlayerName } = rosterMatrixFirstPlayerFromTeams(teams);
    row.firstRosterPlayerId = firstRosterPlayerId;
    row.firstRosterPlayerName = firstRosterPlayerName;
    row.hasRosterEntries = row.rosterEntriesCount > 0;
  }
  return row;
}

async function postTrpcHistJson(url, warRoomCookieHeader, jsonInput, authToken) {
  const body = JSON.stringify({ json: jsonInput });
  console.info("[GMWR:diag] POST →", url);
  await applyWarRoomTrpcHistRule(warRoomCookieHeader);
  const extraHeaders = authToken ? { "Authorization": `Bearer ${authToken}` } : {};
  try {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        body,
        credentials: "include",
      });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const diag = `SERVER_POST_FAILED | url=${url} | network=${msg}`;
      console.error("[GMWR:diag]", diag);
      throw new Error(diag);
    }
    const status = res.status;
    let parsed = null;
    let rawBody = "";
    const ct = res.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) parsed = await res.json();
      else rawBody = await res.text();
    } catch { /* ignore */ }
    if (!res.ok) {
      const err = safeErrorSummary(status, parsed);
      console.warn("[GMWR:diag] POST not-ok", { url, status, err, rawBody: rawBody.slice(0,200) });
      return { ok: false, status, error: `SERVER_POST_FAILED | url=${url} | HTTP ${status} | ${err}`, parsed };
    }
    if (hasTrpcError(parsed)) {
      const err = safeErrorSummary(status, parsed);
      console.warn("[GMWR:diag] POST tRPC error", { url, status, err });
      return { ok: false, status, error: `SERVER_POST_FAILED | url=${url} | tRPC | ${err}`, parsed };
    }
    console.info("[GMWR:diag] POST ok", { url, status });
    return { ok: true, status, parsed };
  } finally {
    await removeWarRoomTrpcHistRule();
  }
}

function picksPayloadForIngestParsedDraft(parsedPicks) {
  return parsedPicks.map((row) => ({
    overallPick: row.overallPick,
    roundId: row.roundId,
    roundPick: row.roundPick,
    teamId: 0,
    teamName: row.teamName,
    playerName: row.playerName,
    position: row.position,
    nflTeam: row.nflTeam,
  }));
}

async function postIngestParsedDraftPicks(leagueId, season, picks, warRoomCookieHeader, authToken) {
  const post = await postTrpcHistJson(TRPC_PARSED_DRAFT_INGEST_URL, warRoomCookieHeader, {
    leagueId: String(leagueId).trim(),
    season,
    picks,
  }, authToken);
  const result = post.ok ? trpcResultJson(post.parsed) : null;
  return { ok: post.ok, status: post.status, error: post.error, result, parsed: post.parsed };
}

/**
 * POST espn.ingestLegacyDraftRecap — correct endpoint for 2010–2017 DOM-scraped picks.
 * Writes source="legacy_draft_recap" so legacyDraftPicks query in DraftHistory can read them.
 * NOTE: server resolves leagueId from the authenticated user — no leagueId in payload.
 */
async function postIngestLegacyDraftRecap(season, picks, warRoomCookieHeader, authToken) {
  // Shape expected by ingestLegacyDraftRecap: no leagueId, no teamId field
  const legacyPicks = picks.map((p) => ({
    overallPick: p.overallPick,
    roundId: p.roundId,
    roundPick: p.roundPick,
    playerName: p.playerName,
    position: p.position,
    nflTeam: p.nflTeam || "",
    teamName: p.teamName,
  }));
  const post = await postTrpcHistJson(TRPC_LEGACY_DRAFT_INGEST_URL, warRoomCookieHeader, {
    season,
    picks: legacyPicks,
  }, authToken);
  const result = post.ok ? trpcResultJson(post.parsed) : null;
  return { ok: post.ok, status: post.status, error: post.error, result, parsed: post.parsed };
}

/** FULL IMPORT: mDraftDetail API → delete season rows → insert normalized picks (no HTML scrape). */
/**
 * Scrape the ESPN League Rosters page for one season and return structured player rows.
 * URL strategy:
 *   - season 2025 → no seasonId param (base URL) because ?seasonId=2025 requires auth redirect
 *   - season 2010–2024 → ?seasonId=YYYY
 *
 * @param {string} leagueId
 * @param {number} season
 */
async function scrapeSeasonRosterPage(leagueId, season) {
  const lid = String(leagueId ?? "").trim();
  const y = Math.floor(Number(season));
  const targetUrl = y === 2025
    ? `https://fantasy.espn.com/football/league/rosters?leagueId=${encodeURIComponent(lid)}`
    : `https://fantasy.espn.com/football/league/rosters?leagueId=${encodeURIComponent(lid)}&seasonId=${y}`;

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = tab.id;
    console.info("[GMWR] scrapeSeasonRoster: opened tab", { tabId, season: y, url: targetUrl });

    await waitForTabComplete(tabId, 30000);
    await sleep(6000);

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [lid, y],
      func: (leagueIdArg, seasonArg) => {
        const INJURY_BADGES = new Set(["Q", "D", "O", "P", "SSPD", "IR", "PUP", "NFI"]);
        const SKIP_SLOTS   = new Set(["SLOT", "PLAYER", "ACQ"]);

        function parsePlayerCell(td) {
          const injuryEl = td.querySelector("[class*='injury'], [class*='status']");
          const injuryStatus = injuryEl ? injuryEl.innerText.trim() : "";
          const raw = td.innerText.trim();
          if (!raw || raw === "Empty") return null;
          const lines = raw.split("\n")
            .map(l => l.trim())
            .filter(l => l && l !== injuryStatus && !INJURY_BADGES.has(l));
          if (lines.length === 0) return null;
          return {
            playerName:  lines[0],
            nflTeam:     lines[1] || "",
            position:    lines[2] || "",
            injuryStatus,
          };
        }

        const tables    = document.querySelectorAll("table");
        const teamNames = document.querySelectorAll(".teamName");
        const players   = [];

        tables.forEach((tbl, i) => {
          const teamName = teamNames[i] ? teamNames[i].innerText.trim() : ("Team_" + i);
          tbl.querySelectorAll("tr").forEach(row => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 2) return;
            const slot = cells[0].innerText.trim();
            if (!slot || SKIP_SLOTS.has(slot.toUpperCase())) return;
            const parsed = parsePlayerCell(cells[1]);
            if (!parsed || !parsed.playerName || parsed.playerName === "Empty") return;
            const acq = cells.length >= 3 ? cells[2].innerText.trim() : "";
            players.push({
              teamName,
              slot,
              playerName:      parsed.playerName,
              nflTeam:         parsed.nflTeam,
              position:        parsed.position,
              acquisitionType: acq,
              injuryStatus:    parsed.injuryStatus,
            });
          });
        });

        const teamSet = new Set(players.map(p => p.teamName));
        return {
          ok: players.length > 0 && teamSet.size > 0,
          leagueId: leagueIdArg,
          season: seasonArg,
          url: location.href,
          title: document.title,
          players,
          teamCount: teamSet.size,
          playerCount: players.length,
        };
      },
    });

    const r = results?.[0]?.result || { ok: false, error: "scrape_failed" };
    console.info("[GMWR] scrapeSeasonRoster: done", { season: y, ok: r.ok, teams: r.teamCount, players: r.playerCount });
    return r;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[GMWR] scrapeSeasonRoster: error", { season: y, msg });
    return { ok: false, error: "scrape_failed", message: msg, season: y, players: [] };
  } finally {
    if (tabId != null) { try { await chrome.tabs.remove(tabId); } catch { /* ignore */ } }
  }
}

/**
 * POST espn.ingestSeasonRosters — writes season_rosters rows with source tracking.
 */
async function postIngestSeasonRosters(season, players, warRoomCookieHeader, authToken) {
  const post = await postTrpcHistJson(
    TRPC_SEASON_ROSTER_INGEST_URL, warRoomCookieHeader, { season, players }, authToken,
  );
  const result = post.ok ? trpcResultJson(post.parsed) : null;
  return { ok: post.ok, status: post.status, error: post.error, result };
}

async function postImportDraftFromEspnApi(leagueId, season, espnCreds, warRoomCookieHeader, authToken) {
  const jsonInput = {
    leagueId: String(leagueId).trim(),
    season,
  };
  if (espnCreds?.swid) jsonInput.swid = espnCreds.swid;
  if (espnCreds?.espnS2) jsonInput.espnS2 = espnCreds.espnS2;
  console.info("[GMWR] importDraftFromEspnApi creds", {
    season,
    hasSwid: Boolean(espnCreds?.swid),
    hasEspnS2: Boolean(espnCreds?.espnS2),
  });
  const post = await postTrpcHistJson(
    TRPC_IMPORT_DRAFT_API_URL,
    warRoomCookieHeader,
    jsonInput,
    authToken,
  );
  const result = post.ok ? trpcResultJson(post.parsed) : null;
  return { ok: post.ok, status: post.status, error: post.error, result, parsed: post.parsed };
}

async function openOrFocusPostConnectTab() {
  const tabs = await chrome.tabs.query({ url: ["https://fantasyfootballrivals.com/*", "https://www.fantasyfootballrivals.com/*", "https://gmwarroom.online/*"] });
  const existing = tabs.find((t) => t.id != null) ?? null;
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { url: POST_CONNECT_URL, active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: POST_CONNECT_URL, active: true });
}

/**
 * POST saveCredentials. Cookie header is applied via DNR (SW fetch forbids Cookie).
 */
async function postSaveCredentials({ swid, espnS2, leagueId, leagueName, warRoomCookieHeader }) {
  const json = { swid, espnS2, leagueId: String(leagueId).trim() };
  if (leagueName && String(leagueName).trim()) json.leagueName = String(leagueName).trim();
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

  // ── RFSN-030C FantasyPros solo mock relay ─────────────────────────────────
  if (t === MSG_FP_MOCK_ARM) {
    (async () => {
      expireFpMockSessionIfStale();
      fpMockConnectorState = {
        armed: true,
        config: message?.config && typeof message.config === "object" ? message.config : {},
        lastStatus: { status: "arming" },
        lastPickAt: null,
        picksEmitted: 0,
        picksObserved: 0,
        armedAt: new Date().toISOString(),
        sessionId: newFpMockSessionId(),
      };
      const r = await broadcastToFantasyProsTabs({
        type: MSG_FP_MOCK_ARM,
        config: fpMockConnectorState.config,
      });
      await broadcastToFfrTabs({
        type: MSG_FP_MOCK_STATUS,
        provider: "fantasypros",
        status: r.reached > 0 ? "armed" : "waiting_for_fantasypros_tab",
        fantasyProsTabs: r.tabCount,
        reached: r.reached,
        sessionId: fpMockConnectorState.sessionId,
      });
      sendResponse({ ok: true, sessionId: fpMockConnectorState.sessionId, ...r });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_FP_MOCK_DISARM) {
    (async () => {
      fpMockConnectorState = {
        armed: false,
        config: null,
        lastStatus: { status: "disarmed" },
        lastPickAt: null,
        picksEmitted: 0,
        picksObserved: 0,
        armedAt: null,
        sessionId: null,
      };
      await broadcastToFantasyProsTabs({ type: MSG_FP_MOCK_DISARM });
      await broadcastToFfrTabs({
        type: MSG_FP_MOCK_STATUS,
        provider: "fantasypros",
        status: "disarmed",
      });
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_FP_MOCK_PING) {
    (async () => {
      expireFpMockSessionIfStale();
      const r = await broadcastToFantasyProsTabs({ type: MSG_FP_MOCK_PING });
      sendResponse({
        ok: true,
        extensionPresent: true,
        fantasyProsTabs: r.tabCount,
        reached: r.reached,
        armed: fpMockConnectorState.armed,
        sessionId: fpMockConnectorState.sessionId,
      });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_FP_MOCK_GET_STATE) {
    (async () => {
      expireFpMockSessionIfStale();
      const tabs = await chrome.tabs.query({ url: "https://draftwizard.fantasypros.com/*" });
      const ffrTabs = (await chrome.tabs.query({})).filter((tab) => isFfrTabUrl(tab.url || ""));
      sendResponse({
        ok: true,
        armed: fpMockConnectorState.armed,
        config: fpMockConnectorState.config,
        lastStatus: fpMockConnectorState.lastStatus,
        lastPickAt: fpMockConnectorState.lastPickAt,
        picksEmitted: fpMockConnectorState.picksEmitted,
        picksObserved: fpMockConnectorState.picksEmitted,
        fantasyProsTabs: tabs.length,
        reached: tabs.length,
        ffrTabs: ffrTabs.length,
        sessionId: fpMockConnectorState.sessionId,
        armedAt: fpMockConnectorState.armedAt,
      });
    })().catch((e) => {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        armed: fpMockConnectorState.armed,
        config: fpMockConnectorState.config,
        lastStatus: fpMockConnectorState.lastStatus,
        lastPickAt: fpMockConnectorState.lastPickAt,
        picksEmitted: fpMockConnectorState.picksEmitted,
        picksObserved: fpMockConnectorState.picksEmitted,
        fantasyProsTabs: 0,
        reached: 0,
        ffrTabs: 0,
        sessionId: fpMockConnectorState.sessionId,
        armedAt: fpMockConnectorState.armedAt,
      });
    });
    return true;
  }

  if (t === MSG_FP_MOCK_PICK_BATCH) {
    if (message?.provider && message.provider !== "fantasypros") {
      sendResponse({ ok: false, error: "unsupported_provider" });
      return true;
    }
    expireFpMockSessionIfStale();
    if (!fpMockConnectorState.armed) {
      sendResponse({ ok: false, error: "not_armed" });
      return true;
    }
    fpMockConnectorState.lastPickAt = new Date().toISOString();
    const batchLen = Array.isArray(message?.picks) ? message.picks.length : 0;
    if (batchLen > 0) {
      setFpMockEmittedCount(fpMockConnectorState.picksEmitted + batchLen);
    }
    (async () => {
      const ffr = await broadcastToFfrTabs({
        ...message,
        type: MSG_FP_MOCK_PICK_BATCH,
        provider: "fantasypros",
        relayedAt: fpMockConnectorState.lastPickAt,
        sessionId: fpMockConnectorState.sessionId,
      });
      sendResponse({
        ok: true,
        ffrTabs: ffr.tabCount,
        ffrReached: ffr.reached,
        picksEmitted: fpMockConnectorState.picksEmitted,
      });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_FP_MOCK_STATUS || t === MSG_FP_MOCK_SESSION_RESET) {
    if (message?.provider && message.provider !== "fantasypros") {
      sendResponse({ ok: false, error: "unsupported_provider" });
      return true;
    }
    expireFpMockSessionIfStale();
    fpMockConnectorState.lastStatus = message;
    // Never adopt observer picksObserved into the session counter — that field used to
    // inflate every poll. Prefer explicit picksEmitted from diagnostics when present.
    if (fpMockConnectorState.armed) {
      const diagEmitted = Number(message?.diagnostics?.picksEmitted);
      if (Number.isFinite(diagEmitted) && diagEmitted >= fpMockConnectorState.picksEmitted) {
        setFpMockEmittedCount(diagEmitted);
      }
    }
    if (t === MSG_FP_MOCK_SESSION_RESET && fpMockConnectorState.config) {
      setFpMockEmittedCount(0);
    }
    (async () => {
      await broadcastToFfrTabs(message);
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  // ── Phase 2 ESPN bookmarklet transport (route only; never mixes with FP) ───
  if (t === MSG_ESPN_BM_SET_AUTO_INJECT) {
    (async () => {
      const enabled = message?.enabled === true;
      espnBmConnectorState.autoInjectEnabled = enabled;
      espnBmConnectorState.diagnostics.featureFlagState = enabled;
      try {
        await chrome.storage.local.set({ rfsnEspnAutoInjectEnabled: enabled });
      } catch (_) {
        /* ignore */
      }
      const r = await broadcastToEspnFantasyTabs({
        type: MSG_ESPN_BM_SET_AUTO_INJECT,
        enabled,
      });
      sendResponse({ ok: true, enabled, ...r });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_DRAFT_AVAILABILITY) {
    (async () => {
      const tabId = sender?.tab?.id != null ? String(sender.tab.id) : "unknown";
      const room = {
        tabId,
        urlKind: message?.urlKind != null ? String(message.urlKind) : null,
        leagueId: message?.leagueId != null ? String(message.leagueId) : null,
        readerLifecycle: message?.readerLifecycle != null ? String(message.readerLifecycle) : null,
        at: new Date().toISOString(),
        planAction: message?.planAction != null ? String(message.planAction) : null,
      };
      espnBmConnectorState.draftRooms[tabId] = room;
      espnBmConnectorState.diagnostics.lastHeartbeat = room.at;
      await broadcastToFfrTabs({
        type: MSG_ESPN_BM_DRAFT_AVAILABILITY,
        protocolVersion: 1,
        provider: "espn-live",
        rooms: Object.values(espnBmConnectorState.draftRooms),
        roomCount: Object.keys(espnBmConnectorState.draftRooms).length,
        ...room,
      });
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_TELEMETRY) {
    espnBmConnectorState.lastTelemetry = {
      event: message?.event != null ? String(message.event).slice(0, 64) : null,
      at: message?.at != null ? String(message.at) : new Date().toISOString(),
      leagueId: message?.leagueId != null ? String(message.leagueId).slice(0, 32) : null,
    };
    try {
      console.info("[rfsn-031b-telemetry]", espnBmConnectorState.lastTelemetry.event, {
        leagueId: espnBmConnectorState.lastTelemetry.leagueId,
        at: espnBmConnectorState.lastTelemetry.at,
      });
    } catch (_) {
      /* ignore */
    }
    sendResponse({ ok: true });
    return true;
  }

  if (t === MSG_ESPN_BM_ARM) {
    (async () => {
      expireEspnBmSessionIfStale();
      const config =
        message?.config && typeof message.config === "object" ? message.config : {};
      const sessionNonce =
        typeof config.sessionNonce === "string" && config.sessionNonce.trim()
          ? String(config.sessionNonce).trim().slice(0, 128)
          : `espn-bm-${Date.now().toString(36)}`;
      const nextConfig = { ...config, sessionNonce };
      espnBmConnectorState = {
        ...espnBmConnectorState,
        armed: true,
        config: nextConfig,
        lastStatus: { status: "arming" },
        lastPickAt: null,
        batchesRelayed: 0,
        armedAt: new Date().toISOString(),
        sessionNonce,
      };
      const r = await broadcastToEspnFantasyTabs({
        type: MSG_ESPN_BM_ARM,
        config: nextConfig,
      });
      // Content reached ≠ publisher.arm(). Keep Waiting until Board Mirror STATUS armed/monitoring.
      await broadcastToFfrTabs({
        type: MSG_ESPN_BM_STATUS,
        protocolVersion: 1,
        provider: "espn-live",
        status: r.reached > 0 ? "waiting_for_espn_mirror" : "waiting_for_espn_tab",
        espnTabs: r.tabCount,
        reached: r.reached,
        sessionNonce,
      });
      sendResponse({ ok: true, sessionNonce, ...r });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_DISARM) {
    (async () => {
      espnBmConnectorState = {
        ...espnBmConnectorState,
        armed: false,
        config: null,
        lastStatus: { status: "disarmed" },
        lastPickAt: null,
        batchesRelayed: 0,
        armedAt: null,
        sessionNonce: null,
      };
      await broadcastToEspnFantasyTabs({ type: MSG_ESPN_BM_DISARM });
      await broadcastToFfrTabs({
        type: MSG_ESPN_BM_STATUS,
        protocolVersion: 1,
        provider: "espn-live",
        status: "disarmed",
      });
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_PING) {
    (async () => {
      expireEspnBmSessionIfStale();
      const r = await broadcastToEspnFantasyTabs({ type: MSG_ESPN_BM_PING });
      sendResponse({
        ok: true,
        extensionPresent: true,
        espnTabs: r.tabCount,
        reached: r.reached,
        armed: espnBmConnectorState.armed,
        sessionNonce: espnBmConnectorState.sessionNonce,
      });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_GET_STATE) {
    (async () => {
      expireEspnBmSessionIfStale();
      const espnTabs = (await chrome.tabs.query({})).filter((tab) =>
        isEspnFantasyTabUrl(tab.url || ""),
      );
      const ffrTabs = (await chrome.tabs.query({})).filter((tab) => isFfrTabUrl(tab.url || ""));
      sendResponse({
        ok: true,
        armed: espnBmConnectorState.armed,
        config: espnBmConnectorState.config,
        lastStatus: espnBmConnectorState.lastStatus,
        lastPickAt: espnBmConnectorState.lastPickAt,
        batchesRelayed: espnBmConnectorState.batchesRelayed,
        espnTabs: espnTabs.length,
        ffrTabs: ffrTabs.length,
        sessionNonce: espnBmConnectorState.sessionNonce,
        armedAt: espnBmConnectorState.armedAt,
        autoInjectEnabled: espnBmConnectorState.autoInjectEnabled,
        draftRooms: espnBmConnectorState.draftRooms,
        lastTelemetry: espnBmConnectorState.lastTelemetry,
        diagnostics: espnBmConnectorState.diagnostics,
      });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_REPLAY_REQUEST) {
    (async () => {
      expireEspnBmSessionIfStale();
      if (!espnBmConnectorState.armed || !espnBmConnectorState.config) {
        sendResponse({ ok: false, error: "not_armed" });
        return;
      }
      const sessionNonce = espnBmConnectorState.sessionNonce;
      if (
        message?.sessionNonce &&
        sessionNonce &&
        String(message.sessionNonce) !== sessionNonce
      ) {
        sendResponse({ ok: false, error: "session_nonce_mismatch" });
        return;
      }
      const payload = {
        type: MSG_ESPN_BM_REPLAY_REQUEST,
        draftId: message?.draftId,
        sessionNonce: sessionNonce,
        afterOverallPick: message?.afterOverallPick,
        requestId: message?.requestId,
        provider: "espn-live",
      };
      const r = await broadcastToEspnFantasyTabs(payload);
      sendResponse({ ok: true, ...r });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_PICK_BATCH) {
    const espnBmPathHop = {
      hop: "background",
      type: t,
      sessionNonce: message?.sessionNonce != null ? String(message.sessionNonce) : null,
      draftId: message?.draftId != null ? String(message.draftId) : null,
      protocolVersion: message?.protocolVersion,
      revision: message?.revision,
      batchSize: Array.isArray(message?.picks) ? message.picks.length : null,
      bgArmed: espnBmConnectorState.armed,
      bgSessionNonce: espnBmConnectorState.sessionNonce,
    };
    try {
      console.info("[espn-bm-path]", "background_recv_PICK_BATCH", espnBmPathHop);
    } catch (_) {
      /* ignore */
    }
    if (message?.provider && message.provider !== "espn-live") {
      try {
        console.info("[espn-bm-path]", "background_drop_PICK_BATCH", {
          ...espnBmPathHop,
          reject: "unsupported_provider",
        });
      } catch (_) {
        /* ignore */
      }
      sendResponse({ ok: false, error: "unsupported_provider" });
      return true;
    }
    if (Math.floor(Number(message?.protocolVersion)) !== 1) {
      try {
        console.info("[espn-bm-path]", "background_drop_PICK_BATCH", {
          ...espnBmPathHop,
          reject: "unsupported_protocol_version",
        });
      } catch (_) {
        /* ignore */
      }
      sendResponse({ ok: false, error: "unsupported_protocol_version" });
      return true;
    }
    expireEspnBmSessionIfStale();
    if (!espnBmConnectorState.armed) {
      try {
        console.info("[espn-bm-path]", "background_drop_PICK_BATCH", {
          ...espnBmPathHop,
          reject: "!espnBmConnectorState.armed",
          line: "background.js:!armed",
        });
      } catch (_) {
        /* ignore */
      }
      sendResponse({ ok: false, error: "not_armed" });
      return true;
    }
    if (
      espnBmConnectorState.sessionNonce &&
      message?.sessionNonce &&
      String(message.sessionNonce) !== espnBmConnectorState.sessionNonce
    ) {
      try {
        console.info("[espn-bm-path]", "background_drop_PICK_BATCH", {
          ...espnBmPathHop,
          reject: "session_nonce_mismatch",
          line: "background.js:session_nonce_mismatch",
        });
      } catch (_) {
        /* ignore */
      }
      sendResponse({ ok: false, error: "session_nonce_mismatch" });
      return true;
    }
    espnBmConnectorState.lastPickAt = new Date().toISOString();
    espnBmConnectorState.batchesRelayed += 1;
    (async () => {
      const ffr = await broadcastToFfrTabs({
        ...message,
        type: MSG_ESPN_BM_PICK_BATCH,
        provider: "espn-live",
        relayedAt: espnBmConnectorState.lastPickAt,
        sessionNonce: espnBmConnectorState.sessionNonce,
      });
      try {
        console.info("[espn-bm-path]", "background_relay_PICK_BATCH", {
          ...espnBmPathHop,
          ffrTabs: ffr.tabCount,
          ffrReached: ffr.reached,
          batchesRelayed: espnBmConnectorState.batchesRelayed,
        });
      } catch (_) {
        /* ignore */
      }
      sendResponse({
        ok: true,
        ffrTabs: ffr.tabCount,
        ffrReached: ffr.reached,
        batchesRelayed: espnBmConnectorState.batchesRelayed,
      });
    })().catch((e) => {
      try {
        console.info("[espn-bm-path]", "background_drop_PICK_BATCH", {
          ...espnBmPathHop,
          reject: "broadcast_failed",
          error: e instanceof Error ? e.message : String(e),
        });
      } catch (_) {
        /* ignore */
      }
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_ESPN_BM_STATUS || t === MSG_ESPN_BM_SESSION_RESET || t === MSG_ESPN_BM_PONG) {
    if (message?.provider && message.provider !== "espn-live") {
      sendResponse({ ok: false, error: "unsupported_provider" });
      return true;
    }
    if (Math.floor(Number(message?.protocolVersion)) !== 1) {
      sendResponse({ ok: false, error: "unsupported_protocol_version" });
      return true;
    }
    expireEspnBmSessionIfStale();
    if (t === MSG_ESPN_BM_STATUS || t === MSG_ESPN_BM_PONG) {
      espnBmConnectorState.lastStatus = message;
    }
    (async () => {
      await broadcastToFfrTabs({
        ...message,
        provider: "espn-live",
        sessionNonce: message?.sessionNonce ?? espnBmConnectorState.sessionNonce,
      });
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
    return true;
  }

  if (t === MSG_PAGE_ESPN_FETCH) {
    (async () => {
      const url = String(message?.url || "").trim();
      if (!url.startsWith("https://fantasy.espn.com/") && !url.startsWith("https://lm-api-reads.fantasy.espn.com/")) {
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
              : r.error === "unavailable"
                ? "unavailable"
                : r.error === "extension_fetch_blocked" ||
                    r.error === "espn_html_not_json" ||
                    r.error === "invalid_json"
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

  // â”€â”€â”€ Capture per-player WEEKLY stats: loops weeks, fetches mMatchupScore box scores,
  //     posts each to playerStatsCache.saveWeeklyPlayerStats (fills gm_weekly_player_stats). â”€â”€â”€
  if (t === MSG_CAPTURE_WEEKLY_STATS) {
    let respondedWS = false;
    const keepAliveWS = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
    function onceRespondWS(response) {
      if (respondedWS) return;
      respondedWS = true;
      clearInterval(keepAliveWS);
      clearTimeout(wsTimer);
      sendResponse(response);
    }
    // up to ~17 weeks x a few seconds each; hard cap 720s.
    const wsTimer = setTimeout(
      () => onceRespondWS({ ok: false, error: "extension_internal_timeout" }),
      720000,
    );

    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const season = Math.floor(Number(message?.season || 2025));
      const fromWeek = Math.max(1, Math.floor(Number(message?.fromWeek || 1)));
      const toWeek = Math.min(22, Math.floor(Number(message?.toWeek || 17)));
      const clerkToken = typeof message?.clerkToken === "string" ? message.clerkToken : "";

      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRespondWS({ ok: false, error: "ESPN login expired", details: "missing_espn_cookies" });
        return;
      }
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        onceRespondWS({ ok: false, error: "GM War Room session not found. Sign in at fantasyfootballrivals.com, then retry." });
        return;
      }

      // count per-player roster entries present in an ESPN payload (so we know if a URL shape actually carried player data)
      function countRosterEntries(data, week) {
        const sched = (data && data.schedule) || [];
        let sides = 0, entries = 0;
        for (const s of sched) {
          if (week && s.matchupPeriodId !== week && s.scoringPeriodId !== week) continue;
          for (const side of ["home", "away"]) {
            const r = s && s[side] && (s[side].rosterForCurrentScoringPeriod || s[side].rosterForMatchupPeriod);
            if (r && r.entries && r.entries.length) { sides++; entries += r.entries.length; }
          }
        }
        return { sides, entries };
      }

      const results = [];
      let totalStats = 0;
      for (let week = fromWeek; week <= toWeek; week++) {
        await sleep(700);
        const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}`;
        // URL A: league-wide boxscore for the scoring period (returns all teams' rosters in one call)
        const urlA = `${base}?view=mBoxscore&view=mScoreboard&view=mMatchupScore&scoringPeriodId=${week}&matchupPeriodId=${week}`;
        let fetched = await fetchEspnJsonWithBackoff(urlA, { label: `weeklyStats_A_w${week}` });
        let usedUrl = "A";
        let counts = fetched.ok && fetched.data ? countRosterEntries(fetched.data, week) : { sides: 0, entries: 0 };

        if (!fetched.ok || counts.entries === 0) {
          // URL B: plain mBoxscore without matchupPeriodId (some seasons key only on scoringPeriodId)
          await sleep(400);
          const urlB = `${base}?view=mBoxscore&view=mMatchupScore&scoringPeriodId=${week}`;
          const fb = await fetchEspnJsonWithBackoff(urlB, { label: `weeklyStats_B_w${week}` });
          const cb = fb.ok && fb.data ? countRosterEntries(fb.data, week) : { sides: 0, entries: 0 };
          if (fb.ok && cb.entries > counts.entries) { fetched = fb; counts = cb; usedUrl = "B"; }
        }

        if (!fetched.ok || fetched.data == null) {
          results.push({ week, ok: false, error: fetched.error || "espn_fetch_failed", usedUrl, rosterEntries: 0 });
          console.warn("[GMWR] weeklyStats fetch failed", { season, week, error: fetched.error });
          continue;
        }

        const post = await postTrpcHistJson(
          TRPC_SAVE_PLAYER_STATS_URL,
          warRoomCookieHeader,
          { season, week, payload: fetched.data },
          clerkToken,
        );
        const r = post?.parsed?.result?.data?.json ?? post?.parsed?.result?.data ?? {};
        const upserted = Number(r.statsUpserted ?? 0) || 0;
        totalStats += upserted;
        results.push({
          week, ok: post.ok, usedUrl,
          rosterEntries: counts.entries, rosterSides: counts.sides,
          statsUpserted: upserted, players: r.playersUpserted ?? null,
          postStatus: post.status ?? null, error: post.error || null,
        });
        console.info("[GMWR] weeklyStats week done", { season, week, usedUrl, rosterEntries: counts.entries, upserted, ok: post.ok });
      }

      onceRespondWS({ ok: true, season, totalStats, weeks: results });
    })().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[GMWR] weeklyStats capture failed", { error: msg });
      onceRespondWS({ ok: false, error: msg });
    });
    return true;
  }

  if (t === MSG_IS_ADMIN) {
    (async () => {
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      const r = await fetchIsAdmin(warRoomCookieHeader);
      sendResponse(r);
    })().catch((err) => {
      sendResponse({ ok: false, isAdmin: false, error: err instanceof Error ? err.message : String(err) });
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
      const result = await discoverLeaguesWithEspnCookie(espnCookieHeader, swid);
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
            "GM War Room session not found. Sign in at fantasyfootballrivals.com in this browser, then try again.",
        });
        return;
      }

      const nameById = new Map(
        (Array.isArray(message?.leagues) ? message.leagues : [])
          .map((L) => [String(L && L.id != null ? L.id : "").trim(), String((L && L.name) || "").trim()]),
      );
      for (const leagueId of leagueIds) {
        const result = await postSaveCredentials({
          swid,
          espnS2,
          leagueId,
          leagueName: nameById.get(String(leagueId).trim()) || "",
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

      await openOrFocusPostConnectTab();
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

  if (t === MSG_ROSTER_MATRIX_TEST) {
    (async () => {
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        sendResponse({ ok: false, error: "ESPN login expired", rows: [] });
        return;
      }
      const rows = [];
      const leagueId = ROSTER_MATRIX_DEBUG_LEAGUE_ID;
      for (const season of ROSTER_MATRIX_DEBUG_SEASONS) {
        const urlSeasons = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mRoster`;
        const rA = await fetchEspnJsonWithBackoff(urlSeasons, { label: `roster_matrix_seasons_${season}` });
        rows.push(buildRosterMatrixRow(season, "seasons_lm_api_reads", rA));
        await sleep(400);
        const urlHistory = `https://fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&view=mRoster`;
        const rB = await fetchEspnJsonWithBackoff(urlHistory, { label: `roster_matrix_leagueHistory_${season}` });
        rows.push(buildRosterMatrixRow(season, "leagueHistory_fantasy_espn", rB));
        await sleep(400);
      }
      console.info("[GMWR] roster matrix debug done", { rowCount: rows.length });
      sendResponse({ ok: true, rows });
    })().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[GMWR] roster matrix debug failed", { error: msg });
      sendResponse({ ok: false, error: msg, rows: [] });
    });
    return true;
  }

  if (t === MSG_ROSTER_2017_POC) {
    let responded = false;
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
    function onceRosterPoc(response) {
      if (responded) return;
      responded = true;
      clearInterval(keepAlive);
      clearTimeout(rosterPocTimer);
      sendResponse(response);
    }
    const rosterPocTimer = setTimeout(
      () =>
        onceRosterPoc(
          buildRoster2017PocResponsePayload({
            ok: false,
            error: "extension_internal_timeout",
            leagueId: "",
            season: 2017,
            teams: [],
          }),
        ),
      110000,
    );

    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const SEASON = 2017;
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRosterPoc(
          buildRoster2017PocResponsePayload({
            ok: false,
            error: "ESPN login expired",
            leagueId,
            season: SEASON,
            teams: [],
          }),
        );
        return;
      }
      const snapshot = await scrapeLeagueRostersPage(leagueId, SEASON);
      onceRosterPoc(buildRoster2017PocResponsePayload(snapshot));
    })().catch((err) => {
      const lid = String(message?.leagueId || "457622").trim();
      onceRosterPoc(
        buildRoster2017PocResponsePayload({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          leagueId: lid,
          season: 2017,
          teams: [],
        }),
      );
    });
    return true;
  }

  if (t === MSG_HIST_TEST) {
    let responded = false;
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
    function onceRespond(response) {
      if (responded) return;
      responded = true;
      clearInterval(keepAlive);
      clearTimeout(testTimer);
      sendResponse(response);
    }
    const testTimer = setTimeout(
      () => onceRespond({ ok: false, error: "extension_internal_timeout" }),
      60000,
    );

    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const season   = Number(message?.season)   || 2026;

      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        onceRespond({ ok: false, error: "Sign in at fantasyfootballrivals.com first." });
        return;
      }

      // Fetch the full ESPN player universe using kona_player_info + x-fantasy-filter.
      // Returns ~1000 scorable players (QB/RB/WR/TE/K/DST) sorted by ownership.
      const filter = JSON.stringify({
        players: {
          limit: 700,
          offset: 0,
          sortPercOwned: { sortAsc: false, sortPriority: 1 },
          filterSlotIds: { value: [0, 2, 4, 6, 8, 9, 10, 11, 16, 17, 23] },
        },
      });

      const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info`;

      // Use DNR to inject ESPN cookies, then fetch with the fantasy filter header
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRespond({ ok: false, error: "ESPN login expired." });
        return;
      }

      await applyEspnHistoricalFetchDnr(buildEspnCookieHeader(swid, espnS2));
      let espnData = null;
      try {
        const r = await fetch(url, {
          credentials: "include",
          headers: {
            Accept: "application/json",
            "x-fantasy-filter": filter,
            "X-Fantasy-Source": "kona",
            "X-Fantasy-Platform": "kona",
          },
        });
        if (r.ok) espnData = await r.json();
        else { onceRespond({ ok: false, error: `ESPN HTTP ${r.status}` }); return; }
      } finally {
        await removeEspnHistoricalFetchDnr();
      }

      const rawPlayers = espnData?.players || [];
      const POSITIONS = { 1:"QB", 2:"RB", 3:"WR", 4:"TE", 5:"K", 9:"DL", 10:"DL", 11:"LB", 12:"DB", 13:"DB", 16:"DEF" };
      const PRO_TEAMS = { 1:"ATL",2:"BUF",3:"CHI",4:"CIN",5:"CLE",6:"DAL",7:"DEN",8:"DET",9:"GB",10:"TEN",11:"IND",12:"KC",13:"LV",14:"LAR",15:"MIA",16:"MIN",17:"NE",18:"NO",19:"NYG",20:"NYJ",21:"PHI",22:"ARI",23:"PIT",24:"LAC",25:"SF",26:"SEA",27:"TB",28:"WSH",29:"CAR",30:"JAX",33:"BAL",34:"HOU" };

      const players = rawPlayers
        .map(entry => {
          const p = entry.player || {};
          const pos = POSITIONS[p.defaultPositionId];
          if (!pos || !p.id || !p.fullName) return null;
          return {
            espnId:   Number(p.id),
            fullName: String(p.fullName),
            position: pos,
            nflTeam:  PRO_TEAMS[p.proTeamId] || null,
          };
        })
        .filter(Boolean);

      if (players.length === 0) {
        onceRespond({ ok: false, error: "No players extracted from ESPN response." });
        return;
      }

      // POST in batches of 450 — stays under server Zod limit regardless of deploy version
      const BATCH_SIZE = 450;
      let totalInserted = 0, totalUpdated = 0;
      for (let offset = 0; offset < players.length; offset += BATCH_SIZE) {
        const batch = players.slice(offset, offset + BATCH_SIZE);
        await sleep(300);
        const post = await postTrpcHistJson(TRPC_SAVE_ROSTER_URL, warRoomCookieHeader, { season, players: batch }, null);
        if (!post.ok) {
          onceRespond({ ok: false, error: post.error || "server_post_failed", fetched: players.length, batchAt: offset });
          return;
        }
        const res = post.parsed?.[0]?.result?.data?.json ?? post.parsed?.result?.data?.json ?? {};
        totalInserted += res.inserted ?? 0;
        totalUpdated  += res.updated  ?? 0;
      }
      onceRespond({ ok: true, fetched: players.length, inserted: totalInserted, updated: totalUpdated, season });
    })().catch((err) => {
      onceRespond({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }

  if (t === MSG_SYNC_TRENDS) {
    let responded = false;
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
    function onceTrends(response) {
      if (responded) return;
      responded = true;
      clearInterval(keepAlive);
      clearTimeout(trendTimer);
      sendResponse(response);
    }
    const trendTimer = setTimeout(
      () => onceTrends({ ok: false, error: "extension_internal_timeout" }),
      60000,
    );

    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const season   = Number(message?.season)   || 2026;

      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        onceTrends({ ok: false, error: "Sign in at fantasyfootballrivals.com first." });
        return;
      }

      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceTrends({ ok: false, error: "ESPN login expired. Open ESPN Fantasy in this browser and sign in, then retry." });
        return;
      }

      // Same kona_player_info universe the populate action uses — but this time
      // we KEEP the live draft-trend fields ESPN returns under player.ownership.
      const filter = JSON.stringify({
        players: {
          limit: 700,
          offset: 0,
          sortPercOwned: { sortAsc: false, sortPriority: 1 },
          filterSlotIds: { value: [0, 2, 4, 6, 8, 9, 10, 11, 16, 17, 23] },
        },
      });
      const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info`;

      await applyEspnHistoricalFetchDnr(buildEspnCookieHeader(swid, espnS2));
      let espnData = null;
      try {
        const r = await fetch(url, {
          credentials: "include",
          headers: {
            Accept: "application/json",
            "x-fantasy-filter": filter,
            "X-Fantasy-Source": "kona",
            "X-Fantasy-Platform": "kona",
          },
        });
        if (r.ok) espnData = await r.json();
        else { onceTrends({ ok: false, error: `ESPN HTTP ${r.status}` }); return; }
      } finally {
        await removeEspnHistoricalFetchDnr();
      }

      const rawPlayers = espnData?.players || [];
      const POSITIONS = { 1:"QB", 2:"RB", 3:"WR", 4:"TE", 5:"K", 9:"DL", 10:"DL", 11:"LB", 12:"DB", 13:"DB", 16:"DEF" };
      const PRO_TEAMS = { 1:"ATL",2:"BUF",3:"CHI",4:"CIN",5:"CLE",6:"DAL",7:"DEN",8:"DET",9:"GB",10:"TEN",11:"IND",12:"KC",13:"LV",14:"LAR",15:"MIA",16:"MIN",17:"NE",18:"NO",19:"NYG",20:"NYJ",21:"PHI",22:"ARI",23:"PIT",24:"LAC",25:"SF",26:"SEA",27:"TB",28:"WSH",29:"CAR",30:"JAX",33:"BAL",34:"HOU" };
      const num = (v) => (typeof v === "number" && Number.isFinite(v)) ? v : null;

      let fetched = rawPlayers.length;
      let withAdp = 0;
      let skippedNoAdp = 0;

      const players = rawPlayers
        .map(entry => {
          const p = entry.player || {};
          const pos = POSITIONS[p.defaultPositionId];
          if (!pos || !p.id || !p.fullName) return null;
          const own = p.ownership || {};
          const adpRaw = num(own.averageDraftPosition);
          const adp = (adpRaw != null && adpRaw > 0) ? adpRaw : null;
          const ranks = p.draftRanksByRankType || {};
          const rankObj = ranks.PPR || ranks.STANDARD || null;
          const espnRank = rankObj ? num(rankObj.rank) : null;
          if (adp != null) withAdp++; else skippedNoAdp++;
          return {
            espnId:   Number(p.id),
            fullName: String(p.fullName),
            position: pos,
            nflTeam:  PRO_TEAMS[p.proTeamId] || null,
            adp,
            percentOwned: num(own.percentOwned),
            auctionValue: num(own.auctionValueAverage),
            adpChange:    num(own.averageDraftPositionPercentChange),
            espnRank,
          };
        })
        .filter(Boolean);

      if (players.length === 0) {
        onceTrends({ ok: false, error: "No players extracted from ESPN response.", fetched });
        return;
      }

      const BATCH_SIZE = 450;
      let totalInserted = 0, totalUpdated = 0, errors = 0;
      const errorSamples = [];
      for (let offset = 0; offset < players.length; offset += BATCH_SIZE) {
        const batch = players.slice(offset, offset + BATCH_SIZE);
        await sleep(300);
        const post = await postTrpcHistJson(TRPC_SAVE_ROSTER_URL, warRoomCookieHeader, { season, players: batch }, null);
        if (!post.ok) {
          errors += batch.length;
          if (errorSamples.length < 3) errorSamples.push(post.error || "server_post_failed");
          continue;
        }
        const res = post.parsed?.[0]?.result?.data?.json ?? post.parsed?.result?.data?.json ?? {};
        totalInserted += res.inserted ?? 0;
        totalUpdated  += res.updated  ?? 0;
      }

      onceTrends({
        ok: true,
        season,
        fetched,
        withAdp,
        skippedNoAdp,
        inserted: totalInserted,
        updated: totalUpdated,
        errors,
        errorSamples,
      });
    })().catch((err) => {
      onceTrends({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }

  if (t === MSG_HIST_FULL) {
    (async () => {
      const { swid, espnS2, hasSwid, hasEspnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        sendResponse({
          ok: false,
          error: "ESPN login expired",
          results: [],
          details: "missing_cookies",
          hasSwid,
          hasEspnS2,
        });
        return;
      }
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({ ok: false, error: "GM War Room session not found.", results: [] });
        return;
      }
      const leagueId = String(message?.leagueId || "457622").trim();
      const clerkToken = typeof message?.clerkToken === "string" ? message.clerkToken : "";
      const espnCreds = { swid, espnS2 };
      const results = [];
      let _diagStage = "init";
      let _diagUrl   = "";
      // MV3 keepalive: prevent service worker termination during long import
      const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

      // 2009–2017: ESPN API has no draft data for these seasons — scrape Draft Recap HTML directly.
      // Uses ingestLegacyDraftRecap so rows land with source='legacy_draft_recap',
      // which is the only value legacyDraftPicks (DraftHistory) will return.
      // Seasons the league did not exist for return no DOM and are skipped gracefully.
      const LEGACY_SCRAPE_MIN = 2009;
      const LEGACY_SCRAPE_MAX = 2017;
      for (let season = LEGACY_SCRAPE_MIN; season <= LEGACY_SCRAPE_MAX; season++) {
        await sleep(800);
        console.info("[GMWR] legacy draft scrape", { leagueId, season });
        _diagStage = `scrape:s${season}`; _diagUrl = "";
        const scrapeResult = await scrapeDraftRecapPage(leagueId, season);
        if (!scrapeResult?.ok || !Array.isArray(scrapeResult.picks) || scrapeResult.picks.length === 0) {
          const row = {
            season,
            ok: false,
            mode: "dom_scrape_failed",
            error: scrapeResult?.error || "no_picks_from_dom",
            pickCount: 0,
          };
          results.push(row);
          console.warn("[GMWR] legacy draft scrape failed", row);
          continue;
        }
        const { picks: parsedPicks, parseErrors } = parseDraftRecapDomResult(scrapeResult, leagueId, season);
        if (parsedPicks.length === 0) {
          const row = { season, ok: false, mode: "dom_parse_empty", error: "no_picks_after_parse", parseErrors };
          results.push(row);
          console.warn("[GMWR] legacy draft parse empty", row);
          continue;
        }
        const picksPayload = picksPayloadForIngestParsedDraft(parsedPicks);
        // postIngestLegacyDraftRecap writes source='legacy_draft_recap' — visible to DraftHistory
        _diagStage = `legacy_ingest:s${season}`; _diagUrl = TRPC_LEGACY_DRAFT_INGEST_URL;
        const ingest = await postIngestLegacyDraftRecap(season, picksPayload, warRoomCookieHeader, clerkToken);
        const row = {
          season,
          ok: ingest.ok,
          mode: "dom_scrape_legacy_ingest",
          pickCount: picksPayload.length,
          upserted: ingest.result?.upserted ?? 0,
          parseErrors,
          error: ingest.error || null,
          ingest: { ok: ingest.ok, status: ingest.status },
        };
        results.push(row);
        console.info("[GMWR] legacy draft ingest", row);
      }

      // 2018+: ESPN mDraftDetail API has draft data — use the existing API import path.
      const API_MIN = LEGACY_SCRAPE_MAX + 1; // 2018
      const currentYear = new Date().getFullYear();
      for (let season = API_MIN; season <= currentYear; season++) {
        await sleep(500);
        _diagStage = `api_draft_import:s${season}`; _diagUrl = TRPC_IMPORT_DRAFT_API_URL;
        const imp = await postImportDraftFromEspnApi(leagueId, season, espnCreds, warRoomCookieHeader, clerkToken);
        const r = imp.result;
        const row = {
          season,
          ok: Boolean(imp.ok && r && (r.success === true || r.status === "imported")),
          mode: "espn_mDraftDetail_import",
          hasSwid,
          hasEspnS2,
          sourceUsed: r?.sourceUsed ?? "espn_mDraftDetail",
          deletedRows: r?.deletedRows ?? r?.deleted ?? 0,
          insertedRows: r?.insertedRows ?? r?.inserted ?? 0,
          teamCount: r?.teamCount ?? 0,
          uniquePicks: r?.uniquePicks ?? 0,
          skippedDuplicates: r?.skippedDuplicates ?? 0,
          error: r?.error ?? imp.error ?? null,
          ingest: imp.ok ? { ok: true, result: r, status: imp.status } : imp,
        };
        results.push(row);
        console.info("[GMWR] mDraftDetail import season", row);

      }

      const allOk = results.length > 0 && results.every((x) => x.ok);
      clearInterval(keepAlive);
      sendResponse({ ok: allOk, results, aborted: false, leagueId });
    })().catch((err) => {
      clearInterval(keepAlive);
      sendResponse({ ok: false, error: `DIAG:stage=${_diagStage} url=${_diagUrl} | ${err instanceof Error ? err.message : String(err)}`, results: [] });
    });
    return true;
  }

  if (t === MSG_HIST_STANDINGS) {
    let responded = false;
    function onceRespondStandings(response) {
      if (responded) return;
      responded = true;
      clearTimeout(standingsTimer);
      sendResponse(response);
    }
    const standingsTimer = setTimeout(
      () => onceRespondStandings({ ok: false, error: "extension_internal_timeout" }),
      110000,
    );
    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const season = Number(message?.season) || 2010;
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRespondStandings({ ok: false, error: "ESPN login expired", details: "missing_cookies" });
        return;
      }
      const scrapeResult = await scrapeStandingsPage(leagueId, season);
      console.info("[GMWR] standings scrape", { leagueId, season }, scrapeResult);
      if (!scrapeResult?.ok) {
        onceRespondStandings({
          ok: false,
          error: scrapeResult?.error || "scrape_failed",
          message: scrapeResult?.message,
          mode: "standings_scrape_failed",
        });
        return;
      }
      const { rows, parseErrors } = parseStandingsRows(scrapeResult);
      console.info("[GMWR] standings parse", { season, rowCount: rows.length, parseErrors });
      if (rows.length === 0) {
        onceRespondStandings({
          ok: false,
          error: "standings_parse_empty",
          mode: "standings_parse_empty",
          parseErrors,
          bodyLength: scrapeResult.bodyLength,
        });
        return;
      }
      onceRespondStandings({
        ok: true,
        mode: "standings_scraped_parsed",
        leagueId,
        season,
        rowCount: rows.length,
        rows,
        parseErrors,
      });
    })().catch((err) => {
      onceRespondStandings({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }

  if (t === MSG_HIST_MATCHUPS) {
    let mResponded = false;
    function onceRespondMatchups(response) {
      if (mResponded) return;
      mResponded = true;
      clearTimeout(matchupsTimer);
      sendResponse(response);
    }
    const matchupsTimer = setTimeout(
      () => onceRespondMatchups({ ok: false, error: "extension_internal_timeout" }),
      110000,
    );
    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const season = Number(message?.season) || 2010;
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRespondMatchups({ ok: false, error: "ESPN login expired", details: "missing_cookies" });
        return;
      }
      const scrapeResult = await scrapeSchedulePage(leagueId, season);
      console.info("[GMWR] schedule scrape", { leagueId, season }, { bodyLength: scrapeResult?.bodyLength, ok: scrapeResult?.ok });
      if (!scrapeResult?.ok) {
        onceRespondMatchups({ ok: false, error: scrapeResult?.error || "scrape_failed", message: scrapeResult?.message, mode: "schedule_scrape_failed" });
        return;
      }
      const { rows, parseErrors } = parseMatchupRows(scrapeResult);
      console.info("[GMWR] matchup parse", { season, rowCount: rows.length, parseErrors });
      if (rows.length === 0) {
        onceRespondMatchups({ ok: false, error: "matchup_parse_empty", mode: "matchup_parse_empty", parseErrors, bodyLength: scrapeResult.bodyLength });
        return;
      }
      onceRespondMatchups({ ok: true, mode: "schedule_scraped_parsed", leagueId, season, rowCount: rows.length, rows, parseErrors });
    })().catch((err) => {
      onceRespondMatchups({ ok: false, error: err instanceof Error ? err.message : String(err) });
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

  if (t === MSG_LEAGUE_HISTORY_MEDALS) {
    let lhmResponded = false;
    function onceRespondLhm(response) {
      if (lhmResponded) return;
      lhmResponded = true;
      clearTimeout(lhmTimer);
      sendResponse(response);
    }
    const lhmTimer = setTimeout(
      () => onceRespondLhm({ ok: false, error: "extension_internal_timeout" }),
      110000,
    );
    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRespondLhm({ ok: false, error: "ESPN login expired", details: "missing_cookies" });
        return;
      }
      const scrapeResult = await scrapeLeagueHistoryPage(leagueId);
      console.info("[GMWR] leagueHistory scrape", { leagueId }, {
        bodyLength: scrapeResult?.bodyLength,
        ok: scrapeResult?.ok,
        cardCount: Array.isArray(scrapeResult?.cards) ? scrapeResult.cards.length : 0,
      });
      if (!scrapeResult?.ok) {
        onceRespondLhm({
          ok: false,
          error: scrapeResult?.error || "scrape_failed",
          message: scrapeResult?.message,
          mode: "league_history_scrape_failed",
        });
        return;
      }
      const { medals, debug } = parseLeagueHistoryMedals(scrapeResult);
      console.info("[GMWR] leagueHistory medals parsed", { count: medals.length, first: medals[0], last: medals[medals.length - 1] });
      onceRespondLhm({
        ok: true,
        mode: "league_history_scraped_parsed",
        leagueId,
        medalCount: medals.length,
        medals,
        debug,
        bodyLength: scrapeResult.bodyLength,
        cardCount: Array.isArray(scrapeResult.cards) ? scrapeResult.cards.length : 0,
      });
    })().catch((err) => {
      onceRespondLhm({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }

  // ─── Historical Roster Capture: scrape ESPN League Rosters page for 2010–2025 ───
  if (t === MSG_ROSTER_FULL) {
    let responded = false;
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
    function onceRespondRoster(response) {
      if (responded) return;
      responded = true;
      clearInterval(keepAlive);
      clearTimeout(rosterFullTimer);
      sendResponse(response);
    }
    // 16 seasons × ~40s each = ~640s. Hard cap at 720s.
    const rosterFullTimer = setTimeout(
      () => onceRespondRoster({ ok: false, error: "extension_internal_timeout" }),
      720000,
    );

    (async () => {
      const leagueId = String(message?.leagueId || "457622").trim();
      const clerkToken = typeof message?.clerkToken === "string" ? message.clerkToken : "";
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRespondRoster({ ok: false, error: "ESPN login expired", details: "missing_espn_cookies" });
        return;
      }

      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      const SEASONS = [2018,2019,2020,2021,2022,2023,2024,2025];
      const results = [];

      for (const season of SEASONS) {
        await sleep(800);
        console.info("[GMWR] roster full: scraping", { leagueId, season });

        const scrape = await scrapeSeasonRosterPage(leagueId, season);
        if (!scrape?.ok || !Array.isArray(scrape.players) || scrape.players.length === 0) {
          const row = {
            season,
            ok: false,
            mode: "scrape_failed",
            error: scrape?.error || "no_players",
            teamCount: 0,
            playerCount: 0,
          };
          results.push(row);
          console.warn("[GMWR] roster full: scrape failed", row);
          continue;
        }

        const ingest = await postIngestSeasonRosters(season, scrape.players, warRoomCookieHeader, clerkToken);
        const row = {
          season,
          ok: ingest.ok,
          mode: "roster_scrape_ingest",
          teamCount: scrape.teamCount,
          playerCount: scrape.playerCount,
          upserted: ingest.result?.upserted ?? 0,
          error: ingest.error || null,
          ingest: { ok: ingest.ok, status: ingest.status },
        };
        results.push(row);
        console.info("[GMWR] roster full: season done", row);
      }

      const allOk = results.length > 0 && results.every(r => r.ok);
      onceRespondRoster({ ok: allOk, results, leagueId });
    })().catch((err) => {
      onceRespondRoster({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }


  // ─── P2: Sync Weekly Player Stats ────────────────────────────────────────

  return false;
});
