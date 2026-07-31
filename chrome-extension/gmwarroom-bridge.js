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

  // ── Phase 2 ESPN bookmarklet transport: FFR page ↔ background ↔ ESPN tab ───
  // Completely separate namespace from FantasyPros (GMWR_ESPN_BM_*).
  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || typeof d.type !== "string") return;
      if (
        d.type !== "GMWR_ESPN_BM_ARM" &&
        d.type !== "GMWR_ESPN_BM_DISARM" &&
        d.type !== "GMWR_ESPN_BM_PING" &&
        d.type !== "GMWR_ESPN_BM_GET_STATE" &&
        d.type !== "GMWR_ESPN_BM_REPLAY_REQUEST"
      ) {
        return;
      }
      if (d.provider != null && d.provider !== "espn-live") return;
      if (Math.floor(Number(d.protocolVersion)) !== 1) return;
      const id = d.id;
      chrome.runtime.sendMessage(
        {
          type: d.type,
          config: d.config && typeof d.config === "object" ? d.config : undefined,
          draftId: d.draftId,
          sessionNonce: d.sessionNonce,
          afterOverallPick: d.afterOverallPick,
          requestId: d.requestId,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            window.postMessage(
              {
                type: d.type + "_REPLY",
                id,
                ok: false,
                error: chrome.runtime.lastError.message,
                channel: "GMWR_ESPN_BM",
                source: "gmwarroom-extension",
              },
              "*",
            );
            return;
          }
          const r = response || {};
          window.postMessage(
            {
              ...r,
              type: d.type + "_REPLY",
              id,
              ok: Boolean(r.ok !== false),
              channel: "GMWR_ESPN_BM",
              source: "gmwarroom-extension",
            },
            "*",
          );
        },
      );
    },
    false,
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;
    if (
      message.type !== "GMWR_ESPN_BM_PICK_BATCH" &&
      message.type !== "GMWR_ESPN_BM_STATUS" &&
      message.type !== "GMWR_ESPN_BM_SESSION_RESET" &&
      message.type !== "GMWR_ESPN_BM_PONG"
    ) {
      return;
    }
    const espnBmPathHop = {
      hop: "bridge",
      type: message.type,
      sessionNonce: message.sessionNonce != null ? String(message.sessionNonce) : null,
      draftId: message.draftId != null ? String(message.draftId) : null,
      protocolVersion: message.protocolVersion,
      revision: message.revision,
      batchSize: Array.isArray(message.picks) ? message.picks.length : null,
    };
    if (message.type === "GMWR_ESPN_BM_PICK_BATCH") {
      try {
        console.info("[espn-bm-path]", "bridge_recv_PICK_BATCH", espnBmPathHop);
      } catch (_) {
        /* ignore */
      }
    }
    if (message.provider && message.provider !== "espn-live") {
      if (message.type === "GMWR_ESPN_BM_PICK_BATCH") {
        try {
          console.info("[espn-bm-path]", "bridge_drop_PICK_BATCH", {
            ...espnBmPathHop,
            reject: "unsupported_provider",
          });
        } catch (_) {
          /* ignore */
        }
      }
      sendResponse({ ok: false, error: "unsupported_provider" });
      return true;
    }
    if (Math.floor(Number(message.protocolVersion)) !== 1) {
      if (message.type === "GMWR_ESPN_BM_PICK_BATCH") {
        try {
          console.info("[espn-bm-path]", "bridge_drop_PICK_BATCH", {
            ...espnBmPathHop,
            reject: "unsupported_protocol_version",
            line: "gmwarroom-bridge.js:protocolVersion",
          });
        } catch (_) {
          /* ignore */
        }
      }
      sendResponse({ ok: false, error: "unsupported_protocol_version" });
      return true;
    }
    // Never forward FP payloads through this listener.
    if (String(message.type).startsWith("GMWR_FP_")) {
      sendResponse({ ok: false, error: "fp_namespace_rejected" });
      return true;
    }
    try {
      window.postMessage(
        {
          ...message,
          channel: "GMWR_ESPN_BM",
          source: "gmwarroom-extension",
        },
        "*",
      );
      if (message.type === "GMWR_ESPN_BM_PICK_BATCH") {
        try {
          console.info("[espn-bm-path]", "bridge_post_PICK_BATCH", espnBmPathHop);
        } catch (_) {
          /* ignore */
        }
      }
      sendResponse({ ok: true });
    } catch (e) {
      if (message.type === "GMWR_ESPN_BM_PICK_BATCH") {
        try {
          console.info("[espn-bm-path]", "bridge_drop_PICK_BATCH", {
            ...espnBmPathHop,
            reject: "postMessage_failed",
            error: e instanceof Error ? e.message : String(e),
          });
        } catch (_) {
          /* ignore */
        }
      }
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  });

  // Relay: deterministic ESPN connect. Background reads ESPN cookies, discovers leagues and
  // POSTs saveCredentials; every reply carries a stage the page turns into one next action.
  window.addEventListener(
    "message",
    (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_CONNECT_ESPN") return;
      const id = d.id;
      if (!id) return;
      chrome.runtime.sendMessage(
        {
          type: "GMWR_CONNECT_ESPN",
          probe: d.probe === true,
          leagueId: d.leagueId != null ? String(d.leagueId).trim() : "",
          leagueName: d.leagueName != null ? String(d.leagueName).trim() : "",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            window.postMessage(
              {
                type: "GMWR_CONNECT_ESPN_REPLY",
                id,
                ok: false,
                stage: "error",
                error: chrome.runtime.lastError.message,
              },
              "*",
            );
            return;
          }
          const r = response || {};
          window.postMessage(
            {
              ...r,
              type: "GMWR_CONNECT_ESPN_REPLY",
              id,
              ok: Boolean(r.ok),
              stage: typeof r.stage === "string" ? r.stage : "error",
            },
            "*",
          );
        },
      );
    },
    false,
  );

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
