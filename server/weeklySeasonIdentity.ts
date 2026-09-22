/**
 * League identity for weekly-season intelligence.
 *
 * Legacy weekly_storylines / fear_index / weekly_player_stats rows cannot be
 * reliably attributed to a league, so they migrate as UNATTRIBUTED_LEAGUE_ID.
 * They are never treated as belonging to ESPN 457622 (or any other league).
 */

export const UNATTRIBUTED_LEAGUE_ID = "unattributed";

export function normalizeLeagueId(leagueId: string | null | undefined): string {
  return String(leagueId ?? "").trim().slice(0, 32);
}

export function isAttributedLeagueId(leagueId: string | null | undefined): boolean {
  const lid = normalizeLeagueId(leagueId);
  return lid.length > 0 && lid !== UNATTRIBUTED_LEAGUE_ID && lid !== "default";
}

export function requireAttributedLeagueId(leagueId: string | null | undefined): string {
  const lid = normalizeLeagueId(leagueId);
  if (!isAttributedLeagueId(lid)) {
    throw new Error("weekly season engine requires an explicit attributed leagueId");
  }
  return lid;
}
