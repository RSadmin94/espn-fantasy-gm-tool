/**
 * Injected on GM War Room web app at document_start: marks extension presence and bridges
 * `postMessage` ESPN fetch requests to the MV3 background worker.
 */
(function gmWarRoomEspnBridge() {
  try {
    document.documentElement.dataset.gmwrExtension = "1";
  } catch {
    /* ignore */
  }

  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_ESPN_FETCH") return;
      const id = d.id;
      const url = d.payload && typeof d.payload.url === "string" ? d.payload.url.trim() : "";
      if (!id || !url) return;
      if (!url.includes("fantasy.espn.com")) return;

      chrome.runtime.sendMessage({ type: "GMWR_PAGE_ESPN_FETCH", id, url }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            {
              type: "GMWR_ESPN_FETCH_REPLY",
              id,
              status: 0,
              error: chrome.runtime.lastError.message,
              bodyText: "",
            },
            "*",
          );
          return;
        }
        const r = response || {};
        const bodyText =
          typeof r.bodyText === "string" && r.bodyText.length > 0
            ? r.bodyText
            : r.result != null
              ? JSON.stringify(r.result)
              : "";
        window.postMessage(
          {
            type: "GMWR_ESPN_FETCH_REPLY",
            id,
            status: r.status ?? 0,
            error: r.error != null ? String(r.error) : "",
            bodyText,
          },
          "*",
        );
      });
    },
    false,
  );

  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_HIST_TEST") return;
      const id = d.id;
      const leagueId = String(d.leagueId || "457622").trim();
      const clerkToken = typeof d.clerkToken === "string" ? d.clerkToken : "";
      const season = d.season ? Number(d.season) : undefined;
      chrome.runtime.sendMessage({ type: "GMWR_HIST_TEST", leagueId, clerkToken, season }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            { type: "GMWR_HIST_TEST_REPLY", id, ok: false, error: chrome.runtime.lastError.message },
            "*",
          );
          return;
        }
        const r = response || {};
        window.postMessage(
          { ...r, type: "GMWR_HIST_TEST_REPLY", id, ok: Boolean(r.ok) },
          "*",
        );
      });
    },
    false,
  );

  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_HIST_STANDINGS") return;
      const id = d.id;
      const leagueId = String(d.leagueId || "457622").trim();
      const season = d.season ? Number(d.season) : 2010;
      chrome.runtime.sendMessage({ type: "GMWR_HIST_STANDINGS", leagueId, season }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            { type: "GMWR_HIST_STANDINGS_REPLY", id, ok: false, error: chrome.runtime.lastError.message },
            "*",
          );
          return;
        }
        const r = response || {};
        window.postMessage({ ...r, type: "GMWR_HIST_STANDINGS_REPLY", id, ok: Boolean(r.ok) }, "*");
      });
    },
    false,
  );

  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_HIST_MATCHUPS") return;
      const id = d.id;
      const leagueId = String(d.leagueId || "457622").trim();
      const season = d.season ? Number(d.season) : 2010;
      chrome.runtime.sendMessage({ type: "GMWR_HIST_MATCHUPS", leagueId, season }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: "GMWR_HIST_MATCHUPS_REPLY", id, ok: false, error: chrome.runtime.lastError.message }, "*");
          return;
        }
        const r = response || {};
        window.postMessage({ ...r, type: "GMWR_HIST_MATCHUPS_REPLY", id, ok: Boolean(r.ok) }, "*");
      });
    },
    false,
  );

  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_HIST_FULL") return;
      const id = d.id;
      const leagueId = String(d.leagueId || "457622").trim();
      const seasons = Array.isArray(d.seasons) ? d.seasons : [];
      const clerkToken = typeof d.clerkToken === "string" ? d.clerkToken : "";
      chrome.runtime.sendMessage({ type: "GMWR_HIST_FULL", leagueId, seasons, clerkToken }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            { type: "GMWR_HIST_FULL_REPLY", id, ok: false, error: chrome.runtime.lastError.message, results: [], aborted: false },
            "*",
          );
          return;
        }
        const r = response || {};
        window.postMessage(
          { type: "GMWR_HIST_FULL_REPLY", id, ok: Boolean(r.ok), error: r.error ? String(r.error) : "", results: r.results || [], aborted: Boolean(r.aborted) },
          "*",
        );
      });
    },
    false,
  );

  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_LEAGUE_HISTORY_MEDALS") return;
      const id = d.id;
      const leagueId = String(d.leagueId || "457622").trim();
      chrome.runtime.sendMessage({ type: "GMWR_LEAGUE_HISTORY_MEDALS", leagueId }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            { type: "GMWR_LEAGUE_HISTORY_MEDALS_REPLY", id, ok: false, error: chrome.runtime.lastError.message, medals: [] },
            "*",
          );
          return;
        }
        const r = response || {};
        window.postMessage(
          {
            ...r,
            type: "GMWR_LEAGUE_HISTORY_MEDALS_REPLY",
            id,
            ok: Boolean(r.ok),
            medals: Array.isArray(r.medals) ? r.medals : [],
          },
          "*",
        );
      });
    },
    false,
  );

  // ── RFSN-030C FantasyPros solo mock: FFR page ↔ background ↔ FP tab ────────
  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || typeof d.type !== "string") return;
      if (
        d.type !== "GMWR_FP_MOCK_ARM" &&
        d.type !== "GMWR_FP_MOCK_DISARM" &&
        d.type !== "GMWR_FP_MOCK_PING" &&
        d.type !== "GMWR_FP_MOCK_GET_STATE"
      ) {
        return;
      }
      const id = d.id;
      chrome.runtime.sendMessage(
        {
          type: d.type,
          config: d.config && typeof d.config === "object" ? d.config : undefined,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            window.postMessage(
              {
                type: d.type + "_REPLY",
                id,
                ok: false,
                error: chrome.runtime.lastError.message,
              },
              "*",
            );
            return;
          }
          const r = response || {};
          window.postMessage({ ...r, type: d.type + "_REPLY", id, ok: Boolean(r.ok !== false) }, "*");
        },
      );
    },
    false,
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;
    if (
      message.type !== "GMWR_FP_MOCK_PICK_BATCH" &&
      message.type !== "GMWR_FP_MOCK_STATUS" &&
      message.type !== "GMWR_FP_MOCK_SESSION_RESET"
    ) {
      return;
    }
    if (message.provider && message.provider !== "fantasypros") {
      sendResponse({ ok: false, error: "unsupported_provider" });
      return true;
    }
    try {
      window.postMessage(
        {
          ...message,
          channel: "GMWR_FP_MOCK",
          source: "gmwarroom-extension",
        },
        "*",
      );
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  });

  // Relay: full-coverage weekly box-score / player-stats capture for one season.
  // Forwards to background.js (MSG_CAPTURE_WEEKLY_STATS), which fetches the full
  // ESPN box score (mBoxscore+mScoreboard+mMatchupScore) per week and posts the
  // raw payload to the war room (cached + extracted server-side).
  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_CAPTURE_WEEKLY_STATS") return;
      const id = d.id;
      const leagueId = String(d.leagueId || "457622").trim();
      const season = d.season ? Number(d.season) : 2025;
      const fromWeek = d.fromWeek ? Number(d.fromWeek) : 1;
      const toWeek = d.toWeek ? Number(d.toWeek) : 18;
      const clerkToken = typeof d.clerkToken === "string" ? d.clerkToken : "";
      chrome.runtime.sendMessage(
        { type: "GMWR_CAPTURE_WEEKLY_STATS", leagueId, season, fromWeek, toWeek, clerkToken },
        (response) => {
          if (chrome.runtime.lastError) {
            window.postMessage(
              { type: "GMWR_CAPTURE_WEEKLY_STATS_REPLY", id, ok: false, error: chrome.runtime.lastError.message, totalStats: 0, weeks: [] },
              "*",
            );
            return;
          }
          const r = response || {};
          window.postMessage(
            {
              ...r,
              type: "GMWR_CAPTURE_WEEKLY_STATS_REPLY",
              id,
              ok: Boolean(r.ok),
              totalStats: Number(r.totalStats || 0),
              weeks: Array.isArray(r.weeks) ? r.weeks : [],
            },
            "*",
          );
        },
      );
    },
    false,
  );
})();
