/**
 * ESPN fantasy D/ST playerIds are negative:
 *   playerId = -(16000 + proTeamId)
 * Example: -16024 → LAC Chargers D/ST.
 * Athlete identity helpers that require playerId > 0 must not treat these as unassigned.
 */

export const ESPN_DST_ID_BASE = 16000;

const ESPN_DST_NICKNAMES: Record<number, string> = {
  1: "Falcons",
  2: "Bills",
  3: "Bears",
  4: "Bengals",
  5: "Browns",
  6: "Cowboys",
  7: "Broncos",
  8: "Lions",
  9: "Packers",
  10: "Titans",
  11: "Colts",
  12: "Chiefs",
  13: "Raiders",
  14: "Rams",
  15: "Dolphins",
  16: "Vikings",
  17: "Patriots",
  18: "Saints",
  19: "Giants",
  20: "Jets",
  21: "Eagles",
  22: "Cardinals",
  23: "Steelers",
  24: "Chargers",
  25: "49ers",
  26: "Seahawks",
  27: "Buccaneers",
  28: "Commanders",
  29: "Panthers",
  30: "Jaguars",
  33: "Ravens",
  34: "Texans",
};

export type EspnDefenseIdentity = {
  playerId: number;
  proTeamId: number;
  fullName: string;
  position: "D/ST";
};

export function espnDefenseProTeamId(
  playerId: number | string | null | undefined,
): number | null {
  if (playerId == null || playerId === "") return null;
  const n = Number(playerId);
  if (!Number.isFinite(n) || n >= 0) return null;
  const proTeamId = Math.abs(Math.floor(n)) - ESPN_DST_ID_BASE;
  if (!Number.isInteger(proTeamId) || !ESPN_DST_NICKNAMES[proTeamId]) return null;
  return proTeamId;
}

export function isEspnDefensePlayerId(
  playerId: number | string | null | undefined,
): boolean {
  return espnDefenseProTeamId(playerId) != null;
}

export function espnDefenseIdentity(
  playerId: number | string | null | undefined,
): EspnDefenseIdentity | null {
  const proTeamId = espnDefenseProTeamId(playerId);
  if (proTeamId == null) return null;
  const n = Math.floor(Number(playerId));
  const nick = ESPN_DST_NICKNAMES[proTeamId]!;
  return {
    playerId: n,
    proTeamId,
    fullName: `${nick} D/ST`,
    position: "D/ST",
  };
}
