/**
 * Lightweight server-side in-memory TTL cache.
 *
 * Usage:
 *   import { memCache } from "./memCache";
 *
 *   const result = await memCache("ownerCareerStats", 10 * 60_000, async () => {
 *     // expensive computation here
 *     return computedValue;
 *   });
 *
 * The second argument is the TTL in milliseconds.
 * The cache is invalidated automatically when the TTL expires.
 * Call memCache.invalidate(key) to manually bust a specific key.
 * Call memCache.invalidateAll() to bust the entire cache (e.g. after a data refresh).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export async function memCache<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }
  const value = await compute();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Manually invalidate a single cache key */
memCache.invalidate = (key: string) => {
  store.delete(key);
};

/** Invalidate all cached entries (call after data refresh) */
memCache.invalidateAll = () => {
  store.clear();
};

/** How many entries are currently cached */
memCache.size = () => store.size;

/** List all cached keys with their remaining TTL in seconds */
memCache.debug = () => {
  const now = Date.now();
  return Array.from(store.entries()).map(([key, entry]) => ({
    key,
    ttlRemaining: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
  }));
};
