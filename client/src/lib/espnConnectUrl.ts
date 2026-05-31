/**
 * Builds the ESPN Fantasy Football URL used when opening the site for the connect flow.
 * Prefer league overview (`/football/league`) — not team pages.
 */
export function buildEspnFantasyFootballConnectUrl(leagueId?: string | null): string {
  const trimmed = leagueId?.trim();
  if (trimmed) {
    return `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(trimmed)}`;
  }
  return "https://fantasy.espn.com/football/";
}
