/**
 * Founder / Beta Tester whitelist.
 *
 * Grants full premium access (bypassing every paywall) to a small, hand-curated set of
 * accounts. Keyed ONLY on authenticated Clerk identity — the Clerk user id (`User.openId`)
 * or the account's email — NEVER on an ESPN owner name (those are unverified, reused across
 * leagues, and spoofable).
 *
 * MVP: a static in-code list. There is no billing or subscription state involved here; this
 * is purely an additive entitlement override. Promote to a DB table only if the list needs to
 * change without a deploy.
 *
 * To add a founder: drop their Clerk user id (preferred) or lowercased sign-in email below.
 */
import type { User } from "../../drizzle/schema";

// Clerk user ids (`User.openId`, e.g. "user_3E8K7..."). Preferred: stable and unspoofable.
export const FOUNDER_CLERK_IDS: ReadonlySet<string> = new Set<string>([
  "user_3EZzDAQ6LKumtOff17svR32NYYe", // Mark Deroux (account #175, focal owner in league 457622)
  // TODO(founder-list): add Demetri Clark Clerk id (their `User.openId`).
]);

// Fallback: sign-in emails, lowercased. Useful when only the email is known (e.g. before the
// account's first login has been mapped to a Clerk id).
export const FOUNDER_EMAILS: ReadonlySet<string> = new Set<string>([
  // TODO(founder-list): add Mark + Demetri sign-in emails, lowercased.
]);

/** True iff this authenticated account is on the Founder/Beta whitelist (by Clerk id or email). */
export function isFounderAccount(
  user: Pick<User, "openId" | "email"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.openId && FOUNDER_CLERK_IDS.has(user.openId)) return true;
  if (user.email && FOUNDER_EMAILS.has(user.email.trim().toLowerCase())) return true;
  return false;
}
