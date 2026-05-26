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
})();
