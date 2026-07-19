import type {
  NormalizedDraftPick,
  NormalizedDraftSnapshot,
} from "./draftTypes";
import { softPickIdentity } from "./eventKey";

/**
 * Merge incoming picks into an existing list.
 * - Same eventKey → enrich (do not duplicate)
 * - Soft identity match with different key → enrich under existing key
 * Returns { picks, duplicatesSuppressed }
 */
export function mergePicks(
  existing: readonly NormalizedDraftPick[],
  incoming: readonly NormalizedDraftPick[],
): { picks: NormalizedDraftPick[]; duplicatesSuppressed: number } {
  const byKey = new Map<string, NormalizedDraftPick>();
  const softToKey = new Map<string, string>();
  let duplicatesSuppressed = 0;

  for (const p of existing) {
    byKey.set(p.eventKey, p);
    softToKey.set(softPickIdentity(p), p.eventKey);
  }

  for (const next of incoming) {
    const soft = softPickIdentity(next);
    const existingKey = byKey.has(next.eventKey)
      ? next.eventKey
      : softToKey.get(soft);

    if (existingKey) {
      const prev = byKey.get(existingKey)!;
      if (existingKey !== next.eventKey || softToKey.has(soft)) {
        duplicatesSuppressed += 1;
      }
      byKey.set(existingKey, enrichPick(prev, next));
      softToKey.set(soft, existingKey);
      continue;
    }

    byKey.set(next.eventKey, next);
    softToKey.set(soft, next.eventKey);
  }

  return {
    picks: [...byKey.values()].sort((a, b) => {
      const oa = a.overallPick ?? 1e9;
      const ob = b.overallPick ?? 1e9;
      return oa - ob;
    }),
    duplicatesSuppressed,
  };
}

function enrichPick(
  prev: NormalizedDraftPick,
  next: NormalizedDraftPick,
): NormalizedDraftPick {
  return {
    ...prev,
    ...Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    ),
    eventKey: prev.eventKey,
    isKeeper: prev.isKeeper || next.isKeeper,
    isTradedPick: prev.isTradedPick || next.isTradedPick,
    keeperStatusKnown: prev.keeperStatusKnown || next.keeperStatusKnown,
    isLiveSelection: prev.isLiveSelection && next.isLiveSelection
      ? true
      : prev.isLiveSelection || next.isLiveSelection
        ? Boolean(next.isLiveSelection && !prev.isKeeper)
        : false,
    playerId: next.playerId || prev.playerId,
    nflTeam: next.nflTeam || prev.nflTeam,
    position: next.position || prev.position,
    currentTeamId: next.currentTeamId || prev.currentTeamId,
    currentTeamName: next.currentTeamName || prev.currentTeamName,
    currentOwnerName: next.currentOwnerName || prev.currentOwnerName,
    originalTeamId: next.originalTeamId || prev.originalTeamId,
    originalTeamName: next.originalTeamName || prev.originalTeamName,
    originalDraftSlot: next.originalDraftSlot ?? prev.originalDraftSlot,
    overallPick: next.overallPick ?? prev.overallPick,
    pickInRound: next.pickInRound ?? prev.pickInRound,
  };
}

/**
 * Full snapshot replace when draft identity changes; otherwise merge picks.
 */
export function applySnapshotUpdate(
  previous: NormalizedDraftSnapshot | null,
  next: NormalizedDraftSnapshot,
): { snapshot: NormalizedDraftSnapshot; duplicatesSuppressed: number; reset: boolean } {
  if (
    !previous ||
    previous.draftFingerprint !== next.draftFingerprint ||
    (previous.draftId && next.draftId && previous.draftId !== next.draftId)
  ) {
    return { snapshot: next, duplicatesSuppressed: 0, reset: Boolean(previous) };
  }

  // Do not reset merely because a temporary read returned zero picks.
  if (next.picks.length === 0 && previous.picks.length > 0 && next.status !== "NOT_STARTED") {
    return {
      snapshot: {
        ...previous,
        ...next,
        picks: previous.picks,
        teams: next.teams.length ? next.teams : previous.teams,
        teamCount: next.teamCount || previous.teamCount,
        lastUpdatedAt: next.lastUpdatedAt,
      },
      duplicatesSuppressed: 0,
      reset: false,
    };
  }

  const { picks, duplicatesSuppressed } = mergePicks(previous.picks, next.picks);
  return {
    snapshot: {
      ...next,
      teams: next.teams.length ? next.teams : previous.teams,
      teamCount: next.teamCount || previous.teamCount,
      picks,
    },
    duplicatesSuppressed,
    reset: false,
  };
}
