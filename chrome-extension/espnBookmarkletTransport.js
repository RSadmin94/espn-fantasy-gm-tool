/**
 * Phase 2 — ESPN bookmarklet transport validation (shared).
 * Route-only helpers: schema/channel/source checks. No mapping / notify / DOM.
 */

export const ESPN_BM_PAGE_CHANNEL = "GMWR_ESPN_BM_PAGE";
export const ESPN_BM_BRIDGE_CHANNEL = "GMWR_ESPN_BM";
export const ESPN_BM_PAGE_SOURCE = "espn-bookmarklet";
export const ESPN_BM_CONTENT_SOURCE = "espn-live-content";
export const ESPN_BM_EXTENSION_SOURCE = "gmwarroom-extension";
export const ESPN_BM_PROVIDER = "espn-live";

export const MSG_ESPN_BM_ARM = "GMWR_ESPN_BM_ARM";
export const MSG_ESPN_BM_DISARM = "GMWR_ESPN_BM_DISARM";
export const MSG_ESPN_BM_PING = "GMWR_ESPN_BM_PING";
export const MSG_ESPN_BM_PONG = "GMWR_ESPN_BM_PONG";
export const MSG_ESPN_BM_STATUS = "GMWR_ESPN_BM_STATUS";
export const MSG_ESPN_BM_PICK_BATCH = "GMWR_ESPN_BM_PICK_BATCH";
export const MSG_ESPN_BM_SESSION_RESET = "GMWR_ESPN_BM_SESSION_RESET";
export const MSG_ESPN_BM_GET_STATE = "GMWR_ESPN_BM_GET_STATE";

/** Types the Rivals page may send toward background (via bridge). */
export const ESPN_BM_FFR_TO_BG_TYPES = [
  MSG_ESPN_BM_ARM,
  MSG_ESPN_BM_DISARM,
  MSG_ESPN_BM_PING,
  MSG_ESPN_BM_GET_STATE,
];

/** Types background may push to Rivals bridge / page. */
export const ESPN_BM_BG_TO_FFR_TYPES = [
  MSG_ESPN_BM_PICK_BATCH,
  MSG_ESPN_BM_STATUS,
  MSG_ESPN_BM_SESSION_RESET,
  MSG_ESPN_BM_PONG,
];

/** Types the bookmarklet page may emit on GMWR_ESPN_BM_PAGE. */
export const ESPN_BM_PAGE_TO_CONTENT_TYPES = [
  MSG_ESPN_BM_PICK_BATCH,
  MSG_ESPN_BM_STATUS,
  MSG_ESPN_BM_PONG,
  MSG_ESPN_BM_SESSION_RESET,
];

export function isEspnBmRuntimeType(type) {
  return (
    ESPN_BM_FFR_TO_BG_TYPES.includes(type) ||
    ESPN_BM_BG_TO_FFR_TYPES.includes(type) ||
    type === MSG_ESPN_BM_PONG
  );
}

export function isEspnLiveDraftId(draftId) {
  const id = String(draftId ?? "").trim();
  if (!id.startsWith("espn-live-")) return false;
  if (id.endsWith("-na")) return false;
  return /^espn-live-\d+-\d{4}$/.test(id);
}

export function validateArmConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  const c = /** @type {Record<string, unknown>} */ (raw);
  const leagueId = String(c.leagueId ?? "").trim();
  const season = Math.floor(Number(c.season));
  const sessionNonce = String(c.sessionNonce ?? "").trim();
  if (!/^\d+$/.test(leagueId)) return null;
  if (!Number.isFinite(season) || season < 2000 || season > 2100) return null;
  if (!sessionNonce || sessionNonce.length > 128) return null;
  const draftPace = c.draftPace;
  const pace =
    draftPace === "broadcast" || draftPace === "brisk" || draftPace === "turbo"
      ? draftPace
      : undefined;
  return {
    leagueId,
    season,
    sessionNonce: sessionNonce.slice(0, 128),
    draftPace: pace,
  };
}

/**
 * @param {unknown} row
 * @returns {object|null}
 */
export function validateTransportPick(row) {
  if (!row || typeof row !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (row);
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
  const playerIdSource = r.playerIdSource === "espn" || r.playerIdSource === "synthetic"
    ? r.playerIdSource
    : null;
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
    nflTeam:
      r.nflTeam != null && String(r.nflTeam).trim()
        ? String(r.nflTeam).trim().slice(0, 8)
        : null,
    isKeeper: Boolean(r.isKeeper),
    isTradedPick: Boolean(r.isTradedPick),
    playerIdSource,
  };
}

/**
 * Validate bookmarklet → content page message (outbound to background).
 * @param {unknown} data
 * @param {{ requireSessionNonce?: string|null }} [opts]
 */
export function validatePageOutboundMessage(data, opts = {}) {
  if (!data || typeof data !== "object") return { ok: false, error: "not_object" };
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.channel !== ESPN_BM_PAGE_CHANNEL) return { ok: false, error: "wrong_channel" };
  if (d.source !== ESPN_BM_PAGE_SOURCE) return { ok: false, error: "wrong_source" };
  if (d.provider != null && d.provider !== ESPN_BM_PROVIDER) {
    return { ok: false, error: "wrong_provider" };
  }
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
    if (!Number.isFinite(season) || season < 2000 || season > 2100) {
      return { ok: false, error: "invalid_season" };
    }
    if (!sessionNonce || sessionNonce.length > 128) {
      return { ok: false, error: "invalid_session_nonce" };
    }
    if (
      opts.requireSessionNonce != null &&
      opts.requireSessionNonce !== "" &&
      sessionNonce !== opts.requireSessionNonce
    ) {
      return { ok: false, error: "session_nonce_mismatch" };
    }
    if (!Array.isArray(d.picks)) return { ok: false, error: "picks_not_array" };
    if (d.picks.length > 256) return { ok: false, error: "picks_too_many" };
    // Empty picks allowed only when draftComplete (completion latch).
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
    return {
      ok: true,
      message: {
        type: MSG_ESPN_BM_PICK_BATCH,
        provider: ESPN_BM_PROVIDER,
        draftType: "live",
        draftId: draftId.slice(0, 128),
        leagueId,
        season,
        sessionNonce: sessionNonce.slice(0, 128),
        teamCount: Math.max(0, Math.floor(Number(d.teamCount)) || 0),
        draftComplete: Boolean(d.draftComplete),
        baselineOnly: Boolean(d.baselineOnly),
        liveNotify: Boolean(d.liveNotify),
        observedAt:
          typeof d.observedAt === "string" ? d.observedAt.slice(0, 40) : new Date().toISOString(),
        picks,
        diagnostics:
          d.diagnostics && typeof d.diagnostics === "object"
            ? {
                picksEmitted: Number(/** @type {any} */ (d.diagnostics).picksEmitted) || 0,
                duplicatesSuppressed:
                  Number(/** @type {any} */ (d.diagnostics).duplicatesSuppressed) || 0,
                rowsScanned: Number(/** @type {any} */ (d.diagnostics).rowsScanned) || 0,
                baselineOnly: Boolean(/** @type {any} */ (d.diagnostics).baselineOnly),
                liveNotify: Boolean(/** @type {any} */ (d.diagnostics).liveNotify),
              }
            : null,
      },
    };
  }

  if (type === MSG_ESPN_BM_STATUS) {
    return {
      ok: true,
      message: {
        type: MSG_ESPN_BM_STATUS,
        provider: ESPN_BM_PROVIDER,
        status: String(d.status ?? "unknown").slice(0, 40),
        reason: d.reason != null ? String(d.reason).slice(0, 80) : null,
        draftId: d.draftId != null ? String(d.draftId).slice(0, 128) : null,
        leagueId: d.leagueId != null ? String(d.leagueId).slice(0, 32) : null,
        season: d.season != null && Number.isFinite(Number(d.season)) ? Number(d.season) : null,
        sessionNonce: d.sessionNonce != null ? String(d.sessionNonce).slice(0, 128) : null,
        draftComplete: d.draftComplete != null ? Boolean(d.draftComplete) : undefined,
        baselineOnly: d.baselineOnly != null ? Boolean(d.baselineOnly) : undefined,
        diagnostics: d.diagnostics && typeof d.diagnostics === "object" ? d.diagnostics : null,
      },
    };
  }

  if (type === MSG_ESPN_BM_PONG) {
    return {
      ok: true,
      message: {
        type: MSG_ESPN_BM_PONG,
        provider: ESPN_BM_PROVIDER,
        armed: Boolean(d.armed),
        draftId: d.draftId != null ? String(d.draftId).slice(0, 128) : null,
        leagueId: d.leagueId != null ? String(d.leagueId).slice(0, 32) : null,
        season: d.season != null && Number.isFinite(Number(d.season)) ? Number(d.season) : null,
        sessionNonce: d.sessionNonce != null ? String(d.sessionNonce).slice(0, 128) : null,
      },
    };
  }

  if (type === MSG_ESPN_BM_SESSION_RESET) {
    const draftId = String(d.draftId ?? "").trim();
    if (draftId && !isEspnLiveDraftId(draftId)) {
      return { ok: false, error: "invalid_draft_id" };
    }
    return {
      ok: true,
      message: {
        type: MSG_ESPN_BM_SESSION_RESET,
        provider: ESPN_BM_PROVIDER,
        draftId: draftId ? draftId.slice(0, 128) : null,
        leagueId: d.leagueId != null ? String(d.leagueId).slice(0, 32) : null,
        sessionNonce: d.sessionNonce != null ? String(d.sessionNonce).slice(0, 128) : null,
      },
    };
  }

  return { ok: false, error: "unhandled_type" };
}

/** Bridge: only forward ESPN BM background→page types (never FP). */
export function shouldBridgeForwardEspnBm(message) {
  if (!message || typeof message !== "object") return false;
  const m = /** @type {Record<string, unknown>} */ (message);
  const type = String(m.type ?? "");
  if (!ESPN_BM_BG_TO_FFR_TYPES.includes(type)) return false;
  if (m.provider != null && m.provider !== ESPN_BM_PROVIDER) return false;
  // Reject FP namespace contamination
  if (type.startsWith("GMWR_FP_")) return false;
  return true;
}

/** Bridge: Rivals page → background command types. */
export function shouldBridgeAcceptEspnBmCommand(data) {
  if (!data || typeof data !== "object") return false;
  const d = /** @type {Record<string, unknown>} */ (data);
  const type = String(d.type ?? "");
  if (!ESPN_BM_FFR_TO_BG_TYPES.includes(type)) return false;
  if (d.provider != null && d.provider !== ESPN_BM_PROVIDER) return false;
  if (type.startsWith("GMWR_FP_")) return false;
  return true;
}
