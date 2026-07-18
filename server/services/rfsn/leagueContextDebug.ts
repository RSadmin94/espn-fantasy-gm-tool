/**
 * Temporary acceptance-only league context debug trace.
 * Enabled when RFSN_LEAGUE_CONTEXT_DEBUG=true — not a product UI surface.
 */

export type LeagueContextDebug = {
  owner: string;
  pickNumber: number | null;
  factsFound: number;
  /** Confidence gate passed (true enough to state). */
  factsEligible: number;
  /** Confidence + heat air rule — injected into verifiedFacts. */
  factsAired: number;
  typesFound: string[];
  typesAired: string[];
  sampleAired: string[];
  sampleBenched: string[];
  userIdPresent: boolean;
};

export function isLeagueContextDebugEnabled(): boolean {
  const v = String(process.env.RFSN_LEAGUE_CONTEXT_DEBUG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
