import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import {
  ADMIN_CAPABILITIES,
  ADMIN_VIEW_CAPABILITIES,
  type AdminCapability,
} from "../../shared/adminCapabilities";
import { NOT_ADMIN_ERR_MSG } from "../../shared/const";
import { isConsoleAccount, isOwnerAccount } from "./owners";

export type { AdminCapability };
export { ADMIN_CAPABILITIES, ADMIN_VIEW_CAPABILITIES };

const ALL_CAPS: readonly AdminCapability[] = ADMIN_CAPABILITIES;

export function capabilitiesFor(
  user: Pick<User, "openId" | "email" | "role"> | null | undefined,
): AdminCapability[] {
  if (!user) return [];
  if (isOwnerAccount(user)) return [...ALL_CAPS];
  if (user.role === "admin") return [...ADMIN_VIEW_CAPABILITIES];
  return [];
}

export function hasCapability(
  user: Pick<User, "openId" | "email" | "role"> | null | undefined,
  capability: AdminCapability,
): boolean {
  if (isOwnerAccount(user)) return true;
  return capabilitiesFor(user).includes(capability);
}

export function assertCapability(
  user: Pick<User, "openId" | "email" | "role"> | null | undefined,
  capability: AdminCapability,
): asserts user is NonNullable<typeof user> {
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please login (10001)" });
  }
  if (!hasCapability(user, capability)) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
}

export function consoleAccessLevel(
  user: Pick<User, "openId" | "email" | "role"> | null | undefined,
): "owner" | "admin" | "none" {
  if (isOwnerAccount(user)) return "owner";
  if (isConsoleAccount(user)) return "admin";
  return "none";
}

export type OwnerProtectionCheck = {
  allowed: boolean;
  reason?: string;
};

/**
 * Prevents the owner from locking themselves out of the console.
 */
export function ownerProtectionCheck(opts: {
  actor: Pick<User, "id" | "openId" | "email" | "role">;
  target: Pick<User, "id" | "openId" | "email" | "role">;
  action:
    | "suspend"
    | "remove_owner"
    | "demote_role"
    | "disable_ai"
    | "restrict";
}): OwnerProtectionCheck {
  const targetingSelf = opts.actor.id === opts.target.id;
  const targetIsOwner = isOwnerAccount(opts.target);
  if (!targetingSelf && !targetIsOwner) return { allowed: true };

  if (
    targetIsOwner &&
    (opts.action === "suspend" ||
      opts.action === "remove_owner" ||
      opts.action === "demote_role" ||
      opts.action === "disable_ai" ||
      opts.action === "restrict")
  ) {
    return {
      allowed: false,
      reason: "The owner account cannot be restricted, suspended, or have owner access removed.",
    };
  }
  if (targetingSelf && (opts.action === "disable_ai" || opts.action === "restrict" || opts.action === "suspend")) {
    return {
      allowed: false,
      reason: "You cannot apply this restriction to your own owner account.",
    };
  }
  return { allowed: true };
}
