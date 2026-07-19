/**
 * RFSN-030C — FantasyPros solo mock draft monitor (pure).
 * Diffs Vue `draftedPlayers` into LockedPick-shaped rows. No ESPN / network.
 */

export const FANTASYPROS_PROVIDER = "fantasypros" as const;
export const FANTASYPROS_SOURCE_SOLO_MOCK = "solo-mock" as const;

export type FantasyProsDraftedPlayer = {
  id?: unknown;
  pick?: unknown;
  round?: unknown;
  posInRound?: unknown;
  ownerPos?: unknown;
  owner?: unknown;
  isKeeper?: unknown;
  isUserTeam?: unknown;
  isNewPick?: unknown;
};

export type FantasyProsPlayerMapEntry = {
  id?: unknown;
  name?: unknown;
  position?: unknown;
  team?: unknown;
  adp?: unknown;
  first_name?: unknown;
  last_name?: unknown;
};

export type FantasyProsLockedPick = {
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: string;
  ownerName: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string | null;
  adp: number | null;
  isKeeper: boolean;
  observedAt: string;
  provider: typeof FANTASYPROS_PROVIDER;
  providerPlayerId: string;
  providerDraftId: string;
  source: typeof FANTASYPROS_SOURCE_SOLO_MOCK;
  identityConfidence: "provider" | "name_team_pos" | "name_only" | "unknown";
  /** Optional canonical ESPN/internal id when a join succeeds. */
  canonicalPlayerId?: string | null;
};

export type FantasyProsDraftRoomSnapshot = {
  compatible: boolean;
  reason?: string;
  vueDraftTarget?: string | null;
  isMultiUserDraft?: boolean | null;
  overallPick?: number;
  teamCount?: number;
  draftComplete?: boolean;
  mockDraftKey?: string | null;
  dcId?: string | null;
  draftedPlayers: FantasyProsDraftedPlayer[];
  playerMap: Record<string, FantasyProsPlayerMapEntry>;
};

export type FantasyProsSessionIdentity = {
  draftId: string;
  providerDraftId: string;
  source: "mockDraftKey" | "dcId" | "generated";
};

/** Distinct from espn-live-* and war-room-live-* so sessions never collide. */
export function buildFantasyProsMockDraftId(sessionKey: string): string {
  const key = String(sessionKey ?? "").trim() || "unknown";
  const safe = key.replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 96);
  return `fp-mock-${safe}`;
}

export function resolveFantasyProsSessionIdentity(args: {
  mockDraftKey?: string | null;
  dcId?: string | null;
  generatedFallback?: string | null;
}): FantasyProsSessionIdentity {
  const mockKey = String(args.mockDraftKey ?? "").trim();
  if (mockKey) {
    return {
      draftId: buildFantasyProsMockDraftId(mockKey),
      providerDraftId: mockKey,
      source: "mockDraftKey",
    };
  }
  const dc = String(args.dcId ?? "").trim();
  if (dc) {
    return {
      draftId: buildFantasyProsMockDraftId(dc),
      providerDraftId: dc,
      source: "dcId",
    };
  }
  const gen = String(args.generatedFallback ?? "").trim() || `gen-${Date.now()}`;
  return {
    draftId: buildFantasyProsMockDraftId(gen),
    providerDraftId: gen,
    source: "generated",
  };
}

export function fantasyProsPickDedupeKey(
  draftSessionId: string,
  overallPick: number,
  playerId: string,
): string {
  return `${draftSessionId}:${overallPick}:${playerId}`;
}

export function normalizePlayerName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectFantasyProsSoloRoom(input: {
  pathname?: string;
  vueDraftTarget?: string | null;
  isMultiUserDraft?: boolean | null;
  hasDraftState?: boolean;
  hasDraftedPlayers?: boolean;
}): { ok: boolean; reason?: string } {
  const path = String(input.pathname ?? "");
  if (path && !/mock-draft-simulator\/live/i.test(path) && !/\/live\/?$/i.test(path)) {
    // Allow empty pathname (unit tests); when provided, prefer live mock route.
    if (/draftwizard\.fantasypros\.com/i.test(path) === false && path.startsWith("http")) {
      return { ok: false, reason: "wrong_host" };
    }
  }
  if (!input.hasDraftState) return { ok: false, reason: "draft_state_unavailable" };
  if (input.vueDraftTarget != null && input.vueDraftTarget !== "local") {
    return { ok: false, reason: "not_local_vue_target" };
  }
  if (input.isMultiUserDraft === true) {
    return { ok: false, reason: "multiuser_not_supported" };
  }
  if (!input.hasDraftedPlayers && input.hasDraftedPlayers !== false) {
    // hasDraftedPlayers false means array exists but empty — still compatible
  }
  return { ok: true };
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

export function mapFantasyProsOwnerLabel(
  owner: string,
  ownerPos: number,
  seatNameByPos?: ReadonlyMap<number, string> | null,
): { ownerName: string; mappingConfirmed: boolean } {
  const mapped = seatNameByPos?.get(ownerPos);
  if (mapped && mapped.trim()) {
    return { ownerName: mapped.trim(), mappingConfirmed: true };
  }
  const raw = str(owner);
  if (raw && !/^your team$/i.test(raw) && !/^team\s*\d+$/i.test(raw)) {
    return { ownerName: raw, mappingConfirmed: false };
  }
  if (raw) return { ownerName: raw, mappingConfirmed: false };
  return { ownerName: `FantasyPros Seat ${ownerPos + 1}`, mappingConfirmed: false };
}

export type CanonicalPlayerHint = {
  espnPlayerId?: string | null;
  name?: string | null;
  nflTeam?: string | null;
  position?: string | null;
};

/**
 * Join drafted row + playerMap into a LockedPick-shaped FantasyPros pick.
 */
export function mapFantasyProsDraftedPick(
  row: FantasyProsDraftedPlayer,
  playerMap: Record<string, FantasyProsPlayerMapEntry>,
  opts: {
    providerDraftId: string;
    observedAt?: string;
    seatNameByPos?: ReadonlyMap<number, string> | null;
    canonicalHints?: readonly CanonicalPlayerHint[] | null;
  },
): FantasyProsLockedPick | null {
  const overallPick = Math.floor(num(row.pick, 0));
  if (overallPick < 1) return null;
  const playerId = str(row.id);
  if (!playerId) return null;

  const fromMap = playerMap[playerId] || playerMap[String(Number(playerId))] || {};
  const playerName =
    str(fromMap.name) ||
    [str(fromMap.first_name), str(fromMap.last_name)].filter(Boolean).join(" ") ||
    `Player ${playerId}`;
  const position = str(fromMap.position, "?").toUpperCase() || "?";
  const nflTeam = str(fromMap.team) || null;
  const adpRaw = fromMap.adp;
  const adp =
    adpRaw == null || adpRaw === ""
      ? null
      : Number.isFinite(Number(adpRaw))
        ? Number(adpRaw)
        : null;

  const ownerPos = Math.floor(num(row.ownerPos, 0));
  const { ownerName } = mapFantasyProsOwnerLabel(str(row.owner), ownerPos, opts.seatNameByPos);

  let identityConfidence: FantasyProsLockedPick["identityConfidence"] = "provider";
  let canonicalPlayerId: string | null = null;
  const hints = opts.canonicalHints;
  if (hints && hints.length > 0) {
    const norm = normalizePlayerName(playerName);
    const hit = hints.find((h) => {
      if (!h?.name) return false;
      const sameName = normalizePlayerName(String(h.name)) === norm;
      if (!sameName) return false;
      const teamOk =
        !nflTeam ||
        !h.nflTeam ||
        String(h.nflTeam).toUpperCase() === String(nflTeam).toUpperCase();
      const posOk =
        !h.position ||
        !position ||
        position === "?" ||
        String(h.position).toUpperCase() === position;
      return teamOk && posOk;
    });
    if (hit?.espnPlayerId) {
      canonicalPlayerId = String(hit.espnPlayerId);
      identityConfidence =
        hit.nflTeam && hit.position ? "name_team_pos" : "name_only";
    } else if (playerName === `Player ${playerId}`) {
      identityConfidence = "unknown";
    }
  } else if (playerName === `Player ${playerId}`) {
    identityConfidence = "unknown";
  }

  const round = Math.max(1, Math.floor(num(row.round, 1)));
  const roundPick = Math.max(1, Math.floor(num(row.posInRound, 1)));

  return {
    overallPick,
    round,
    roundPick,
    teamId: String(ownerPos),
    ownerName,
    playerId: canonicalPlayerId || playerId,
    playerName,
    position,
    nflTeam,
    adp,
    isKeeper: Boolean(row.isKeeper),
    observedAt: opts.observedAt || new Date().toISOString(),
    provider: FANTASYPROS_PROVIDER,
    providerPlayerId: playerId,
    providerDraftId: opts.providerDraftId,
    source: FANTASYPROS_SOURCE_SOLO_MOCK,
    identityConfidence,
    canonicalPlayerId,
  };
}

export function parseFantasyProsDraftedPlayers(
  draftedPlayers: readonly FantasyProsDraftedPlayer[],
  playerMap: Record<string, FantasyProsPlayerMapEntry>,
  opts: {
    providerDraftId: string;
    observedAt?: string;
    seatNameByPos?: ReadonlyMap<number, string> | null;
    canonicalHints?: readonly CanonicalPlayerHint[] | null;
  },
): FantasyProsLockedPick[] {
  const out: FantasyProsLockedPick[] = [];
  for (const row of draftedPlayers) {
    const mapped = mapFantasyProsDraftedPick(row, playerMap, opts);
    if (mapped) out.push(mapped);
  }
  out.sort((a, b) => a.overallPick - b.overallPick);
  return out;
}

/**
 * Diff previous vs next locked picks; returns newly finalized picks in ascending order.
 * Keepers are included in the list but callers should exclude them from notify.
 */
export function diffFantasyProsLockedPicks(
  prev: readonly FantasyProsLockedPick[],
  next: readonly FantasyProsLockedPick[],
): FantasyProsLockedPick[] {
  const prevKeys = new Set(
    prev.map((p) => fantasyProsPickDedupeKey("x", p.overallPick, p.providerPlayerId)),
  );
  const added: FantasyProsLockedPick[] = [];
  for (const p of next) {
    const key = fantasyProsPickDedupeKey("x", p.overallPick, p.providerPlayerId);
    if (prevKeys.has(key)) continue;
    // Prefer same overallPick replacement as new if player changed
    const prevSameSlot = prev.find((x) => x.overallPick === p.overallPick);
    if (prevSameSlot && prevSameSlot.providerPlayerId === p.providerPlayerId) continue;
    if (prevSameSlot && prevSameSlot.providerPlayerId !== p.providerPlayerId) {
      added.push(p);
      continue;
    }
    if (!prevSameSlot) added.push(p);
  }
  return added.sort((a, b) => a.overallPick - b.overallPick);
}

export function selectFantasyProsPicksToNotify(
  draftSessionId: string,
  newly: readonly FantasyProsLockedPick[],
  alreadyNotified: ReadonlySet<string>,
): { toNotify: FantasyProsLockedPick[]; nextNotified: Set<string> } {
  const nextNotified = new Set(alreadyNotified);
  const toNotify: FantasyProsLockedPick[] = [];
  for (const pick of newly) {
    if (pick.isKeeper) continue;
    const key = fantasyProsPickDedupeKey(
      draftSessionId,
      pick.overallPick,
      pick.providerPlayerId,
    );
    if (nextNotified.has(key)) continue;
    nextNotified.add(key);
    toNotify.push(pick);
  }
  return { toNotify, nextNotified };
}

/** Detect draft reset / new mock when picks shrink or session key changes. */
export function detectFantasyProsDraftReset(args: {
  prevProviderDraftId: string | null;
  nextProviderDraftId: string | null;
  prevPickCount: number;
  nextPickCount: number;
  prevOverallPick?: number;
  nextOverallPick?: number;
}): boolean {
  if (
    args.prevProviderDraftId &&
    args.nextProviderDraftId &&
    args.prevProviderDraftId !== args.nextProviderDraftId
  ) {
    return true;
  }
  if (args.prevPickCount > 0 && args.nextPickCount === 0) return true;
  if (
    args.prevPickCount >= 3 &&
    args.nextPickCount > 0 &&
    args.nextPickCount < Math.floor(args.prevPickCount / 2) &&
    (args.nextOverallPick ?? 0) <= 2
  ) {
    return true;
  }
  return false;
}

export function toNotifyLockedPickPayload(
  pick: FantasyProsLockedPick,
  args: {
    leagueId: string;
    draftId: string;
    teamCount: number;
    draftComplete?: boolean;
    draftPace?: "broadcast" | "brisk" | "turbo";
  },
) {
  return {
    leagueId: args.leagueId,
    draftId: args.draftId,
    pick: {
      overallPick: pick.overallPick,
      round: pick.round,
      roundPick: pick.roundPick,
      teamId: pick.teamId,
      ownerName: pick.ownerName,
      playerId: pick.playerId,
      playerName: pick.playerName,
      position: pick.position,
      nflTeam: pick.nflTeam,
      adp: pick.adp,
    },
    draftComplete: Boolean(args.draftComplete),
    draftPace: args.draftPace,
    teamCount: args.teamCount,
    // Provider metadata (optional; ignored by older servers)
    provider: pick.provider,
    providerPlayerId: pick.providerPlayerId,
    providerDraftId: pick.providerDraftId,
    source: pick.source,
    observedAt: pick.observedAt,
    identityConfidence: pick.identityConfidence,
  };
}
