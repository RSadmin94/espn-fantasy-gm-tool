import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({
      select: mockSelect,
    }),
  };
});

import { assertUserLeagueAccess, userHasLeagueAccess } from "./leagueAccess";

describe("leagueAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  it("userHasLeagueAccess returns false when no connection row exists", async () => {
    expect(await userHasLeagueAccess(1, "457622")).toBe(false);
  });

  it("userHasLeagueAccess returns true when a connection row exists", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 99 }]),
        }),
      }),
    });
    expect(await userHasLeagueAccess(1, "457622")).toBe(true);
  });

  it("assertUserLeagueAccess throws FORBIDDEN when not connected", async () => {
    await expect(assertUserLeagueAccess(1, "999999")).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
  });

  it("assertUserLeagueAccess resolves when connected", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });
    await expect(assertUserLeagueAccess(1, "457622")).resolves.toBeUndefined();
  });
});
