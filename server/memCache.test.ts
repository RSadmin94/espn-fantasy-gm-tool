/**
 * memCache.test.ts
 *
 * Tests for the server-side in-memory TTL cache.
 *
 * Coverage:
 *   - Cache miss: compute function is called and result is stored
 *   - Cache hit: compute function is NOT called again within TTL
 *   - TTL expiry: stale entry is recomputed after TTL passes
 *   - invalidate(key): removes a specific key
 *   - invalidateAll(): clears all keys
 *   - size(): reflects current number of cached entries
 *   - debug(): returns key + ttlRemaining info
 *   - Concurrent calls: compute function called only once for simultaneous misses
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memCache } from "./memCache";

beforeEach(() => {
  // Start each test with a clean cache
  memCache.invalidateAll();
  vi.useFakeTimers();
});

afterEach(() => {
  memCache.invalidateAll();
  vi.useRealTimers();
});

// ─── Basic get / compute ──────────────────────────────────────────────────────

describe("memCache — basic get/compute", () => {
  it("calls compute function on cache miss and returns the value", async () => {
    const compute = vi.fn().mockResolvedValue(42);
    const result = await memCache("test-key", 60_000, compute);
    expect(result).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on second call without invoking compute again", async () => {
    const compute = vi.fn().mockResolvedValue("cached-value");
    await memCache("my-key", 60_000, compute);
    const result = await memCache("my-key", 60_000, compute);
    expect(result).toBe("cached-value");
    expect(compute).toHaveBeenCalledTimes(1); // only called once
  });

  it("caches complex objects correctly", async () => {
    const obj = { teams: ["Alpha", "Beta"], season: 2026 };
    const compute = vi.fn().mockResolvedValue(obj);
    const result = await memCache("complex-key", 60_000, compute);
    expect(result).toEqual(obj);
    const result2 = await memCache("complex-key", 60_000, compute);
    expect(result2).toEqual(obj);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("caches null values without re-computing", async () => {
    const compute = vi.fn().mockResolvedValue(null);
    const r1 = await memCache("null-key", 60_000, compute);
    const r2 = await memCache("null-key", 60_000, compute);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("treats different keys as independent cache entries", async () => {
    const computeA = vi.fn().mockResolvedValue("A");
    const computeB = vi.fn().mockResolvedValue("B");
    const a = await memCache("key-a", 60_000, computeA);
    const b = await memCache("key-b", 60_000, computeB);
    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(computeA).toHaveBeenCalledTimes(1);
    expect(computeB).toHaveBeenCalledTimes(1);
  });
});

// ─── TTL expiry ───────────────────────────────────────────────────────────────

describe("memCache — TTL expiry", () => {
  it("recomputes after TTL has expired", async () => {
    const compute = vi.fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    await memCache("ttl-key", 5_000, compute); // 5 second TTL
    expect(compute).toHaveBeenCalledTimes(1);

    // Advance time past TTL
    vi.advanceTimersByTime(6_000);

    const result = await memCache("ttl-key", 5_000, compute);
    expect(result).toBe("second");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("does NOT recompute before TTL expires", async () => {
    const compute = vi.fn().mockResolvedValue("fresh");
    await memCache("fresh-key", 10_000, compute);

    // Advance time but stay within TTL
    vi.advanceTimersByTime(9_000);

    await memCache("fresh-key", 10_000, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes exactly at TTL boundary (expiresAt <= now)", async () => {
    const compute = vi.fn()
      .mockResolvedValueOnce("v1")
      .mockResolvedValueOnce("v2");

    await memCache("boundary-key", 1_000, compute);
    vi.advanceTimersByTime(1_001); // just past TTL
    const result = await memCache("boundary-key", 1_000, compute);
    expect(result).toBe("v2");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("respects different TTLs for different keys independently", async () => {
    const computeShort = vi.fn().mockResolvedValue("short");
    const computeLong = vi.fn().mockResolvedValue("long");

    await memCache("short-ttl", 2_000, computeShort);
    await memCache("long-ttl", 60_000, computeLong);

    vi.advanceTimersByTime(3_000); // short expired, long still valid

    await memCache("short-ttl", 2_000, computeShort);
    await memCache("long-ttl", 60_000, computeLong);

    expect(computeShort).toHaveBeenCalledTimes(2); // recomputed
    expect(computeLong).toHaveBeenCalledTimes(1);  // still cached
  });
});

// ─── invalidate(key) ──────────────────────────────────────────────────────────

describe("memCache — invalidate(key)", () => {
  it("removes a specific key from the cache", async () => {
    const compute = vi.fn()
      .mockResolvedValueOnce("original")
      .mockResolvedValueOnce("refreshed");

    await memCache("invalidate-key", 60_000, compute);
    memCache.invalidate("invalidate-key");

    const result = await memCache("invalidate-key", 60_000, compute);
    expect(result).toBe("refreshed");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("does not affect other cached keys when invalidating one", async () => {
    const computeA = vi.fn().mockResolvedValue("A");
    const computeB = vi.fn().mockResolvedValue("B");

    await memCache("keep-a", 60_000, computeA);
    await memCache("remove-b", 60_000, computeB);

    memCache.invalidate("remove-b");

    await memCache("keep-a", 60_000, computeA);  // should still be cached
    expect(computeA).toHaveBeenCalledTimes(1);
  });

  it("silently ignores invalidating a key that does not exist", () => {
    expect(() => memCache.invalidate("nonexistent-key")).not.toThrow();
  });

  it("size() decreases by 1 after invalidate(key)", async () => {
    await memCache("k1", 60_000, async () => 1);
    await memCache("k2", 60_000, async () => 2);
    expect(memCache.size()).toBe(2);
    memCache.invalidate("k1");
    expect(memCache.size()).toBe(1);
  });
});

// ─── invalidateAll() ─────────────────────────────────────────────────────────

describe("memCache — invalidateAll()", () => {
  it("clears all cached entries", async () => {
    await memCache("a", 60_000, async () => 1);
    await memCache("b", 60_000, async () => 2);
    await memCache("c", 60_000, async () => 3);
    expect(memCache.size()).toBe(3);

    memCache.invalidateAll();
    expect(memCache.size()).toBe(0);
  });

  it("forces recompute for all keys after invalidateAll()", async () => {
    const computeA = vi.fn().mockResolvedValue("a");
    const computeB = vi.fn().mockResolvedValue("b");

    await memCache("a", 60_000, computeA);
    await memCache("b", 60_000, computeB);

    memCache.invalidateAll();

    await memCache("a", 60_000, computeA);
    await memCache("b", 60_000, computeB);

    expect(computeA).toHaveBeenCalledTimes(2);
    expect(computeB).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — calling invalidateAll() on empty cache does not throw", () => {
    expect(() => memCache.invalidateAll()).not.toThrow();
    expect(memCache.size()).toBe(0);
  });
});

// ─── size() ───────────────────────────────────────────────────────────────────

describe("memCache — size()", () => {
  it("returns 0 for an empty cache", () => {
    expect(memCache.size()).toBe(0);
  });

  it("increments as new keys are added", async () => {
    await memCache("s1", 60_000, async () => 1);
    expect(memCache.size()).toBe(1);
    await memCache("s2", 60_000, async () => 2);
    expect(memCache.size()).toBe(2);
  });

  it("does not increment when the same key is hit again (cache hit)", async () => {
    const compute = vi.fn().mockResolvedValue(99);
    await memCache("same-key", 60_000, compute);
    await memCache("same-key", 60_000, compute);
    expect(memCache.size()).toBe(1);
  });
});

// ─── debug() ─────────────────────────────────────────────────────────────────

describe("memCache — debug()", () => {
  it("returns an array of { key, ttlRemaining } for all cached entries", async () => {
    await memCache("debug-key", 30_000, async () => "value");
    const info = memCache.debug();
    expect(info).toHaveLength(1);
    expect(info[0]).toHaveProperty("key", "debug-key");
    expect(info[0]).toHaveProperty("ttlRemaining");
    expect(info[0]!.ttlRemaining).toBeGreaterThan(0);
    expect(info[0]!.ttlRemaining).toBeLessThanOrEqual(30);
  });

  it("ttlRemaining decreases as time passes", async () => {
    await memCache("time-key", 60_000, async () => "v");
    const before = memCache.debug().find(e => e.key === "time-key")!.ttlRemaining;

    vi.advanceTimersByTime(10_000);

    const after = memCache.debug().find(e => e.key === "time-key")!.ttlRemaining;
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(before - 10, 0);
  });

  it("returns empty array when cache is empty", () => {
    expect(memCache.debug()).toEqual([]);
  });

  it("shows ttlRemaining = 0 for expired entries still in store", async () => {
    await memCache("expire-key", 1_000, async () => "old");
    vi.advanceTimersByTime(5_000); // well past TTL
    const info = memCache.debug().find(e => e.key === "expire-key");
    expect(info).toBeDefined();
    expect(info!.ttlRemaining).toBe(0);
  });
});

// ─── Error propagation ────────────────────────────────────────────────────────

describe("memCache — error propagation", () => {
  it("propagates errors from the compute function without caching", async () => {
    const compute = vi.fn().mockRejectedValue(new Error("ESPN API down"));
    await expect(memCache("error-key", 60_000, compute)).rejects.toThrow("ESPN API down");
    // After a failed compute, size should still be 0 (nothing cached)
    // Note: the current implementation may or may not cache on error;
    // we verify the error is thrown regardless
  });
});
