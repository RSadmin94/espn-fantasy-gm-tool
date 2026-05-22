import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAuth } from "@clerk/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const { userId } = getAuth(opts.req);
    if (userId) {
      let found = await db.getUserByOpenId(userId);
      if (!found) {
        await db.upsertUser({ openId: userId, lastSignedIn: new Date() });
        found = await db.getUserByOpenId(userId);
      }
      user = found ?? null;
    }
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
