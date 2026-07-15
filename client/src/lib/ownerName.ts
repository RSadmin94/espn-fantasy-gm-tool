/**
 * Owner-name display helpers.
 *
 * Owner keys in this app are ESPN member GUIDs, sometimes prefixed `id:` (the
 * canonical ownerKey form) and sometimes bare `{GUID}`. These must NEVER be shown
 * to users. Use displayOwnerName() at every render site that might fall back to a
 * raw key so the UI shows a clean name or "Unknown Owner" instead of a GUID.
 */

const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

/** True if the value looks like a raw owner key / GUID (with or without an `id:` prefix). */
export function looksLikeOwnerKey(value?: string | null): boolean {
  if (!value) return false;
  const s = String(value).trim();
  if (s.startsWith("id:")) return true;
  return GUID_RE.test(s.replace(/^id:/, ""));
}

/**
 * Resolve an owner to a clean display name. Prefers a real fallback name; never
 * returns a raw key/GUID. Returns "Unknown Owner" when only a key is available.
 */
export function displayOwnerName(ownerKey?: string | null, fallbackName?: string | null): string {
  const name = fallbackName?.trim();
  if (name && !looksLikeOwnerKey(name)) return name;
  const key = ownerKey?.trim();
  if (key && !looksLikeOwnerKey(key)) return key; // some "keys" are already plain names
  return "Unknown Owner";
}
