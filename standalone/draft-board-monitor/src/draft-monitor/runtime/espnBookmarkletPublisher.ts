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
};

export type EspnBmPickBatchMessage = {
  type: "GMWR_ESPN_BM_PICK_BATCH";
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
    // Re-ARM always starts a fresh nonce session + baseline.
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
    this.emitStatus("armed");
    return { ok: true, sessionNonce: this.armConfig.sessionNonce };
  }

  disarm(): void {
    this.armed = false;
    this.armConfig = null;
    this.publishedKeys = new Set();
    this.baselined = false;
    this.completionEmitted = false;
    this.emitStatus("disarmed");
  }

  pong(): void {
    const draftId = this.armConfig
      ? buildEspnLiveDraftId(this.armConfig.leagueId, this.armConfig.season)
      : null;
    this.emitFn({
      type: "GMWR_ESPN_BM_PONG",
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
   * Called after mirror applyAdapterResult. No-op unless armed.
   * First successful snapshot → baseline projection batch (liveNotify=false).
   * Later new picks → delta batches (liveNotify=true).
   * Completion always rides on a PICK_BATCH (delta, baseline, or empty once).
   */
  onSnapshot(snapshot: NormalizedDraftSnapshot | null): void {
    if (!this.armed || !this.armConfig) return;
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
  }): void {
    const diagnostics: EspnBmDiagnostics = {
      picksEmitted: args.liveNotify ? this.picksEmittedLive : 0,
      duplicatesSuppressed: this.duplicatesSuppressed,
      rowsScanned: args.rowsScanned,
      baselineOnly: args.baselineOnly,
      liveNotify: args.liveNotify,
    };
    this.emitFn({
      type: "GMWR_ESPN_BM_PICK_BATCH",
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
    });
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
