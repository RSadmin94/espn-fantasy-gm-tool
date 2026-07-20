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
