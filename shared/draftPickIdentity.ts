/**
 * Restore draft-pick identity from ESPN playerId when the ledger stored
 * an empty name / unknown position. Missing ADP must not erase the player;
 * missing name must not erase a known playerId.
 */
import { espnDefenseIdentity, isEspnDefensePlayerId } from "./espnDefenseIdentity";

export type DraftPickIdentityFields = {
  playerId?: number | string | null;
  playerName?: string | null;
  position?: string | null;
  keeper?: boolean;
  reservedForKeeper?: boolean;
  isKeeper?: boolean;
  retained?: boolean;
  keeperSlot?: boolean;
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

function pickIsKeeperOrRetained(pick: DraftPickIdentityFields): boolean {
  return Boolean(
    pick.keeper ||
      pick.reservedForKeeper ||
      pick.isKeeper ||
      pick.retained ||
      pick.keeperSlot,
  );
}

/** Draft slot with no ESPN player id yet (pre-draft order, not a failed identity lookup). */
export function isUnassignedDraftPick(playerId: number | string | null | undefined): boolean {
  return espnPlayerIdKey(playerId) == null && !isEspnDefensePlayerId(playerId);
}

/** Draft Board / Draft Grades player label — distinguishes open slots, retained slots, and unresolved historical ids. */
export function draftBoardPickDisplayName(pick: DraftPickIdentityFields): string {
  const trimmed = String(pick.playerName ?? "").trim();
  if (trimmed) return trimmed;
  if (!isUnassignedDraftPick(pick.playerId)) return "Unknown historical player";
  if (pickIsKeeperOrRetained(pick)) return "Retained player unavailable";
  return "Unassigned pick";
}

/** Position badge for draft ledger rows — TBD for unassigned slots, ? only after id lookup fails. */
export function draftBoardPositionLabel(
  position: string | null | undefined,
  playerId: number | string | null | undefined,
): string {
  const pos = String(position ?? "").trim();
  if (pos && pos !== "?") return pos;
  if (isEspnDefensePlayerId(playerId)) return "D/ST";
  if (isUnassignedDraftPick(playerId)) return "TBD";
  return pos || "?";
}

export function applyEspnDefenseIdentities<T extends DraftPickIdentityFields>(picks: T[]): T[] {
  return picks.map((p) => {
    const dst = espnDefenseIdentity(p.playerId);
    if (!dst) return p;
    const nextName = draftPickNameIsBlank(p.playerName) ? dst.fullName : p.playerName;
    const nextPos = draftPickPositionNeedsFill(p.position) ? dst.position : p.position;
    if (nextName === p.playerName && nextPos === p.position) return p;
    return { ...p, playerName: nextName, position: nextPos };
  });
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
