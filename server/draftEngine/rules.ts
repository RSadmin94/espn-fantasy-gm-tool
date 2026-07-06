/**
 * Engine rules (non-negotiable):
 * 1. League-walled — personality fits use ONLY picks in the configured league.
 * 2. Active owners only — departed owners never get personality fits or sim seats.
 * 3. Departed board context — all historical picks stay in the Choice Ledger for board shape.
 */

import { PRIMARY_BEHAVIORAL_LEAGUE_ID } from "./constants";

/** Every behavioral record is scoped to one league — no cross-league pooling. */
export const BEHAVIORAL_LEAGUE_ID = PRIMARY_BEHAVIORAL_LEAGUE_ID;

export type ChooserRole = "active" | "departed_context";

/** Chooser is modeled/simulated only when active; departed rows are ledger context only. */
export function chooserRoleFor(profileOwnerKey: string, activeProfileKeys: ReadonlySet<string>): ChooserRole {
  return activeProfileKeys.has(profileOwnerKey) ? "active" : "departed_context";
}

/** Personality / simulation eligibility (Rules 1 + 2). */
export function isEligibleForPersonalityFit(args: {
  leagueId: string;
  profileOwnerKey: string;
  activeProfileKeys: ReadonlySet<string>;
}): boolean {
  return args.leagueId === BEHAVIORAL_LEAGUE_ID && args.activeProfileKeys.has(args.profileOwnerKey);
}
