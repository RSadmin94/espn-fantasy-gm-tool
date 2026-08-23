/**
 * Application owner allowlist for the Admin Console.
 *
 * Distinct from founder/beta premium (`founders.ts`) and staff comp (`staff.ts`).
 * Founder/beta access does NOT grant operational console access.
 *
 * Preferred production resolution:
 *   1. Persisted DB role: users.role === "owner"
 *   2. Environment Clerk ids: OWNER_ACCOUNT_CLERK_IDS and/or OWNER_OPEN_ID
 *
 * Bootstrap only (do not use as the long-term sole control):
 *   3. Static APPLICATION_OWNER_CLERK_IDS — retained so the product owner keeps
 *      console access when role is still "user" (pre-migration) and env is unset.
 *   4. OWNER_ACCOUNT_EMAILS — opt-in, empty by default. Email is a weaker
 *      identifier than Clerk id; do not rely on it as the only production gate.
 */
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";

function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Last-resort Clerk id bootstrap for the application owner (Rod Sellers).
 * Same person as a founder, but founder/beta lists MUST NOT be reused here —
 * other founders would otherwise inherit Admin Console access.
 * Keep until production has users.role = owner and/or OWNER_OPEN_ID set.
 */
export const APPLICATION_OWNER_CLERK_IDS: ReadonlySet<string> = new Set<string>([
  "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
]);

export function ownerClerkIds(): ReadonlySet<string> {
  const ids = new Set<string>(APPLICATION_OWNER_CLERK_IDS);
  if (ENV.ownerOpenId) ids.add(ENV.ownerOpenId);
  for (const id of csvEnv("OWNER_ACCOUNT_CLERK_IDS")) ids.add(id);
  return ids;
}

export function ownerEmails(): ReadonlySet<string> {
  return new Set(csvEnv("OWNER_ACCOUNT_EMAILS").map((e) => e.toLowerCase()));
}

export function isApplicationOwnerOpenId(openId: string | null | undefined): boolean {
  if (!openId) return false;
  return ownerClerkIds().has(openId);
}

export function isOwnerAccount(
  user: Pick<User, "openId" | "email" | "role"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.openId && ownerClerkIds().has(user.openId)) return true;
  if (user.email && ownerEmails().has(user.email.trim().toLowerCase())) return true;
  return false;
}

export function isConsoleAccount(
  user: Pick<User, "openId" | "email" | "role"> | null | undefined,
): boolean {
  if (!user) return false;
  if (isOwnerAccount(user)) return true;
  return user.role === "admin";
}
