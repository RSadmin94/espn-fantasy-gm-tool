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
import { resolveCurrentOwner } from "../currentOwnerService";

// Clerk user ids (`User.openId`, e.g. "user_3E8K7..."). Preferred: stable and unspoofable.
export const FOUNDER_CLERK_IDS: ReadonlySet<string> = new Set<string>([
  "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo", // Rod Sellers (account #1, founder/owner)
  // Mark Deroux (user_3EZzDAQ6LKumtOff17svR32NYYe) removed for free-flow QA — restore to re-grant founder access.
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


// ---------------------------------------------------------------------------
// Founder access by claimed OWNER IDENTITY (no Clerk id / email required).
//
// A user who CLAIMS one of these owner identities (via the normal receipt -> claim
// -> setup flow) gets founder/premium access in ANY league their account resolves
// through. Keyed on the user's OWN resolved owner (resolveCurrentOwner), so it only
// activates AFTER claim/setup completion (isSetupComplete), and merely viewing
// someone else's public receipt never grants access. The claim path's source +
// slot guards are unchanged; this is a read-only consumer of the resolved owner.
// ---------------------------------------------------------------------------

/** Normalize an owner display name for tolerant matching: trim, collapse inner whitespace, lowercase. */
function normalizeOwnerName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Founder owner display names (normalized). Add a name here to grant founder access by claimed identity. */
export const FOUNDER_OWNER_NAMES: ReadonlySet<string> = new Set<string>([
  normalizeOwnerName("Demetri Clark"),
]);

/** Pure decision: is this owner display name on the founder owner-name list? (case- and space-insensitive) */
export function isFounderOwnerName(displayName: string | null | undefined): boolean {
  const n = normalizeOwnerName(displayName);
  return n.length > 0 && FOUNDER_OWNER_NAMES.has(n);
}

/**
 * True iff the authenticated user has CLAIMED (setup-complete) an owner whose display name is on
 * the founder owner-name list. DB/cache-backed (resolveCurrentOwner: 60-min TTL keyed by userId),
 * hence async. Returns false until claim/setup completion, and is based on the user's OWN resolved
 * owner -- never on a league or receipt merely being viewed.
 */
export async function hasFounderOwnerIdentity(
  user: { id: number } | null | undefined,
): Promise<boolean> {
  if (!user?.id) return false;
  const owner = await resolveCurrentOwner({ id: user.id });
  if (!owner.isSetupComplete) return false;
  return isFounderOwnerName(owner.displayName);
}
