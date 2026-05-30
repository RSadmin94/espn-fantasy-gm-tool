import { getAuth } from "@clerk/express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  auth: ReturnType<typeof getAuth>;
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const auth = getAuth(opts.req);
  console.log("CLERK AUTH DEBUG", {
    userId: auth.userId,
    sessionId: auth.sessionId,
    hasCookie: !!opts.req.headers.cookie,
    proto: opts.req.headers["x-forwarded-proto"],
    host: opts.req.headers.host,
  });

  let user: User | null = null;

  try {
    const { userId } = auth;
    if (userId) {
      user = (await db.getUserByOpenId(userId)) ?? null;
      if (!user) {
        // Auto-provision user on first Clerk login
        await db.upsertUser({
          openId: userId,
          name: null,
          email: null,
          loginMethod: "clerk",
          lastSignedIn: new Date(),
        });
        user = (await db.getUserByOpenId(userId)) ?? null;
      } else {
        await db.upsertUser({ openId: userId, lastSignedIn: new Date() });
      }
    }
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    auth,
    user,
  };
}
