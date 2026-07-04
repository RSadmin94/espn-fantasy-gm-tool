/**
 * Staff (comp) whitelist — free full access for the team you hire.
 *
 * Grants the SAME premium entitlement as the founder list (wired into hasPremiumAccess in
 * _core/trpc.ts), so a staff member who connects THEIR OWN ESPN league gets every Rivals Pro
 * feature at no charge, on their own data. Purely an additive entitlement override: no Stripe,
 * no billing/subscription state, and NOT the read-only demo lock — staff are normal accounts.
 *
 * Keyed ONLY on authenticated Clerk identity — sign-in email (easiest to onboard with) or Clerk
 * user id — never on an ESPN owner name. Env-driven so you can add a hire without a code change:
 *   STAFF_ACCOUNT_EMAILS      comma-separated sign-in emails, lowercased        (easiest)
 *   STAFF_ACCOUNT_CLERK_IDS   comma-separated Clerk user ids ("user_...")
 * Add someone, let Railway redeploy, and they're in on their next page load. Dormant (grants
 * nothing to anyone) until at least one entry is configured.
 *
 * NOTE: email matching requires the account's email to be captured at sign-in (see
 * _core/context.ts). Clerk-id matching always works regardless.
 */
import type { User } from "../../drizzle/schema";

function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function staffClerkIds(): ReadonlySet<string> {
  return new Set(csvEnv("STAFF_ACCOUNT_CLERK_IDS"));
}

function staffEmails(): ReadonlySet<string> {
  return new Set(csvEnv("STAFF_ACCOUNT_EMAILS").map((e) => e.toLowerCase()));
}

/** True iff this authenticated account is on the staff comp list (full free access). */
export function isStaffAccount(
  user: Pick<User, "openId" | "email"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.openId && staffClerkIds().has(user.openId)) return true;
  if (user.email && staffEmails().has(user.email.trim().toLowerCase())) return true;
  return false;
}
