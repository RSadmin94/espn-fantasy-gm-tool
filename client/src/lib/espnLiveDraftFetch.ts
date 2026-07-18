/**
 * Sprint 10.1 — fetch ESPN mDraftDetail for live monitoring (extension-backed).
 *
 * Authority: Path A (browser cookies / credentials), not server ESPN session.
 *
 * RFSN-013 — Live Draft Experience Shell: user-facing product is Live Draft;
 * this module is the first hidden source adapter (ESPN). Do not surface "ESPN"
 * in product UI.
 *
 * Deferred — RFSN-012 ESPN Connector Reliability Layer (Sprint 10.3):
 * - Chrome extension heartbeat
 * - cookie/session validation
 * - connector health indicator
 * - user-facing "connected to ESPN draft?" state
 * Do not build a second server ESPN ingestion path.
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
