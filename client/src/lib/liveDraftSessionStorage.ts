/**
 * Persists in-progress Live Draft engine state across route navigation.
 * Cleared on explicit reset or schedule identity change.
 */

export type LiveDraftPersistedState = {
  idx: number;
  running: boolean;
  results: Record<number, unknown>;
  manualTeamIds: number[];
  pauseOnMyPicks: boolean;
  draftSeed: number;
  paceMs: number;
};

export function liveDraftSessionStorageKey(
  leagueId: string | null | undefined,
  draftId: string,
  scheduleSig: string,
): string {
  return `rfsn-live-draft:${leagueId ?? "no-league"}:${draftId}:${scheduleSig}`;
}

/** Structural schedule identity — ignores mock-predicted open-pick player churn on refetch. */
export function buildLiveDraftScheduleSig(
  schedule: ReadonlyArray<{
    pickNumber: number;
    teamId: number;
    isKeeperSlot?: boolean;
    player?: string | null;
  }>,
): string {
  return schedule
    .map((s) =>
      s.isKeeperSlot
        ? `${s.pickNumber}:${s.teamId}:k:${String(s.player ?? "").toLowerCase().trim()}`
        : `${s.pickNumber}:${s.teamId}:o`,
    )
    .join("|");
}

export function readLiveDraftSession(key: string): LiveDraftPersistedState | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as LiveDraftPersistedState;
  } catch {
    return null;
  }
}

export function writeLiveDraftSession(key: string, state: LiveDraftPersistedState): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearLiveDraftSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Drop every persisted engine session for a draft (all schedule signatures). */
export function clearAllLiveDraftSessionsForDraft(
  leagueId: string | null | undefined,
  draftId: string,
): void {
  const prefix = `rfsn-live-draft:${leagueId ?? "no-league"}:${draftId}:`;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
