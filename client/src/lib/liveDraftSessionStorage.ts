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
