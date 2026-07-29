import { describe, expect, it } from "vitest";

/**
 * Mirrors getChatHistory / addChatMessage catch policy in server/db.ts.
 */
async function getChatHistoryPolicy(
  deps: {
    selectRows: () => Promise<unknown[]>;
    isMissingTableError: (e: unknown) => boolean;
  },
): Promise<unknown[]> {
  try {
    return await deps.selectRows();
  } catch (err) {
    if (deps.isMissingTableError(err)) return [];
    throw err;
  }
}

async function addChatMessagePolicy(
  deps: {
    insert: () => Promise<void>;
    isMissingTableError: (e: unknown) => boolean;
  },
): Promise<"ok" | "skipped"> {
  try {
    await deps.insert();
    return "ok";
  } catch (err) {
    if (deps.isMissingTableError(err)) return "skipped";
    throw err;
  }
}

function missingTableDetector(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; cur && i < 4; i++) {
    const err = cur as { code?: string; cause?: unknown };
    if (err.code === "ER_NO_SUCH_TABLE") return true;
    cur = err.cause;
  }
  return false;
}

describe("chat_history soft-fail policy", () => {
  it("returns empty history when chat_history table is missing", async () => {
    const result = await getChatHistoryPolicy({
      selectRows: async () => {
        throw Object.assign(new Error("Failed query: select from `chat_history`"), {
          cause: Object.assign(new Error("Table 'railway.chat_history' doesn't exist"), {
            code: "ER_NO_SUCH_TABLE",
            errno: 1146,
          }),
        });
      },
      isMissingTableError: missingTableDetector,
    });
    expect(result).toEqual([]);
  });

  it("skips persist when chat_history table is missing", async () => {
    const status = await addChatMessagePolicy({
      insert: async () => {
        throw Object.assign(new Error("Failed query: insert into `chat_history`"), {
          cause: Object.assign(new Error("Table 'railway.chat_history' doesn't exist"), {
            code: "ER_NO_SUCH_TABLE",
            errno: 1146,
          }),
        });
      },
      isMissingTableError: missingTableDetector,
    });
    expect(status).toBe("skipped");
  });

  it("rethrows non-missing-table errors", async () => {
    await expect(
      getChatHistoryPolicy({
        selectRows: async () => {
          throw new Error("connection refused");
        },
        isMissingTableError: () => false,
      }),
    ).rejects.toThrow(/connection refused/);
  });
});
