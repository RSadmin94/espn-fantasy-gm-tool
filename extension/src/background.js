/**
 * Background service worker.
 * Handles cookie retrieval for ESPN credentials and stores state
 * for the popup to consume.
 */

// Listen for context messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ESPN_CONTEXT_DETECTED") {
    chrome.storage.local.set({ espnPageContext: message.payload });
    sendResponse({ ok: true });
  }

  if (message.type === "GET_ESPN_COOKIES") {
    fetchEspnCookies().then(cookies => {
      sendResponse({ ok: true, cookies });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true; // keep channel open for async response
  }
});

/**
 * Fetches SWID and espn_s2 cookies from fantasy.espn.com.
 * Returns { swid, espnS2 } or throws if not found.
 */
async function fetchEspnCookies() {
  const [swidCookie, espnS2Cookie] = await Promise.all([
    chrome.cookies.get({ url: "https://fantasy.espn.com", name: "SWID" }),
    chrome.cookies.get({ url: "https://fantasy.espn.com", name: "espn_s2" }),
  ]);

  // Also try www.espn.com domain as fallback
  const [swidFallback, espnS2Fallback] = await Promise.all([
    swidCookie ? Promise.resolve(null) : chrome.cookies.get({ url: "https://www.espn.com", name: "SWID" }),
    espnS2Cookie ? Promise.resolve(null) : chrome.cookies.get({ url: "https://www.espn.com", name: "espn_s2" }),
  ]);

  const swid = (swidCookie || swidFallback)?.value || null;
  const espnS2 = (espnS2Cookie || espnS2Fallback)?.value || null;

  return { swid, espnS2 };
}
