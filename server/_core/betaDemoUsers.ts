/**
 * Curated beta/demo accounts — hand-approved viewers who sign in with their own Clerk
 * account (not the shared Try Demo ticket) and receive read-only access to the demo league
 * without ESPN credentials.
 *
 * Keyed ONLY on Clerk user id (`User.openId`) or sign-in email — never ESPN owner names.
 * Does not loosen global signup; Clerk dashboard still controls who can register.
 *
 * To add a beta demo user: add their lowercased email (and Clerk id when known) below.
 * Premium demo entitlements (e.g. Draft War Room) are granted per-email via
 * `BETA_DEMO_PREMIUM_EMAILS` — wired into `hasPremiumAccess` in trpc.ts.
 */
import type { User } from "../../drizzle/schema";

/** Default curated league for beta/demo mounts (see db.demoLeagueId). */
export const BETA_DEMO_LEAGUE_DISPLAY_NAME = "Atlantans Finest FF";

function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** In-code beta/demo sign-in emails (lowercased). */
export const BETA_DEMO_EMAILS: ReadonlySet<string> = new Set<string>([
  "flurrysports@gmail.com", // Zach Brunner / FlurrySports
]);

/** Clerk user ids for beta/demo accounts (preferred once known). */
export const BETA_DEMO_CLERK_IDS: ReadonlySet<string> = new Set<string>([
  // Zach Brunner — add Clerk id after first login if desired.
]);

/** Subset of beta/demo users who also receive premium demo entitlements (Draft War Room, etc.). */
export const BETA_DEMO_PREMIUM_EMAILS: ReadonlySet<string> = new Set<string>([
  "flurrysports@gmail.com", // Zach Brunner — premium demo only; not global paywall removal.
]);

function allBetaDemoEmails(): ReadonlySet<string> {
  const out = new Set(BETA_DEMO_EMAILS);
  for (const e of csvEnv("BETA_DEMO_ACCOUNT_EMAIL")) out.add(e.toLowerCase());
  return out;
}

function allBetaDemoClerkIds(): ReadonlySet<string> {
  const out = new Set(BETA_DEMO_CLERK_IDS);
  for (const id of csvEnv("BETA_DEMO_ACCOUNT_CLERK_ID")) out.add(id);
  return out;
}

/** True when this authenticated account is an approved beta/demo viewer. */
export function isBetaDemoAccount(
  user: Pick<User, "openId" | "email"> | null | undefined,
): boolean {
  if (!user) return false;
  const clerkIds = allBetaDemoClerkIds();
  if (user.openId && clerkIds.has(user.openId)) return true;
  const email = user.email?.trim().toLowerCase();
  if (email && allBetaDemoEmails().has(email)) return true;
  return false;
}

/**
 * Premium demo entitlement for approved beta viewers (Draft War Room, pro teasers, etc.).
 * Scoped per-email — does not remove the global Draft War Room paywall for other users.
 */
export function hasBetaDemoPremiumAccess(
  user: Pick<User, "openId" | "email"> | null | undefined,
): boolean {
  if (!user || !isBetaDemoAccount(user)) return false;
  const email = user.email?.trim().toLowerCase();
  return !!email && BETA_DEMO_PREMIUM_EMAILS.has(email);
}
