/**
 * Demo (read-only viewer) account identification.
 *
 * Mirrors founders.ts: keyed ONLY on authenticated Clerk identity (User.openId) or the
 * account's sign-in email — never on an ESPN owner name. A recognized demo account keeps
 * full READ access but is blocked from every write, enforced centrally in _core/trpc.ts.
 *
 * No new `role` enum value is introduced: the users.role column is a fixed mysqlEnum and
 * this project's deploy does not run migrations, so demo status is derived from identity —
 * exactly like the founder whitelist — rather than from a schema change.
 *
 * ACTIVATION (dormant until then): set one or both server env vars once the demo account
 * exists in Clerk —
 *   DEMO_ACCOUNT_CLERK_ID   comma-separated Clerk user id(s), e.g. "user_ABC123"  (preferred)
 *   DEMO_ACCOUNT_EMAIL      comma-separated sign-in email(s), lowercased
 * Until at least one is set, isDemoAccount() returns false for everyone and the read-only
 * guard has no effect on any account. The canonical demo email is
 * demo@fantasyfootballrivals.com.
 */
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import { isBetaDemoAccount } from "./betaDemoUsers";

export const DEMO_READONLY_MSG =
  "This is a read-only demo. Import your own ESPN league to make changes.";

function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function demoClerkIds(): ReadonlySet<string> {
  return new Set(csvEnv("DEMO_ACCOUNT_CLERK_ID"));
}

function demoEmails(): ReadonlySet<string> {
  return new Set(csvEnv("DEMO_ACCOUNT_EMAIL").map((e) => e.toLowerCase()));
}

/** True iff this authenticated account is the curated read-only demo account. */
export function isDemoAccount(
  user: Pick<User, "openId" | "email"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.openId && demoClerkIds().has(user.openId)) return true;
  if (user.email && demoEmails().has(user.email.trim().toLowerCase())) return true;
  if (isBetaDemoAccount(user)) return true;
  return false;
}

/** Throw a uniform FORBIDDEN if the user is the read-only demo account. Reads never call this. */
export function assertNotDemo(
  user: Pick<User, "openId" | "email"> | null | undefined,
): void {
  if (isDemoAccount(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: DEMO_READONLY_MSG });
  }
}
