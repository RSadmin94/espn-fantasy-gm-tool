"use strict";
(() => {
  // espnBookmarkletTransport.js
  var ESPN_BM_PAGE_CHANNEL = "GMWR_ESPN_BM_PAGE";
  var ESPN_BM_PAGE_SOURCE = "espn-bookmarklet";
  var ESPN_BM_CONTENT_SOURCE = "espn-live-content";
  var ESPN_BM_PROVIDER = "espn-live";
  var ESPN_BM_PROTOCOL_VERSION = 1;
  var MSG_ESPN_BM_ARM = "GMWR_ESPN_BM_ARM";
  var MSG_ESPN_BM_DISARM = "GMWR_ESPN_BM_DISARM";
  var MSG_ESPN_BM_PING = "GMWR_ESPN_BM_PING";
  var MSG_ESPN_BM_PONG = "GMWR_ESPN_BM_PONG";
  var MSG_ESPN_BM_STATUS = "GMWR_ESPN_BM_STATUS";
  var MSG_ESPN_BM_PICK_BATCH = "GMWR_ESPN_BM_PICK_BATCH";
  var MSG_ESPN_BM_SESSION_RESET = "GMWR_ESPN_BM_SESSION_RESET";
  var MSG_ESPN_BM_GET_STATE = "GMWR_ESPN_BM_GET_STATE";
  var MSG_ESPN_BM_REPLAY_REQUEST = "GMWR_ESPN_BM_REPLAY_REQUEST";
  var ESPN_BM_PAGE_TO_CONTENT_TYPES = [
    MSG_ESPN_BM_PICK_BATCH,
    MSG_ESPN_BM_STATUS,
    MSG_ESPN_BM_PONG,
    MSG_ESPN_BM_SESSION_RESET
  ];
  function isEspnLiveDraftId(draftId) {
    const id = String(draftId ?? "").trim();
    if (!id.startsWith("espn-live-")) return false;
    if (id.endsWith("-na")) return false;
    return /^espn-live-\d+-\d{4}$/.test(id);
  }
  function validateProtocolVersion(raw) {
    const version = Math.floor(Number(raw));
    if (!Number.isFinite(version) || version !== ESPN_BM_PROTOCOL_VERSION) {
      return { ok: false, error: "unsupported_protocol_version" };
    }
    return { ok: true, version };
  }
  function validatePickBatchRevision(raw) {
    const revision = Math.floor(Number(raw));
    if (!Number.isFinite(revision) || revision < 1) {
      return { ok: false, error: "invalid_revision" };
    }
    return { ok: true, revision };
  }
  function withProtocolVersion(fields) {
    return { protocolVersion: ESPN_BM_PROTOCOL_VERSION, ...fields };
  }
  function shouldRepostArmOnPageStatus(status) {
    return String(status ?? "") === "ready";
  }
  function validateArmConfig(raw) {
    if (!raw || typeof raw !== "object") return null;
    const c = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const leagueId = String(c.leagueId ?? "").trim();
    const season = Math.floor(Number(c.season));
    const sessionNonce = String(c.sessionNonce ?? "").trim();
    if (!/^\d+$/.test(leagueId)) return null;
    if (!Number.isFinite(season) || season < 2e3 || season > 2100) return null;
    if (!sessionNonce || sessionNonce.length > 128) return null;
    const draftPace = c.draftPace;
    const pace = draftPace === "broadcast" || draftPace === "brisk" || draftPace === "turbo" ? draftPace : void 0;
    return {
      leagueId,
      season,
      sessionNonce: sessionNonce.slice(0, 128),
      draftPace: pace
    };
  }
  function validateReplayRequest(raw) {
    if (!raw || typeof raw !== "object") return null;
    const c = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const draftId = String(c.draftId ?? "").trim();
    const sessionNonce = String(c.sessionNonce ?? "").trim();
    const afterOverallPick = Math.floor(Number(c.afterOverallPick));
    const requestId = String(c.requestId ?? "").trim();
    if (!isEspnLiveDraftId(draftId)) return null;
    if (!sessionNonce || sessionNonce.length > 128) return null;
    if (!Number.isFinite(afterOverallPick) || afterOverallPick < 0) return null;
    if (!requestId || requestId.length > 128) return null;
    return {
      draftId: draftId.slice(0, 128),
      sessionNonce: sessionNonce.slice(0, 128),
      afterOverallPick,
      requestId: requestId.slice(0, 128)
    };
  }
  function validateTransportPick(row) {
    if (!row || typeof row !== "object") return null;
    const r = (
      /** @type {Record<string, unknown>} */
      row
    );
    const eventKey = String(r.eventKey ?? "").trim();
    const overallPick = Math.floor(Number(r.overallPick));
    const round = Math.floor(Number(r.round));
    const pickInRound = Math.floor(Number(r.pickInRound));
    const playerName = String(r.playerName ?? "").trim();
    const playerId = String(r.playerId ?? "").trim();
    if (!eventKey || eventKey.length > 200) return null;
    if (!Number.isFinite(overallPick) || overallPick < 1) return null;
    if (!Number.isFinite(round) || round < 1) return null;
    if (!Number.isFinite(pickInRound) || pickInRound < 1) return null;
    if (!playerName || playerName.length > 120) return null;
    if (!playerId || playerId.length > 160) return null;
    const playerIdSource = r.playerIdSource === "espn" || r.playerIdSource === "synthetic" ? r.playerIdSource : null;
    if (!playerIdSource) return null;
    return {
      eventKey: eventKey.slice(0, 200),
      overallPick,
      round,
      pickInRound,
      teamId: String(r.teamId ?? "").trim().slice(0, 64) || `slot-${pickInRound}`,
      teamName: String(r.teamName ?? "").trim().slice(0, 80) || "Team",
      ownerName: String(r.ownerName ?? r.teamName ?? "").trim().slice(0, 80) || "Team",
      playerId: playerId.slice(0, 160),
      playerName: playerName.slice(0, 120),
      position: String(r.position ?? "UNK").trim().slice(0, 8) || "UNK",
      nflTeam: r.nflTeam != null && String(r.nflTeam).trim() ? String(r.nflTeam).trim().slice(0, 8) : null,
      isKeeper: Boolean(r.isKeeper),
      isTradedPick: Boolean(r.isTradedPick),
      playerIdSource
    };
  }
  function validatePageOutboundMessage(data, opts = {}) {
    if (!data || typeof data !== "object") return { ok: false, error: "not_object" };
    const d = (
      /** @type {Record<string, unknown>} */
      data
    );
    if (d.channel !== ESPN_BM_PAGE_CHANNEL) return { ok: false, error: "wrong_channel" };
    if (d.source !== ESPN_BM_PAGE_SOURCE) return { ok: false, error: "wrong_source" };
    if (d.provider != null && d.provider !== ESPN_BM_PROVIDER) {
      return { ok: false, error: "wrong_provider" };
    }
    const protocol = validateProtocolVersion(d.protocolVersion);
    if (!protocol.ok) return protocol;
    const type = String(d.type ?? "");
    if (!ESPN_BM_PAGE_TO_CONTENT_TYPES.includes(type)) {
      return { ok: false, error: "wrong_type" };
    }
    if (type === MSG_ESPN_BM_PICK_BATCH) {
      const draftId = String(d.draftId ?? "").trim();
      const leagueId = String(d.leagueId ?? "").trim();
      const season = Math.floor(Number(d.season));
      const sessionNonce = String(d.sessionNonce ?? "").trim();
      if (!isEspnLiveDraftId(draftId)) return { ok: false, error: "invalid_draft_id" };
      if (!/^\d+$/.test(leagueId)) return { ok: false, error: "invalid_league_id" };
      if (!Number.isFinite(season) || season < 2e3 || season > 2100) {
        return { ok: false, error: "invalid_season" };
      }
      if (!sessionNonce || sessionNonce.length > 128) {
        return { ok: false, error: "invalid_session_nonce" };
      }
      if (opts.requireSessionNonce != null && opts.requireSessionNonce !== "" && sessionNonce !== opts.requireSessionNonce) {
        return { ok: false, error: "session_nonce_mismatch" };
      }
      if (!Array.isArray(d.picks)) return { ok: false, error: "picks_not_array" };
      if (d.picks.length > 256) return { ok: false, error: "picks_too_many" };
      if (d.picks.length === 0 && !d.draftComplete) {
        return { ok: false, error: "empty_non_complete_batch" };
      }
      const picks = [];
      for (const row of d.picks) {
        const v = validateTransportPick(row);
        if (v) picks.push(v);
      }
      if (d.picks.length > 0 && picks.length === 0) {
        return { ok: false, error: "no_valid_picks" };
      }
      const revisionCheck = validatePickBatchRevision(d.revision);
      if (!revisionCheck.ok) return revisionCheck;
      return {
        ok: true,
        message: withProtocolVersion({
          type: MSG_ESPN_BM_PICK_BATCH,
          provider: ESPN_BM_PROVIDER,
          draftType: "live",
          draftId: draftId.slice(0, 128),
          leagueId,
          season,
          sessionNonce: sessionNonce.slice(0, 128),
          revision: revisionCheck.revision,
          teamCount: Math.max(0, Math.floor(Number(d.teamCount)) || 0),
          draftComplete: Boolean(d.draftComplete),
          baselineOnly: Boolean(d.baselineOnly),
          liveNotify: Boolean(d.liveNotify),
          observedAt: typeof d.observedAt === "string" ? d.observedAt.slice(0, 40) : (/* @__PURE__ */ new Date()).toISOString(),
          picks,
          diagnostics: d.diagnostics && typeof d.diagnostics === "object" ? {
            picksEmitted: Number(
              /** @type {any} */
              d.diagnostics.picksEmitted
            ) || 0,
            duplicatesSuppressed: Number(
              /** @type {any} */
              d.diagnostics.duplicatesSuppressed
            ) || 0,
            rowsScanned: Number(
              /** @type {any} */
              d.diagnostics.rowsScanned
            ) || 0,
            baselineOnly: Boolean(
              /** @type {any} */
              d.diagnostics.baselineOnly
            ),
            liveNotify: Boolean(
              /** @type {any} */
              d.diagnostics.liveNotify
            ),
            replay: Boolean(
              /** @type {any} */
              d.diagnostics.replay
            ),
            replayRequestId: typeof /** @type {any} */
            d.diagnostics.replayRequestId === "string" ? String(
              /** @type {any} */
              d.diagnostics.replayRequestId
            ).slice(0, 128) : void 0,
            afterOverallPick: Number.isFinite(Number(
              /** @type {any} */
              d.diagnostics.afterOverallPick
            )) ? Math.floor(Number(
              /** @type {any} */
              d.diagnostics.afterOverallPick
            )) : void 0
          } : null
        })
      };
    }
    if (type === MSG_ESPN_BM_STATUS) {
      const revision = d.revision != null && Number.isFinite(Number(d.revision)) ? Math.max(0, Math.floor(Number(d.revision))) : 0;
      return {
        ok: true,
        message: withProtocolVersion({
          type: MSG_ESPN_BM_STATUS,
          provider: ESPN_BM_PROVIDER,
          revision,
          status: String(d.status ?? "unknown").slice(0, 40),
          reason: d.reason != null ? String(d.reason).slice(0, 80) : null,
          draftId: d.draftId != null ? String(d.draftId).slice(0, 128) : null,
          leagueId: d.leagueId != null ? String(d.leagueId).slice(0, 32) : null,
          season: d.season != null && Number.isFinite(Number(d.season)) ? Number(d.season) : null,
          sessionNonce: d.sessionNonce != null ? String(d.sessionNonce).slice(0, 128) : null,
          draftComplete: d.draftComplete != null ? Boolean(d.draftComplete) : void 0,
          baselineOnly: d.baselineOnly != null ? Boolean(d.baselineOnly) : void 0,
          diagnostics: d.diagnostics && typeof d.diagnostics === "object" ? d.diagnostics : null
        })
      };
    }
    if (type === MSG_ESPN_BM_PONG) {
      const revision = d.revision != null && Number.isFinite(Number(d.revision)) ? Math.max(0, Math.floor(Number(d.revision))) : 0;
      return {
        ok: true,
        message: withProtocolVersion({
          type: MSG_ESPN_BM_PONG,
          provider: ESPN_BM_PROVIDER,
          revision,
          armed: Boolean(d.armed),
          draftId: d.draftId != null ? String(d.draftId).slice(0, 128) : null,
          leagueId: d.leagueId != null ? String(d.leagueId).slice(0, 32) : null,
          season: d.season != null && Number.isFinite(Number(d.season)) ? Number(d.season) : null,
          sessionNonce: d.sessionNonce != null ? String(d.sessionNonce).slice(0, 128) : null
        })
      };
    }
    if (type === MSG_ESPN_BM_SESSION_RESET) {
      const draftId = String(d.draftId ?? "").trim();
      if (draftId && !isEspnLiveDraftId(draftId)) {
        return { ok: false, error: "invalid_draft_id" };
      }
      return {
        ok: true,
        message: withProtocolVersion({
          type: MSG_ESPN_BM_SESSION_RESET,
          provider: ESPN_BM_PROVIDER,
          draftId: draftId ? draftId.slice(0, 128) : null,
          leagueId: d.leagueId != null ? String(d.leagueId).slice(0, 32) : null,
          sessionNonce: d.sessionNonce != null ? String(d.sessionNonce).slice(0, 128) : null
        })
      };
    }
    return { ok: false, error: "unhandled_type" };
  }

  // providers/espn-live/content.js
  (function espnLiveBookmarkletContent() {
    "use strict";
    let armedSessionNonce = null;
    let lastArmConfig = null;
    let boardMirrorInjected = false;
    function pathLog(event, extra) {
      try {
        console.info("[espn-bm-path]", event, extra || {});
      } catch (_) {
      }
    }
    function injectBoardMirrorIfNeeded(reason) {
      if (boardMirrorInjected) return;
      try {
        if (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.rfsnBoardMirror === "1") {
          boardMirrorInjected = true;
          pathLog("content_board_mirror_already_present", { reason: reason || "dataset" });
          return;
        }
        var s = document.createElement("script");
        s.src = chrome.runtime.getURL("providers/espn-live/board-mirror.iife.js");
        s.async = false;
        s.setAttribute("data-rfsn-ext", "1");
        (document.documentElement || document.head).appendChild(s);
        s.onload = function() {
          try {
            s.remove();
          } catch (_) {
          }
        };
        boardMirrorInjected = true;
        pathLog("content_inject_board_mirror", { reason: reason || "arm", ok: true });
      } catch (err) {
        pathLog("content_inject_board_mirror", {
          reason: reason || "arm",
          ok: false,
          error: err && err.message ? String(err.message) : "inject_failed"
        });
        try {
          chrome.runtime.sendMessage({
            type: MSG_ESPN_BM_STATUS,
            protocolVersion: ESPN_BM_PROTOCOL_VERSION,
            provider: "espn-live",
            status: "mirror_inject_failed",
            reason: err && err.message ? String(err.message) : "inject_failed"
          });
        } catch (_) {
        }
      }
    }
    function postToPage(payload) {
      window.postMessage(
        Object.assign(
          {
            channel: ESPN_BM_PAGE_CHANNEL,
            source: ESPN_BM_CONTENT_SOURCE,
            protocolVersion: ESPN_BM_PROTOCOL_VERSION
          },
          payload
        ),
        window.location.origin
      );
    }
    function applyArmConfig(config) {
      armedSessionNonce = config.sessionNonce;
      lastArmConfig = config;
      postToPage({ type: "ARM", config });
      postToPage({ type: MSG_ESPN_BM_ARM, config });
    }
    function repostArmToPage(reason) {
      if (lastArmConfig) {
        pathLog("content_repost_ARM", {
          reason: reason || "cached",
          sessionNonce: lastArmConfig.sessionNonce,
          via: "lastArmConfig"
        });
        applyArmConfig(lastArmConfig);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: MSG_ESPN_BM_GET_STATE }, function(state) {
          if (chrome.runtime.lastError) return;
          if (!state || !state.armed || !state.config) return;
          const config = validateArmConfig(state.config);
          if (!config) return;
          pathLog("content_repost_ARM", {
            reason: reason || "get_state",
            sessionNonce: config.sessionNonce,
            via: "GET_STATE"
          });
          applyArmConfig(config);
        });
      } catch (_) {
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
        armedSessionNonce
      };
    }
    function relayToBackground(message) {
      if (message && message.type === "GMWR_ESPN_BM_PICK_BATCH") {
        pathLog("content_relay_PICK_BATCH", hopFields(message));
      }
      try {
        const p = chrome.runtime.sendMessage(message);
        if (p && typeof p.catch === "function") p.catch(function() {
        });
      } catch (_) {
      }
    }
    injectBoardMirrorIfNeeded("content_boot");
    try {
      chrome.runtime.sendMessage({ type: MSG_ESPN_BM_GET_STATE }, function(state) {
        if (chrome.runtime.lastError) return;
        if (!state || !state.armed || !state.config) return;
        const config = validateArmConfig(state.config);
        if (!config) return;
        injectBoardMirrorIfNeeded("rehydrate_arm");
        applyArmConfig(config);
      });
    } catch (_) {
    }
    window.addEventListener("message", function(ev) {
      if (ev.source !== window) return;
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (d && d.type === "GMWR_ESPN_BM_PICK_BATCH") {
        pathLog("content_recv_PICK_BATCH", hopFields(d));
      }
      const result = validatePageOutboundMessage(d, {
        requireSessionNonce: armedSessionNonce
      });
      if (!result.ok || !result.message) {
        if (d && d.type === "GMWR_ESPN_BM_PICK_BATCH") {
          pathLog("content_drop_PICK_BATCH", {
            ...hopFields(d),
            reject: "validatePageOutboundMessage",
            error: result.error || "no_message"
          });
        }
        return;
      }
      if (result.message.type === "GMWR_ESPN_BM_PICK_BATCH") {
        if (!armedSessionNonce) {
          pathLog("content_drop_PICK_BATCH", {
            ...hopFields(result.message),
            reject: "!armedSessionNonce",
            line: "content.js:!armedSessionNonce"
          });
          return;
        }
        if (result.message.sessionNonce !== armedSessionNonce) {
          pathLog("content_drop_PICK_BATCH", {
            ...hopFields(result.message),
            reject: "sessionNonce !== armedSessionNonce",
            line: "content.js:session_nonce_mismatch"
          });
          return;
        }
      }
      if (result.message.type === "GMWR_ESPN_BM_STATUS" && shouldRepostArmOnPageStatus(result.message.status)) {
        repostArmToPage("page_status_ready");
      }
      relayToBackground(result.message);
    });
    chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
      if (!message || typeof message.type !== "string") return;
      if (message.type === MSG_ESPN_BM_ARM) {
        const config = validateArmConfig(message.config);
        if (!config) {
          sendResponse({ ok: false, error: "invalid_arm_config" });
          return true;
        }
        injectBoardMirrorIfNeeded("arm");
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
          ...req
        });
        postToPage({
          type: MSG_ESPN_BM_REPLAY_REQUEST,
          ...req
        });
        sendResponse({ ok: true, host: "espn" });
        return true;
      }
    });
  })();
})();
