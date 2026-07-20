/**
 * Helpers for ESPN Live bookmarklet-primary vs legacy league-fetch fallback.
 * Keeps DraftWarRoom wiring testable without mounting the full page.
 */

/** Legacy league-fetch only when the extension is confirmed missing. */
export function shouldEnableLegacyEspnLeagueFetch(args: {
  connectedLeagueLive: boolean;
  bookmarkletConnectorStatus: string;
}): boolean {
  return (
    Boolean(args.connectedLeagueLive) &&
    args.bookmarkletConnectorStatus === "extension_missing"
  );
}

/**
 * Prefer bookmarklet monitor status whenever Live ESPN is on and the extension
 * is not confirmed missing (including idle/arming/waiting/monitoring).
 */
export function shouldPreferEspnBookmarkletStatus(args: {
  connectedLeagueLive: boolean;
  bookmarkletTransportActive?: boolean;
  bookmarkletConnectorStatus: string;
}): boolean {
  if (!args.connectedLeagueLive) return false;
  return args.bookmarkletConnectorStatus !== "extension_missing";
}

/**
 * True only when Board Mirror publisher has confirmed ARM (or is monitoring).
 * STATUS "ready" alone must NOT count — that fires before publisher.arm().
 * Background tab-reach STATUS "armed"/"waiting_for_espn_mirror" lacks league identity.
 */
export function isEspnMirrorPublisherHandshake(args: {
  status: string;
  sessionNonce?: string | null;
  leagueId?: string | null;
  draftId?: string | null;
}): boolean {
  const status = String(args.status ?? "");
  if (status === "monitoring" || status === "complete") return true;
  if (status !== "armed") return false;
  const nonce = args.sessionNonce != null ? String(args.sessionNonce).trim() : "";
  if (!nonce) return false;
  const leagueId = args.leagueId != null ? String(args.leagueId).trim() : "";
  const draftId = args.draftId != null ? String(args.draftId).trim() : "";
  if (leagueId && /^\d+$/.test(leagueId)) return true;
  return Boolean(draftId && /^espn-live-\d+-\d{4}$/.test(draftId) && !draftId.endsWith("-na"));
}
