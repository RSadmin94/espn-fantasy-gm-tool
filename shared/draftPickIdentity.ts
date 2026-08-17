/**
 * Restore draft-pick identity from ESPN playerId when the ledger stored
 * an empty name / unknown position. Missing ADP must not erase the player;
 * missing name must not erase a known playerId.
 */
export type DraftPickIdentityFields = {
  playerId?: number | string | null;
  playerName?: string | null;
  position?: string | null;
};

export type EspnPlayerIdentity = {
  fullName: string;
  position: string;
};

export function espnPlayerIdKey(playerId: number | string | null | undefined): string | null {
  if (playerId == null || playerId === "") return null;
  const n = Number(playerId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.floor(n));
}

export function draftPickNameIsBlank(name: string | null | undefined): boolean {
  return String(name ?? "").trim() === "";
}

export function draftPickPositionNeedsFill(position: string | null | undefined): boolean {
  const pos = String(position ?? "").trim();
  return !pos || pos === "?";
}

export function pickNeedsIdentity(p: DraftPickIdentityFields): boolean {
  return espnPlayerIdKey(p.playerId) != null && (draftPickNameIsBlank(p.playerName) || draftPickPositionNeedsFill(p.position));
}

export function historicalPickDisplayName(name: string | null | undefined): string {
  const t = String(name ?? "").trim();
  return t || "Unknown historical player";
}

export function applyDraftPickIdentityMap<T extends DraftPickIdentityFields>(
  picks: T[],
  byEspnId: Map<string, EspnPlayerIdentity>,
): T[] {
  if (byEspnId.size === 0) return picks;
  return picks.map((p) => {
    const key = espnPlayerIdKey(p.playerId);
    if (!key) return p;
    const hit = byEspnId.get(key);
    if (!hit) return p;
    const nextName = draftPickNameIsBlank(p.playerName) ? hit.fullName : p.playerName;
    const nextPos = draftPickPositionNeedsFill(p.position) && hit.position ? hit.position : p.position;
    if (nextName === p.playerName && nextPos === p.position) return p;
    return { ...p, playerName: nextName, position: nextPos };
  });
}
