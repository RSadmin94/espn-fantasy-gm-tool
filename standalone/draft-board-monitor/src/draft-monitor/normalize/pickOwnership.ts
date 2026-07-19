import type { NormalizedDraftPick, NormalizedDraftTeam } from "./draftTypes";

/**
 * Current owner controls board placement.
 * Snake math is never used when the source names a drafting team.
 */
export function resolveCurrentOwner(args: {
  currentTeamId?: string | null;
  currentTeamName?: string | null;
  originalTeamId?: string | null;
  originalTeamName?: string | null;
  originalDraftSlot?: number | null;
  teams: readonly NormalizedDraftTeam[];
}): {
  currentTeamId: string;
  currentTeamName: string;
  isTradedPick: boolean;
  originalTeamId?: string;
  originalTeamName?: string;
} {
  const byId = new Map(args.teams.map((t) => [t.teamId, t]));
  const byName = new Map(
    args.teams.map((t) => [norm(t.teamName), t]),
  );

  let currentTeamId = String(args.currentTeamId ?? "").trim();
  let currentTeamName = String(args.currentTeamName ?? "").trim();

  if (currentTeamId && byId.has(currentTeamId)) {
    currentTeamName = byId.get(currentTeamId)!.teamName;
  } else if (currentTeamName && byName.has(norm(currentTeamName))) {
    const t = byName.get(norm(currentTeamName))!;
    currentTeamId = t.teamId;
    currentTeamName = t.teamName;
  } else if (!currentTeamId && currentTeamName) {
    currentTeamId = `name:${norm(currentTeamName)}`;
  } else if (currentTeamId && !currentTeamName) {
    currentTeamName = `Team ${currentTeamId}`;
  }

  const originalTeamId = String(args.originalTeamId ?? "").trim() || undefined;
  let originalTeamName = String(args.originalTeamName ?? "").trim() || undefined;
  if (originalTeamId && byId.has(originalTeamId)) {
    originalTeamName = byId.get(originalTeamId)!.teamName;
  }

  const slot = args.originalDraftSlot;
  if (
    !originalTeamId &&
    slot != null &&
    Number.isFinite(slot) &&
    slot >= 1
  ) {
    const bySlot = args.teams.find((t) => t.draftSlot === Math.floor(slot));
    if (bySlot) {
      return {
        currentTeamId: currentTeamId || bySlot.teamId,
        currentTeamName: currentTeamName || bySlot.teamName,
        isTradedPick:
          Boolean(currentTeamId) &&
          currentTeamId !== bySlot.teamId,
        originalTeamId: bySlot.teamId,
        originalTeamName: bySlot.teamName,
      };
    }
  }

  const isTradedPick = Boolean(
    originalTeamId &&
      currentTeamId &&
      originalTeamId !== currentTeamId,
  );

  return {
    currentTeamId: currentTeamId || "unknown",
    currentTeamName: currentTeamName || "Unknown Team",
    isTradedPick,
    originalTeamId,
    originalTeamName,
  };
}

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Group picks for board cells: round → teamId → picks (stable overall order). */
export function groupPicksByRoundAndTeam(
  picks: readonly NormalizedDraftPick[],
): Map<number, Map<string, NormalizedDraftPick[]>> {
  const byRound = new Map<number, Map<string, NormalizedDraftPick[]>>();
  const sorted = [...picks].sort((a, b) => {
    const oa = a.overallPick ?? Number.MAX_SAFE_INTEGER;
    const ob = b.overallPick ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    const pa = a.pickInRound ?? 0;
    const pb = b.pickInRound ?? 0;
    return pa - pb;
  });
  for (const p of sorted) {
    if (!byRound.has(p.round)) byRound.set(p.round, new Map());
    const byTeam = byRound.get(p.round)!;
    if (!byTeam.has(p.currentTeamId)) byTeam.set(p.currentTeamId, []);
    byTeam.get(p.currentTeamId)!.push(p);
  }
  return byRound;
}
