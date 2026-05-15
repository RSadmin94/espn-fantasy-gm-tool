/**
 * Content script — runs on fantasy.espn.com pages.
 * Extracts leagueId and teamId from the current URL and sends them
 * to the background service worker for the popup to consume.
 */

(function extractEspnContext() {
  const url = new URL(window.location.href);
  const leagueId = url.searchParams.get("leagueId") || null;
  const teamId = url.searchParams.get("teamId") || null;

  // Also try to detect league ID from path segments like /football/league/158918
  let detectedLeagueId = leagueId;
  if (!detectedLeagueId) {
    const pathMatch = window.location.pathname.match(/\/(\d{5,})/);
    if (pathMatch) detectedLeagueId = pathMatch[1];
  }

  const context = {
    leagueId: detectedLeagueId,
    teamId: teamId,
    url: window.location.href,
    timestamp: Date.now(),
  };

  // Store in extension storage so the popup can read it
  chrome.storage.local.set({ espnPageContext: context });

  // Also notify the background worker
  chrome.runtime.sendMessage({ type: "ESPN_CONTEXT_DETECTED", payload: context });
})();
