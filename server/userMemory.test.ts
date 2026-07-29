import { describe, expect, it } from "vitest";

/**
 * Mirrors getUserMemory catch policy in server/db.ts (no live DB required).
 */
async function getUserMemoryPolicy(
  userId: number,
  deps: {
    getDb: () => Promise<unknown | null>;
    selectRows: (userId: number) => Promise<unknown[]>;
    isMissingTableError: (e: unknown) => boolean;
  },
): Promise<unknown | null> {
  const db = await deps.getDb();
  if (!db) return null;
  try {
    const rows = await deps.selectRows(userId);
    return rows[0] ?? null;
  } catch (err) {
    if (deps.isMissingTableError(err)) return null;
    throw err;
  }
}

describe("getUserMemory policy", () => {
  it("uses the provided userId when querying", async () => {
    const seen: number[] = [];
    const row = { id: 9, userId: 42, riskTolerance: "aggressive" };
    const result = await getUserMemoryPolicy(42, {
      getDb: async () => ({}),
      selectRows: async (uid) => {
        seen.push(uid);
        return [row];
      },
      isMissingTableError: () => false,
    });
    expect(seen).toEqual([42]);
    expect(result).toEqual(row);
  });

  it("returns null when no memory row exists", async () => {
    const result = await getUserMemoryPolicy(7, {
      getDb: async () => ({}),
      selectRows: async () => [],
      isMissingTableError: () => false,
    });
    expect(result).toBeNull();
  });

  it("returns null when lookup is empty (null-equivalent)", async () => {
    const result = await getUserMemoryPolicy(7, {
      getDb: async () => ({}),
      selectRows: async () => [],
      isMissingTableError: () => false,
    });
    expect(result).toBeNull();
  });

  it("returns null when user_memory table is missing", async () => {
    const result = await getUserMemoryPolicy(1, {
      getDb: async () => ({}),
      selectRows: async () => {
        throw Object.assign(new Error("Failed query: select from `user_memory`"), {
          cause: Object.assign(new Error("no such table"), { code: "ER_NO_SUCH_TABLE", errno: 1146 }),
        });
      },
      isMissingTableError: (e) => {
        let cur: unknown = e;
        for (let i = 0; cur && i < 4; i++) {
          const err = cur as { code?: string; cause?: unknown };
          if (err.code === "ER_NO_SUCH_TABLE") return true;
          cur = err.cause;
        }
        return false;
      },
    });
    expect(result).toBeNull();
  });

  it("rethrows non-missing-table database errors", async () => {
    await expect(
      getUserMemoryPolicy(1, {
        getDb: async () => ({}),
        selectRows: async () => {
          throw new Error("connection reset");
        },
        isMissingTableError: () => false,
      }),
    ).rejects.toThrow(/connection reset/);
  });
});
