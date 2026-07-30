/**
 * Phase 2 — ESPN bookmarklet transport content script (isolated world).
 * Relays GMWR_ESPN_BM_* page messages ↔ background. No DOM parsing / observers.
 * Phase 4 — rehydrate ARM from background after tab reload; relay REPLAY_REQUEST.
 * RFSN-031B — production auto-inject of dormant ESPN reader behind feature flag.
 */
import {
  ESPN_BM_CONTENT_SOURCE,
  ESPN_BM_PAGE_CHANNEL,
  ESPN_BM_PROTOCOL_VERSION,
  MSG_ESPN_BM_ARM,
  MSG_ESPN_BM_DISARM,
  MSG_ESPN_BM_DRAFT_AVAILABILITY,
  MSG_ESPN_BM_GET_STATE,
  MSG_ESPN_BM_PING,
  MSG_ESPN_BM_REPLAY_REQUEST,
  MSG_ESPN_BM_SET_AUTO_INJECT,
  MSG_ESPN_BM_TELEMETRY,
  shouldRepostArmOnPageStatus,
  validateArmConfig,
  validatePageOutboundMessage,
  validateReplayRequest,
} from "../../espnBookmarkletTransport.js";
import {
  ESPN_AUTO_INJECT_STORAGE_KEY,
  ESPN_AUTO_INJECT_TELEMETRY,
  ESPN_LIVE_READER_ASSET,
  ESPN_READER_HANDSHAKE_KEY,
  isEspnAutoInjectEnabled,
  planEspnReaderInjection,
} from "../../espnAutoInject.js";
import {
  classifyEspnFantasyUrl,
  extractEspnLeagueIdFromUrl,
} from "../../espnLiveDraftRoom.js";

(function espnLiveBookmarkletContent() {
  "use strict";

  /** @type {string|null} */
  let armedSessionNonce = null;
  /** @type {{ leagueId: string, season: number, sessionNonce: string, draftPace?: string, destination?: string }|null} */
  let lastArmConfig = null;

  /** RFSN-031A spike CLOSED — keep disabled constant for static suite / rollback clarity. */
  var RFSN_031A_SPIKE_ENABLED = false; // CLOSED — spike PASS; production path is RFSN-031B
  void RFSN_031A_SPIKE_ENABLED;

  /** @type {boolean|null} session push from Rivals; null = unset */
  let remoteAutoInject = null;
  let autoInjectInFlight = false;
  let autoInjectedThisLoad = false;
  /** @type {string} */
  let readerLifecycle = "not_present";

  function postToPage(payload) {
    window.postMessage(
      Object.assign(
        {
          channel: ESPN_BM_PAGE_CHANNEL,
          source: ESPN_BM_CONTENT_SOURCE,
          protocolVersion: ESPN_BM_PROTOCOL_VERSION,
        },
        payload,
      ),
      window.location.origin,
    );
  }

  function applyArmConfig(config) {
    armedSessionNonce = config.sessionNonce;
    lastArmConfig = config;
    postToPage({ type: "ARM", config });
    postToPage({ type: MSG_ESPN_BM_ARM, config });
  }

  /**
   * Re-post ARM into the page after reader attaches its listener
   * (STATUS ready). First ARM often arrives before that listener exists.
   */
  function repostArmToPage(reason) {
    if (lastArmConfig) {
      pathLog("content_repost_ARM", {
        reason: reason || "cached",
        sessionNonce: lastArmConfig.sessionNonce,
        via: "lastArmConfig",
      });
      applyArmConfig(lastArmConfig);
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: MSG_ESPN_BM_GET_STATE }, function (state) {
        if (chrome.runtime.lastError) return;
        if (!state || !state.armed || !state.config) return;
        const config = validateArmConfig(state.config);
        if (!config) return;
        pathLog("content_repost_ARM", {
          reason: reason || "get_state",
          sessionNonce: config.sessionNonce,
          via: "GET_STATE",
        });
        applyArmConfig(config);
      });
    } catch (_) {
      /* ignore */
    }
  }

  function hopFields(message) {
    const picks = message && Array.isArray(message.picks) ? message.picks : null;
    return {
      hop: "content",
      type: message && message.type,
      sessionNonce: message && message.sessionNonce != null ? String(message.sessionNonce) : null,
      draftId: message && message.draftId != null ? String(message.draftId) : null,
      protocolVersion: message && message.protocolVersion,
      revision: message && message.revision,
      batchSize: picks ? picks.length : null,
      armedSessionNonce: armedSessionNonce,
    };
  }

  function pathLog(event, extra) {
    try {
      console.info("[espn-bm-path]", event, extra || {});
    } catch (_) {
      /* ignore */
    }
  }

  function emitTelemetry(event, extra) {
    try {
      chrome.runtime
        .sendMessage({
          type: MSG_ESPN_BM_TELEMETRY,
          event: String(event),
          at: new Date().toISOString(),
          ...(extra || {}),
        })
        .catch(function () {});
    } catch (_) {
      /* ignore */
    }
    try {
      console.info("[rfsn-031b-telemetry]", event, extra || {});
    } catch (_) {
      /* ignore */
    }
  }

  function reportDraftAvailability(extra) {
    const href = String(window.location.href || "");
    const urlKind = classifyEspnFantasyUrl(href);
    const leagueId = extractEspnLeagueIdFromUrl(href);
    try {
      chrome.runtime
        .sendMessage({
          type: MSG_ESPN_BM_DRAFT_AVAILABILITY,
          urlKind,
          leagueId,
          hrefHost: (() => {
            try {
              return new URL(href).hostname;
            } catch (_) {
              return null;
            }
          })(),
          readerLifecycle,
          remoteAutoInject,
          ...(extra || {}),
        })
        .catch(function () {});
    } catch (_) {
      /* ignore */
    }
  }

  function readHandshake() {
    try {
      return window[ESPN_READER_HANDSHAKE_KEY] || null;
    } catch (_) {
      return null;
    }
  }

  function runProductionAutoInject(storageEnabled) {
    const href = String(window.location.href || "");
    // Kill switch: remote false always wins. Default (unset + no storage) = off.
    const effective =
      remoteAutoInject === false
        ? false
        : remoteAutoInject === true
          ? true
          : storageEnabled === true;

    void isEspnAutoInjectEnabled(storageEnabled, remoteAutoInject === null ? undefined : remoteAutoInject);

    const plan = planEspnReaderInjection({
      href,
      autoInjectEnabled: effective,
      handshake: readHandshake(),
      alreadyInjecting: autoInjectInFlight,
      injectedThisLoad: autoInjectedThisLoad,
    });

    if (plan.urlKind === "live_draft_room" && effective) {
      emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.draft_room_detected, {
        urlKind: plan.urlKind,
        leagueId: plan.leagueId,
      });
    }

    if (plan.action === "duplicate_prevented") {
      emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.reader_duplicate_prevented, {
        reason: plan.reason,
        leagueId: plan.leagueId,
      });
      if (plan.reason === "compatible_reader_present") {
        readerLifecycle = "reader_ready";
      }
      reportDraftAvailability({ planAction: plan.action, planReason: plan.reason });
      return;
    }

    if (plan.action !== "inject") {
      reportDraftAvailability({ planAction: plan.action, planReason: plan.reason });
      return;
    }

    autoInjectInFlight = true;
    readerLifecycle = "injecting";
    emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.injection_attempted, {
      reason: plan.reason,
      leagueId: plan.leagueId,
      via: "web_accessible_resources_script_tag",
    });
    try {
      var s = document.createElement("script");
      s.src = chrome.runtime.getURL(ESPN_LIVE_READER_ASSET);
      s.async = false;
      s.setAttribute("data-rfsn-espn-live-reader", "1");
      s.onload = function () {
        autoInjectInFlight = false;
        autoInjectedThisLoad = true;
        readerLifecycle = "reader_ready";
        const hs = readHandshake();
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.injection_succeeded, {
          leagueId: plan.leagueId,
          handshake: hs
            ? {
                kind: hs.kind,
                readerVersion: hs.readerVersion,
                protocolVersion: hs.protocolVersion,
              }
            : null,
        });
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.reader_ready, {
          leagueId: plan.leagueId,
        });
        reportDraftAvailability({ planAction: "inject", planReason: "succeeded" });
        try {
          s.remove();
        } catch (_) {
          /* ignore */
        }
        repostArmToPage("auto_inject_ready");
      };
      s.onerror = function () {
        autoInjectInFlight = false;
        readerLifecycle = "error";
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.injection_failed, {
          reason: "script_onerror",
          leagueId: plan.leagueId,
        });
        reportDraftAvailability({ planAction: "inject", planReason: "script_onerror" });
      };
      (document.documentElement || document.head).appendChild(s);
    } catch (err) {
      autoInjectInFlight = false;
      readerLifecycle = "error";
      emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.injection_failed, {
        reason: err && err.message ? String(err.message) : "inject_exception",
        leagueId: plan.leagueId,
      });
      reportDraftAvailability({ planAction: "inject", planReason: "exception" });
    }
  }

  function scheduleAutoInject() {
    try {
      chrome.storage.local.get([ESPN_AUTO_INJECT_STORAGE_KEY], function (res) {
        const stored = res && res[ESPN_AUTO_INJECT_STORAGE_KEY];
        runProductionAutoInject(stored === true);
      });
    } catch (_) {
      runProductionAutoInject(false);
    }
  }

  // RFSN-031B production inject — default off until storage/remote enables.
  try {
    scheduleAutoInject();
  } catch (_) {
    /* ignore */
  }

  // Re-check on SPA URL changes (ESPN draft navigation).
  try {
    let lastHref = String(window.location.href || "");
    setInterval(function () {
      const href = String(window.location.href || "");
      if (href === lastHref) return;
      lastHref = href;
      scheduleAutoInject();
    }, 2000);
  } catch (_) {
    /* ignore */
  }

  function relayToBackground(message) {
    if (message && message.type === "GMWR_ESPN_BM_PICK_BATCH") {
      pathLog("content_relay_PICK_BATCH", hopFields(message));
    }
    try {
      const p = chrome.runtime.sendMessage(message);
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (_) {
      /* ignore */
    }
  }

  // Phase 4 — if background still armed after ESPN tab reload, rehydrate immediately.
  try {
    chrome.runtime.sendMessage({ type: MSG_ESPN_BM_GET_STATE }, function (state) {
      if (chrome.runtime.lastError) return;
      if (!state || !state.armed || !state.config) return;
      const config = validateArmConfig(state.config);
      if (!config) return;
      applyArmConfig(config);
    });
  } catch (_) {
    /* ignore */
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    if (ev.origin !== window.location.origin) return;
    const d = ev.data;
    if (d && d.type === "GMWR_ESPN_BM_PICK_BATCH") {
      pathLog("content_recv_PICK_BATCH", hopFields(d));
    }
    const result = validatePageOutboundMessage(d, {
      requireSessionNonce: armedSessionNonce,
    });
    if (!result.ok || !result.message) {
      if (d && d.type === "GMWR_ESPN_BM_PICK_BATCH") {
        pathLog("content_drop_PICK_BATCH", {
          ...hopFields(d),
          reject: "validatePageOutboundMessage",
          error: result.error || "no_message",
        });
      }
      return;
    }
    if (result.message.type === "GMWR_ESPN_BM_PICK_BATCH") {
      if (!armedSessionNonce) {
        pathLog("content_drop_PICK_BATCH", {
          ...hopFields(result.message),
          reject: "!armedSessionNonce",
          line: "content.js:!armedSessionNonce",
        });
        return;
      }
      if (result.message.sessionNonce !== armedSessionNonce) {
        pathLog("content_drop_PICK_BATCH", {
          ...hopFields(result.message),
          reject: "sessionNonce !== armedSessionNonce",
          line: "content.js:session_nonce_mismatch",
        });
        return;
      }
    }
    if (
      result.message.type === "GMWR_ESPN_BM_STATUS" &&
      shouldRepostArmOnPageStatus(result.message.status)
    ) {
      readerLifecycle = "reader_ready";
      emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.reader_ready, {});
      repostArmToPage("page_status_ready");
    }
    if (result.message.type === "GMWR_ESPN_BM_STATUS") {
      const st = String(result.message.status || "");
      if (st === "armed") readerLifecycle = "armed";
      if (st === "monitoring") readerLifecycle = "capturing";
      if (st === "complete") readerLifecycle = "complete";
      if (st === "disarmed") readerLifecycle = "disconnected";
      if (st === "error") readerLifecycle = "error";
    }
    relayToBackground(result.message);
  });

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== "string") return;
    if (message.type === MSG_ESPN_BM_SET_AUTO_INJECT) {
      remoteAutoInject = message.enabled === true;
      try {
        chrome.storage.local.set({
          [ESPN_AUTO_INJECT_STORAGE_KEY]: remoteAutoInject === true,
        });
      } catch (_) {
        /* ignore */
      }
      scheduleAutoInject();
      sendResponse({ ok: true, enabled: remoteAutoInject });
      return true;
    }
    if (message.type === MSG_ESPN_BM_ARM) {
      const config = validateArmConfig(message.config);
      if (!config) {
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.arm_rejected, {
          reason: "invalid_arm_config",
        });
        sendResponse({ ok: false, error: "invalid_arm_config" });
        return true;
      }
      const pageLeagueId = extractEspnLeagueIdFromUrl(String(window.location.href || ""));
      const enriched = Object.assign({}, config, {
        pageLeagueId: pageLeagueId || undefined,
      });
      emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.arm_sent, {
        leagueId: config.leagueId,
        destination: config.destination,
      });
      applyArmConfig(enriched);
      emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.arm_accepted, {
        leagueId: config.leagueId,
      });
      readerLifecycle = "armed";
      sendResponse({ ok: true, host: "espn", sessionNonce: config.sessionNonce });
      return true;
    }
    if (message.type === MSG_ESPN_BM_DISARM) {
      armedSessionNonce = null;
      lastArmConfig = null;
      readerLifecycle = "disconnected";
      postToPage({ type: "DISARM" });
      postToPage({ type: MSG_ESPN_BM_DISARM });
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === MSG_ESPN_BM_PING) {
      postToPage({ type: "PING" });
      postToPage({ type: MSG_ESPN_BM_PING });
      sendResponse({ ok: true, host: "espn" });
      return true;
    }
    if (message.type === MSG_ESPN_BM_REPLAY_REQUEST) {
      const req = validateReplayRequest(message);
      if (!req) {
        sendResponse({ ok: false, error: "invalid_replay_request" });
        return true;
      }
      if (!armedSessionNonce) {
        sendResponse({ ok: false, error: "not_armed" });
        return true;
      }
      if (req.sessionNonce !== armedSessionNonce) {
        sendResponse({ ok: false, error: "session_nonce_mismatch" });
        return true;
      }
      emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.replay_requested, {
        afterOverallPick: req.afterOverallPick,
      });
      postToPage({
        type: "REPLAY_REQUEST",
        ...req,
      });
      postToPage({
        type: MSG_ESPN_BM_REPLAY_REQUEST,
        ...req,
      });
      sendResponse({ ok: true, host: "espn" });
      return true;
    }
  });
})();
