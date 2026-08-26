/** Presentation-only identity. Never invents a player name and never writes draft rows. */

export const UNAVAILABLE_PLAYER_LABEL = "Unavailable player";

export type DraftPickIdentity = {
  playerId: number | null;
  playerName: string | null | undefined;
  position: string | null | undefined;
};

export type ResolvedPlayerIdentity = {
  playerId: number | null;
  name: string;
  position: string | null;
  unresolved: boolean;
  source: "stored" | "registry" | "espn_cache" | "unavailable";
};

export function pickIsIdentifiable(pick: DraftPickIdentity): boolean {
  return Number(pick.playerId) > 0 || Boolean(String(pick.playerName || "").trim());
}

export function resolvePickDisplayIdentity(
  pick: DraftPickIdentity,
  lookup?: { name: string; position?: string | null; source?: "registry" | "espn_cache" } | null,
): ResolvedPlayerIdentity {
  const id = Number(pick.playerId) > 0 ? Number(pick.playerId) : null;
  const stored = String(pick.playerName || "").trim();
  const storedPos = String(pick.position || "").trim() || null;
  if (stored) {
    return { playerId: id, name: stored, position: storedPos, unresolved: false, source: "stored" };
  }
  const resolved = String(lookup?.name || "").trim();
  if (resolved) {
    return {
      playerId: id,
      name: resolved,
      position: storedPos || String(lookup?.position || "").trim() || null,
      unresolved: false,
      source: lookup?.source === "espn_cache" ? "espn_cache" : "registry",
    };
  }
  return {
    playerId: id,
    name: UNAVAILABLE_PLAYER_LABEL,
    position: storedPos,
    unresolved: true,
    source: "unavailable",
  };
}
