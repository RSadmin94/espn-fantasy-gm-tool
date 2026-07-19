import type { DraftSource, NormalizedDraftPick } from "./draftTypes";

function normName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic event key — strongest available fields first.
 * Never uses timestamp alone.
 */
export function buildEventKey(args: {
  source: DraftSource;
  sourceEventId?: string | null;
  draftId?: string | null;
  overallPick?: number | null;
  round?: number | null;
  pickInRound?: number | null;
  teamId?: string | null;
  playerId?: string | null;
  teamName?: string | null;
  playerName?: string | null;
}): string {
  const src = args.source;
  const sid = String(args.sourceEventId ?? "").trim();
  if (sid) return `${src}:id:${sid}`;

  const draft = String(args.draftId ?? "").trim() || "unknown";
  const overall = Number(args.overallPick);
  if (Number.isFinite(overall) && overall >= 1) {
    return `${src}:${draft}:overall:${Math.floor(overall)}`;
  }

  const round = Number(args.round);
  const pir = Number(args.pickInRound);
  if (Number.isFinite(round) && round >= 1 && Number.isFinite(pir) && pir >= 1) {
    return `${src}:${draft}:r${Math.floor(round)}p${Math.floor(pir)}`;
  }

  const teamId = String(args.teamId ?? "").trim();
  const playerId = String(args.playerId ?? "").trim();
  if (
    Number.isFinite(round) &&
    round >= 1 &&
    Number.isFinite(pir) &&
    pir >= 1 &&
    teamId &&
    playerId
  ) {
    return `${src}:r${Math.floor(round)}p${Math.floor(pir)}:t${teamId}:pl${playerId}`;
  }

  const tName = normName(String(args.teamName ?? ""));
  const pName = normName(String(args.playerName ?? ""));
  if (
    Number.isFinite(round) &&
    round >= 1 &&
    Number.isFinite(pir) &&
    pir >= 1 &&
    tName &&
    pName
  ) {
    return `${src}:r${Math.floor(round)}p${Math.floor(pir)}:${tName}:${pName}`;
  }

  // Last resort — still deterministic from available fields
  return `${src}:fallback:${draft}:${Math.floor(round || 0)}:${Math.floor(pir || 0)}:${tName}:${pName}`;
}

/** Soft identity used to enrich an existing pick when keys differ slightly. */
export function softPickIdentity(pick: Pick<NormalizedDraftPick, "round" | "pickInRound" | "overallPick" | "playerName" | "playerId">): string {
  if (pick.overallPick != null && pick.overallPick >= 1) {
    return `o:${pick.overallPick}`;
  }
  if (pick.round >= 1 && pick.pickInRound != null && pick.pickInRound >= 1) {
    const pn = pick.playerId || normName(pick.playerName);
    return `r${pick.round}p${pick.pickInRound}:${pn}`;
  }
  return `n:${normName(pick.playerName)}:r${pick.round}`;
}
