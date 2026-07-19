/**
 * RFSN-030C — FantasyPros solo mock page-world observer.
 * Injected into draftwizard.fantasypros.com (page world) so it can read __debugStore.
 * Emits only sanitized pick/session payloads — never the full Vue store.
 */
(function fantasyProsPageObserver() {
  "use strict";

  var CHANNEL = "GMWR_FP_MOCK_PAGE";
  var MAX_STORE_WAIT_MS = 45000;
  var INITIAL_BACKOFF_MS = 250;
  var MAX_BACKOFF_MS = 4000;
  var POLL_MS_WHEN_ARMED = 400;

  var armed = false;
  var sessionConfig = null;
  var baselineKeys = new Set();
  var lastProviderDraftId = null;
  var lastPickCount = 0;
  var pollTimer = null;
  var waitStartedAt = 0;
  var backoffMs = INITIAL_BACKOFF_MS;
  var restartCount = 0;
  var generatedSessionKey = null;
  var diagnostics = {
    provider: "fantasypros",
    picksObserved: 0,
    picksEmitted: 0,
    duplicatesSuppressed: 0,
    observerRestarts: 0,
    lastEventAt: null,
    lastError: null,
  };

  function postToContent(payload) {
    try {
      window.postMessage(
        Object.assign({ channel: CHANNEL, source: "fantasypros-page-observer" }, payload),
        window.location.origin,
      );
    } catch (_) {
      /* ignore */
    }
  }

  function readStore() {
    try {
      var store = window.__debugStore;
      if (!store || !store.draftState) return null;
      var ds = store.draftState;
      var drafted = Array.isArray(ds.draftedPlayers) ? ds.draftedPlayers : null;
      if (!drafted) return null;
      var playerMap = {};
      try {
        playerMap =
          (store.playerMap && typeof store.playerMap === "object" && store.playerMap) ||
          (ds.playerMap && typeof ds.playerMap === "object" && ds.playerMap) ||
          (window.draftRoomData && window.draftRoomData.playerData) ||
          {};
      } catch (_) {
        playerMap = {};
      }
      var mockDraftKey =
        (ds.mockDraftKey && String(ds.mockDraftKey)) ||
        (store.mockDraftKey && String(store.mockDraftKey)) ||
        null;
      var dcId =
        (ds.dcId && String(ds.dcId)) ||
        (store.dcId && String(store.dcId)) ||
        (window.draftRoomData && window.draftRoomData.dcId && String(window.draftRoomData.dcId)) ||
        null;
      return {
        vueDraftTarget: store.vueDraftTarget != null ? String(store.vueDraftTarget) : ds.vueDraftTarget != null ? String(ds.vueDraftTarget) : "local",
        isMultiUserDraft: Boolean(store.isMultiUserDraft || ds.isMultiUserDraft),
        draftedPlayers: drafted,
        playerMap: playerMap,
        overallPick: Number(ds.overallPick || ds.pick || drafted.length || 0),
        teamCount: Number(ds.teamCount || (ds.teams && ds.teams.length) || 0) || null,
        draftComplete: Boolean(ds.draftComplete || ds.isComplete),
        mockDraftKey: mockDraftKey,
        dcId: dcId,
      };
    } catch (err) {
      diagnostics.lastError = "store_read_failed";
      return null;
    }
  }

  function resolveSessionKey(snap) {
    if (snap.mockDraftKey) return { key: String(snap.mockDraftKey), source: "mockDraftKey" };
    if (snap.dcId) return { key: String(snap.dcId), source: "dcId" };
    if (!generatedSessionKey) {
      generatedSessionKey =
        "gen-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
    }
    return { key: generatedSessionKey, source: "generated" };
  }

  function draftIdFor(key) {
    var safe = String(key).replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 96);
    return "fp-mock-" + safe;
  }

  function pickKey(overallPick, playerId) {
    return String(overallPick) + ":" + String(playerId);
  }

  function sanitizeRow(row) {
    if (!row || typeof row !== "object") return null;
    var id = row.id != null ? String(row.id) : "";
    var pick = Math.floor(Number(row.pick));
    if (!id || !Number.isFinite(pick) || pick < 1) return null;
    return {
      id: id,
      pick: pick,
      round: Math.max(1, Math.floor(Number(row.round) || 1)),
      posInRound: Math.max(1, Math.floor(Number(row.posInRound) || 1)),
      ownerPos: Math.floor(Number(row.ownerPos) || 0),
      owner: row.owner != null ? String(row.owner) : "",
      isKeeper: Boolean(row.isKeeper),
    };
  }

  function playerSlice(playerMap, id) {
    var raw = playerMap[id] || playerMap[String(Number(id))] || null;
    if (!raw || typeof raw !== "object") return null;
    return {
      id: id,
      name: raw.name != null ? String(raw.name) : "",
      position: raw.position != null ? String(raw.position) : "",
      team: raw.team != null ? String(raw.team) : "",
      adp: raw.adp != null && Number.isFinite(Number(raw.adp)) ? Number(raw.adp) : null,
      first_name: raw.first_name != null ? String(raw.first_name) : "",
      last_name: raw.last_name != null ? String(raw.last_name) : "",
    };
  }

  function detectReset(snap, providerDraftId) {
    if (lastProviderDraftId && providerDraftId && lastProviderDraftId !== providerDraftId) return true;
    if (lastPickCount > 0 && snap.draftedPlayers.length === 0) return true;
    if (
      lastPickCount >= 3 &&
      snap.draftedPlayers.length > 0 &&
      snap.draftedPlayers.length < Math.floor(lastPickCount / 2) &&
      (snap.overallPick || 0) <= 2
    ) {
      return true;
    }
    return false;
  }

  function establishBaseline(snap, providerDraftId) {
    baselineKeys = new Set();
    for (var i = 0; i < snap.draftedPlayers.length; i++) {
      var row = sanitizeRow(snap.draftedPlayers[i]);
      if (!row) continue;
      baselineKeys.add(pickKey(row.pick, row.id));
    }
    lastProviderDraftId = providerDraftId;
    lastPickCount = snap.draftedPlayers.length;
  }

  function tick() {
    if (!armed) return;
    var snap = readStore();
    if (!snap) {
      if (!waitStartedAt) waitStartedAt = Date.now();
      if (Date.now() - waitStartedAt > MAX_STORE_WAIT_MS) {
        diagnostics.lastError = "draft_state_unavailable";
        postToContent({
          type: "STATUS",
          status: "unavailable",
          reason: "draft_state_unavailable",
          diagnostics: diagnostics,
        });
        scheduleNext(MAX_BACKOFF_MS);
        return;
      }
      scheduleNext(backoffMs);
      backoffMs = Math.min(MAX_BACKOFF_MS, Math.floor(backoffMs * 1.6));
      return;
    }

    backoffMs = INITIAL_BACKOFF_MS;
    waitStartedAt = 0;

    if (snap.isMultiUserDraft || (snap.vueDraftTarget && snap.vueDraftTarget !== "local")) {
      diagnostics.lastError = snap.isMultiUserDraft ? "multiuser_not_supported" : "not_local_vue_target";
      postToContent({
        type: "STATUS",
        status: "unsupported",
        reason: diagnostics.lastError,
        diagnostics: diagnostics,
      });
      scheduleNext(MAX_BACKOFF_MS);
      return;
    }

    var session = resolveSessionKey(snap);
    var providerDraftId = session.key;
    var draftId = draftIdFor(providerDraftId);

    if (detectReset(snap, providerDraftId)) {
      restartCount += 1;
      diagnostics.observerRestarts = restartCount;
      establishBaseline(snap, providerDraftId);
      postToContent({
        type: "SESSION_RESET",
        draftId: draftId,
        providerDraftId: providerDraftId,
        sessionSource: session.source,
        diagnostics: diagnostics,
      });
      scheduleNext(POLL_MS_WHEN_ARMED);
      return;
    }

    if (lastProviderDraftId == null) {
      establishBaseline(snap, providerDraftId);
      postToContent({
        type: "STATUS",
        status: "monitoring",
        draftId: draftId,
        providerDraftId: providerDraftId,
        sessionSource: session.source,
        pickCount: snap.draftedPlayers.length,
        baselineOnly: true,
        room: {
          vueDraftTarget: snap.vueDraftTarget,
          isMultiUserDraft: snap.isMultiUserDraft,
          teamCount: snap.teamCount,
          overallPick: snap.overallPick,
          draftComplete: snap.draftComplete,
        },
        diagnostics: diagnostics,
      });
      scheduleNext(POLL_MS_WHEN_ARMED);
      return;
    }

    var newRows = [];
    var sliceMap = {};
    for (var j = 0; j < snap.draftedPlayers.length; j++) {
      var sanitized = sanitizeRow(snap.draftedPlayers[j]);
      if (!sanitized) continue;
      diagnostics.picksObserved += 1;
      var key = pickKey(sanitized.pick, sanitized.id);
      if (baselineKeys.has(key)) {
        diagnostics.duplicatesSuppressed += 1;
        continue;
      }
      baselineKeys.add(key);
      newRows.push(sanitized);
      var ps = playerSlice(snap.playerMap, sanitized.id);
      if (ps) sliceMap[sanitized.id] = ps;
    }

    lastPickCount = snap.draftedPlayers.length;
    lastProviderDraftId = providerDraftId;

    if (newRows.length > 0) {
      newRows.sort(function (a, b) {
        return a.pick - b.pick;
      });
      diagnostics.picksEmitted += newRows.length;
      diagnostics.lastEventAt = new Date().toISOString();
      postToContent({
        type: "PICK_BATCH",
        draftId: draftId,
        providerDraftId: providerDraftId,
        sessionSource: session.source,
        picks: newRows,
        playerMapSlice: sliceMap,
        room: {
          vueDraftTarget: snap.vueDraftTarget,
          isMultiUserDraft: snap.isMultiUserDraft,
          teamCount: snap.teamCount,
          overallPick: snap.overallPick,
          draftComplete: snap.draftComplete,
        },
        observedAt: diagnostics.lastEventAt,
        diagnostics: diagnostics,
      });
    } else {
      postToContent({
        type: "STATUS",
        status: "monitoring",
        draftId: draftId,
        providerDraftId: providerDraftId,
        sessionSource: session.source,
        pickCount: snap.draftedPlayers.length,
        room: {
          vueDraftTarget: snap.vueDraftTarget,
          isMultiUserDraft: snap.isMultiUserDraft,
          teamCount: snap.teamCount,
          overallPick: snap.overallPick,
          draftComplete: snap.draftComplete,
        },
        diagnostics: diagnostics,
      });
    }

    scheduleNext(POLL_MS_WHEN_ARMED);
  }

  function scheduleNext(ms) {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, Math.max(200, ms));
  }

  function arm(config) {
    armed = true;
    sessionConfig = config || {};
    baselineKeys = new Set();
    lastProviderDraftId = null;
    lastPickCount = 0;
    waitStartedAt = 0;
    backoffMs = INITIAL_BACKOFF_MS;
    if (sessionConfig.forceNewSession) generatedSessionKey = null;
    diagnostics.lastError = null;
    postToContent({ type: "STATUS", status: "armed", diagnostics: diagnostics });
    scheduleNext(INITIAL_BACKOFF_MS);
  }

  function disarm() {
    armed = false;
    sessionConfig = null;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    postToContent({ type: "STATUS", status: "disarmed", diagnostics: diagnostics });
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    if (ev.origin !== window.location.origin) return;
    var d = ev.data;
    if (!d || d.channel !== CHANNEL || d.source !== "fantasypros-content") return;
    if (d.type === "ARM") arm(d.config || {});
    if (d.type === "DISARM") disarm();
    if (d.type === "PING") {
      postToContent({ type: "PONG", armed: armed, diagnostics: diagnostics });
    }
  });

  postToContent({ type: "STATUS", status: "ready", diagnostics: diagnostics });
})();
