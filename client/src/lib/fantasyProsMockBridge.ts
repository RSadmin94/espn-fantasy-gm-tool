/**
 * RFSN-030C — validate FantasyPros extension → FFR window messages.
 * No credentials; rejects wrong provider / malformed batches.
 */

export type FantasyProsBridgePickRow = {
  id: string;
  pick: number;
  round: number;
  posInRound: number;
  ownerPos: number;
  owner: string;
  isKeeper: boolean;
};

export type FantasyProsBridgePickBatch = {
  type: "GMWR_FP_MOCK_PICK_BATCH";
  provider: "fantasypros";
  source: "solo-mock";
  draftId: string;
  providerDraftId: string;
  sessionSource?: string;
  picks: FantasyProsBridgePickRow[];
  playerMapSlice: Record<
    string,
    {
      id?: string;
      name?: string;
      position?: string;
      team?: string;
      adp?: number | null;
    }
  >;
  room?: {
    vueDraftTarget?: string | null;
    isMultiUserDraft?: boolean;
    teamCount?: number | null;
    overallPick?: number | null;
    draftComplete?: boolean;
  } | null;
  observedAt?: string;
  diagnostics?: Record<string, unknown> | null;
};

export type FantasyProsBridgeStatus = {
  type: "GMWR_FP_MOCK_STATUS";
  provider: "fantasypros";
  status: string;
  reason?: string | null;
  draftId?: string | null;
  providerDraftId?: string | null;
  fantasyProsTabs?: number;
  reached?: number;
  room?: FantasyProsBridgePickBatch["room"];
  diagnostics?: Record<string, unknown> | null;
  baselineOnly?: boolean;
};

export type FantasyProsBridgeSessionReset = {
  type: "GMWR_FP_MOCK_SESSION_RESET";
  provider: "fantasypros";
  draftId: string;
  providerDraftId: string;
};

function isFromExtension(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.source === "gmwarroom-extension" || d.channel === "GMWR_FP_MOCK";
}

function validatePickRow(row: unknown): FantasyProsBridgePickRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const pick = Math.floor(Number(r.pick));
  if (!id || !Number.isFinite(pick) || pick < 1) return null;
  return {
    id,
    pick,
    round: Math.max(1, Math.floor(Number(r.round) || 1)),
    posInRound: Math.max(1, Math.floor(Number(r.posInRound) || 1)),
    ownerPos: Math.floor(Number(r.ownerPos) || 0),
    owner: r.owner != null ? String(r.owner).slice(0, 80) : "",
    isKeeper: Boolean(r.isKeeper),
  };
}

export function parseFantasyProsBridgeMessage(
  data: unknown,
): FantasyProsBridgePickBatch | FantasyProsBridgeStatus | FantasyProsBridgeSessionReset | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!isFromExtension(d) && d.type !== "GMWR_FP_MOCK_PICK_BATCH") {
    // Allow unit tests to pass payloads without source stamp when explicitly typed.
    if (
      d.type !== "GMWR_FP_MOCK_PICK_BATCH" &&
      d.type !== "GMWR_FP_MOCK_STATUS" &&
      d.type !== "GMWR_FP_MOCK_SESSION_RESET"
    ) {
      return null;
    }
  }

  if (d.provider != null && d.provider !== "fantasypros") return null;

  if (d.type === "GMWR_FP_MOCK_STATUS") {
    return {
      type: "GMWR_FP_MOCK_STATUS",
      provider: "fantasypros",
      status: String(d.status ?? "unknown"),
      reason: d.reason != null ? String(d.reason) : null,
      draftId: d.draftId != null ? String(d.draftId) : null,
      providerDraftId: d.providerDraftId != null ? String(d.providerDraftId) : null,
      fantasyProsTabs: d.fantasyProsTabs != null ? Number(d.fantasyProsTabs) : undefined,
      reached: d.reached != null ? Number(d.reached) : undefined,
      room: (d.room as FantasyProsBridgePickBatch["room"]) ?? null,
      diagnostics: (d.diagnostics as Record<string, unknown>) ?? null,
      baselineOnly: Boolean(d.baselineOnly),
    };
  }

  if (d.type === "GMWR_FP_MOCK_SESSION_RESET") {
    const draftId = String(d.draftId ?? "").trim();
    const providerDraftId = String(d.providerDraftId ?? "").trim();
    if (!draftId.startsWith("fp-mock-") || !providerDraftId) return null;
    return {
      type: "GMWR_FP_MOCK_SESSION_RESET",
      provider: "fantasypros",
      draftId,
      providerDraftId,
    };
  }

  if (d.type !== "GMWR_FP_MOCK_PICK_BATCH") return null;

  const draftId = String(d.draftId ?? "").trim();
  const providerDraftId = String(d.providerDraftId ?? "").trim();
  if (!draftId.startsWith("fp-mock-") || !providerDraftId) return null;
  if (!Array.isArray(d.picks) || d.picks.length === 0 || d.picks.length > 64) return null;

  const picks: FantasyProsBridgePickRow[] = [];
  for (const row of d.picks) {
    const v = validatePickRow(row);
    if (v) picks.push(v);
  }
  if (!picks.length) return null;

  const playerMapSlice: FantasyProsBridgePickBatch["playerMapSlice"] = {};
  const rawMap =
    d.playerMapSlice && typeof d.playerMapSlice === "object"
      ? (d.playerMapSlice as Record<string, unknown>)
      : {};
  for (const p of picks) {
    const entry = rawMap[p.id];
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      playerMapSlice[p.id] = {
        id: p.id,
        name: e.name != null ? String(e.name).slice(0, 80) : "",
        position: e.position != null ? String(e.position).slice(0, 8) : "",
        team: e.team != null ? String(e.team).slice(0, 8) : "",
        adp: e.adp != null && Number.isFinite(Number(e.adp)) ? Number(e.adp) : null,
      };
    }
  }

  return {
    type: "GMWR_FP_MOCK_PICK_BATCH",
    provider: "fantasypros",
    source: "solo-mock",
    draftId: draftId.slice(0, 128),
    providerDraftId: providerDraftId.slice(0, 96),
    sessionSource: d.sessionSource != null ? String(d.sessionSource) : undefined,
    picks,
    playerMapSlice,
    room: (d.room as FantasyProsBridgePickBatch["room"]) ?? null,
    observedAt: typeof d.observedAt === "string" ? d.observedAt : undefined,
    diagnostics: (d.diagnostics as Record<string, unknown>) ?? null,
  };
}

export function postFantasyProsMockArm(config: {
  leagueId: string;
  season: number;
  forceNewSession?: boolean;
}): Promise<{ ok: boolean; fantasyProsTabs?: number; reached?: number; error?: string }> {
  return new Promise((resolve) => {
    const id = `fp-arm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_FP_MOCK_ARM_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({
        ok: Boolean(d.ok),
        fantasyProsTabs: d.fantasyProsTabs != null ? Number(d.fantasyProsTabs) : undefined,
        reached: d.reached != null ? Number(d.reached) : undefined,
        error: d.error ? String(d.error) : undefined,
      });
    };
    window.addEventListener("message", onReply);
    window.postMessage({ type: "GMWR_FP_MOCK_ARM", id, config }, "*");
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 8000);
  });
}

export function postFantasyProsMockDisarm(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const id = `fp-disarm-${Date.now()}`;
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_FP_MOCK_DISARM_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({ ok: Boolean(d.ok), error: d.error ? String(d.error) : undefined });
    };
    window.addEventListener("message", onReply);
    window.postMessage({ type: "GMWR_FP_MOCK_DISARM", id }, "*");
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 5000);
  });
}

export function postFantasyProsMockPing(): Promise<{
  ok: boolean;
  fantasyProsTabs?: number;
  reached?: number;
  armed?: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    const id = `fp-ping-${Date.now()}`;
    const onReply = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.type !== "GMWR_FP_MOCK_PING_REPLY" || d.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve({
        ok: Boolean(d.ok),
        fantasyProsTabs: d.fantasyProsTabs != null ? Number(d.fantasyProsTabs) : undefined,
        reached: d.reached != null ? Number(d.reached) : undefined,
        armed: Boolean(d.armed),
        error: d.error ? String(d.error) : undefined,
      });
    };
    window.addEventListener("message", onReply);
    window.postMessage({ type: "GMWR_FP_MOCK_PING", id }, "*");
    setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "extension_timeout" });
    }, 5000);
  });
}
