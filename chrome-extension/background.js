/**
 * GM War Room extension — background service worker.
 * Reads ESPN cookies + gmwarroom session cookies, POSTs espn.saveCredentials from the extension.
 * Session cookies are injected via declarativeNetRequest (fetch cannot set a Cookie header from a SW).
 */

const WAR_ROOM_ORIGIN = "https://gmwarroom.online";
const TRPC_SAVE_URL = `${WAR_ROOM_ORIGIN}/api/trpc/espn.saveCredentials`;
const SYNC_AUTOSYNC_URL = `${WAR_ROOM_ORIGIN}/sync?autoSync=2026`;
const ESPN_COOKIE_URL = "https://fantasy.espn.com/";

const MSG_OPEN_CONNECT = "GMWR_OPEN_CONNECT_AND_SAVE";
/** Session rule: inject Cookie only for the saveCredentials request, then removed. */
const DNR_SAVE_COOKIE_RULE_ID = 8844201;

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

async function detectLeagueId() {
  try {
    const espnTabs = await chrome.tabs.query({ url: "https://fantasy.espn.com/*" });
    for (const t of espnTabs) {
      const id = extractLeagueIdFromUrl(t.url ?? "");
      if (id) return id;
    }
  } catch {
    /* ignore */
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return extractLeagueIdFromUrl(active?.url ?? "");
}

async function getEspnCookieValues() {
  const base = { url: ESPN_COOKIE_URL };
  const [swidRow, s2Row] = await Promise.all([
    chrome.cookies.get({ ...base, name: "SWID" }),
    chrome.cookies.get({ ...base, name: "espn_s2" }),
  ]);
  return { swid: swidRow?.value ?? "", espnS2: s2Row?.value ?? "" };
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

function logPipeline({ hasSwid, hasS2, leagueId, warRoomSession, status, ok, errorSummary }) {
  console.info("[GMWR] ESPN extension pipeline", {
    leagueIdDetected: leagueId ? String(leagueId).trim() : null,
    swidPresent: hasSwid,
    espnS2Present: hasS2,
    warRoomSessionCookiesPresent: warRoomSession,
    saveCredentialsHttpStatus: status ?? null,
    saveOk: ok,
    error: errorSummary ?? null,
  });
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
  const json = { swid, espnS2 };
  const lid = leagueId ? String(leagueId).trim() : "";
  if (lid) json.leagueId = lid;
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
    return { ok: true, status };
  } finally {
    await removeSaveCredentialsCookieRule();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MSG_OPEN_CONNECT) return false;

  (async () => {
    const leagueId = await detectLeagueId();
    const { swid, espnS2 } = await getEspnCookieValues();
    const hasSwid = Boolean(swid);
    const hasS2 = Boolean(espnS2);

    const warRoomCookieHeader = await getWarRoomCookieHeaderString();
    const warRoomSession = Boolean(warRoomCookieHeader);

    if (!hasSwid || !hasS2) {
      logPipeline({
        hasSwid,
        hasS2,
        leagueId,
        warRoomSession,
        status: null,
        ok: false,
        errorSummary: "Missing ESPN cookies",
      });
      sendResponse({
        ok: false,
        error: "ESPN cookies not found. Open fantasy.espn.com and sign in, then try again.",
      });
      return;
    }

    if (!warRoomSession) {
      logPipeline({
        hasSwid,
        hasS2,
        leagueId,
        warRoomSession,
        status: null,
        ok: false,
        errorSummary: "No GM War Room session cookies",
      });
      sendResponse({
        ok: false,
        error: "GM War Room session not found. Sign in at gmwarroom.online in this browser, then try again.",
      });
      return;
    }

    const result = await postSaveCredentials({
      swid,
      espnS2,
      leagueId,
      warRoomCookieHeader,
    });

    logPipeline({
      hasSwid,
      hasS2,
      leagueId,
      warRoomSession,
      status: result.status,
      ok: result.ok,
      errorSummary: result.ok ? null : result.error,
    });

    if (!result.ok) {
      sendResponse({
        ok: false,
        error: result.error || "Save failed.",
        status: result.status,
      });
      return;
    }

    await openOrFocusSyncTab();
    sendResponse({ ok: true });
  })().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.info("[GMWR] ESPN extension pipeline", {
      leagueIdDetected: null,
      swidPresent: null,
      espnS2Present: null,
      warRoomSessionCookiesPresent: null,
      saveCredentialsHttpStatus: null,
      saveOk: false,
      error: msg,
    });
    sendResponse({ ok: false, error: msg });
  });

  return true;
});
