/**
 * GM War Room extension — background service worker.
 * Reads ESPN cookies, opens gmwarroom connect tab, asks content script to POST with credentials:include.
 */

const WAR_ROOM_ORIGIN = "https://gmwarroom.online";
const CONNECT_URL = `${WAR_ROOM_ORIGIN}/connect?extensionConnect=1`;
const ESPN_COOKIE_URL = "https://fantasy.espn.com/";

const MSG_OPEN_CONNECT = "GMWR_OPEN_CONNECT_AND_SAVE";

function extractLeagueIdFromUrl(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const u = new URL(url);
    const q = u.searchParams.get("leagueId") || u.searchParams.get("league_id");
    if (q) return q.trim();
    const m = u.pathname.match(/\/leagues?\/(\d+)/i);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return "";
}

async function getEspnCookieValues() {
  const base = { url: ESPN_COOKIE_URL };
  const [swidRow, s2Row] = await Promise.all([
    chrome.cookies.get({ ...base, name: "SWID" }),
    chrome.cookies.get({ ...base, name: "espn_s2" }),
  ]);
  return { swid: swidRow?.value ?? "", espnS2: s2Row?.value ?? "" };
}

function logSaveIntent({ hasSwid, hasS2, leagueId }) {
  console.info("[GMWR] save credentials intent", {
    swidPresent: hasSwid,
    espnS2Present: hasS2,
    leagueId: leagueId || "(none)",
  });
}

async function findConnectTab() {
  const tabs = await chrome.tabs.query({ url: "https://gmwarroom.online/*" });
  return tabs.find((t) => t.id != null && t.url && t.url.includes("/connect")) ?? null;
}

async function openOrFocusConnectTab() {
  const existing = await findConnectTab();
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { url: CONNECT_URL, active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return existing.id;
  }
  const created = await chrome.tabs.create({ url: CONNECT_URL, active: true });
  if (created.id == null) throw new Error("Could not create tab");
  return created.id;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpd);
      reject(new Error("Tab load timeout"));
    }, 60000);

    function onUpd(id, info) {
      if (id !== tabId) return;
      if (info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpd);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpd);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (t.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpd);
        resolve();
      }
    });
  });
}

async function sendSaveToTab(tabId, payload, attempts = 8) {
  const msg = { type: "GMWR_SAVE_ESPN_CREDS", payload };
  for (let i = 0; i < attempts; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, msg);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw new Error("Content script did not respond — reload the GM War Room tab and try again.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== MSG_OPEN_CONNECT) return false;

  (async () => {
    const tabIdActive = sender.tab?.id;
    let leagueUrl = sender.tab?.url;
    if (tabIdActive == null) {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      leagueUrl = active?.url;
    }

    const leagueId = extractLeagueIdFromUrl(leagueUrl ?? "");
    const { swid, espnS2 } = await getEspnCookieValues();
    const hasSwid = Boolean(swid);
    const hasS2 = Boolean(espnS2);
    logSaveIntent({ hasSwid, hasS2, leagueId });

    if (!hasSwid || !hasS2) {
      sendResponse({ ok: false, error: "ESPN cookies not found. Open fantasy.espn.com and sign in, then try again." });
      return;
    }

    const tabId = await openOrFocusConnectTab();
    await waitForTabComplete(tabId);
    await sendSaveToTab(tabId, { swid, espnS2, leagueId });

    sendResponse({ ok: true });
  })().catch((err) => {
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  });

  return true;
});
