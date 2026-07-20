/**
 * Phase 1 — ESPN bookmarklet → Rivals publish layer (page-local only).
 * Emits window.postMessage batches; no extension/Rivals wiring yet.
 * Mirror rendering is intentionally untouched.
 */

import type { NormalizedDraftPick, NormalizedDraftSnapshot } from "../normalize/draftTypes";
import { buildEventKey } from "../normalize/eventKey";

export const ESPN_BM_CHANNEL = "GMWR_ESPN_BM_PAGE";
export const ESPN_BM_SOURCE = "espn-bookmarklet";
export const ESPN_BM_PROVIDER = "espn-live" as const;
/** Must match chrome-extension/espnBookmarkletTransport.js ESPN_BM_PROTOCOL_VERSION. */
export const ESPN_BM_PROTOCOL_VERSION = 1 as const;

/** Must match shared/espnLiveDraftMonitor.buildEspnLiveDraftId — never emit "-na". */
export function buildEspnLiveDraftId(leagueId: string, season: number): string {
  const lid = String(leagueId ?? "").trim() || "unknown";
  const yr =
    Number.isFinite(season) && season > 0 ? Math.floor(season) : new Date().getFullYear();
  return `espn-live-${lid}-${yr}`;
}

export type EspnBookmarkletArmConfig = {
  leagueId: string;
  season: number;
  /** Required opaque session id from Rivals ARM (or generated for local tests). */
  sessionNonce: string;
  draftPace?: "broadcast" | "brisk" | "turbo";
};

export type EspnBmTransportPick = {
  eventKey: string;
  overallPick: number;
  round: number;
  pickInRound: number;
  teamId: string;
  teamName: string;
  ownerName: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string | null;
  isKeeper: boolean;
  isTradedPick: boolean;
  playerIdSource: "espn" | "synthetic";
};

export type EspnBmDiagnostics = {
  picksEmitted: number;
  duplicatesSuppressed: number;
  rowsScanned: number;
  baselineOnly: boolean;
  liveNotify: boolean;
  /** Phase 4 — set on reconciliation batches. */
  replay?: boolean;
  replayRequestId?: string;
  afterOverallPick?: number;
};

export type EspnBmPickBatchMessage = {
  type: "GMWR_ESPN_BM_PICK_BATCH";
  protocolVersion: typeof ESPN_BM_PROTOCOL_VERSION;
  revision: number;
  channel: typeof ESPN_BM_CHANNEL;
  source: typeof ESPN_BM_SOURCE;
  provider: typeof ESPN_BM_PROVIDER;
  draftType: "live";
  draftId: string;
  leagueId: string;
  season: number;
  sessionNonce: string;
  teamCount: number;
  draftComplete: boolean;
  /** Full board projection on ARM — Rivals must not notifyLockedPick these. */
  baselineOnly: boolean;
  /** True only for picks completed after baseline (live commentary candidates). */
  liveNotify: boolean;
  observedAt: string;
  picks: EspnBmTransportPick[];
  diagnostics: EspnBmDiagnostics;
};

export type EspnBmStatusMessage = {
  type: "GMWR_ESPN_BM_STATUS";
  protocolVersion: typeof ESPN_BM_PROTOCOL_VERSION;
  revision: number;
  channel: typeof ESPN_BM_CHANNEL;
  source: typeof ESPN_BM_SOURCE;
  provider: typeof ESPN_BM_PROVIDER;
  status: "ready" | "armed" | "monitoring" | "complete" | "disarmed" | "error";
  reason?: string | null;
  draftId?: string | null;
  leagueId?: string | null;
  season?: number | null;
  sessionNonce?: string | null;
  draftComplete?: boolean;
  baselineOnly?: boolean;
  diagnostics?: EspnBmDiagnostics | null;
};

export type EspnBmPongMessage = {
  type: "GMWR_ESPN_BM_PONG";
  protocolVersion: typeof ESPN_BM_PROTOCOL_VERSION;
  revision: number;
  channel: typeof ESPN_BM_CHANNEL;
  source: typeof ESPN_BM_SOURCE;
  provider: typeof ESPN_BM_PROVIDER;
  armed: boolean;
  draftId: string | null;
  leagueId: string | null;
  season: number | null;
  sessionNonce: string | null;
};

export type EspnBmOutboundMessage =
  | EspnBmPickBatchMessage
  | EspnBmStatusMessage
  | EspnBmPongMessage;

export type EspnBookmarkletPublisherOptions = {
  /** Override emit (tests). Default: window.postMessage when a window is bound. */
  emit?: (message: EspnBmOutboundMessage) => void;
  nowIso?: () => string;
  /** Optional bound page window for postMessage + inbound ARM/DISARM/PING. */
  window?: Window;
};

function normToken(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Deterministic synthetic transport id when ESPN playerId is absent.
 * Not a permanent registry id — Rivals resolves via pool before projection.
 */
export function buildSyntheticEspnPlayerId(args: {
  playerName: string;
  position?: string | null;
  nflTeam?: string | null;
}): string {
  const n = normToken(args.playerName) || "unknown";
  const p = normToken(String(args.position ?? "unk")) || "unk";
  const t = normToken(String(args.nflTeam ?? "fa")) || "fa";
  return `syn:${n}|${p}|${t}`;
}

export function resolveTransportPlayerId(pick: NormalizedDraftPick): {
  playerId: string;
  playerIdSource: "espn" | "synthetic";
} {
  const espnId = String(pick.playerId ?? "").trim();
  if (espnId) return { playerId: espnId, playerIdSource: "espn" };
  return {
    playerId: buildSyntheticEspnPlayerId({
      playerName: pick.playerName,
      position: pick.position,
      nflTeam: pick.nflTeam,
    }),
    playerIdSource: "synthetic",
  };
}

function newNonce(): string {
  return `espn-bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidArmConfig(raw: unknown): EspnBookmarkletArmConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const leagueId = String(c.leagueId ?? "").trim();
  const season = Math.floor(Number(c.season));
  if (!/^\d+$/.test(leagueId)) return null;
  if (!Number.isFinite(season) || season < 2000 || season > 2100) return null;
  const sessionNonce =
    String(c.sessionNonce ?? "").trim() || newNonce();
  const draftPace = c.draftPace;
  const pace =
    draftPace === "broadcast" || draftPace === "brisk" || draftPace === "turbo"
      ? draftPace
      : undefined;
  return { leagueId, season, sessionNonce, draftPace: pace };
}

export function toTransportPick(
  pick: NormalizedDraftPick,
  draftId: string,
): EspnBmTransportPick | null {
  const overall = Math.floor(Number(pick.overallPick));
  const round = Math.floor(Number(pick.round));
  const pickInRound = Math.floor(Number(pick.pickInRound));
  const playerName = String(pick.playerName ?? "").trim();
  if (!Number.isFinite(overall) || overall < 1) return null;
  if (!Number.isFinite(round) || round < 1) return null;
  if (!Number.isFinite(pickInRound) || pickInRound < 1) return null;
  if (!playerName) return null;

  const { playerId, playerIdSource } = resolveTransportPlayerId(pick);
  const teamId = String(pick.currentTeamId ?? "").trim() || `slot-${pickInRound}`;
  const teamName = String(pick.currentTeamName ?? "").trim() || teamId;
  const eventKey = buildEventKey({
    source: "espn",
    draftId,
    overallPick: overall,
    round,
    pickInRound,
    teamId,
    playerId,
    teamName,
    playerName,
  });

  return {
    eventKey,
    overallPick: overall,
    round,
    pickInRound,
    teamId,
    teamName,
    ownerName: String(pick.currentOwnerName ?? teamName).trim() || teamName,
    playerId,
    playerName,
    position: String(pick.position ?? "UNK").trim() || "UNK",
    nflTeam: pick.nflTeam != null && String(pick.nflTeam).trim() ? String(pick.nflTeam).trim() : null,
    isKeeper: Boolean(pick.isKeeper),
    isTradedPick: Boolean(pick.isTradedPick),
    playerIdSource,
  };
}

/**
 * Page-local publisher. ARM required before any batch. Mirror-agnostic.
 */
export class EspnBookmarkletPublisher {
  private emitFn: (message: EspnBmOutboundMessage) => void;
  private nowIso: () => string;
  private win: Window | null;
  private armed = false;
  private armConfig: EspnBookmarkletArmConfig | null = null;
  private publishedKeys = new Set<string>();
  private baselined = false;
  private completionEmitted = false;
  private picksEmittedLive = 0;
  private duplicatesSuppressed = 0;
  private inboundAttached = false;
  private onInbound: ((ev: MessageEvent) => void) | null = null;
  /** Retained board for Phase 4 reconciliation (survives brief DISARM). */
  private boardPicks: EspnBmTransportPick[] = [];
  private boardTeamCount = 0;
  private boardDraftComplete = false;
  private boardDraftId: string | null = null;
  private boardLeagueId: string | null = null;
  private boardSeason: number | null = null;
  /** Recent emitted batches (bounded) for diagnostics / duplicate-aware replay tests. */
  private recentBatches: EspnBmPickBatchMessage[] = [];
  private static readonly RECENT_BATCH_LIMIT = 48;
  /** Monotonic per armed session — stamped on every outbound batch. */
  private sessionRevision = 0;

  constructor(opts: EspnBookmarkletPublisherOptions = {}) {
    this.win = opts.window ?? (typeof window !== "undefined" ? window : null);
    this.nowIso = opts.nowIso ?? (() => new Date().toISOString());
    this.emitFn =
      opts.emit ??
      ((message) => {
        if (!this.win) return;
        try {
          this.win.postMessage(message, this.win.location?.origin || "*");
        } catch {
          try {
            this.win.postMessage(message, "*");
          } catch {
            /* ignore */
          }
        }
      });
  }

  get isArmed(): boolean {
    return this.armed;
  }

  get state() {
    return {
      armed: this.armed,
      baselined: this.baselined,
      completionEmitted: this.completionEmitted,
      publishedKeyCount: this.publishedKeys.size,
      picksEmittedLive: this.picksEmittedLive,
      duplicatesSuppressed: this.duplicatesSuppressed,
      boardPickCount: this.boardPicks.length,
      recentBatchCount: this.recentBatches.length,
      sessionRevision: this.sessionRevision,
      leagueId: this.armConfig?.leagueId ?? null,
      season: this.armConfig?.season ?? null,
      sessionNonce: this.armConfig?.sessionNonce ?? null,
      draftId: this.armConfig
        ? buildEspnLiveDraftId(this.armConfig.leagueId, this.armConfig.season)
        : null,
    };
  }

  /** Listen for ARM / DISARM / PING from extension content (Phase 2+). Safe in Phase 1. */
  attachInboundListener(): void {
    if (this.inboundAttached || !this.win) return;
    this.onInbound = (ev: MessageEvent) => {
      if (ev.source !== this.win) return;
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      const msg = d as Record<string, unknown>;
      if (msg.channel !== ESPN_BM_CHANNEL) return;
      if (msg.type === "ARM" || msg.type === "GMWR_ESPN_BM_ARM") {
        this.arm(msg.config ?? msg);
        return;
      }
      if (msg.type === "DISARM" || msg.type === "GMWR_ESPN_BM_DISARM") {
        this.disarm();
        return;
      }
      if (msg.type === "PING" || msg.type === "GMWR_ESPN_BM_PING") {
        this.pong();
        return;
      }
      if (msg.type === "REPLAY_REQUEST" || msg.type === "GMWR_ESPN_BM_REPLAY_REQUEST") {
        this.handleReplayRequest(msg.config ?? msg);
      }
    };
    this.win.addEventListener("message", this.onInbound);
    this.inboundAttached = true;
    this.emitStatus("ready");
  }

  detachInboundListener(): void {
    if (!this.inboundAttached || !this.win || !this.onInbound) return;
    this.win.removeEventListener("message", this.onInbound);
    this.onInbound = null;
    this.inboundAttached = false;
  }

  arm(rawConfig: unknown): { ok: boolean; error?: string; sessionNonce?: string } {
    const config = isValidArmConfig(rawConfig);
    if (!config) {
      this.emitStatus("error", { reason: "invalid_arm_config" });
      return { ok: false, error: "invalid_arm_config" };
    }
    const nextDraftId = buildEspnLiveDraftId(config.leagueId, config.season);
    // Drop retained board when league/season identity changes.
    if (
      this.boardDraftId &&
      (this.boardDraftId !== nextDraftId ||
        this.boardLeagueId !== config.leagueId ||
        this.boardSeason !== config.season)
    ) {
      this.boardPicks = [];
      this.boardTeamCount = 0;
      this.boardDraftComplete = false;
      this.recentBatches = [];
    }
    // Re-ARM always starts a fresh nonce session + baseline cursor.
    // boardPicks retained for immediate REPLAY_REQUEST before next snapshot.
    this.armed = true;
    this.armConfig = {
      ...config,
      sessionNonce: String(config.sessionNonce).trim() || newNonce(),
    };
    this.publishedKeys = new Set();
    this.baselined = false;
    this.completionEmitted = false;
    this.picksEmittedLive = 0;
    this.duplicatesSuppressed = 0;
    this.sessionRevision = 0;
    this.emitStatus("armed");
    return { ok: true, sessionNonce: this.armConfig.sessionNonce };
  }

  disarm(): void {
    this.armed = false;
    this.armConfig = null;
    this.publishedKeys = new Set();
    this.baselined = false;
    this.completionEmitted = false;
    // Intentionally retain boardPicks / recentBatches for reconnect replay.
    this.emitStatus("disarmed");
  }

  pong(): void {
    const draftId = this.armConfig
      ? buildEspnLiveDraftId(this.armConfig.leagueId, this.armConfig.season)
      : null;
    this.emitFn({
      type: "GMWR_ESPN_BM_PONG",
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
      revision: this.sessionRevision,
      channel: ESPN_BM_CHANNEL,
      source: ESPN_BM_SOURCE,
      provider: ESPN_BM_PROVIDER,
      armed: this.armed,
      draftId,
      leagueId: this.armConfig?.leagueId ?? null,
      season: this.armConfig?.season ?? null,
      sessionNonce: this.armConfig?.sessionNonce ?? null,
    });
  }

  /**
   * Phase 4 — idempotent reconciliation after War Room reconnect.
   * afterOverallPick <= 0 → full board as baseline (no live notify).
   * afterOverallPick > 0 → only newer picks as liveNotify candidates.
   */
  handleReplayRequest(raw: unknown): {
    ok: boolean;
    error?: string;
    emitted?: number;
  } {
    if (!this.armed || !this.armConfig) {
      this.emitStatus("error", { reason: "replay_not_armed" });
      return { ok: false, error: "not_armed" };
    }
    if (!raw || typeof raw !== "object") {
      this.emitStatus("error", { reason: "invalid_replay_request" });
      return { ok: false, error: "invalid_replay_request" };
    }
    const r = raw as Record<string, unknown>;
    const draftId = String(r.draftId ?? "").trim();
    const sessionNonce = String(r.sessionNonce ?? "").trim();
    const afterOverallPick = Math.floor(Number(r.afterOverallPick));
    const requestId = String(r.requestId ?? "").trim();
    const expectedDraftId = buildEspnLiveDraftId(
      this.armConfig.leagueId,
      this.armConfig.season,
    );
    if (!draftId || draftId !== expectedDraftId) {
      this.emitStatus("error", {
        reason: "replay_wrong_draft_id",
        draftId: expectedDraftId,
        leagueId: this.armConfig.leagueId,
        season: this.armConfig.season,
      });
      return { ok: false, error: "wrong_draft_id" };
    }
    if (!sessionNonce || sessionNonce !== this.armConfig.sessionNonce) {
      this.emitStatus("error", {
        reason: "replay_wrong_session_nonce",
        draftId: expectedDraftId,
        leagueId: this.armConfig.leagueId,
        season: this.armConfig.season,
      });
      return { ok: false, error: "wrong_session_nonce" };
    }
    if (!Number.isFinite(afterOverallPick) || afterOverallPick < 0) {
      this.emitStatus("error", { reason: "invalid_after_overall_pick" });
      return { ok: false, error: "invalid_after_overall_pick" };
    }
    if (!requestId) {
      this.emitStatus("error", { reason: "missing_replay_request_id" });
      return { ok: false, error: "missing_replay_request_id" };
    }

    const boardMax =
      this.boardPicks.length > 0
        ? Math.max(...this.boardPicks.map((p) => p.overallPick))
        : 0;
    if (afterOverallPick > boardMax) {
      this.emitStatus("error", {
        reason: "stale_replay",
        draftId: expectedDraftId,
        leagueId: this.armConfig.leagueId,
        season: this.armConfig.season,
      });
      return { ok: false, error: "stale_replay" };
    }

    const picks = this.boardPicks
      .filter((p) => p.overallPick > afterOverallPick)
      .sort((a, b) => a.overallPick - b.overallPick);

    // Nothing missing — success with no batch (avoids empty non-complete reject).
    if (picks.length === 0) {
      this.emitStatus("monitoring", {
        draftId: expectedDraftId,
        leagueId: this.armConfig.leagueId,
        season: this.armConfig.season,
        draftComplete: this.boardDraftComplete,
      });
      return { ok: true, emitted: 0 };
    }

    const fullReconcile = afterOverallPick <= 0;
    for (const row of picks) this.publishedKeys.add(row.eventKey);
    if (fullReconcile) this.baselined = true;

    this.emitBatch({
      draftId: expectedDraftId,
      leagueId: this.armConfig.leagueId,
      season: this.armConfig.season,
      sessionNonce: this.armConfig.sessionNonce,
      teamCount: this.boardTeamCount || 12,
      draftComplete: this.boardDraftComplete,
      baselineOnly: fullReconcile,
      liveNotify: !fullReconcile,
      observedAt: this.nowIso(),
      picks,
      rowsScanned: this.boardPicks.length,
      replay: true,
      replayRequestId: requestId.slice(0, 128),
      afterOverallPick,
    });
    this.emitStatus("monitoring", {
      draftId: expectedDraftId,
      leagueId: this.armConfig.leagueId,
      season: this.armConfig.season,
      draftComplete: this.boardDraftComplete,
      baselineOnly: fullReconcile,
    });
    return { ok: true, emitted: picks.length };
  }

  /**
   * Called after mirror applyAdapterResult. No-op unless armed.
   * First successful snapshot → baseline projection batch (liveNotify=false).
   * Later new picks → delta batches (liveNotify=true).
   * Completion always rides on a PICK_BATCH (delta, baseline, or empty once).
   */
  onSnapshot(snapshot: NormalizedDraftSnapshot | null): void {
    if (!this.armed || !this.armConfig) {
      try {
        console.info("[espn-bm-path]", "mirror_skip_onSnapshot", {
          hop: "board-mirror",
          reject: "!armed || !armConfig",
          line: "espnBookmarkletPublisher.ts:onSnapshot",
          armed: this.armed,
          hasArmConfig: Boolean(this.armConfig),
          pickCount: snapshot?.picks?.length ?? null,
        });
      } catch {
        /* ignore */
      }
      return;
    }
    if (!snapshot || snapshot.source !== "espn") return;

    const { leagueId, season, sessionNonce } = this.armConfig;
    const draftId = buildEspnLiveDraftId(leagueId, season);
    if (draftId.endsWith("-na")) {
      this.emitStatus("error", { reason: "invalid_draft_id", draftId, leagueId, season });
      return;
    }

    const observedAt = this.nowIso();
    const teamCount = snapshot.teamCount || snapshot.teams.length || 0;
    const draftComplete = snapshot.status === "COMPLETE";

    const transport: EspnBmTransportPick[] = [];
    for (const pick of snapshot.picks) {
      const row = toTransportPick(pick, draftId);
      if (row) transport.push(row);
    }
    transport.sort((a, b) => a.overallPick - b.overallPick);

    // Always retain latest board for reconnect replay (Phase 4).
    this.boardPicks = transport;
    this.boardTeamCount = teamCount;
    this.boardDraftComplete = draftComplete;
    this.boardDraftId = draftId;
    this.boardLeagueId = leagueId;
    this.boardSeason = season;

    if (!this.baselined) {
      this.baselined = true;
      for (const row of transport) this.publishedKeys.add(row.eventKey);
      this.emitBatch({
        draftId,
        leagueId,
        season,
        sessionNonce,
        teamCount,
        draftComplete,
        baselineOnly: true,
        liveNotify: false,
        observedAt,
        picks: transport,
        rowsScanned: transport.length,
      });
      this.emitStatus("monitoring", {
        draftId,
        leagueId,
        season,
        baselineOnly: true,
        draftComplete,
      });
      if (draftComplete) {
        // Completion already on baseline batch — STATUS only (no second batch).
        this.emitCompletionOnce({
          draftId,
          leagueId,
          season,
          sessionNonce,
          teamCount,
          observedAt,
          alreadyOnBatch: true,
        });
      }
      return;
    }

    const delta: EspnBmTransportPick[] = [];
    let skippedKnown = 0;
    for (const row of transport) {
      if (this.publishedKeys.has(row.eventKey)) {
        skippedKnown += 1;
        continue;
      }
      this.publishedKeys.add(row.eventKey);
      delta.push(row);
    }
    this.duplicatesSuppressed = Math.max(this.duplicatesSuppressed, skippedKnown);

    if (delta.length > 0) {
      this.picksEmittedLive += delta.length;
      this.emitBatch({
        draftId,
        leagueId,
        season,
        sessionNonce,
        teamCount,
        draftComplete,
        baselineOnly: false,
        liveNotify: true,
        observedAt,
        picks: delta,
        rowsScanned: transport.length,
      });
      this.emitStatus("monitoring", { draftId, leagueId, season, draftComplete });
      if (draftComplete) {
        this.emitCompletionOnce({
          draftId,
          leagueId,
          season,
          sessionNonce,
          teamCount,
          observedAt,
          alreadyOnBatch: true,
        });
      }
      return;
    }

    // No new picks — delayed completion still needs one PICK_BATCH for ingestion.
    if (draftComplete) {
      this.emitCompletionOnce({
        draftId,
        leagueId,
        season,
        sessionNonce,
        teamCount,
        observedAt,
        alreadyOnBatch: false,
      });
    }
  }

  /**
   * Emit completion exactly once per ARM session.
   * Prefer carrying draftComplete on an existing batch; otherwise emit an empty
   * PICK_BATCH so Phase 3 maps directly into NormalizedPickBatch.draftComplete
   * without a second event type.
   */
  private emitCompletionOnce(args: {
    draftId: string;
    leagueId: string;
    season: number;
    sessionNonce: string;
    teamCount: number;
    observedAt: string;
    alreadyOnBatch: boolean;
  }): void {
    if (this.completionEmitted) return;
    this.completionEmitted = true;
    if (!args.alreadyOnBatch) {
      this.emitBatch({
        draftId: args.draftId,
        leagueId: args.leagueId,
        season: args.season,
        sessionNonce: args.sessionNonce,
        teamCount: args.teamCount,
        draftComplete: true,
        baselineOnly: false,
        liveNotify: false,
        observedAt: args.observedAt,
        picks: [],
        rowsScanned: this.publishedKeys.size,
      });
    }
    this.emitStatus("complete", {
      draftId: args.draftId,
      leagueId: args.leagueId,
      season: args.season,
      draftComplete: true,
    });
  }

  private emitBatch(args: {
    draftId: string;
    leagueId: string;
    season: number;
    sessionNonce: string;
    teamCount: number;
    draftComplete: boolean;
    baselineOnly: boolean;
    liveNotify: boolean;
    observedAt: string;
    picks: EspnBmTransportPick[];
    rowsScanned: number;
    replay?: boolean;
    replayRequestId?: string;
    afterOverallPick?: number;
  }): void {
    const diagnostics: EspnBmDiagnostics = {
      picksEmitted: args.liveNotify ? this.picksEmittedLive : 0,
      duplicatesSuppressed: this.duplicatesSuppressed,
      rowsScanned: args.rowsScanned,
      baselineOnly: args.baselineOnly,
      liveNotify: args.liveNotify,
      ...(args.replay
        ? {
            replay: true,
            replayRequestId: args.replayRequestId,
            afterOverallPick: args.afterOverallPick,
          }
        : {}),
    };
    const message: EspnBmPickBatchMessage = {
      type: "GMWR_ESPN_BM_PICK_BATCH",
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
      revision: ++this.sessionRevision,
      channel: ESPN_BM_CHANNEL,
      source: ESPN_BM_SOURCE,
      provider: ESPN_BM_PROVIDER,
      draftType: "live",
      draftId: args.draftId,
      leagueId: args.leagueId,
      season: args.season,
      sessionNonce: args.sessionNonce,
      teamCount: args.teamCount,
      draftComplete: args.draftComplete,
      baselineOnly: args.baselineOnly,
      liveNotify: args.liveNotify,
      observedAt: args.observedAt,
      picks: args.picks,
      diagnostics,
    };
    try {
      console.info("[espn-bm-path]", "mirror_emit_PICK_BATCH", {
        hop: "board-mirror",
        sessionNonce: message.sessionNonce,
        draftId: message.draftId,
        protocolVersion: message.protocolVersion,
        revision: message.revision,
        batchSize: message.picks.length,
        baselineOnly: message.baselineOnly,
        liveNotify: message.liveNotify,
      });
    } catch {
      /* ignore */
    }
    this.recentBatches.push(message);
    if (this.recentBatches.length > EspnBookmarkletPublisher.RECENT_BATCH_LIMIT) {
      this.recentBatches.splice(
        0,
        this.recentBatches.length - EspnBookmarkletPublisher.RECENT_BATCH_LIMIT,
      );
    }
    this.emitFn(message);
  }

  private emitStatus(
    status: EspnBmStatusMessage["status"],
    extra?: {
      reason?: string | null;
      draftId?: string | null;
      leagueId?: string | null;
      season?: number | null;
      baselineOnly?: boolean;
      draftComplete?: boolean;
    },
  ): void {
    const draftId = this.armConfig
      ? buildEspnLiveDraftId(this.armConfig.leagueId, this.armConfig.season)
      : extra?.draftId ?? null;
    this.emitFn({
      type: "GMWR_ESPN_BM_STATUS",
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
      revision: this.sessionRevision,
      channel: ESPN_BM_CHANNEL,
      source: ESPN_BM_SOURCE,
      provider: ESPN_BM_PROVIDER,
      status,
      reason: extra?.reason ?? null,
      draftId: extra?.draftId ?? draftId,
      leagueId: extra?.leagueId ?? this.armConfig?.leagueId ?? null,
      season: extra?.season ?? this.armConfig?.season ?? null,
      sessionNonce: this.armConfig?.sessionNonce ?? null,
      draftComplete: extra?.draftComplete,
      baselineOnly: extra?.baselineOnly,
      diagnostics: {
        picksEmitted: this.picksEmittedLive,
        duplicatesSuppressed: this.duplicatesSuppressed,
        rowsScanned: this.publishedKeys.size,
        baselineOnly: Boolean(extra?.baselineOnly),
        liveNotify: false,
      },
    });
  }
}
