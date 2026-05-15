/**
 * popup.js — drives all state transitions for the extension popup.
 *
 * States:
 *   loading → (detect ESPN tab + cookies + league)
 *   not-on-espn → user isn't on fantasy.espn.com
 *   no-cookies  → on ESPN but not logged in
 *   no-league   → logged in but no leagueId in URL
 *   ready       → all data captured, waiting for user click
 *   connecting  → sending to backend
 *   success     → league connected
 *   error       → something went wrong
 *   not-logged-in → user not signed in to the GM Tool
 */

// ─── GM Tool app URL (auto-detects dev vs prod) ───────────────────────────────
const GM_TOOL_ORIGINS = [
  "https://espnfftool-d7edtbt5.manus.space",
  "http://localhost:3000",
];

// ─── State management ─────────────────────────────────────────────────────────

let currentState = "loading";
let capturedData = { leagueId: null, teamId: null, swid: null, espnS2: null };
let gmToolOrigin = null;

function showState(name) {
  currentState = name;
  document.querySelectorAll(".state").forEach(el => el.classList.remove("active"));
  const el = document.getElementById(`state-${name}`);
  if (el) el.classList.add("active");
}

// ─── Main init ────────────────────────────────────────────────────────────────

async function init() {
  showState("loading");

  try {
    // 1. Detect which GM Tool origin is reachable (check storage first)
    gmToolOrigin = await detectGmToolOrigin();

    // 2. Get ESPN cookies from background worker
    const cookieResult = await getCookiesFromBackground();
    capturedData.swid = cookieResult.swid;
    capturedData.espnS2 = cookieResult.espnS2;

    const hasCookies = !!(capturedData.swid && capturedData.espnS2);

    // 3. Get current ESPN tab context
    const pageContext = await getEspnPageContext();

    if (pageContext) {
      capturedData.leagueId = pageContext.leagueId;
      capturedData.teamId = pageContext.teamId;
    }

    // 4. Determine state
    if (!hasCookies) {
      // Check if we're even on ESPN
      const espnTab = await getActiveEspnTab();
      if (!espnTab) {
        showState("not-on-espn");
      } else {
        showState("no-cookies");
      }
      return;
    }

    if (!capturedData.leagueId) {
      // Show no-league state but allow manual entry
      showState("no-league");
      return;
    }

    // All good — show ready state
    document.getElementById("ready-league-id").textContent = capturedData.leagueId;
    document.getElementById("ready-team-id").textContent = capturedData.teamId || "Auto-detect";
    document.getElementById("btn-connect").disabled = false;
    showState("ready");

  } catch (err) {
    showError(err.message || "Failed to detect ESPN session");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function detectGmToolOrigin() {
  // Try to find an active GM Tool tab first
  for (const origin of GM_TOOL_ORIGINS) {
    try {
      const tabs = await chrome.tabs.query({ url: `${origin}/*` });
      if (tabs.length > 0) return origin;
    } catch (_) { /* ignore */ }
  }
  // Default to production
  return GM_TOOL_ORIGINS[0];
}

async function getCookiesFromBackground() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_ESPN_COOKIES" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.ok) {
        resolve(response.cookies);
      } else {
        reject(new Error(response?.error || "Cookie fetch failed"));
      }
    });
  });
}

async function getEspnPageContext() {
  // First check storage (set by content script)
  const stored = await chrome.storage.local.get("espnPageContext");
  if (stored.espnPageContext && stored.espnPageContext.leagueId) {
    // Only use if fresh (within 10 minutes)
    const age = Date.now() - (stored.espnPageContext.timestamp || 0);
    if (age < 10 * 60 * 1000) return stored.espnPageContext;
  }

  // Try to inject content script into active ESPN tab
  const espnTab = await getActiveEspnTab();
  if (!espnTab) return null;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: espnTab.id },
      files: ["src/content.js"],
    });
    // Wait a tick for the script to run
    await new Promise(r => setTimeout(r, 300));
    const fresh = await chrome.storage.local.get("espnPageContext");
    return fresh.espnPageContext || null;
  } catch (_) {
    // scripting permission not available — fall back to URL parsing from tab
    const url = new URL(espnTab.url);
    const leagueId = url.searchParams.get("leagueId");
    const teamId = url.searchParams.get("teamId");
    if (leagueId) return { leagueId, teamId, url: espnTab.url, timestamp: Date.now() };
    return null;
  }
}

async function getActiveEspnTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const espnTab = tabs.find(t => t.url && t.url.includes("fantasy.espn.com"));
  if (espnTab) return espnTab;

  // Also check all tabs
  const allTabs = await chrome.tabs.query({ url: "https://fantasy.espn.com/*" });
  return allTabs[0] || null;
}

function showError(message) {
  document.getElementById("error-message").textContent = message;
  showState("error");
}

// ─── Connect flow ─────────────────────────────────────────────────────────────

async function connectLeague() {
  showState("connecting");
  updateConnectingStatus("Validating ESPN credentials…");

  try {
    // Build the tRPC mutation URL
    const url = `${gmToolOrigin}/api/trpc/providers.connectViaExtension`;

    const response = await fetch(url, {
      method: "POST",
      credentials: "include", // send session cookie
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {
          leagueId: capturedData.leagueId,
          teamId: capturedData.teamId ? parseInt(capturedData.teamId, 10) : undefined,
          swid: capturedData.swid,
          espnS2: capturedData.espnS2,
          // Pass current year so backend fetches the active season;
          // backend is responsible for also fetching historical seasons.
          season: new Date().getFullYear(),
        },
      }),
    });

    if (response.status === 401) {
      showState("not-logged-in");
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      let message = `Server error (${response.status})`;
      try {
        const json = JSON.parse(text);
        message = json?.error?.json?.message || json?.message || message;
      } catch (_) { /* ignore */ }
      showError(message);
      return;
    }

    const data = await response.json();
    const result = data?.result?.data?.json;

    updateConnectingStatus("League connected! Building GM profile…");

    // Show success
    const leagueName = result?.leagueName || `League ${capturedData.leagueId}`;
    document.getElementById("success-league-name").textContent = leagueName;
    showState("success");

    // Store the connected origin for "Open GM Tool" button
    await chrome.storage.local.set({ lastConnectedOrigin: gmToolOrigin });

  } catch (err) {
    showError(err.message || "Connection failed");
  }
}

function updateConnectingStatus(text) {
  const el = document.getElementById("connecting-status");
  if (el) el.textContent = text;
}

// ─── Button wiring ────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // not-on-espn
  document.getElementById("btn-open-espn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://fantasy.espn.com/football/league" });
  });

  // no-cookies
  document.getElementById("btn-retry-cookies")?.addEventListener("click", () => {
    chrome.storage.local.remove("espnPageContext");
    init();
  });

  // no-league
  document.getElementById("btn-retry-league")?.addEventListener("click", () => {
    chrome.storage.local.remove("espnPageContext");
    init();
  });

  document.getElementById("btn-use-manual-league")?.addEventListener("click", () => {
    const input = document.getElementById("manual-league-id");
    const val = input?.value?.trim();
    if (!val || !/^\d{4,}$/.test(val)) {
      input.style.borderColor = "#ef4444";
      return;
    }
    input.style.borderColor = "#334155";
    capturedData.leagueId = val;
    // Show ready state with manually entered league ID
    document.getElementById("ready-league-id").textContent = capturedData.leagueId;
    document.getElementById("ready-team-id").textContent = capturedData.teamId || "Auto-detect";
    document.getElementById("btn-connect").disabled = false;
    showState("ready");
  });

  // ready
  document.getElementById("btn-connect")?.addEventListener("click", connectLeague);

  document.getElementById("btn-not-logged-in")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${gmToolOrigin}/connect` });
  });

  // error
  document.getElementById("btn-retry-error")?.addEventListener("click", () => {
    chrome.storage.local.remove("espnPageContext");
    init();
  });

  document.getElementById("btn-manual-fallback")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${gmToolOrigin}/connect?mode=manual` });
  });

  // not-logged-in
  document.getElementById("btn-open-app-login")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${gmToolOrigin}/connect` });
  });

  document.getElementById("btn-retry-after-login")?.addEventListener("click", () => {
    init();
  });

  // success — send user to claim-team step so they can identify their team
  document.getElementById("btn-open-app")?.addEventListener("click", async () => {
    const stored = await chrome.storage.local.get("lastConnectedOrigin");
    const origin = stored.lastConnectedOrigin || gmToolOrigin;
    chrome.tabs.create({ url: `${origin}/connect?step=claim_team` });
  });

  // footer privacy
  document.getElementById("footer-privacy")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${gmToolOrigin}/privacy` });
  });

  // Run init
  init();
});
