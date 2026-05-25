/**
 * Runs on fantasy.espn.com — same-origin fetches include the user's ESPN session cookies.
 * The MV3 service worker cannot send Cookie on fetch(); this proxy uses credentials: "include".
 */
const GMWR_FETCH_ESPN = "GMWR_FETCH_ESPN";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== GMWR_FETCH_ESPN) return false;

  const url = String(msg.url || "").trim();
  if (!url.startsWith("https://fantasy.espn.com/")) {
    sendResponse({ ok: false, status: 0, error: "invalid_url", data: null });
    return true;
  }

  fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then(async (res) => {
      const status = res.status;
      const contentType = (res.headers.get("content-type") || "").toLowerCase();

      if (status === 401 || status === 403) {
        sendResponse({ ok: false, status, error: "ESPN login expired", data: null });
        return;
      }
      if (status === 404) {
        sendResponse({ ok: false, status, error: "not_found", data: null });
        return;
      }
      if (status === 429) {
        sendResponse({ ok: false, status, error: "rate_limited", data: null });
        return;
      }
      if (!res.ok) {
        sendResponse({ ok: false, status, error: `HTTP ${status}`, data: null });
        return;
      }
      if (contentType.includes("text/html")) {
        sendResponse({ ok: false, status, error: "espn_html_not_json", data: null });
        return;
      }
      try {
        const data = await res.json();
        sendResponse({ ok: true, status, error: null, data });
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, status, error: m, data: null });
      }
    })
    .catch((err) => {
      sendResponse({
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
        data: null,
      });
    });

  return true;
});
