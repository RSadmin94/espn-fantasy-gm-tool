/**
 * Background Service Worker — ESPN GM Tool v1.5.0
 *
 * Responsibilities:
 *  1. Connector flow: capture ESPN page context + cookies for popup.js
 *  2. DNA badge relay: serve TEAM_BRIEF and LEAGUE_PULSE requests from inject.js
 *     (avoids CORS issues by relaying from the service worker)
 *  3. Cache leaguePulse/teamBrief data for 30 minutes
 *  4. Toolbar icon click → open/focus the GM Tool web app
 */

const DEFAULT_BACKEND = "https://espnfftool-d7edtbt5.manus.space";
const DEFAULT_SEASON  = new Date().getFullYear() - 1; // last completed NFL season
const CACHE_TTL_MS    = 30 * 60 * 1000; // 30 minutes

// In-memory cache (cleared on service worker restart)
const cache = new Map();

// ─── tRPC GET helper ──────────────────────────────────────────────────────────
async function trpcGet(backendUrl, procedure, input = {}) {
  const url = new URL(`${backendUrl}/api/trpc/${procedure}`);
  url.searchParams.set("input", JSON.stringify({ json: input }));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
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

// ─── Config helper ────────────────────────────────────────────────────────────
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

// ─── ESPN cookie helper ───────────────────────────────────────────────────────
async function fetchEspnCookies() {
  const [swidCookie, espnS2Cookie] = await Promise.all([
    chrome.cookies.get({ url: "https://fantasy.espn.com", name: "SWID" }),
    chrome.cookies.get({ url: "https://fantasy.espn.com", name: "espn_s2" }),
  ]);

  const [swidFallback, espnS2Fallback] = await Promise.all([
    swidCookie ? Promise.resolve(null) : chrome.cookies.get({ url: "https://www.espn.com", name: "SWID" }),
    espnS2Cookie ? Promise.resolve(null) : chrome.cookies.get({ url: "https://www.espn.com", name: "espn_s2" }),
  ]);

  const swid = (swidCookie || swidFallback)?.value || null;
  const espnS2 = (espnS2Cookie || espnS2Fallback)?.value || null;

  return { swid, espnS2 };
}

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // ── Connector flow messages (from content.js and popup.js) ──────────────────
  if (message.type === "ESPN_CONTEXT_DETECTED") {
    chrome.storage.local.set({ espnPageContext: message.payload });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "GET_ESPN_COOKIES") {
    fetchEspnCookies().then(cookies => {
      sendResponse({ ok: true, cookies });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true; // keep channel open for async response
  }

  // ── DNA badge messages (from inject.js) ─────────────────────────────────────
  handleDnaMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message || String(err) });
  });
  return true; // keep channel open for async response
});

async function handleDnaMessage(msg) {
  const config = await getConfig();

  switch (msg.type) {

    case "GET_CONFIG":
      return { ...config, provider: msg.provider || "espn" };

    case "OPEN_OPTIONS":
      chrome.runtime.openOptionsPage?.();
      return { ok: true };

    case "LEAGUE_PULSE": {
      const cacheKey = `leaguePulse:espn:${config.leagueId}:${config.season}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };
      const data = await trpcGet(config.backendUrl, "weeklyAssessment.leaguePulse", {
        season: config.season,
        leagueId: config.leagueId || undefined,
      });
      cache.set(cacheKey, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "TEAM_BRIEF": {
      const { teamId } = msg;
      const cacheKey = `teamBrief:espn:${config.leagueId}:${config.season}:${teamId}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };
      const data = await trpcGet(config.backendUrl, "weeklyAssessment.teamBrief", {
        teamId: Number(teamId),
        season: config.season,
        leagueId: config.leagueId || undefined,
      });
      cache.set(cacheKey, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "ROD_OPPORTUNITIES": {
      const cacheKey = `rodOpp:espn:${config.leagueId}:${config.season}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };
      const data = await trpcGet(config.backendUrl, "weeklyAssessment.rodOpportunities", {
        season: config.season,
        leagueId: config.leagueId || undefined,
      });
      cache.set(cacheKey, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "CLEAR_CACHE":
      cache.clear();
      return { ok: true };

    default:
      // Unknown message — return ok silently (don't throw, other listeners may handle it)
      return { ok: true };
  }
}

// ─── Toolbar icon click → open the DNA slide-out panel on the current ESPN tab ──
// If the active tab is on fantasy.espn.com, send OPEN_PANEL to inject.js.
// If not on ESPN, open fantasy.espn.com so the user can use the DNA badges there.
// We NEVER navigate to the GM Tool website from this handler.

chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) return;

  const isEspnTab = tab.url?.includes("fantasy.espn.com");

  if (!isEspnTab) {
    const espnTabs = await chrome.tabs.query({
      url: "https://fantasy.espn.com/*",
    });

    if (espnTabs[0]?.id) {
      await chrome.tabs.update(espnTabs[0].id, { active: true });
      await chrome.windows.update(espnTabs[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({
        url: "https://fantasy.espn.com/football/",
      });
    }

    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
    return;
  } catch {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof window.__AF_OPEN_PANEL__ === "function") {
          window.__AF_OPEN_PANEL__();
          return;
        }

        const fab = document.getElementById("af-league-pulse-fab");
        if (fab) {
          fab.click();
          return;
        }

        window.__afOpenPanelOnReady = true;
      },
    });
  } catch (err) {
    console.warn("[AF Extension] Could not open panel", err);
  }
});
