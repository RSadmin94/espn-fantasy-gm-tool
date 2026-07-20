/**
 * Phase 2 — ESPN bookmarklet transport content script (isolated world).
 * Relays GMWR_ESPN_BM_* page messages ↔ background. No DOM parsing / observers.
 * Phase 4 — rehydrate ARM from background after tab reload; relay REPLAY_REQUEST.
 */
import {
  ESPN_BM_CONTENT_SOURCE,
  ESPN_BM_PAGE_CHANNEL,
  ESPN_BM_PROTOCOL_VERSION,
  MSG_ESPN_BM_ARM,
  MSG_ESPN_BM_DISARM,
  MSG_ESPN_BM_GET_STATE,
  MSG_ESPN_BM_PING,
  MSG_ESPN_BM_REPLAY_REQUEST,
  shouldRepostArmOnPageStatus,
  validateArmConfig,
  validatePageOutboundMessage,
  validateReplayRequest,
} from "../../espnBookmarkletTransport.js";

(function espnLiveBookmarkletContent() {
  "use strict";

  /** @type {string|null} */
  let armedSessionNonce = null;
  /** @type {{ leagueId: string, season: number, sessionNonce: string, draftPace?: string }|null} */
  let lastArmConfig = null;

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
   * Re-post ARM into the page after Board Mirror attaches its listener
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
    // STATUS "ready" / early messages may lack nonce before ARM — allow STATUS/PONG
    // without nonce match when not armed; PICK_BATCH always requires armed nonce.
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
    // Board Mirror just attached its inbound listener — re-post ARM so publisher.arm runs.
    if (
      result.message.type === "GMWR_ESPN_BM_STATUS" &&
      shouldRepostArmOnPageStatus(result.message.status)
    ) {
      repostArmToPage("page_status_ready");
    }
    relayToBackground(result.message);
  });

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== "string") return;
    if (message.type === MSG_ESPN_BM_ARM) {
      const config = validateArmConfig(message.config);
      if (!config) {
        sendResponse({ ok: false, error: "invalid_arm_config" });
        return true;
      }
      applyArmConfig(config);
      sendResponse({ ok: true, host: "espn", sessionNonce: config.sessionNonce });
      return true;
    }
    if (message.type === MSG_ESPN_BM_DISARM) {
      armedSessionNonce = null;
      lastArmConfig = null;
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
