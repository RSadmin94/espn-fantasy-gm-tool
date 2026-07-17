/**
 * Client owner-identity helpers aligned with server authority.
 *
 * Source of truth (server):
 * - `owners.ownerList.ownerKey` / `owners.ownerProfile` input = canonical profile key
 *   from `resolveOwnerKey` + `buildRawKeyToCanonicalProfileKey` (`id:{memberId}` or `name:…`)
 * - `dna.leagueCast.memberId` = bare ESPN `primaryOwner` / members.id (NOT the profile key)
 * - `memberIdFromOwnerKey("id:{GUID}")` → `{GUID}` (server/db.ts)
 * - `ownerKeyFromId(ownerId)` / `resolveOwnerKey(id,…)` → `id:{ownerId}` when an id exists
 *
 * Do not match dossier routes by display name. Use ownerKeysEqual only for id:/brace
 * normalization already used by Owner Profiles.
 */

/** Mirrors server `resolveOwnerKey(ownerId, …)` when `ownerId` is present / `ownerKeyFromId`. */
export function ownerKeyFromMemberId(memberId: string | null | undefined): string {
  const id = String(memberId ?? "").trim();
  if (!id) return "";
  if (id.startsWith("id:") || id.startsWith("name:")) return id;
  return `id:${id}`;
}

/**
 * Existing Owner Profiles equality: exact match, or same ESPN member id after
 * stripping the canonical `id:` prefix and optional GUID braces.
 * Does not compare display names.
 */
export function ownerKeysEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (key: string) => {
    let s = key.trim();
    if (/^id:/i.test(s)) s = s.slice(3).trim();
    if (s.startsWith("{") && s.endsWith("}")) s = s.slice(1, -1).trim();
    return s.toUpperCase();
  };
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return norm(left) === norm(right);
}

/** Resolve a route param against `owners.ownerList` keys — returns the list's authoritative key. */
export function resolveDirectoryOwnerKey(
  routeOwnerId: string | null | undefined,
  directoryOwnerKeys: readonly string[],
): string | null {
  const requested = typeof routeOwnerId === "string" ? routeOwnerId.trim() : "";
  if (!requested) return null;
  for (const key of directoryOwnerKeys) {
    const k = String(key ?? "").trim();
    if (!k) continue;
    if (k === requested || ownerKeysEqual(k, requested)) return k;
  }
  return null;
}

/** Canonical Rivals dossier path for an authoritative ownerKey. */
export function rivalsOwnerDossierPath(ownerKey: string): string {
  const key = ownerKey.trim();
  if (!key) return "/rivals/owners";
  return `/rivals/owners/${encodeURIComponent(key)}`;
}

/**
 * Prefer Cast `ownerKey` (server-canonical) when present; otherwise derive from bare `memberId`
 * via the same `id:` contract as `resolveOwnerKey` / `ownerKeyFromId`.
 */
export function castMemberDossierOwnerKey(member: {
  ownerKey?: string | null;
  memberId?: string | null;
}): string {
  const fromServer = typeof member.ownerKey === "string" ? member.ownerKey.trim() : "";
  if (fromServer) return fromServer;
  return ownerKeyFromMemberId(member.memberId);
}
