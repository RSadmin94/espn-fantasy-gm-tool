/**
 * Mock-draft pool identity + composition guards.
 * Keeps drafted players out of available and detects skill-starved (DP-flooded) boards.
 */

import { normalizePlayerKey } from "./draftEngine/phase1/types";

export const SKILL_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export type PoolPlayerLike = {
  name: string;
  position: string;
  espnId?: string | number | null;
};

/** Stable draft identity — prefer ESPN id, else normalized name. */
export function mockDraftPlayerKey(p: { name: string; espnId?: string | number | null }): string {
  const id = p.espnId != null && String(p.espnId).trim() !== "" ? String(p.espnId).trim() : "";
  if (id) return `espn:${id}`;
  return `name:${normalizePlayerKey(p.name)}`;
}

export function countByPosition(pool: PoolPlayerLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pool) {
    const pos = String(p.position || "?").toUpperCase();
    out[pos] = (out[pos] ?? 0) + 1;
  }
  return out;
}

export function countSkillPlayers(pool: PoolPlayerLike[]): number {
  return pool.filter((p) => SKILL_POSITIONS.has(String(p.position || "").toUpperCase())).length;
}

export function countDpPlayers(pool: PoolPlayerLike[]): number {
  return pool.filter((p) => String(p.position || "").toUpperCase() === "DP").length;
}

/**
 * Skill pool is unhealthy when IDP dominates and almost no offense loaded —
 * classic ESPN offense-feed miss with IDP still present.
 */
export function isSkillStarvedPool(pool: PoolPlayerLike[]): boolean {
  const skill = countSkillPlayers(pool);
  const dp = countDpPlayers(pool);
  return skill < 80 && dp > 40;
}

/** Remove drafted / keeper identities from a display or selection pool. */
export function excludeIdentitiesFromPool<T extends PoolPlayerLike>(
  pool: T[],
  drafted: Iterable<{ name: string; espnId?: string | number | null }>,
): T[] {
  const banned = new Set<string>();
  for (const d of drafted) {
    banned.add(mockDraftPlayerKey(d));
    banned.add(`name:${normalizePlayerKey(d.name)}`);
    if (d.espnId != null && String(d.espnId).trim() !== "") {
      banned.add(`espn:${String(d.espnId).trim()}`);
    }
  }
  return pool.filter((p) => {
    const key = mockDraftPlayerKey(p);
    if (banned.has(key)) return false;
    if (banned.has(`name:${normalizePlayerKey(p.name)}`)) return false;
    return true;
  });
}
