/**
 * RFSN-031B — Production ESPN reader auto-injection helpers (pure + injectable).
 * Feature flag default OFF. Idempotent inject. No DOM pick parsing.
 */

import {
  classifyEspnFantasyUrl,
  extractEspnLeagueIdFromUrl,
  isSupportedEspnLiveDraftRoomUrl,
} from "./espnLiveDraftRoom.js";

/** Storage key — chrome.storage.local / sync. Default missing = disabled. */
export const ESPN_AUTO_INJECT_STORAGE_KEY = "rfsnEspnAutoInjectEnabled";

/** Window handshake for compatible production reader (page MAIN world). */
export const ESPN_READER_HANDSHAKE_KEY = "__RFSN_ESPN_LIVE_READER__";

export const ESPN_LIVE_READER_VERSION = "1.0.0";
export const ESPN_LIVE_CONNECTOR_PROTOCOL_VERSION = 1;
export const ESPN_LIVE_READER_ASSET =
  "providers/espn-live/espn-live-reader.iife.js";

/** @typedef {"not_present"|"injecting"|"reader_ready"|"armed"|"capturing"|"disconnected"|"complete"|"error"} ReaderLifecycleState */

/**
 * @param {unknown} stored
 * @param {boolean} [remoteEnabled] from Rivals / server flag push
 * @returns {boolean}
 */
export function isEspnAutoInjectEnabled(stored, remoteEnabled) {
  // Explicit remote kill wins.
  if (remoteEnabled === false) return false;
  if (stored === true || stored === "true" || stored === 1) {
    // Require remote/session enablement when provided; storage alone is not enough
    // unless remote is undefined (popup/advanced local override path).
    if (remoteEnabled === undefined || remoteEnabled === null) return true;
    return remoteEnabled === true;
  }
  return false;
}

/**
 * Compatible reader already present?
 * @param {unknown} handshake
 * @param {{ readerVersion?: string, protocolVersion?: number }} [expect]
 */
export function hasCompatibleEspnReaderHandshake(handshake, expect = {}) {
  if (!handshake || typeof handshake !== "object") return false;
  const h = /** @type {Record<string, unknown>} */ (handshake);
  if (h.kind !== "espn-live-reader") return false;
  const proto = Number(h.protocolVersion);
  const expectProto = Number(expect.protocolVersion ?? ESPN_LIVE_CONNECTOR_PROTOCOL_VERSION);
  if (!Number.isFinite(proto) || proto !== expectProto) return false;
  const ver = String(h.readerVersion ?? "");
  const expectVer = String(expect.readerVersion ?? ESPN_LIVE_READER_VERSION);
  if (!ver || ver !== expectVer) return false;
  return true;
}

/**
 * Incompatible / stale marker that should be replaced (not re-used).
 * @param {unknown} handshake
 */
export function isStaleOrIncompatibleEspnReader(handshake) {
  if (!handshake || typeof handshake !== "object") return false;
  const h = /** @type {Record<string, unknown>} */ (handshake);
  if (h.kind === "espn-live-reader" && !hasCompatibleEspnReaderHandshake(h)) {
    return true;
  }
  // Spike marker alone is not a production reader.
  if (h.marker === "rfsn-031a-spike" || h.spike === true) return true;
  return false;
}

/**
 * Decide inject action for one poll/wake.
 * @param {{
 *   href: string,
 *   autoInjectEnabled: boolean,
 *   handshake: unknown,
 *   alreadyInjecting: boolean,
 *   injectedThisLoad: boolean,
 * }} args
 * @returns {{ action: "skip"|"inject"|"duplicate_prevented"|"unsupported", reason: string, urlKind: string, leagueId: string|null }}
 */
export function planEspnReaderInjection(args) {
  const href = String(args.href || "");
  const urlKind = classifyEspnFantasyUrl(href);
  const leagueId = extractEspnLeagueIdFromUrl(href);

  if (!args.autoInjectEnabled) {
    return {
      action: "skip",
      reason: "auto_inject_disabled",
      urlKind,
      leagueId,
    };
  }
  if (urlKind !== "live_draft_room" || !isSupportedEspnLiveDraftRoomUrl(href)) {
    return {
      action: "unsupported",
      reason: "not_live_draft_room",
      urlKind,
      leagueId,
    };
  }
  if (args.alreadyInjecting || args.injectedThisLoad) {
    return {
      action: "duplicate_prevented",
      reason: args.alreadyInjecting ? "injecting" : "already_injected_this_load",
      urlKind,
      leagueId,
    };
  }
  if (hasCompatibleEspnReaderHandshake(args.handshake)) {
    return {
      action: "duplicate_prevented",
      reason: "compatible_reader_present",
      urlKind,
      leagueId,
    };
  }
  return {
    action: "inject",
    reason: isStaleOrIncompatibleEspnReader(args.handshake)
      ? "replace_stale_or_incompatible"
      : "not_present",
    urlKind,
    leagueId,
  };
}

/**
 * Telemetry event names (event-only; no secrets).
 */
export const ESPN_AUTO_INJECT_TELEMETRY = Object.freeze({
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
  capture_completed: "capture_completed",
});

/**
 * Map publisher status → lifecycle for diagnostics.
 * @param {string|null|undefined} status
 * @param {{ armed?: boolean, capturing?: boolean }} [extra]
 * @returns {ReaderLifecycleState}
 */
export function mapPublisherStatusToLifecycle(status, extra = {}) {
  const s = String(status || "");
  if (s === "error") return "error";
  if (s === "complete") return "complete";
  if (s === "disarmed") return "disconnected";
  if (s === "armed") return "armed";
  if (s === "monitoring" || extra.capturing) return "capturing";
  if (s === "ready") return "reader_ready";
  if (extra.armed) return "armed";
  return "not_present";
}

/**
 * Version gate for ARM — block incompatible readers.
 * @param {{ readerVersion?: string|null, protocolVersion?: number|null, extensionProtocol?: number }} args
 */
export function isReaderCompatibleForArm(args) {
  const proto = Number(args.protocolVersion);
  const expect = Number(args.extensionProtocol ?? ESPN_LIVE_CONNECTOR_PROTOCOL_VERSION);
  if (!Number.isFinite(proto) || proto !== expect) return false;
  const ver = String(args.readerVersion ?? "").trim();
  if (!ver) return false;
  // Same major protocol family — exact readerVersion match for 031B.
  return ver === ESPN_LIVE_READER_VERSION;
}
