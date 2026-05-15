/**
 * Background Service Worker — ESPN GM Tool v2.0.0
 *
 * Responsibilities:
 *  1. Connector flow: capture ESPN page context + cookies for popup.js
 *  2. DNA badge relay: serve TEAM_BRIEF and LEAGUE_PULSE requests from inject.js
 *  3. Cache responses per leagueId+season for 30 minutes
 *  4. Toolbar icon click → popup.html (set as default_popup in manifest)
 */

"use strict";

const DEFAULT_BACKEND = "https://espnfftool-d7edtbt5.manus.space";
const DEFAULT_SEASON  = new Date().getFullYear();
const CACHE_TTL_MS    = 30 * 60 * 1000; // 30 minutes

// In-memory cache (cleared on service worker restart)
const cache = new Map();

// ─── Config ───────────────────────────────────────────────────────────────────
async function getConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get({
      backendUrl: DEFAULT_BACKEND,
      season: DEFAULT_SEASON,
      leagueId: "",
      defaultProvider: "espn",
    }, resolve);
  });
}

// ─── tRPC GET helper ──────────────────────────────────────────────────────────
async function trpcGet(backendUrl, procedure, input) {
  const url = new URL(`${backendUrl}/api/trpc/${procedure}`);
  url.searchParams.set("input", JSON.stringify({ json: input }));
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`tRPC ${procedure} → HTTP ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) {
    const item = body[0];
    if (item?.error) throw new Error(item.error.message || "tRPC error");
    return item?.result?.data?.json ?? item?.result?.data;
  }
  if (body?.result?.data?.json !== undefined) return body.result.data.json;
  if (body?.result?.data !== undefined) return body.result.data;
  throw new Error("Unexpected tRPC response shape");
}

// ─── ESPN cookie helper ───────────────────────────────────────────────────────
async function fetchEspnCookies() {
  const [a, b] = await Promise.all([
    chrome.cookies.get({ url: "https://fantasy.espn.com", name: "SWID" }),
    chrome.cookies.get({ url: "https://fantasy.espn.com", name: "espn_s2" }),
  ]);
  const [c, d] = await Promise.all([
    a ? Promise.resolve(null) : chrome.cookies.get({ url: "https://www.espn.com", name: "SWID" }),
    b ? Promise.resolve(null) : chrome.cookies.get({ url: "https://www.espn.com", name: "espn_s2" }),
  ]);
  return { swid: (a || c)?.value || null, espnS2: (b || d)?.value || null };
}

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ESPN_CONTEXT_DETECTED") {
    chrome.storage.local.set({ espnPageContext: message.payload });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "GET_ESPN_COOKIES") {
    fetchEspnCookies()
      .then(cookies => sendResponse({ ok: true, cookies }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // All other messages (DNA badge relay from inject.js)
  handleDnaMessage(message)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message || String(err) }));
  return true;
});

async function handleDnaMessage(msg) {
  const config = await getConfig();
  const leagueId = msg.leagueId || config.leagueId || "";
  const season   = msg.season   || config.season;

  switch (msg.type) {
    case "GET_CONFIG":
      return { ...config };

    case "LEAGUE_PULSE": {
      const key = `lp:${season}:${leagueId}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };
      const data = await trpcGet(config.backendUrl, "weeklyAssessment.leaguePulse", {
        season,
        ...(leagueId ? { leagueId } : {}),
      });
      cache.set(key, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "TEAM_BRIEF": {
      const key = `tb:${season}:${leagueId}:${msg.teamId}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };
      const data = await trpcGet(config.backendUrl, "weeklyAssessment.teamBrief", {
        teamId: Number(msg.teamId),
        season,
        ...(leagueId ? { leagueId } : {}),
      });
      cache.set(key, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "ROD_OPPORTUNITIES": {
      const key = `rod:${season}:${leagueId}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };
      const data = await trpcGet(config.backendUrl, "weeklyAssessment.rodOpportunities", {
        season,
        ...(leagueId ? { leagueId } : {}),
      });
      cache.set(key, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "CLEAR_CACHE":
      cache.clear();
      return { ok: true };

    default:
      return { ok: true };
  }
}
