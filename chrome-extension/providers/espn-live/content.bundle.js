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
  var MSG_ESPN_BM_SET_AUTO_INJECT = "GMWR_ESPN_BM_SET_AUTO_INJECT";
  var MSG_ESPN_BM_DRAFT_AVAILABILITY = "GMWR_ESPN_BM_DRAFT_AVAILABILITY";
  var MSG_ESPN_BM_TELEMETRY = "GMWR_ESPN_BM_TELEMETRY";
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
    const destinationRaw = String(c.destination ?? "live-draft").trim();
    if (!/^[a-z0-9_-]{1,64}$/i.test(destinationRaw)) return null;
    const draftPace = c.draftPace;
    const pace = draftPace === "broadcast" || draftPace === "brisk" || draftPace === "turbo" ? draftPace : void 0;
    return {
      leagueId,
      season,
      sessionNonce: sessionNonce.slice(0, 128),
      destination: destinationRaw.toLowerCase(),
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

  // espnLiveDraftRoom.js
  function classifyEspnFantasyUrl(href) {
    let u;
    try {
      u = new URL(String(href || ""));
    } catch {
      return "unsupported";
    }
    const host = u.hostname.toLowerCase();
    if (!/(^|\.)espn\.com$/i.test(host) && host !== "fantasy.espn.com") {
      return "unsupported";
    }
    const path = (u.pathname || "").toLowerCase();
    const search = u.search || "";
    if (/draftrecap/i.test(path) || /[?&]view=draftrecap/i.test(search)) {
      return "draft_recap";
    }
    if (/\/history\b/i.test(path) || /\/league\/history/i.test(path)) {
      return "historical";
    }
    if (/\/football\/draft\/?$/i.test(path) || /\/football\/league\/draft\/?$/i.test(path) || /\/ffl\/draft\/?$/i.test(path) || /\/football\/draft\//i.test(path)) {
      if (!/recap/i.test(path)) return "live_draft_room";
    }
    if (/\/football\/league\/?$/i.test(path) && /[?&]draft=/i.test(search)) {
      return "live_draft_room";
    }
    if (/\/football\/league\/?$/i.test(path) || /\/football\/team\b/i.test(path)) {
      return "league_home";
    }
    if (/\/football\b/i.test(path)) {
      return "unsupported";
    }
    return "unsupported";
  }
  function isSupportedEspnLiveDraftRoomUrl(href) {
    return classifyEspnFantasyUrl(href) === "live_draft_room";
  }
  function extractEspnLeagueIdFromUrl(href) {
    try {
      const u = new URL(String(href || ""));
      const qp = u.searchParams.get("leagueId") || u.searchParams.get("league_id");
      if (qp && /^\d+$/.test(String(qp).trim())) return String(qp).trim();
      const m = String(href).match(/[?&]leagueId=(\d+)/i) || String(href).match(/[?&]league_id=(\d+)/i);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  // espnAutoInject.js
  var ESPN_AUTO_INJECT_STORAGE_KEY = "rfsnEspnAutoInjectEnabled";
  var ESPN_READER_HANDSHAKE_KEY = "__RFSN_ESPN_LIVE_READER__";
  var ESPN_LIVE_READER_VERSION = "1.0.0";
  var ESPN_LIVE_CONNECTOR_PROTOCOL_VERSION = 1;
  var ESPN_LIVE_READER_ASSET = "providers/espn-live/espn-live-reader.iife.js";
  function isEspnAutoInjectEnabled(stored, remoteEnabled) {
    if (remoteEnabled === false) return false;
    if (stored === true || stored === "true" || stored === 1) {
      if (remoteEnabled === void 0 || remoteEnabled === null) return true;
      return remoteEnabled === true;
    }
    return false;
  }
  function hasCompatibleEspnReaderHandshake(handshake, expect = {}) {
    if (!handshake || typeof handshake !== "object") return false;
    const h = (
      /** @type {Record<string, unknown>} */
      handshake
    );
    if (h.kind !== "espn-live-reader") return false;
    const proto = Number(h.protocolVersion);
    const expectProto = Number(expect.protocolVersion ?? ESPN_LIVE_CONNECTOR_PROTOCOL_VERSION);
    if (!Number.isFinite(proto) || proto !== expectProto) return false;
    const ver = String(h.readerVersion ?? "");
    const expectVer = String(expect.readerVersion ?? ESPN_LIVE_READER_VERSION);
    if (!ver || ver !== expectVer) return false;
    return true;
  }
  function isStaleOrIncompatibleEspnReader(handshake) {
    if (!handshake || typeof handshake !== "object") return false;
    const h = (
      /** @type {Record<string, unknown>} */
      handshake
    );
    if (h.kind === "espn-live-reader" && !hasCompatibleEspnReaderHandshake(h)) {
      return true;
    }
    if (h.marker === "rfsn-031a-spike" || h.spike === true) return true;
    return false;
  }
  function planEspnReaderInjection(args) {
    const href = String(args.href || "");
    const urlKind = classifyEspnFantasyUrl(href);
    const leagueId = extractEspnLeagueIdFromUrl(href);
    if (!args.autoInjectEnabled) {
      return {
        action: "skip",
        reason: "auto_inject_disabled",
        urlKind,
        leagueId
      };
    }
    if (urlKind !== "live_draft_room" || !isSupportedEspnLiveDraftRoomUrl(href)) {
      return {
        action: "unsupported",
        reason: "not_live_draft_room",
        urlKind,
        leagueId
      };
    }
    if (args.alreadyInjecting || args.injectedThisLoad) {
      return {
        action: "duplicate_prevented",
        reason: args.alreadyInjecting ? "injecting" : "already_injected_this_load",
        urlKind,
        leagueId
      };
    }
    if (hasCompatibleEspnReaderHandshake(args.handshake)) {
      return {
        action: "duplicate_prevented",
        reason: "compatible_reader_present",
        urlKind,
        leagueId
      };
    }
    return {
      action: "inject",
      reason: isStaleOrIncompatibleEspnReader(args.handshake) ? "replace_stale_or_incompatible" : "not_present",
      urlKind,
      leagueId
    };
  }
  var ESPN_AUTO_INJECT_TELEMETRY = Object.freeze({
    draft_room_detected: "draft_room_detected",
    injection_attempted: "injection_attempted",
    injection_succeeded: "injection_succeeded",
    injection_failed: "injection_failed",
    reader_ready: "reader_ready",
    reader_duplicate_prevented: "reader_duplicate_prevented",
    league_matched: "league_matched",
    league_mismatched: "league_mismatched",
    arm_sent: "arm_sent",
    arm_accepted: "arm_accepted",
    arm_rejected: "arm_rejected",
    first_batch_received: "first_batch_received",
    reconnect_started: "reconnect_started",
    reconnect_completed: "reconnect_completed",
    replay_requested: "replay_requested",
    replay_completed: "replay_completed",
    capture_completed: "capture_completed"
  });

  // providers/espn-live/content.js
  (function espnLiveBookmarkletContent() {
    "use strict";
    let armedSessionNonce = null;
    let lastArmConfig = null;
    var RFSN_031A_SPIKE_ENABLED = false;
    void RFSN_031A_SPIKE_ENABLED;
    let remoteAutoInject = null;
    let autoInjectInFlight = false;
    let autoInjectedThisLoad = false;
    let readerLifecycle = "not_present";
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
    function pathLog(event, extra) {
      try {
        console.info("[espn-bm-path]", event, extra || {});
      } catch (_) {
      }
    }
    function emitTelemetry(event, extra) {
      try {
        chrome.runtime.sendMessage({
          type: MSG_ESPN_BM_TELEMETRY,
          event: String(event),
          at: (/* @__PURE__ */ new Date()).toISOString(),
          ...extra || {}
        }).catch(function() {
        });
      } catch (_) {
      }
      try {
        console.info("[rfsn-031b-telemetry]", event, extra || {});
      } catch (_) {
      }
    }
    function reportDraftAvailability(extra) {
      const href = String(window.location.href || "");
      const urlKind = classifyEspnFantasyUrl(href);
      const leagueId = extractEspnLeagueIdFromUrl(href);
      try {
        chrome.runtime.sendMessage({
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
          ...extra || {}
        }).catch(function() {
        });
      } catch (_) {
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
      const effective = remoteAutoInject === false ? false : remoteAutoInject === true ? true : storageEnabled === true;
      void isEspnAutoInjectEnabled(storageEnabled, remoteAutoInject === null ? void 0 : remoteAutoInject);
      const plan = planEspnReaderInjection({
        href,
        autoInjectEnabled: effective,
        handshake: readHandshake(),
        alreadyInjecting: autoInjectInFlight,
        injectedThisLoad: autoInjectedThisLoad
      });
      if (plan.urlKind === "live_draft_room" && effective) {
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.draft_room_detected, {
          urlKind: plan.urlKind,
          leagueId: plan.leagueId
        });
      }
      if (plan.action === "duplicate_prevented") {
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.reader_duplicate_prevented, {
          reason: plan.reason,
          leagueId: plan.leagueId
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
        via: "web_accessible_resources_script_tag"
      });
      try {
        var s = document.createElement("script");
        s.src = chrome.runtime.getURL(ESPN_LIVE_READER_ASSET);
        s.async = false;
        s.setAttribute("data-rfsn-espn-live-reader", "1");
        s.onload = function() {
          autoInjectInFlight = false;
          autoInjectedThisLoad = true;
          readerLifecycle = "reader_ready";
          const hs = readHandshake();
          emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.injection_succeeded, {
            leagueId: plan.leagueId,
            handshake: hs ? {
              kind: hs.kind,
              readerVersion: hs.readerVersion,
              protocolVersion: hs.protocolVersion
            } : null
          });
          emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.reader_ready, {
            leagueId: plan.leagueId
          });
          reportDraftAvailability({ planAction: "inject", planReason: "succeeded" });
          try {
            s.remove();
          } catch (_) {
          }
          repostArmToPage("auto_inject_ready");
        };
        s.onerror = function() {
          autoInjectInFlight = false;
          readerLifecycle = "error";
          emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.injection_failed, {
            reason: "script_onerror",
            leagueId: plan.leagueId
          });
          reportDraftAvailability({ planAction: "inject", planReason: "script_onerror" });
        };
        (document.documentElement || document.head).appendChild(s);
      } catch (err) {
        autoInjectInFlight = false;
        readerLifecycle = "error";
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.injection_failed, {
          reason: err && err.message ? String(err.message) : "inject_exception",
          leagueId: plan.leagueId
        });
        reportDraftAvailability({ planAction: "inject", planReason: "exception" });
      }
    }
    function scheduleAutoInject() {
      try {
        chrome.storage.local.get([ESPN_AUTO_INJECT_STORAGE_KEY], function(res) {
          const stored = res && res[ESPN_AUTO_INJECT_STORAGE_KEY];
          runProductionAutoInject(stored === true);
        });
      } catch (_) {
        runProductionAutoInject(false);
      }
    }
    try {
      scheduleAutoInject();
    } catch (_) {
    }
    try {
      let lastHref = String(window.location.href || "");
      setInterval(function() {
        const href = String(window.location.href || "");
        if (href === lastHref) return;
        lastHref = href;
        scheduleAutoInject();
      }, 2e3);
    } catch (_) {
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
    try {
      chrome.runtime.sendMessage({ type: MSG_ESPN_BM_GET_STATE }, function(state) {
        if (chrome.runtime.lastError) return;
        if (!state || !state.armed || !state.config) return;
        const config = validateArmConfig(state.config);
        if (!config) return;
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
    chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
      if (!message || typeof message.type !== "string") return;
      if (message.type === MSG_ESPN_BM_SET_AUTO_INJECT) {
        remoteAutoInject = message.enabled === true;
        try {
          chrome.storage.local.set({
            [ESPN_AUTO_INJECT_STORAGE_KEY]: remoteAutoInject === true
          });
        } catch (_) {
        }
        scheduleAutoInject();
        sendResponse({ ok: true, enabled: remoteAutoInject });
        return true;
      }
      if (message.type === MSG_ESPN_BM_ARM) {
        const config = validateArmConfig(message.config);
        if (!config) {
          emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.arm_rejected, {
            reason: "invalid_arm_config"
          });
          sendResponse({ ok: false, error: "invalid_arm_config" });
          return true;
        }
        const pageLeagueId = extractEspnLeagueIdFromUrl(String(window.location.href || ""));
        const enriched = Object.assign({}, config, {
          pageLeagueId: pageLeagueId || void 0
        });
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.arm_sent, {
          leagueId: config.leagueId,
          destination: config.destination
        });
        applyArmConfig(enriched);
        emitTelemetry(ESPN_AUTO_INJECT_TELEMETRY.arm_accepted, {
          leagueId: config.leagueId
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
          afterOverallPick: req.afterOverallPick
        });
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
