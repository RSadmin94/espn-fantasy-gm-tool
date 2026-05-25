/**
 * Injected on https://fantasy.espn.com/football/* — same origin as FFL API (`/apis/v3/...`).
 * Uses credentials: "include" so ESPN session cookies attach. Do not set Origin, Referer, or Cookie.
 */
const GMWR_FETCH_ESPN = "GMWR_FETCH_ESPN";

function topLevelPayloadKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.keys(obj).slice(0, 50);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== GMWR_FETCH_ESPN) return false;

  const url = String(msg.url || "").trim();
  if (!url.startsWith("https://fantasy.espn.com/")) {
    sendResponse({ ok: false, status: 0, json: null, errorType: "invalid_url" });
    return true;
  }

  const fetchOrigin = typeof location !== "undefined" ? location.origin : "";

  fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Fantasy-Source": "kona",
      "X-Fantasy-Platform": "kona",
    },
  })
    .then(async (res) => {
      const status = res.status;
      const contentType = (res.headers.get("content-type") || "").toLowerCase();

      if (status === 401 || status === 403) {
        sendResponse({ ok: false, status, json: null, errorType: "espn_login_expired" });
        return;
      }
      if (status === 404) {
        sendResponse({ ok: false, status, json: null, errorType: "unavailable" });
        return;
      }
      if (status === 429) {
        sendResponse({ ok: false, status, json: null, errorType: "rate_limited" });
        return;
      }
      if (!res.ok) {
        sendResponse({ ok: false, status, json: null, errorType: "http_error" });
        return;
      }
      if (contentType.includes("text/html")) {
        sendResponse({ ok: false, status, json: null, errorType: "espn_html_not_json" });
        return;
      }
      try {
        const json = await res.json();
        console.info("[GMWR] ESPN in-page fetch OK", {
          fetchOrigin,
          url,
          status,
          payloadKeys: topLevelPayloadKeys(json),
        });
        sendResponse({ ok: true, status, json, errorType: null });
      } catch {
        sendResponse({ ok: false, status, json: null, errorType: "invalid_json" });
      }
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetwork =
        err instanceof TypeError || /Failed to fetch|NetworkError|Load failed|network/i.test(msg);
      console.warn("[GMWR] ESPN in-page fetch catch", { fetchOrigin, url, errorType: isNetwork ? "cors_or_network_blocked" : "network_error", message: msg });
      sendResponse({
        ok: false,
        status: 0,
        json: null,
        errorType: isNetwork ? "cors_or_network_blocked" : "network_error",
      });
    });

  return true;
});
