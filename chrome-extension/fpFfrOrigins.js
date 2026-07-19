/**
 * Unit helpers for RFSN-030C FFR tab URL matching (mirrors background isFfrTabUrl).
 */
export function isFfrTabUrlForTests(url, origins = [
  "https://fantasyfootballrivals.com",
  "https://www.fantasyfootballrivals.com",
  "https://gmwarroom.online",
  "http://localhost",
  "http://127.0.0.1",
]) {
  if (!url || typeof url !== "string") return false;
  if (origins.some((origin) => url.startsWith(origin))) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return (
      u.hostname === "fantasyfootballrivals.com" ||
      u.hostname.endsWith(".fantasyfootballrivals.com")
    );
  } catch {
    return false;
  }
}
