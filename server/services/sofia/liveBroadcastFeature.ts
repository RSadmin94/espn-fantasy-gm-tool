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

/**
 * Voice/TTS beta. Default false — written commentary is the launch path and uses the
 * deterministic voice provider (no live LLM dependency for booth cards).
 */
export function isRfsnVoiceBeta(): boolean {
  return process.env.RFSN_VOICE_BETA === "true";
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
