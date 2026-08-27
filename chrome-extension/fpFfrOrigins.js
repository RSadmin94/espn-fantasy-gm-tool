/**
 * Unit helpers for RFSN-030C FFR tab URL matching (mirrors background isFfrTabUrl).
 * Store build is pinned to canonical Production hosts only.
 */
export const FFR_PRODUCTION_ORIGINS = [
  "https://www.fantasyfootballrivals.com",
  "https://fantasyfootballrivals.com",
];

export function isFfrTabUrlForTests(url, origins = FFR_PRODUCTION_ORIGINS) {
  if (!url || typeof url !== "string") return false;
  if (origins.some((origin) => url.startsWith(origin))) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "www.fantasyfootballrivals.com" ||
      u.hostname === "fantasyfootballrivals.com"
    );
  } catch {
    return false;
  }
}
