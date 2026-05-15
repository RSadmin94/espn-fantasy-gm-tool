/**
 * Background Service Worker — ATLANTAS FINEST DNA Advisor v1.2.0
 *
 * Responsibilities:
 *  - Relay API calls from content scripts (avoids CORS issues)
 *  - Route to provider-specific endpoints (ESPN vs Sleeper vs Yahoo)
 *  - Cache leaguePulse/teamBrief data for 30 minutes
 *  - Store/retrieve user config (backend URL, season, provider overrides)
 */

const DEFAULT_BACKEND = "https://espnfftool-d7edtbt5.manus.space";
const DEFAULT_SEASON  = new Date().getFullYear() - 1; // auto-detect: always the last completed NFL season
const CACHE_TTL_MS    = 30 * 60 * 1000; // 30 minutes

// In-memory cache (cleared on service worker restart)
const cache = new Map();

// ─── tRPC helper ─────────────────────────────────────────────────────────────
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

// ─── Provider routing ─────────────────────────────────────────────────────────
// Maps provider → procedure names for league pulse and team brief.
// ESPN uses the existing weeklyAssessment procedures.
// Sleeper uses the providers.* procedures.
// Yahoo uses the providers.* procedures (requires OAuth tokens stored in the web app).
function getProcedures(provider) {
  switch (provider) {
    case "sleeper":
      return {
        leaguePulse: "providers.getSleeperLeaguePulse",
        teamBrief: "providers.getSleeperTeamBrief",
      };
    case "yahoo":
      // Yahoo uses the same provider router — data is fetched using stored OAuth tokens.
      // The web app backend handles token refresh automatically.
      return {
        leaguePulse: "providers.getYahooLeaguePulse",
        teamBrief: "providers.getYahooTeamBrief",
      };
    case "espn":
    default:
      return {
        leaguePulse: "weeklyAssessment.leaguePulse",
        teamBrief: "weeklyAssessment.teamBrief",
      };
  }
}

// ─── Message handler ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => {
    sendResponse({ error: err.message || String(err) });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  const config = await getConfig();
  const provider = msg.provider || "espn";
  const procedures = getProcedures(provider);

  switch (msg.type) {

    case "GET_CONFIG":
      return { ...config, provider };

    case "OPEN_OPTIONS":
      chrome.runtime.openOptionsPage();
      return { ok: true };

    case "LEAGUE_PULSE": {
      if (!procedures.leaguePulse) {
        return {
          data: null,
          fromCache: false,
          error: `League Pulse is not yet available for ${provider}. Coming soon!`,
        };
      }
      const leagueId = msg.leagueId || config.leagueId;
      const cacheKey = `leaguePulse:${provider}:${leagueId || "default"}:${config.season}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };

      const input = (provider === "sleeper" || provider === "yahoo")
        ? { leagueId, season: config.season }
        : { season: config.season };

      const data = await trpcGet(config.backendUrl, procedures.leaguePulse, input);
      cache.set(cacheKey, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "TEAM_BRIEF": {
      if (!procedures.teamBrief) {
        return {
          data: null,
          fromCache: false,
          error: `Team Brief is not yet available for ${provider}. Coming soon!`,
        };
      }
      const { teamId } = msg;
      const leagueId = msg.leagueId || config.leagueId;
      const cacheKey = `teamBrief:${provider}:${leagueId || "default"}:${config.season}:${teamId}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };

      let input;
      if (provider === "sleeper") {
        input = { leagueId, userId: String(teamId), season: config.season };
      } else if (provider === "yahoo") {
        input = { leagueId, teamKey: String(teamId), season: config.season };
      } else {
        input = { teamId: Number(teamId), season: config.season };
      }

      const data = await trpcGet(config.backendUrl, procedures.teamBrief, input);
      cache.set(cacheKey, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "ROD_OPPORTUNITIES": {
      const cacheKey = `rodOpp:${provider}:${config.season}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { data: hit.data, fromCache: true };
      const data = await trpcGet(config.backendUrl, "weeklyAssessment.rodOpportunities", { season: config.season });
      cache.set(cacheKey, { data, ts: Date.now() });
      return { data, fromCache: false };
    }

    case "CLEAR_CACHE":
      cache.clear();
      return { ok: true };

    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

// ─── Config helpers ───────────────────────────────────────────────────────────
async function getConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get({
      backendUrl: DEFAULT_BACKEND,
      season: DEFAULT_SEASON,
      leagueId: "",       // Sleeper/Yahoo league ID (ESPN uses env var on server)
      defaultProvider: "espn",
    }, resolve);
  });
}

// ─── Toolbar icon click → open web app advisor panel ─────────────────────────
const WEB_APP_URL = "https://espnfftool-d7edtbt5.manus.space";

chrome.action.onClicked.addListener(async () => {
  // Find an existing web app tab
  const tabs = await chrome.tabs.query({ url: `${WEB_APP_URL}/*` });
  if (tabs.length > 0) {
    // Focus the existing tab and send message to open advisor panel
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    chrome.tabs.sendMessage(tab.id, { type: "OPEN_ADVISOR_PANEL" });
  } else {
    // Open a new tab and open advisor panel once loaded
    const tab = await chrome.tabs.create({ url: `${WEB_APP_URL}/command-center?openAdvisor=1` });
    // The web app will detect the ?openAdvisor=1 query param on load
  }
});
