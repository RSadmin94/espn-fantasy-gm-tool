/**
 * Content script — runs on fantasy.espn.com pages.
 * Extracts leagueId and teamId from multiple sources:
 *   1. URL query params (?leagueId=... &teamId=...)
 *   2. URL path segments (/football/league/158918)
 *   3. ESPN localStorage (espn.fantasy.maxScoringPeriodId, lastViewedLeagueId, etc.)
 *   4. ESPN sessionStorage
 *   5. DOM data attributes on the page
 */

(function extractEspnContext() {
  const url = new URL(window.location.href);

  // ── 1. URL query params ──────────────────────────────────────────────────────
  let leagueId = url.searchParams.get("leagueId") || null;
  let teamId   = url.searchParams.get("teamId")   || null;

  // ── 2. URL path segments (e.g. /football/league/158918 or /football/teams/158918) ──
  if (!leagueId) {
    const pathMatch = window.location.pathname.match(/\/(\d{5,})/);
    if (pathMatch) leagueId = pathMatch[1];
  }

  // ── 3. ESPN localStorage keys ────────────────────────────────────────────────
  if (!leagueId) {
    try {
      // ESPN stores the last viewed league in several keys
      const candidates = [
        "lastViewedLeagueId",
        "espn.fantasy.lastLeagueId",
        "fantasy.lastLeagueId",
        "leagueId",
      ];
      for (const key of candidates) {
        const val = localStorage.getItem(key);
        if (val && /^\d{4,}$/.test(val.trim())) {
          leagueId = val.trim();
          break;
        }
      }

      // Also scan all localStorage keys for anything that looks like a league ID
      if (!leagueId) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("league") || key.includes("League"))) {
            const val = localStorage.getItem(key);
            if (val && /^\d{4,}$/.test(val.trim())) {
              leagueId = val.trim();
              break;
            }
          }
        }
      }
    } catch (_) { /* localStorage blocked in some contexts */ }
  }

  // ── 4. sessionStorage ────────────────────────────────────────────────────────
  if (!leagueId) {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes("league") || key.includes("League"))) {
          const val = sessionStorage.getItem(key);
          if (val && /^\d{4,}$/.test(val.trim())) {
            leagueId = val.trim();
            break;
          }
        }
      }
    } catch (_) { /* sessionStorage blocked */ }
  }

  // ── 5. DOM data attributes ───────────────────────────────────────────────────
  if (!leagueId) {
    try {
      // ESPN React app often embeds league/team data in window.__espnfitt__ or similar
      const espnData = window.__espnfitt__ || window.espnfitt || window.__INITIAL_STATE__;
      if (espnData) {
        const str = JSON.stringify(espnData);
        const m = str.match(/"leagueId"\s*:\s*(\d+)/);
        if (m) leagueId = m[1];
        if (!teamId) {
          const tm = str.match(/"teamId"\s*:\s*(\d+)/);
          if (tm) teamId = tm[1];
        }
      }
    } catch (_) { /* window globals may not exist */ }
  }

  // ── 6. Try to extract teamId from URL if still missing ───────────────────────
  if (!teamId) {
    const teamMatch = url.pathname.match(/teams?\/(\d+)/i);
    if (teamMatch) teamId = teamMatch[1];
  }

  const context = {
    leagueId: leagueId,
    teamId:   teamId,
    url:      window.location.href,
    timestamp: Date.now(),
  };

  // Store in extension storage so the popup can read it
  chrome.storage.local.set({ espnPageContext: context });

  // Also notify the background worker
  chrome.runtime.sendMessage({ type: "ESPN_CONTEXT_DETECTED", payload: context });
})();
