/**
 * Shared Live Draft surface gate (RFSN-030).
 *
 * DraftWarRoom stays mounted across `/draft/live` ↔ `/draft/mock`.
 * `liveDraftActive` is sticky (toggle ON survives Mock). Any Live-only
 * service (booth poller, ESPN monitor, etc.) must also require the Live
 * Draft route surface (`preferLiveDraft` from `/draft/live`).
 */
export function isLiveDraftSurfaceActive(args: {
  liveDraftActive: boolean;
  /** True only on the Live Draft surface (`preferLiveDraft` / `/draft/live`). */
  preferLiveDraft: boolean;
}): boolean {
  return Boolean(args.liveDraftActive && args.preferLiveDraft);
}

/**
 * Connected-league ESPN monitor may run only on the Live Draft surface
 * with Live Draft ON and the Connected League source selected.
 */
export function isConnectedLeagueLiveActive(args: {
  liveDraftActive: boolean;
  preferLiveDraft: boolean;
  source: string;
  /** RFSN-030C — FantasyPros simulation must not arm ESPN. */
  fantasyProsSessionActive?: boolean;
}): boolean {
  if (args.fantasyProsSessionActive) return false;
  return (
    isLiveDraftSurfaceActive({
      liveDraftActive: args.liveDraftActive,
      preferLiveDraft: args.preferLiveDraft,
    }) && args.source === "connected-league"
  );
}
