/**
 * RFSN-014 — League Format Player Pool Enforcement.
 *
 * Eligible draft positions come from the league's lineup requirements
 * (FormatProfile / LeagueRosterRules), not the full NFL registry.
 *
 * Rule: DP appears only when the league allows it — never "DP should never appear."
 *
 * Scope (shared rule; wire every draft surface to it):
 * - Draft War Room availablePool / Live Draft / Mock Draft (wired)
 * - Draft Reality Mode, Draft Targets, Recommendations (follow-on)
 */

import { rosterRulesFromLineupSlotCounts } from "./draftEngine/phase5/leagueRosterRules";

const SKILL_AND_KICKER = new Set(["QB", "RB", "WR", "TE", "K"]);

/** Known primary league (457622): IDP slot 15 — DP in All Players is correct for this league. */
export const PRIMARY_IDP_LINEUP_REQS: Record<string, number> = {
  QB: 1,
  RB: 1,
  WR: 2,
  TE: 1,
  FLEX: 2,
  DP: 1,
  K: 1,
};

/**
 * Safe default for unknown / unparsed leagues: standard offense + K + team D/ST.
 * Does NOT invent an IDP (DP) slot.
 */
export const STANDARD_NON_IDP_LINEUP_REQS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  K: 1,
  DEF: 1,
};

export function leagueRostersIdp(leagueReqs: Record<string, number>): boolean {
  return (leagueReqs.DP ?? 0) > 0;
}

export function leagueRostersTeamDefense(leagueReqs: Record<string, number>): boolean {
  return (leagueReqs.DEF ?? 0) > 0;
}

/** True when this normalized draft position may appear in the league's draftable pool. */
export function isDraftPoolPositionEligible(
  draftPos: string,
  leagueReqs: Record<string, number>,
): boolean {
  const pos = String(draftPos ?? "").toUpperCase();
  if (SKILL_AND_KICKER.has(pos)) return true;
  if (pos === "DP") return leagueRostersIdp(leagueReqs);
  if (pos === "DEF" || pos === "DST" || pos === "D/ST") {
    return leagueRostersTeamDefense(leagueReqs);
  }
  return false;
}

/** Allow-list for availablePool rows after keepers / mock exclusion. */
export function draftPoolPositionAllowList(
  leagueReqs: Record<string, number>,
): Set<string> {
  const allow = new Set<string>(["QB", "RB", "WR", "TE", "K"]);
  if (leagueRostersIdp(leagueReqs)) allow.add("DP");
  if (leagueRostersTeamDefense(leagueReqs)) {
    allow.add("DEF");
    allow.add("DST");
  }
  return allow;
}

/** Position tabs that should appear in Live Draft (beyond ALL + skill + K). */
export function draftPoolExtraPositionTabs(
  leagueReqs: Record<string, number>,
): { showDef: boolean; showDp: boolean } {
  return {
    showDef: leagueRostersTeamDefense(leagueReqs),
    showDp: leagueRostersIdp(leagueReqs),
  };
}

/**
 * Resolve lineup requirements for draft pool eligibility.
 * Unknown / missing metadata → standard non-IDP (never invent DP).
 */
export function resolveLeagueLineupReqsForDraftPool(args: {
  leagueId: string;
  lineupSlotCounts?: Record<string, unknown> | null;
}): Record<string, number> {
  if (String(args.leagueId) === "457622") return { ...PRIMARY_IDP_LINEUP_REQS };

  const counts = args.lineupSlotCounts;
  if (!counts || typeof counts !== "object") {
    return { ...STANDARD_NON_IDP_LINEUP_REQS };
  }

  try {
    const s = rosterRulesFromLineupSlotCounts({
      leagueId: String(args.leagueId),
      lineupSlotCounts: counts,
    }).starters;
    if (!(s.QB > 0 && s.WR > 0 && s.TE > 0)) {
      return { ...STANDARD_NON_IDP_LINEUP_REQS };
    }
    const reqs: Record<string, number> = {
      QB: s.QB,
      RB: s.RB,
      WR: s.WR,
      TE: s.TE,
      FLEX: s.FLEX,
      K: s.K,
    };
    if (s.DP > 0) reqs.DP = s.DP;
    if (s.DST > 0) reqs.DEF = s.DST;
    return reqs;
  } catch {
    return { ...STANDARD_NON_IDP_LINEUP_REQS };
  }
}
