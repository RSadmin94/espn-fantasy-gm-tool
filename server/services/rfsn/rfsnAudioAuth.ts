/**
 * Clerk session resolution for non-tRPC Express routes (e.g. WAV delivery).
 */
import { getAuth } from "@clerk/express";
import type { Request } from "express";
import type { User } from "../../../drizzle/schema";
import * as db from "../../db";

export async function resolveClerkUserFromRequest(req: Request): Promise<User | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  return (await db.getUserByOpenId(userId)) ?? null;
}
