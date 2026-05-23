import { getAuth } from "@clerk/express";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";

export async function authenticateClerkRequest(req: Request): Promise<User | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;

  let user = (await db.getUserByOpenId(userId)) ?? null;
  if (!user) {
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

  return user;
}
