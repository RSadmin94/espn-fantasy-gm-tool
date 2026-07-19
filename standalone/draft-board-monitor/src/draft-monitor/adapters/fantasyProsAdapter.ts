/**
 * FantasyPros Mock Draft Simulator adapter.
 * Reuses proven __debugStore.draftState reading patterns from page-observer.js.
 * Emits NormalizedDraftSnapshot only — no Rivals notify path.
 */
import {
  emptySnapshot,
  type DraftStatus,
  type NormalizedDraftPick,
  type NormalizedDraftSnapshot,
  type NormalizedDraftTeam,
} from "../normalize/draftTypes";
import { buildEventKey } from "../normalize/eventKey";
import { resolveCurrentOwner } from "../normalize/pickOwnership";

export type FantasyProsRawStore = {
  draftState?: Record<string, unknown> | null;
  playerMap?: Record<string, unknown> | null;
  vueDraftTarget?: unknown;
  isMultiUserDraft?: unknown;
  mockDraftKey?: unknown;
  dcId?: unknown;
};

export type FantasyProsReadResult = {
  ok: boolean;
  error?: string;
  snapshot?: NormalizedDraftSnapshot;
  sourcePickCount?: number;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

/** Re-read current store — never retain a stale draftState reference. */
export function readFantasyProsDebugStore(
  win: Window & { __debugStore?: FantasyProsRawStore; draftRoomData?: Record<string, unknown> },
): FantasyProsRawStore | null {
  try {
    const store = win.__debugStore;
    if (!store || !store.draftState) return null;
    return store;
  } catch {
    return null;
  }
}

export function buildFantasyProsFingerprint(args: {
  mockDraftKey?: string | null;
  dcId?: string | null;
  draftName?: string | null;
  teamCount: number;
  teamIds: string[];
}): string {
  if (args.mockDraftKey) return `fantasypros:mdk:${args.mockDraftKey}`;
  if (args.dcId) return `fantasypros:dc:${args.dcId}`;
  const teams = args.teamIds.slice().sort().join(",");
  return `fantasypros:fp:${args.draftName ?? "unnamed"}:${args.teamCount}:${teams}`;
}

export function observeFantasyProsFromStore(
  store: FantasyProsRawStore,
  opts?: { pathname?: string; nowIso?: string },
): FantasyProsReadResult {
  const ds = store.draftState;
  if (!ds || typeof ds !== "object") {
    return { ok: false, error: "FantasyPros draft state not found" };
  }

  const drafted = Array.isArray(ds.draftedPlayers) ? ds.draftedPlayers : null;
  if (!drafted) {
    return { ok: false, error: "FantasyPros draftedPlayers unavailable" };
  }

  const vueTarget = str(store.vueDraftTarget ?? ds.vueDraftTarget, "local");
  if (vueTarget && vueTarget !== "local") {
    return { ok: false, error: `Unsupported vueDraftTarget: ${vueTarget}` };
  }
  if (store.isMultiUserDraft === true || ds.isMultiUserDraft === true) {
    return { ok: false, error: "Multi-user FantasyPros draft not supported in standalone monitor" };
  }

  const playerMap =
    (store.playerMap && typeof store.playerMap === "object" ? store.playerMap : null) ||
    (ds.playerMap && typeof ds.playerMap === "object"
      ? (ds.playerMap as Record<string, unknown>)
      : {}) ||
    {};

  const mockDraftKey =
    str(ds.mockDraftKey) || str(store.mockDraftKey) || null;
  const dcId = str(ds.dcId) || str(store.dcId) || null;
  const draftId = mockDraftKey
    ? `fp-mock-${mockDraftKey}`
    : dcId
      ? `fp-mock-${dcId}`
      : undefined;

  const teamsRaw = Array.isArray(ds.teams) ? ds.teams : [];
  const teams = extractTeams(teamsRaw, drafted);
  const teamCount =
    num(ds.teamCount, 0) ||
    teams.length ||
    maxOwnerPos(drafted) + 1;

  // Ensure seats exist even when teams[] is missing
  const ensuredTeams: NormalizedDraftTeam[] =
    teams.length > 0
      ? teams
      : Array.from({ length: Math.max(teamCount, 0) }, (_, i) => ({
          teamId: `seat-${i}`,
          teamName: `Team ${i + 1}`,
          draftSlot: i + 1,
        }));

  const draftName =
    str(ds.title) ||
    str(ds.draftName) ||
    str(ds.leagueName) ||
    undefined;

  const fingerprint = buildFantasyProsFingerprint({
    mockDraftKey,
    dcId,
    draftName: draftName ?? null,
    teamCount: ensuredTeams.length,
    teamIds: ensuredTeams.map((t) => t.teamId),
  });

  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const picks: NormalizedDraftPick[] = [];
  let seq = 0;

  for (const row of drafted) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const playerId = str(r.id);
    const overallPick = Math.floor(num(r.pick, 0));
    if (!playerId || overallPick < 1) continue;

    const round = Math.max(1, Math.floor(num(r.round, 1)));
    const pickInRound = Math.max(1, Math.floor(num(r.posInRound, 1)));
    const ownerPos = Math.floor(num(r.ownerPos, -1));
    const ownerLabel = str(r.owner);
    const isKeeper = Boolean(r.isKeeper);
    const keeperStatusKnown = Object.prototype.hasOwnProperty.call(r, "isKeeper");

    const pm = (playerMap[playerId] ||
      playerMap[String(Number(playerId))]) as Record<string, unknown> | undefined;
    const playerName =
      str(pm?.name) ||
      [str(pm?.first_name), str(pm?.last_name)].filter(Boolean).join(" ") ||
      `Player ${playerId}`;
    const position = normalizePos(str(pm?.position));
    const nflTeam = str(pm?.team) || undefined;

    const seat =
      ownerPos >= 0
        ? ensuredTeams.find((t) => t.draftSlot === ownerPos + 1) ||
          ensuredTeams[ownerPos]
        : undefined;

    const owner = resolveCurrentOwner({
      currentTeamId: seat?.teamId ?? (ownerPos >= 0 ? `seat-${ownerPos}` : undefined),
      currentTeamName: seat?.teamName ?? (ownerLabel || undefined),
      originalDraftSlot: ownerPos >= 0 ? ownerPos + 1 : undefined,
      teams: ensuredTeams,
    });

    // Traded: FantasyPros ownerPos is current seat; original slot equals ownerPos unless trade meta exists
    const tradeMeta = r.tradedFrom != null || r.originalOwnerPos != null;
    const originalOwnerPos =
      r.originalOwnerPos != null ? Math.floor(num(r.originalOwnerPos, ownerPos)) : ownerPos;
    const traded =
      tradeMeta && originalOwnerPos !== ownerPos
        ? true
        : owner.isTradedPick;

    const eventKey = buildEventKey({
      source: "fantasypros",
      sourceEventId: `${draftId ?? fingerprint}:${overallPick}:${playerId}`,
      draftId,
      overallPick,
      round,
      pickInRound,
      teamId: owner.currentTeamId,
      playerId,
      teamName: owner.currentTeamName,
      playerName,
    });

    picks.push({
      eventKey,
      source: "fantasypros",
      draftId,
      overallPick,
      round,
      pickInRound,
      originalDraftSlot: originalOwnerPos >= 0 ? originalOwnerPos + 1 : undefined,
      currentTeamId: owner.currentTeamId,
      currentTeamName: owner.currentTeamName,
      currentOwnerName: ownerLabel || undefined,
      originalTeamId: owner.originalTeamId,
      originalTeamName: owner.originalTeamName,
      playerId,
      playerName,
      nflTeam,
      position,
      isKeeper,
      isTradedPick: traded,
      isLiveSelection: !isKeeper,
      keeperStatusKnown,
      sourceSequence: seq++,
      sourceTimestamp: nowIso,
    });
  }

  const draftComplete = Boolean(ds.draftComplete || ds.isComplete);
  const overallPickCursor = num(ds.overallPick || ds.pick, picks.length);
  let status: DraftStatus = "UNKNOWN";
  if (draftComplete) status = "COMPLETE";
  else if (picks.length === 0 && overallPickCursor <= 1) status = "NOT_STARTED";
  else if (picks.length > 0) status = "ACTIVE";
  else status = "NOT_STARTED";

  if (ds.paused === true || ds.isPaused === true) status = "PAUSED";

  const roundCount =
    num(ds.rounds, 0) ||
    num(ds.totalRounds, 0) ||
    (picks.length && teamCount
      ? Math.max(...picks.map((p) => p.round))
      : undefined) ||
    undefined;

  const userTeam = ensuredTeams.find((t) => t.isUserTeam);

  const onClockIdx =
    ds.teamIndexTheClock != null
      ? Math.floor(num(ds.teamIndexTheClock, -1))
      : ds.teamOnTheClock != null
        ? Math.floor(num(ds.teamOnTheClock, -1))
        : -1;

  const snapshot: NormalizedDraftSnapshot = {
    source: "fantasypros",
    draftId,
    draftName,
    status,
    teamCount: ensuredTeams.length,
    roundCount: roundCount || undefined,
    teams: ensuredTeams,
    picks,
    currentOverallPick: status === "COMPLETE" ? undefined : overallPickCursor || undefined,
    currentRound:
      status === "COMPLETE"
        ? undefined
        : Math.max(1, Math.floor(num(ds.round, Math.ceil(overallPickCursor / Math.max(ensuredTeams.length, 1))))),
    currentPickInRound:
      status === "COMPLETE"
        ? undefined
        : ((overallPickCursor - 1) % Math.max(ensuredTeams.length, 1)) + 1,
    onTheClockTeamId:
      status === "ACTIVE" && onClockIdx >= 0
        ? ensuredTeams[onClockIdx]?.teamId
        : undefined,
    userTeamId: userTeam?.teamId,
    lastUpdatedAt: nowIso,
    draftFingerprint: fingerprint,
  };

  return { ok: true, snapshot, sourcePickCount: drafted.length };
}

function extractTeams(
  teamsRaw: unknown[],
  drafted: unknown[],
): NormalizedDraftTeam[] {
  const out: NormalizedDraftTeam[] = [];
  for (let i = 0; i < teamsRaw.length; i++) {
    const t = teamsRaw[i];
    if (!t || typeof t !== "object") continue;
    const row = t as Record<string, unknown>;
    const teamId = str(row.id, `seat-${i}`);
    const teamName = str(row.name) || str(row.teamName) || `Team ${i + 1}`;
    const ownerName =
      str((row.participant as Record<string, unknown> | undefined)?.name) ||
      str(row.owner) ||
      undefined;
    const isUserTeam = Boolean(row.isUserTeam || row.userTeam || (row.participant as Record<string, unknown> | undefined)?.human);
    out.push({
      teamId: String(teamId),
      teamName,
      ownerName,
      draftSlot: i + 1,
      isUserTeam,
    });
  }
  if (out.length) return out;

  // Infer seats from drafted ownerPos
  const seats = new Map<number, string>();
  for (const row of drafted) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const pos = Math.floor(num(r.ownerPos, -1));
    if (pos < 0) continue;
    if (!seats.has(pos)) seats.set(pos, str(r.owner, `Team ${pos + 1}`));
  }
  return [...seats.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pos, name]) => ({
      teamId: `seat-${pos}`,
      teamName: name || `Team ${pos + 1}`,
      draftSlot: pos + 1,
      isUserTeam: false,
    }));
}

function maxOwnerPos(drafted: unknown[]): number {
  let max = -1;
  for (const row of drafted) {
    if (!row || typeof row !== "object") continue;
    const pos = Math.floor(num((row as Record<string, unknown>).ownerPos, -1));
    if (pos > max) max = pos;
  }
  return max;
}

function normalizePos(pos: string): string | undefined {
  const p = pos.trim().toUpperCase();
  if (!p) return undefined;
  if (p === "DST" || p === "DEF" || p === "D/ST") return "D/ST";
  if (p === "PK") return "K";
  return p;
}

export function observeFantasyPros(
  win: Window & { __debugStore?: FantasyProsRawStore },
): FantasyProsReadResult {
  const store = readFantasyProsDebugStore(win);
  if (!store) {
    return { ok: false, error: "FantasyPros draft state not found (__debugStore.draftState)" };
  }
  return observeFantasyProsFromStore(store, {
    pathname: typeof win.location?.pathname === "string" ? win.location.pathname : "",
  });
}

export function fantasyProsAdapterErrorSnapshot(error: string): NormalizedDraftSnapshot {
  return emptySnapshot("fantasypros", {
    status: "UNKNOWN",
    draftFingerprint: "fantasypros:error",
    draftName: error,
  });
}
