/**
 * Phase 3 — validate ESPN bookmarklet transport messages on the Rivals page.
 * Minimal adaptation into NormalizedPickBatch; no FantasyPros mapping reuse.
 */
import { buildEspnLiveDraftId } from "@shared/espnLiveDraftMonitor";
import type { NormalizedPickBatch, NormalizedPickEvent } from "@shared/draftSource";

export const ESPN_BM_BRIDGE_CHANNEL = "GMWR_ESPN_BM";
export const ESPN_BM_EXTENSION_SOURCE = "gmwarroom-extension";
/** Must match extension espnBookmarkletTransport ESPN_BM_PROTOCOL_VERSION. */
export const ESPN_BM_PROTOCOL_VERSION = 1 as const;

function protocolVersionOk(raw: unknown): boolean {
  return Math.floor(Number(raw)) === ESPN_BM_PROTOCOL_VERSION;
}

export type EspnBmBridgePick = {
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

export type EspnBmBridgePickBatch = {
  type: "GMWR_ESPN_BM_PICK_BATCH";
  protocolVersion: typeof ESPN_BM_PROTOCOL_VERSION;
  revision: number;
  provider: "espn-live";
  draftType: "live";
  draftId: string;
  leagueId: string;
  season: number;
  sessionNonce: string;
  teamCount: number;
  draftComplete: boolean;
  baselineOnly: boolean;
  liveNotify: boolean;
  observedAt: string;
  picks: EspnBmBridgePick[];
  diagnostics?: Record<string, unknown> | null;
};

export type EspnBmBridgeStatus = {
  type: "GMWR_ESPN_BM_STATUS";
  protocolVersion: typeof ESPN_BM_PROTOCOL_VERSION;
  revision?: number;
  provider: "espn-live";
  status: string;
  reason?: string | null;
  draftId?: string | null;
  leagueId?: string | null;
  season?: number | null;
  sessionNonce?: string | null;
  draftComplete?: boolean;
  baselineOnly?: boolean;
  espnTabs?: number;
  reached?: number;
  diagnostics?: Record<string, unknown> | null;
};

export type EspnBmBridgePong = {
  type: "GMWR_ESPN_BM_PONG";
  protocolVersion: typeof ESPN_BM_PROTOCOL_VERSION;
  revision?: number;
  provider: "espn-live";
  armed: boolean;
  draftId?: string | null;
  leagueId?: string | null;
  season?: number | null;
  sessionNonce?: string | null;
};

export type EspnBmBridgeSessionReset = {
  type: "GMWR_ESPN_BM_SESSION_RESET";
  protocolVersion: typeof ESPN_BM_PROTOCOL_VERSION;
  provider: "espn-live";
  draftId: string | null;
  leagueId?: string | null;
  sessionNonce?: string | null;
};

function isFromExtension(data: Record<string, unknown>): boolean {
  return data.source === ESPN_BM_EXTENSION_SOURCE || data.channel === ESPN_BM_BRIDGE_CHANNEL;
}

function validatePick(row: unknown): EspnBmBridgePick | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const eventKey = String(r.eventKey ?? "").trim();
  const overallPick = Math.floor(Number(r.overallPick));
  const round = Math.floor(Number(r.round));
  const pickInRound = Math.floor(Number(r.pickInRound));
  const playerId = String(r.playerId ?? "").trim();
  const playerName = String(r.playerName ?? "").trim();
  if (!eventKey || eventKey.length > 200) return null;
  if (!Number.isFinite(overallPick) || overallPick < 1) return null;
  if (!Number.isFinite(round) || round < 1) return null;
  if (!Number.isFinite(pickInRound) || pickInRound < 1) return null;
  if (!playerId || !playerName) return null;
  const playerIdSource =
    r.playerIdSource === "espn" || r.playerIdSource === "synthetic" ? r.playerIdSource : null;
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
      r.nflTeam != null && String(r.nflTeam).trim() ? String(r.nflTeam).trim().slice(0, 8) : null,
    isKeeper: Boolean(r.isKeeper),
    isTradedPick: Boolean(r.isTradedPick),
    playerIdSource,
  };
}

export function parseEspnBookmarkletBridgeMessage(
  data: unknown,
):
  | EspnBmBridgePickBatch
  | EspnBmBridgeStatus
  | EspnBmBridgePong
  | EspnBmBridgeSessionReset
  | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const type = String(d.type ?? "");
  if (!type.startsWith("GMWR_ESPN_BM_")) return null;
  // Never accept FantasyPros namespace
  if (type.startsWith("GMWR_FP_")) return null;
  if (!isFromExtension(d)) {
    // Allow unit tests to omit source/channel when type is explicit.
    if (
      type !== "GMWR_ESPN_BM_PICK_BATCH" &&
      type !== "GMWR_ESPN_BM_STATUS" &&
      type !== "GMWR_ESPN_BM_PONG" &&
      type !== "GMWR_ESPN_BM_SESSION_RESET"
    ) {
      return null;
    }
  }
  if (d.provider != null && d.provider !== "espn-live") return null;
  if (!protocolVersionOk(d.protocolVersion)) return null;

  if (type === "GMWR_ESPN_BM_STATUS") {
    return {
      type: "GMWR_ESPN_BM_STATUS",
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
      revision:
        d.revision != null && Number.isFinite(Number(d.revision))
          ? Math.max(0, Math.floor(Number(d.revision)))
          : undefined,
      provider: "espn-live",
      status: String(d.status ?? "unknown"),
      reason: d.reason != null ? String(d.reason) : null,
      draftId: d.draftId != null ? String(d.draftId) : null,
      leagueId: d.leagueId != null ? String(d.leagueId) : null,
      season: d.season != null && Number.isFinite(Number(d.season)) ? Number(d.season) : null,
      sessionNonce: d.sessionNonce != null ? String(d.sessionNonce) : null,
      draftComplete: d.draftComplete != null ? Boolean(d.draftComplete) : undefined,
      baselineOnly: d.baselineOnly != null ? Boolean(d.baselineOnly) : undefined,
      espnTabs: d.espnTabs != null ? Number(d.espnTabs) : undefined,
      reached: d.reached != null ? Number(d.reached) : undefined,
      diagnostics: (d.diagnostics as Record<string, unknown>) ?? null,
    };
  }

  if (type === "GMWR_ESPN_BM_PONG") {
    return {
      type: "GMWR_ESPN_BM_PONG",
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
      revision:
        d.revision != null && Number.isFinite(Number(d.revision))
          ? Math.max(0, Math.floor(Number(d.revision)))
          : undefined,
      provider: "espn-live",
      armed: Boolean(d.armed),
      draftId: d.draftId != null ? String(d.draftId) : null,
      leagueId: d.leagueId != null ? String(d.leagueId) : null,
      season: d.season != null && Number.isFinite(Number(d.season)) ? Number(d.season) : null,
      sessionNonce: d.sessionNonce != null ? String(d.sessionNonce) : null,
    };
  }

  if (type === "GMWR_ESPN_BM_SESSION_RESET") {
    return {
      type: "GMWR_ESPN_BM_SESSION_RESET",
      protocolVersion: ESPN_BM_PROTOCOL_VERSION,
      provider: "espn-live",
      draftId: d.draftId != null ? String(d.draftId) : null,
      leagueId: d.leagueId != null ? String(d.leagueId) : null,
      sessionNonce: d.sessionNonce != null ? String(d.sessionNonce) : null,
    };
  }

  if (type !== "GMWR_ESPN_BM_PICK_BATCH") return null;

  const draftId = String(d.draftId ?? "").trim();
  const leagueId = String(d.leagueId ?? "").trim();
  const season = Math.floor(Number(d.season));
  const sessionNonce = String(d.sessionNonce ?? "").trim();
  if (!/^espn-live-\d+-\d{4}$/.test(draftId) || draftId.endsWith("-na")) return null;
  if (!/^\d+$/.test(leagueId)) return null;
  if (!Number.isFinite(season) || season < 2000 || season > 2100) return null;
  if (!sessionNonce || sessionNonce.length > 128) return null;
  const revision = Math.floor(Number(d.revision));
  if (!Number.isFinite(revision) || revision < 1) return null;
  if (!Array.isArray(d.picks) || d.picks.length > 256) return null;
  if (d.picks.length === 0 && !d.draftComplete) return null;

  const picks: EspnBmBridgePick[] = [];
  for (const row of d.picks) {
    const v = validatePick(row);
    if (v) picks.push(v);
  }
  if (d.picks.length > 0 && picks.length === 0) return null;

  return {
    type: "GMWR_ESPN_BM_PICK_BATCH",
    protocolVersion: ESPN_BM_PROTOCOL_VERSION,
    revision,
    provider: "espn-live",
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
    diagnostics: (d.diagnostics as Record<string, unknown>) ?? null,
  };
}

/**
 * Smallest adaptation: transport pick fields → NormalizedPickEvent.
 * Already nearly 1:1 with shared draft-source schema.
 */
export function espnBmBatchToNormalized(
  batch: EspnBmBridgePickBatch,
  opts?: { expectedLeagueId?: string; expectedSeason?: number },
): { ok: true; batch: NormalizedPickBatch } | { ok: false; error: string } {
  if (opts?.expectedLeagueId && batch.leagueId !== String(opts.expectedLeagueId)) {
    return { ok: false, error: "league_mismatch" };
  }
  if (opts?.expectedSeason != null && batch.season !== opts.expectedSeason) {
    return { ok: false, error: "season_mismatch" };
  }
  const expectedDraftId = buildEspnLiveDraftId(batch.leagueId, batch.season);
  if (batch.draftId !== expectedDraftId) {
    return { ok: false, error: "unknown_draft_id" };
  }

  const lastOverall =
    batch.picks.length > 0 ? Math.max(...batch.picks.map((p) => p.overallPick)) : -1;

  const picks: NormalizedPickEvent[] = batch.picks.map((p) => ({
    provider: "espn-live",
    draftType: "live",
    draftId: batch.draftId,
    leagueId: batch.leagueId,
    round: p.round,
    pick: p.pickInRound,
    overallPick: p.overallPick,
    teamId: p.teamId,
    ownerId: p.teamId,
    ownerName: p.ownerName || p.teamName,
    playerId: p.playerId,
    playerName: p.playerName,
    position: p.position,
    timestamp: batch.observedAt,
    nflTeam: p.nflTeam,
    adp: null,
    metadata: {
      adapter: "espn-bookmarklet",
      eventKey: p.eventKey,
      isKeeper: p.isKeeper,
      isTradedPick: p.isTradedPick,
      playerIdSource: p.playerIdSource,
      draftCompletePick: Boolean(batch.draftComplete && p.overallPick === lastOverall),
    },
  }));

  return {
    ok: true,
    batch: {
      provider: "espn-live",
      draftType: "live",
      draftId: batch.draftId,
      leagueId: batch.leagueId,
      teamCount: batch.teamCount || 12,
      draftComplete: batch.draftComplete,
      picks,
    },
  };
}

export function postEspnBookmarkletArm(config: {
  leagueId: string;
  season: number;
  sessionNonce: string;
  destination?: string;
  draftPace?: "broadcast" | "brisk" | "turbo";
}): Promise<{
  ok: boolean;
  sessionNonce?: string;
  espnTabs?: number;
  reached?: number;
  error?: string;
}> {
  return new Promise((resolve) => {
    const id = `espn-bm-arm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const armConfig = {
      ...config,
      destination: config.destination || "live-draft",
    };
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_ESPN_BM_ARM_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({
        ok: Boolean(d.ok),
        sessionNonce: d.sessionNonce != null ? String(d.sessionNonce) : armConfig.sessionNonce,
        espnTabs: d.espnTabs != null ? Number(d.espnTabs) : d.tabCount != null ? Number(d.tabCount) : undefined,
        reached: d.reached != null ? Number(d.reached) : undefined,
        error: d.error ? String(d.error) : undefined,
      });
    };
    window.addEventListener("message", onReply);
    window.postMessage(
      {
        type: "GMWR_ESPN_BM_ARM",
        protocolVersion: ESPN_BM_PROTOCOL_VERSION,
        id,
        provider: "espn-live",
        config: armConfig,
      },
      "*",
    );
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 8000);
  });
}

/** RFSN-031B — push auto-inject enable/kill to extension (default off server-side). */
export function postEspnAutoInjectEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const id = `espn-bm-auto-${Date.now()}`;
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_ESPN_BM_SET_AUTO_INJECT_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({ ok: Boolean(d.ok), error: d.error ? String(d.error) : undefined });
    };
    window.addEventListener("message", onReply);
    window.postMessage(
      {
        type: "GMWR_ESPN_BM_SET_AUTO_INJECT",
        protocolVersion: ESPN_BM_PROTOCOL_VERSION,
        id,
        provider: "espn-live",
        enabled: Boolean(enabled),
      },
      "*",
    );
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 5000);
  });
}

export function postEspnBookmarkletDisarm(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const id = `espn-bm-disarm-${Date.now()}`;
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_ESPN_BM_DISARM_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({ ok: Boolean(d.ok), error: d.error ? String(d.error) : undefined });
    };
    window.addEventListener("message", onReply);
    window.postMessage(
      { type: "GMWR_ESPN_BM_DISARM", protocolVersion: ESPN_BM_PROTOCOL_VERSION, id, provider: "espn-live" },
      "*",
    );
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 5000);
  });
}

export function postEspnBookmarkletPing(): Promise<{
  ok: boolean;
  espnTabs?: number;
  reached?: number;
  armed?: boolean;
  sessionNonce?: string | null;
  error?: string;
}> {
  return new Promise((resolve) => {
    const id = `espn-bm-ping-${Date.now()}`;
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_ESPN_BM_PING_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({
        ok: Boolean(d.ok),
        espnTabs: d.espnTabs != null ? Number(d.espnTabs) : undefined,
        reached: d.reached != null ? Number(d.reached) : undefined,
        armed: d.armed != null ? Boolean(d.armed) : undefined,
        sessionNonce: d.sessionNonce != null ? String(d.sessionNonce) : null,
        error: d.error ? String(d.error) : undefined,
      });
    };
    window.addEventListener("message", onReply);
    window.postMessage(
      { type: "GMWR_ESPN_BM_PING", protocolVersion: ESPN_BM_PROTOCOL_VERSION, id, provider: "espn-live" },
      "*",
    );
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 5000);
  });
}

/**
 * Phase 4 — request idempotent board reconciliation after reconnect.
 * Bookmarklet retains boardPicks and emits a PICK_BATCH filtered by afterOverallPick.
 */
export function postEspnBookmarkletReplayRequest(args: {
  draftId: string;
  sessionNonce: string;
  afterOverallPick: number;
  requestId?: string;
}): Promise<{ ok: boolean; reached?: number; error?: string }> {
  return new Promise((resolve) => {
    const id = `espn-bm-replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestId =
      args.requestId?.trim() ||
      `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_ESPN_BM_REPLAY_REQUEST_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({
        ok: Boolean(d.ok),
        reached: d.reached != null ? Number(d.reached) : undefined,
        error: d.error ? String(d.error) : undefined,
      });
    };
    window.addEventListener("message", onReply);
    window.postMessage(
      {
        type: "GMWR_ESPN_BM_REPLAY_REQUEST",
        protocolVersion: ESPN_BM_PROTOCOL_VERSION,
        id,
        provider: "espn-live",
        draftId: args.draftId,
        sessionNonce: args.sessionNonce,
        afterOverallPick: Math.max(0, Math.floor(args.afterOverallPick)),
        requestId,
      },
      "*",
    );
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 8000);
  });
}

export function newEspnBookmarkletSessionNonce(): string {
  return `espn-bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
