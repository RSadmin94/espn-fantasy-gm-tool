/**
 * RFSN-024 — Live Draft UX presentation helpers (client-only).
 * Does not touch league feed adapters, notifyLockedPick, pool ownership, or ADP sort.
 */
import {
  isLiveDraftRealAdp,
  LIVE_DRAFT_SYNTHETIC_ADP_FLOOR,
} from "./liveDraftPoolPresentation";

export type LiveDraftUiPhase =
  | "idle"
  | "connected"
  | "waiting"
  | "paused"
  | "reconnecting"
  | "complete";

export type LiveDraftUxStatusInput = {
  active: boolean;
  source: "rfsn" | "espn" | "connected-league" | "manual";
  monitoring: boolean;
  boothOnAir: boolean;
  draftComplete: boolean;
  lastError: string | null;
  connectorReady: boolean;
  /** User paused the draft clock / session. */
  draftPaused?: boolean;
  /** At least one non-keeper pick has locked. */
  hasLockedPicks?: boolean;
  /** ESPN Mirror bookmarklet transport (not legacy league-fetch polling). */
  transportKind?: "espn-mirror" | null;
  lastRevision?: number | null;
  lockedCount?: number;
};

function isEspnSource(source: LiveDraftUxStatusInput["source"]): boolean {
  return source === "espn" || source === "connected-league";
}

export function resolveLiveDraftUiPhase(status: LiveDraftUxStatusInput): LiveDraftUiPhase {
  if (!status.active) return "idle";
  if (status.draftComplete) return "complete";
  // Mirror waiting (no handshake yet) is waiting — not reconnecting.
  if (
    status.transportKind === "espn-mirror" &&
    !status.connectorReady &&
    !status.lastError
  ) {
    return "waiting";
  }
  if (isEspnSource(status.source) && status.lastError) return "reconnecting";
  if (status.draftPaused) return "paused";
  if (isEspnSource(status.source) && status.monitoring && status.connectorReady) {
    if (status.hasLockedPicks) return "waiting";
    return "connected";
  }
  if (!isEspnSource(status.source) && status.monitoring) {
    return status.hasLockedPicks ? "waiting" : "connected";
  }
  if (status.monitoring) return "connected";
  return "waiting";
}

/** User-facing status stack — no provider/internal monitor jargon. */
export function liveDraftStatusLines(status: LiveDraftUxStatusInput): string[] {
  const phase = resolveLiveDraftUiPhase(status);
  const boothLine = status.boothOnAir ? "RFSN Booth Online" : "RFSN Booth Standby";
  const mirror = status.transportKind === "espn-mirror";
  const sourceLabel = mirror
    ? status.connectorReady
      ? "Connected to ESPN Mirror"
      : "Waiting for ESPN Mirror"
    : isEspnSource(status.source)
      ? "Connected League"
      : "RFSN Draft";
  const rev =
    mirror && status.lastRevision != null ? ` · rev ${status.lastRevision}` : "";
  const pickLine =
    mirror && status.lockedCount != null
      ? `Picks ${status.lockedCount}${rev}`
      : null;

  switch (phase) {
    case "idle":
      return ["Live Draft idle", "Turn on Live Draft to open the booth"];
    case "complete":
      return ["Draft complete", boothLine];
    case "reconnecting":
      return mirror
        ? ["Reconnecting to ESPN Mirror", "Live Draft will resume when the Mirror recovers"]
        : ["Reconnecting to league feed", "Live Draft will resume when the feed recovers"];
    case "paused":
      return ["Draft paused — monitoring suspended", boothLine];
    case "waiting":
      if (mirror && !status.connectorReady) {
        return [
          "Waiting for ESPN Mirror",
          "Open the ESPN draft and run Board Mirror",
          boothLine,
        ];
      }
      return pickLine
        ? [sourceLabel, "Waiting for next pick", pickLine, boothLine]
        : [sourceLabel, "Waiting for next pick", boothLine];
    case "connected":
    default:
      return pickLine
        ? [sourceLabel, "Monitoring Live Draft", pickLine, boothLine]
        : [sourceLabel, "Monitoring Live Draft", boothLine];
  }
}

export function liveDraftPhaseBadgeLabel(phase: LiveDraftUiPhase): string {
  switch (phase) {
    case "idle":
      return "Idle";
    case "connected":
      return "Connected";
    case "waiting":
      return "Waiting";
    case "paused":
      return "Paused";
    case "reconnecting":
      return "Reconnecting";
    case "complete":
      return "Complete";
  }
}

/** ADP for display — never promote rank or undrafted-sentinel as a fake ADP. */
export function formatLiveDraftPoolAdp(adp: unknown): { label: string; isReal: boolean } {
  if (isLiveDraftRealAdp(adp)) {
    const n = Number(adp);
    const label = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return { label: `ADP ${label}`, isReal: true };
  }
  return { label: "ADP unavailable", isReal: false };
}

export function formatLiveDraftMarketValue(marketValue: unknown): string {
  if (marketValue == null || !Number.isFinite(Number(marketValue))) return "Val —";
  return `Val ${Math.round(Number(marketValue))}/100`;
}

/**
 * Value vs market for an available player at the current overall pick.
 * Positive = still available later than ADP (value). Uses existing ADP + pick only.
 */
export function formatLiveDraftValueVsMarket(
  adp: unknown,
  overallPick: number | null | undefined,
): string | null {
  if (!isLiveDraftRealAdp(adp)) return null;
  if (overallPick == null || !Number.isFinite(overallPick) || overallPick <= 0) return null;
  const delta = Math.round(Number(adp) - Number(overallPick));
  if (delta === 0) return "At market";
  return `${delta > 0 ? "+" : ""}${delta} vs market`;
}

export type LiveDraftRecentPick = {
  pickNumber: number;
  round: number;
  ownerName: string;
  teamName: string;
  playerName: string;
  position: string;
  /** Presentation-only identity fields for headshots (from locked results). */
  playerId?: string | null;
  nflTeam?: string | null;
  isLast: boolean;
  hasReaction?: boolean;
};

export function buildLiveDraftRecentPicks(args: {
  schedule: ReadonlyArray<{
    pickNumber: number;
    round?: number;
    teamId?: number;
    ownerName?: string;
  }>;
  results: Record<
    number,
    | {
        name?: string;
        position?: string;
        isKeeper?: boolean;
        id?: string | number | null;
        nflTeam?: string | null;
      }
    | undefined
  >;
  teams: ReadonlyArray<{ teamId?: number; teamName?: string; ownerName?: string }>;
  limit?: number;
  reactionPickNumbers?: ReadonlySet<number>;
}): LiveDraftRecentPick[] {
  const limit = args.limit ?? 8;
  const teamById = new Map(
    args.teams.map((t) => [Number(t.teamId), t] as const),
  );
  const locked: LiveDraftRecentPick[] = [];
  for (const slot of args.schedule) {
    const res = args.results[slot.pickNumber];
    if (!res?.name || res.isKeeper) continue;
    const team = teamById.get(Number(slot.teamId));
    locked.push({
      pickNumber: slot.pickNumber,
      round: Number(slot.round ?? 0),
      ownerName: String(team?.ownerName ?? slot.ownerName ?? "—").trim() || "—",
      teamName: String(team?.teamName ?? "—").trim() || "—",
      playerName: String(res.name).trim(),
      position: String(res.position ?? "?").toUpperCase(),
      playerId: res.id != null && String(res.id).trim() ? String(res.id).trim() : null,
      nflTeam:
        res.nflTeam != null && String(res.nflTeam).trim()
          ? String(res.nflTeam).trim()
          : null,
      isLast: false,
      hasReaction: args.reactionPickNumbers?.has(slot.pickNumber) ?? false,
    });
  }
  locked.sort((a, b) => a.pickNumber - b.pickNumber);
  const slice = locked.slice(-limit);
  if (slice.length > 0) slice[slice.length - 1]!.isLast = true;
  return slice.reverse();
}

export function liveDraftBoothPresenceLine(args: {
  speaking: boolean;
  analystName: string | null;
}): string {
  if (args.speaking && args.analystName) {
    return `${args.analystName} analyzing pick`;
  }
  return "RFSN is monitoring";
}

export function liveDraftAudioStateLabel(args: {
  speaking: boolean;
  audioState: string;
}): string {
  if (args.speaking) return "Speaking";
  if (args.audioState === "loading" || args.audioState === "buffering") return "Cueing";
  return "Silent";
}
