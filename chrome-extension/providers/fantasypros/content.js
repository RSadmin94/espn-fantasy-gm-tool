/**
 * RFSN-030C — FantasyPros content script (isolated world).
 * Injects page-world observer, validates sanitized events, relays to background.
 */
(function fantasyProsContentBridge() {
  "use strict";

  var PAGE_CHANNEL = "GMWR_FP_MOCK_PAGE";
  var MSG_FP_PICK_BATCH = "GMWR_FP_MOCK_PICK_BATCH";
  var MSG_FP_STATUS = "GMWR_FP_MOCK_STATUS";
  var MSG_FP_SESSION_RESET = "GMWR_FP_MOCK_SESSION_RESET";
  var MSG_FP_ARM = "GMWR_FP_MOCK_ARM";
  var MSG_FP_DISARM = "GMWR_FP_MOCK_DISARM";

  var injected = false;
  var lastEmitKeys = new Set();
  var MAX_EMIT_KEYS = 400;

  function injectObserver() {
    if (injected) return;
    try {
      var s = document.createElement("script");
      s.src = chrome.runtime.getURL("providers/fantasypros/page-observer.js");
      s.async = false;
      (document.documentElement || document.head).appendChild(s);
      s.onload = function () {
        try {
          s.remove();
        } catch (_) {
          /* ignore */
        }
      };
      injected = true;
    } catch (err) {
      chrome.runtime
        .sendMessage({
          type: MSG_FP_STATUS,
          status: "inject_failed",
          reason: err && err.message ? String(err.message) : "inject_failed",
        })
        .catch(function () {});
    }
  }

  function postToPage(payload) {
    window.postMessage(
      Object.assign({ channel: PAGE_CHANNEL, source: "fantasypros-content" }, payload),
      window.location.origin,
    );
  }

  function validatePickRow(row) {
    if (!row || typeof row !== "object") return null;
    var id = String(row.id || "").trim();
    var pick = Math.floor(Number(row.pick));
    if (!id || !Number.isFinite(pick) || pick < 1) return null;
    return {
      id: id,
      pick: pick,
      round: Math.max(1, Math.floor(Number(row.round) || 1)),
      posInRound: Math.max(1, Math.floor(Number(row.posInRound) || 1)),
      ownerPos: Math.floor(Number(row.ownerPos) || 0),
      owner: row.owner != null ? String(row.owner).slice(0, 80) : "",
      isKeeper: Boolean(row.isKeeper),
    };
  }

  function validateBatch(data) {
    if (!data || data.provider === "espn") return null;
    var draftId = String(data.draftId || "").trim();
    var providerDraftId = String(data.providerDraftId || "").trim();
    if (!draftId.startsWith("fp-mock-") || !providerDraftId) return null;
    if (!Array.isArray(data.picks) || data.picks.length === 0) return null;
    if (data.picks.length > 64) return null;

    var picks = [];
    for (var i = 0; i < data.picks.length; i++) {
      var row = validatePickRow(data.picks[i]);
      if (row) picks.push(row);
    }
    if (!picks.length) return null;

    var playerMapSlice = {};
    var rawMap = data.playerMapSlice && typeof data.playerMapSlice === "object" ? data.playerMapSlice : {};
    for (var j = 0; j < picks.length; j++) {
      var pid = picks[j].id;
      var entry = rawMap[pid];
      if (entry && typeof entry === "object") {
        playerMapSlice[pid] = {
          id: pid,
          name: entry.name != null ? String(entry.name).slice(0, 80) : "",
          position: entry.position != null ? String(entry.position).slice(0, 8) : "",
          team: entry.team != null ? String(entry.team).slice(0, 8) : "",
          adp:
            entry.adp != null && Number.isFinite(Number(entry.adp))
              ? Number(entry.adp)
              : null,
        };
      }
    }

    return {
      type: MSG_FP_PICK_BATCH,
      provider: "fantasypros",
      source: "solo-mock",
      draftId: draftId.slice(0, 128),
      providerDraftId: providerDraftId.slice(0, 96),
      sessionSource: data.sessionSource != null ? String(data.sessionSource).slice(0, 32) : "",
      picks: picks,
      playerMapSlice: playerMapSlice,
      room: data.room && typeof data.room === "object"
        ? {
            vueDraftTarget: data.room.vueDraftTarget != null ? String(data.room.vueDraftTarget) : null,
            isMultiUserDraft: Boolean(data.room.isMultiUserDraft),
            teamCount:
              data.room.teamCount != null && Number.isFinite(Number(data.room.teamCount))
                ? Number(data.room.teamCount)
                : null,
            overallPick:
              data.room.overallPick != null && Number.isFinite(Number(data.room.overallPick))
                ? Number(data.room.overallPick)
                : null,
            draftComplete: Boolean(data.room.draftComplete),
          }
        : null,
      observedAt:
        typeof data.observedAt === "string" ? data.observedAt.slice(0, 40) : new Date().toISOString(),
      diagnostics:
        data.diagnostics && typeof data.diagnostics === "object"
          ? {
              picksObserved: Number(data.diagnostics.picksObserved) || 0,
              picksEmitted: Number(data.diagnostics.picksEmitted) || 0,
              duplicatesSuppressed: Number(data.diagnostics.duplicatesSuppressed) || 0,
              observerRestarts: Number(data.diagnostics.observerRestarts) || 0,
              lastEventAt: data.diagnostics.lastEventAt || null,
              lastError: data.diagnostics.lastError || null,
            }
          : null,
    };
  }

  function rememberEmit(draftId, pick, playerId) {
    var key = draftId + ":" + pick + ":" + playerId;
    if (lastEmitKeys.has(key)) return false;
    lastEmitKeys.add(key);
    if (lastEmitKeys.size > MAX_EMIT_KEYS) {
      lastEmitKeys = new Set(Array.from(lastEmitKeys).slice(-200));
    }
    return true;
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    if (ev.origin !== window.location.origin) return;
    var d = ev.data;
    if (!d || d.channel !== PAGE_CHANNEL || d.source !== "fantasypros-page-observer") return;

    if (d.type === "PICK_BATCH") {
      var batch = validateBatch(d);
      if (!batch) return;
      var filtered = [];
      for (var i = 0; i < batch.picks.length; i++) {
        var p = batch.picks[i];
        if (rememberEmit(batch.draftId, p.pick, p.id)) filtered.push(p);
      }
      if (!filtered.length) return;
      batch.picks = filtered;
      chrome.runtime.sendMessage(batch).catch(function () {});
      return;
    }

    if (d.type === "SESSION_RESET") {
      lastEmitKeys = new Set();
      chrome.runtime
        .sendMessage({
          type: MSG_FP_SESSION_RESET,
          provider: "fantasypros",
          draftId: String(d.draftId || "").slice(0, 128),
          providerDraftId: String(d.providerDraftId || "").slice(0, 96),
          sessionSource: d.sessionSource != null ? String(d.sessionSource) : "",
        })
        .catch(function () {});
      return;
    }

    if (d.type === "STATUS" || d.type === "PONG") {
      chrome.runtime
        .sendMessage({
          type: MSG_FP_STATUS,
          provider: "fantasypros",
          status: d.status || "unknown",
          reason: d.reason || null,
          draftId: d.draftId ? String(d.draftId).slice(0, 128) : null,
          providerDraftId: d.providerDraftId ? String(d.providerDraftId).slice(0, 96) : null,
          sessionSource: d.sessionSource || null,
          pickCount: d.pickCount != null ? Number(d.pickCount) : null,
          baselineOnly: Boolean(d.baselineOnly),
          room: d.room || null,
          diagnostics: d.diagnostics || null,
          armed: d.armed,
        })
        .catch(function () {});
    }
  });

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || !message.type) return;
    if (message.type === MSG_FP_ARM) {
      injectObserver();
      postToPage({ type: "ARM", config: message.config || {} });
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === MSG_FP_DISARM) {
      postToPage({ type: "DISARM" });
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "GMWR_FP_MOCK_PING") {
      injectObserver();
      postToPage({ type: "PING" });
      sendResponse({ ok: true, host: "fantasypros" });
      return true;
    }
  });

  injectObserver();
})();
