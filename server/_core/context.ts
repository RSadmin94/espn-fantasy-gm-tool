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

/**
 * Best-effort fetch of the account's primary sign-in email from Clerk's Backend API.
 * Version-independent (the installed @clerk/backend build does not surface a users helper),
 * short-timeout, and never throws — a failure yields null so sign-in is never blocked. Used only
 * to populate a MISSING email (first provision or one-time backfill), so it adds no per-request
 * cost once an account's email is stored.
 */
async function fetchClerkPrimaryEmail(userId: string): Promise<string | null> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const u = (await r.json()) as {
      primary_email_address_id?: string;
      email_addresses?: Array<{ id?: string; email_address?: string }>;
    };
    const list = Array.isArray(u.email_addresses) ? u.email_addresses : [];
    const primary = list.find((e) => e.id === u.primary_email_address_id) ?? list[0];
    const email = primary?.email_address;
    return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const auth = getAuth(opts.req);

  let user: User | null = null;

  try {
    const { userId } = auth;
    if (userId) {
      user = (await db.getUserByOpenId(userId)) ?? null;
      if (!user) {
        // Auto-provision user on first Clerk login. Capture the sign-in email so email-based
        // entitlement lists (staff / founder) work; best-effort, never blocks sign-in.
        const email = await fetchClerkPrimaryEmail(userId);
        await db.upsertUser({
          openId: userId,
          name: null,
          email,
          loginMethod: "clerk",
          lastSignedIn: new Date(),
        });
        user = (await db.getUserByOpenId(userId)) ?? null;
      } else if (!user.email) {
        // One-time backfill for accounts provisioned before email capture existed. Only write
        // email when we actually got one, so we never overwrite an existing value with null.
        const email = await fetchClerkPrimaryEmail(userId);
        await db.upsertUser(
          email
            ? { openId: userId, email, lastSignedIn: new Date() }
            : { openId: userId, lastSignedIn: new Date() },
        );
        user = (await db.getUserByOpenId(userId)) ?? user;
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
