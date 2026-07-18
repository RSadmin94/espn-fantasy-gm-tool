/**
 * Sprint 10.1 — fetch ESPN mDraftDetail for live monitoring (extension-backed).
 */
import {
  fetchEspnJsonWithRetry,
  fetchEspnUrlViaExtension,
  isGmWarRoomExtensionPresent,
  type EspnJsonResult,
} from "@/lib/espnApi";

const FANTASY_FFL = "https://fantasy.espn.com/apis/v3/games/ffl";

/** Lightweight live poll URL — draft detail + teams for owner labels. */
export function buildEspnLiveDraftDetailUrl(leagueId: string, season: number): string {
  const lid = encodeURIComponent(String(leagueId).trim());
  const params = new URLSearchParams();
  params.append("view", "mDraftDetail");
  params.append("view", "mTeam");
  return `${FANTASY_FFL}/seasons/${season}/segments/0/leagues/${lid}?${params.toString()}`;
}

export async function fetchEspnLiveDraftDetail(
  leagueId: string,
  season: number,
): Promise<EspnJsonResult> {
  const url = buildEspnLiveDraftDetailUrl(leagueId, season);
  if (isGmWarRoomExtensionPresent()) {
    return fetchEspnUrlViaExtension(url, 45_000);
  }
  return fetchEspnJsonWithRetry(url, { tryExtensionOnBlocked: true });
}
