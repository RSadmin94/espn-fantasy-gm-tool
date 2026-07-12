/**
 * RFSN Live broadcast feature flag and internal access control.
 */
import type { User } from "../../../drizzle/schema";
import { hasBetaDemoPremiumAccess, isBetaDemoAccount } from "../../_core/betaDemoUsers";
import { isFounderAccount } from "../../_core/founders";
import { isStaffAccount } from "../../_core/staff";

/** Default disabled — must be explicitly set to "true". */
export function isRfsnLiveBroadcastEnabled(): boolean {
  return process.env.RFSN_LIVE_BROADCAST_ENABLED === "true";
}

/** Internal beta: founders, staff, or beta-demo premium users when flag is on. */
export function canAccessRfsnLiveBroadcast(user: User | null | undefined): boolean {
  if (!isRfsnLiveBroadcastEnabled()) return false;
  if (!user) return false;
  if (isFounderAccount(user) || isStaffAccount(user)) return true;
  if (hasBetaDemoPremiumAccess(user) || isBetaDemoAccount(user)) return true;
  return false;
}

/** Client may show Live nav when server flag is on and user has internal access. */
export function clientRfsnLiveNavEnabled(): boolean {
  return isRfsnLiveBroadcastEnabled();
}
