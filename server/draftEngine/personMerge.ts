/**
 * Person-merge overlay for the draft engine.
 * Extends ownerProfileService union-find with explicit aliases from
 * ownerIdentityAuthority (read-only parity — no writes to that module).
 */

import { buildRawKeyToCanonicalProfileKey, type GmTeamRow } from "../ownerProfileService";

/** Mirrors ownerIdentityAuthority NAME_ALIAS_REGISTRY (Rule 2 explicit aliases). */
export const EXPLICIT_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "steve hibbard": "steven hibbard",
});

export const STEVEN_HIBBARD_CANONICAL_KEY = "id:{82E515D1-73FF-466C-A7A8-099B050278B5}";

/**
 * Standard person-merge remap plus explicit steve→steven hibbard union when the id'd
 * steven profile exists in league history.
 */
export function buildDraftEngineOwnerKeyRemap(allLeagueGmRows: GmTeamRow[]): Map<string, string> {
  const base = buildRawKeyToCanonicalProfileKey(allLeagueGmRows);
  const stevenIdPresent = [...base.values()].includes(STEVEN_HIBBARD_CANONICAL_KEY);
  if (!stevenIdPresent) return base;

  const overlay = new Map<string, string>();
  for (const [raw, canon] of base) {
    overlay.set(raw, canon === "name:steve hibbard" ? STEVEN_HIBBARD_CANONICAL_KEY : canon);
  }
  return overlay;
}
