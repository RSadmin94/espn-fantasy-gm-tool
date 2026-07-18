/**
 * Sprint 10.1 — ESPN Live Draft Monitoring (pure).
 * Converts mDraftDetail payloads into locked-pick rows and diffs new finals.
 * Does not call RFSN, TTS, or editorial routing.
 */

export type EspnLiveLockedPick = {
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
};

export type EspnLiveDraftSnapshot = {
  season: number;
  teamCount: number;
  draftComplete: boolean;
  picks: EspnLiveLockedPick[];
};

const POSITION_MAP: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};

/** Distinct from war-room-live-* so sim and ESPN sessions never collide. */
export function buildEspnLiveDraftId(leagueId: string, season: number): string {
  const lid = String(leagueId ?? "").trim() || "unknown";
  const yr = Number.isFinite(season) && season > 0 ? Math.floor(season) : new Date().getFullYear();
  return `espn-live-${lid}-${yr}`;
}

function teamsFromPayload(data: Record<string, unknown>): Record<string, unknown>[] {
  const teams = data.teams;
  if (Array.isArray(teams)) return teams.filter((t) => t && typeof t === "object") as Record<string, unknown>[];
  if (teams && typeof teams === "object") {
    return Object.values(teams as Record<string, unknown>).filter(
      (t) => t && typeof t === "object",
    ) as Record<string, unknown>[];
  }
  return [];
}

function extractPickRows(data: Record<string, unknown>): Record<string, unknown>[] {
  const dd = data.draftDetail as Record<string, unknown> | undefined;
  if (!dd || typeof dd !== "object" || Array.isArray(dd)) return [];
  for (const key of ["picks", "draftedPlayers", "draftResults"] as const) {
    const arr = dd[key];
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
    }
  }
  return [];
}

function ownerLabel(team: Record<string, unknown> | undefined, teamId: number): string {
  if (!team) return `Team ${teamId}`;
  const owners = team.owners;
  if (Array.isArray(owners) && owners.length > 0) {
    const first = owners[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object") {
      const o = first as Record<string, unknown>;
      const name =
        [o.firstName, o.lastName].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() ||
        (typeof o.displayName === "string" ? o.displayName.trim() : "");
      if (name) return name;
    }
  }
  const loc = typeof team.location === "string" ? team.location.trim() : "";
  const nick = typeof team.nickname === "string" ? team.nickname.trim() : "";
  const combined = `${loc} ${nick}`.trim();
  if (combined) return combined;
  if (typeof team.name === "string" && team.name.trim()) return team.name.trim();
  return `Team ${teamId}`;
}

function playerFromPick(pick: Record<string, unknown>): {
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string | null;
} {
  const pool = (pick.playerPoolEntry as Record<string, unknown>) || {};
  const player = (pool.player as Record<string, unknown>) || {};
  const rawPid = pick.playerId ?? player.id;
  const pidNum = rawPid != null && Number.isFinite(Number(rawPid)) ? Number(rawPid) : 0;
  const name =
    (typeof player.fullName === "string" && player.fullName.trim()) ||
    (typeof pick.playerName === "string" && pick.playerName.trim()) ||
    (typeof pick.fullName === "string" && pick.fullName.trim()) ||
    "";
  const posId = Number(player.defaultPositionId ?? pick.defaultPositionId ?? 0);
  const position = POSITION_MAP[posId] || (posId > 0 ? "?" : "?");
  const proTeamId = player.proTeamId;
  let nflTeam: string | null = null;
  if (typeof player.proTeam === "string" && player.proTeam.trim()) {
    nflTeam = player.proTeam.trim();
  } else if (proTeamId != null && Number.isFinite(Number(proTeamId))) {
    nflTeam = String(proTeamId);
  }
  return {
    playerId: pidNum > 0 ? String(pidNum) : name ? `name:${name.toLowerCase()}` : "",
    playerName: name,
    position,
    nflTeam,
  };
}

/**
 * Parse ESPN league JSON (mDraftDetail or combined views) into locked picks only.
 * Rows without a player name are ignored (provisional / on-the-clock).
 */
export function parseEspnLiveDraftSnapshot(
  data: unknown,
  opts?: { ownerNameByTeamId?: ReadonlyMap<string, string> },
): EspnLiveDraftSnapshot | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const rows = extractPickRows(payload);
  if (rows.length === 0 && !(payload.draftDetail && typeof payload.draftDetail === "object")) {
    return null;
  }

  const seasonRaw = payload.seasonId;
  const season =
    typeof seasonRaw === "number" && Number.isFinite(seasonRaw)
      ? seasonRaw
      : typeof seasonRaw === "string" && /^\d+$/.test(seasonRaw)
        ? Number(seasonRaw)
        : 0;

  const settings = (payload.settings as Record<string, unknown>) || {};
  const teams = teamsFromPayload(payload);
  const sizeRaw = (settings.size as number) ?? (settings.teamCount as number);
  const teamCount =
    typeof sizeRaw === "number" && sizeRaw > 0
      ? sizeRaw
      : teams.length > 0
        ? teams.length
        : 14;

  const teamById = new Map<number, Record<string, unknown>>();
  for (const t of teams) {
    const tid = Number(t.id);
    if (Number.isFinite(tid)) teamById.set(tid, t);
  }

  const dd = (payload.draftDetail as Record<string, unknown>) || {};
  const draftComplete = Boolean(dd.drafted);

  const picks: EspnLiveLockedPick[] = [];
  for (const pick of rows) {
    const overallPick = Number(
      pick.overallPickNumber ?? pick.overallPick ?? pick.overallPickId ?? 0,
    );
    if (!Number.isFinite(overallPick) || overallPick <= 0) continue;

    const player = playerFromPick(pick);
    if (!player.playerName.trim()) continue; // provisional — do not notify

    const teamIdNum = Number(pick.teamId ?? 0);
    const teamId = Number.isFinite(teamIdNum) && teamIdNum > 0 ? String(teamIdNum) : "0";
    const fromOpts = opts?.ownerNameByTeamId?.get(teamId);
    const ownerName =
      fromOpts?.trim() ||
      ownerLabel(teamById.get(teamIdNum), teamIdNum);

    let round = Number(pick.roundId ?? pick.round ?? 0);
    if (round <= 0 && teamCount > 0) {
      round = Math.floor((overallPick - 1) / teamCount) + 1;
    }
    let roundPick = Number(pick.roundPickNumber ?? pick.pickInRound ?? 0);
    if (roundPick <= 0 && teamCount > 0) {
      roundPick = ((overallPick - 1) % teamCount) + 1;
    }

    const isKeeper = Boolean(pick.keeper || pick.reservedForKeeper);
    picks.push({
      overallPick,
      round: round > 0 ? round : 1,
      roundPick: roundPick > 0 ? roundPick : 1,
      teamId,
      ownerName,
      playerId: player.playerId || `pick:${overallPick}`,
      playerName: player.playerName.trim(),
      position: player.position || "?",
      nflTeam: player.nflTeam,
      adp: null,
      isKeeper,
    });
  }

  picks.sort((a, b) => a.overallPick - b.overallPick);
  return { season, teamCount, draftComplete, picks };
}

/** Newly finalized picks present in `next` but not in `prev` (by overallPick + player identity). */
export function diffEspnLiveLockedPicks(
  prev: readonly EspnLiveLockedPick[],
  next: readonly EspnLiveLockedPick[],
): EspnLiveLockedPick[] {
  const prevKeys = new Set(
    prev.map((p) => `${p.overallPick}:${p.playerId}:${p.playerName.trim().toLowerCase()}`),
  );
  const out: EspnLiveLockedPick[] = [];
  for (const p of next) {
    const key = `${p.overallPick}:${p.playerId}:${p.playerName.trim().toLowerCase()}`;
    if (prevKeys.has(key)) continue;
    out.push(p);
  }
  return out;
}

export function espnLiveLockedPickNotifyKey(draftId: string, pick: EspnLiveLockedPick): string {
  return `${draftId}:${pick.overallPick}:${pick.playerId}:${pick.playerName.trim().toLowerCase()}`;
}

/**
 * Idempotent notify selection — same locked pick never notifies twice for a draftId.
 * Returns picks that should fire notifyLockedPick and the updated notified key set.
 */
export function selectEspnLivePicksToNotify(
  draftId: string,
  newlyLocked: readonly EspnLiveLockedPick[],
  alreadyNotified: ReadonlySet<string>,
): { toNotify: EspnLiveLockedPick[]; nextNotified: Set<string> } {
  const nextNotified = new Set(alreadyNotified);
  const toNotify: EspnLiveLockedPick[] = [];
  for (const pick of newlyLocked) {
    const key = espnLiveLockedPickNotifyKey(draftId, pick);
    if (nextNotified.has(key)) continue;
    nextNotified.add(key);
    toNotify.push(pick);
  }
  return { toNotify, nextNotified };
}
