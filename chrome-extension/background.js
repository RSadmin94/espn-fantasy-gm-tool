/**
 * GM War Room extension — background service worker.
 * Reads ESPN cookies + gmwarroom session cookies, discovers 2026 leagues via ESPN profile API,
 * POSTs espn.saveCredentials per selected league. War Room cookies are injected via DNR
 * (fetch cannot set a Cookie header from a SW). ESPN historical JSON is fetched from the
 * service worker with `credentials: "include"` plus session-rule DNR (Cookie + Kona headers).
 * Historical draft recap: scrape the rendered draftrecap page in a background tab (no ESPN draft JSON API).
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

// ─── Historical league import (War Room tRPC; draft recap uses ingestParsedDraftPicks only) ───
const TRPC_PARSED_DRAFT_INGEST_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.ingestParsedDraftPicks`;
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
    removeRuleIds: [DNR_TRPC_HIST_RULE_ID, DNR_TRPC_HIST_RULE_ID + 1, DNR_TRPC_HIST_RULE_ID + 2],
    addRules: [
      {
        id: DNR_TRPC_HIST_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "Cookie", operation: "set", value: warRoomCookieHeader }],
        },
        condition: {
          urlFilter: "https://gmwarroom.online/api/trpc/espn.ingestParsedDraftPicks*",
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
      removeRuleIds: [DNR_TRPC_HIST_RULE_ID, DNR_TRPC_HIST_RULE_ID + 1, DNR_TRPC_HIST_RULE_ID + 2],
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
    await sleep(6000);

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const bodyText = document.body.innerText || "";
        const candidates = [];
        const selectors = [
          "table tr",
          "[role='row']",
          ".Table__TR",
          ".Table__TD",
          ".pick-list li",
          ".draft-recap-pick",
          "[class*='draft']",
          "[class*='pick']",
        ];
        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach((el, i) => {
            const text = (el.innerText || "").trim();
            if (text) {
              candidates.push({
                selector,
                index: i,
                text,
                html: el.innerHTML.slice(0, 1000),
              });
            }
          });
        }
        return {
          ok: true,
          url: location.href,
          title: document.title,
          bodyLength: bodyText.length,
          bodyPreview: bodyText.slice(0, 2000),
          candidates: candidates.slice(0, 1200),
        };
      },
    });
    return results?.[0]?.result || { ok: false, error: "scrape_failed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: "scrape_failed", message: msg };
  } finally {
    if (tabId != null) {
      chrome.tabs.remove(tabId).catch(() => { /* tab may already be closed */ });
    }
  }
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

async function postTrpcHistJson(url, warRoomCookieHeader, jsonInput, authToken) {
  const body = JSON.stringify({ json: jsonInput });
  await applyWarRoomTrpcHistRule(warRoomCookieHeader);
  const extraHeaders = authToken ? { "Authorization": `Bearer ${authToken}` } : {};
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
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
    let responded = false;
    function onceRespond(response) {
      if (responded) return;
      responded = true;
      clearTimeout(internalTimer);
      sendResponse(response);
    }
    const internalTimer = setTimeout(
      () => onceRespond({ ok: false, error: "extension_internal_timeout" }),
      110000,
    );

    (async () => {
      const TEST_LEAGUE = "457622";
      const TEST_SEASON = Number(message?.season) || 2010;
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        onceRespond({ ok: false, error: "ESPN login expired", details: "missing_cookies" });
        return;
      }

      const full = await scrapeDraftRecapPage(TEST_LEAGUE, TEST_SEASON);
      console.info("[GMWR] draft recap scrape full result", { season: TEST_SEASON }, full);
      const candidates = Array.isArray(full?.candidates) ? full.candidates : [];
      const first20CandidateTexts = candidates.slice(0, 20).map((c) => (c && c.text ? String(c.text) : ""));
      const summary = {
        bodyLength: typeof full?.bodyLength === "number" ? full.bodyLength : 0,
        candidatesCount: candidates.length,
        first20CandidateTexts,
      };
      const probeOk = Boolean(full && full.ok !== false && full.error == null);
      if (!probeOk) {
        onceRespond({
          ok: false,
          error: full?.message || full?.error || "scrape_probe_failed",
          mode: "draft_recap_scrape_probe",
          scrape: full,
          summary,
        });
        return;
      }

      const { picks: parsedPicks, parseErrors } = parseDraftRecapCandidatesToPicks(
        candidates,
        TEST_LEAGUE,
        TEST_SEASON,
      );

      // 2010-specific minimum-count validation only applies to the baseline season
      if (TEST_SEASON === 2010) {
        const v = validateDraftRecap2010ParsedPicks(parsedPicks);
        if (!v.ok) {
          console.warn("[GMWR] draft recap parse validation failed", v.reason, {
            parsedCount: parsedPicks.length,
          });
          onceRespond({
            ok: false,
            error: v.reason || "draft_recap_parse_failed",
            mode: "draft_recap_parse_failed",
            scrape: full,
            summary,
            parseErrors,
            parsedCount: parsedPicks.length,
            validationReason: v.reason,
          });
          return;
        }
      }

      if (parsedPicks.length === 0) {
        onceRespond({
          ok: false,
          error: "draft_recap_parse_empty",
          mode: "draft_recap_parse_empty",
          scrape: full,
          summary,
          parseErrors,
          parsedCount: 0,
        });
        return;
      }

      const picksPayload = picksPayloadForIngestParsedDraft(parsedPicks);
      const first5 = parsedPicks.slice(0, 5);
      const last5 = parsedPicks.slice(-5);
      console.info("[GMWR] draft recap HTML parse", {
        season: TEST_SEASON,
        parsedCount: parsedPicks.length,
        pickPayloadCount: picksPayload.length,
        first5,
        last5,
      });

      onceRespond({
        ok: true,
        mode: "draft_recap_scrape_parsed",
        leagueId: TEST_LEAGUE,
        season: TEST_SEASON,
        parsedCount: parsedPicks.length,
        picks: picksPayload,
        summary,
        first5ParsedRows: first5,
        last5ParsedRows: last5,
      });
    })().catch((err) => {
      onceRespond({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  }

  if (t === MSG_HIST_FULL) {
    (async () => {
      const { swid, espnS2 } = await getEspnCookieValues();
      if (!swid || !espnS2) {
        sendResponse({ ok: false, error: "ESPN login expired", results: [], details: "missing_cookies" });
        return;
      }
      const warRoomCookieHeader = await getWarRoomCookieHeaderString();
      if (!warRoomCookieHeader) {
        sendResponse({ ok: false, error: "GM War Room session not found.", results: [] });
        return;
      }
      const leagueId = String(message?.leagueId || "457622").trim();
      const clerkToken = typeof message?.clerkToken === "string" ? message.clerkToken : "";
      const results = [];
      for (let season = 2010; season <= 2025; season++) {
        await sleep(500);
        const full = await scrapeDraftRecapPage(leagueId, season);
        const candidates = Array.isArray(full?.candidates) ? full.candidates : [];
        const summary = {
          season,
          bodyLength: typeof full?.bodyLength === "number" ? full.bodyLength : 0,
          candidatesCount: candidates.length,
        };
        const probeOk = Boolean(full && full.ok !== false && full.error == null);
        if (!probeOk) {
          results.push({
            season,
            ok: false,
            mode: "draft_recap_scrape_probe",
            summary,
            scrape: full,
            parsedCount: 0,
            ingest: null,
          });
          continue;
        }
        const { picks: parsedPicks, parseErrors } = parseDraftRecapCandidatesToPicks(candidates, leagueId, season);
        if (parsedPicks.length === 0) {
          results.push({
            season,
            ok: false,
            mode: "draft_recap_parse_empty",
            summary,
            parseErrors,
            parsedCount: 0,
            ingest: null,
          });
          continue;
        }
        const picksPayload = picksPayloadForIngestParsedDraft(parsedPicks);
        const ingest = await postIngestParsedDraftPicks(leagueId, season, picksPayload, warRoomCookieHeader, clerkToken);
        const r = ingest.result;
        const row = {
          season,
          ok: Boolean(ingest.ok && r && r.success),
          mode: "draft_recap_scrape_ingest",
          summary,
          parsedCount: parsedPicks.length,
          received: r?.received,
          insertedOrUpdated: r?.insertedOrUpdated,
          dbCountAfter: r?.dbCountAfter,
          apiSuccess: r?.success,
          parseErrors,
          ingest: ingest.ok ? { ok: true, result: r, status: ingest.status } : ingest,
        };
        results.push(row);
        console.info("[GMWR] draft recap full import season", row);
      }
      const allOk = results.length > 0 && results.every((x) => x.ok);
      sendResponse({ ok: allOk, results, aborted: false, leagueId });
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
