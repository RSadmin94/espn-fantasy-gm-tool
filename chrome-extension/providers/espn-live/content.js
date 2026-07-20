/**
 * Phase 2 — ESPN bookmarklet transport content script (isolated world).
 * Relays GMWR_ESPN_BM_* page messages ↔ background. No DOM parsing / observers.
 */
import {
  ESPN_BM_CONTENT_SOURCE,
  ESPN_BM_PAGE_CHANNEL,
  MSG_ESPN_BM_ARM,
  MSG_ESPN_BM_DISARM,
  MSG_ESPN_BM_PING,
  validateArmConfig,
  validatePageOutboundMessage,
} from "../../espnBookmarkletTransport.js";

(function espnLiveBookmarkletContent() {
  "use strict";

  /** @type {string|null} */
  let armedSessionNonce = null;

  function postToPage(payload) {
    window.postMessage(
      Object.assign(
        { channel: ESPN_BM_PAGE_CHANNEL, source: ESPN_BM_CONTENT_SOURCE },
        payload,
      ),
      window.location.origin,
    );
  }

  function relayToBackground(message) {
    try {
      const p = chrome.runtime.sendMessage(message);
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (_) {
      /* ignore */
    }
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    if (ev.origin !== window.location.origin) return;
    const d = ev.data;
    const result = validatePageOutboundMessage(d, {
      requireSessionNonce: armedSessionNonce,
    });
    if (!result.ok || !result.message) return;
    // STATUS "ready" / early messages may lack nonce before ARM — allow STATUS/PONG
    // without nonce match when not armed; PICK_BATCH always requires armed nonce.
    if (result.message.type === "GMWR_ESPN_BM_PICK_BATCH") {
      if (!armedSessionNonce) return;
      if (result.message.sessionNonce !== armedSessionNonce) return;
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
      armedSessionNonce = config.sessionNonce;
      postToPage({ type: "ARM", config });
      postToPage({ type: MSG_ESPN_BM_ARM, config });
      sendResponse({ ok: true, host: "espn", sessionNonce: config.sessionNonce });
      return true;
    }
    if (message.type === MSG_ESPN_BM_DISARM) {
      armedSessionNonce = null;
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
  });
})();
