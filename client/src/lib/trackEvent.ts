/**
 * Lightweight client-side event tracking helper.
 *
 * Fires a fire-and-forget tRPC mutation to log UI events to the usage_events table.
 * Never throws — all errors are silently swallowed so tracking never breaks the app.
 *
 * Usage:
 *   trackEvent("page_view", "weekly_intel", { page: "/weekly-intel" })
 *   trackEvent("feature_open", "trade_lab")
 *   trackEvent("ai_action", "advisor.chat", { action: "message_sent" })
 *   trackEvent("cta_click", "subscription", { action: "checkout_clicked" })
 */

export type UIEventType =
  | "page_view"
  | "feature_open"
  | "ai_action"
  | "cta_click"
  | "session_start"
  | "return_visit"
  | "league_switch"
  | "tab_view"
  | "drop_off";

export interface TrackEventOptions {
  page?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

// Session ID is generated once per browser session and stored in sessionStorage
function getSessionId(): string {
  const key = "ff_gm_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

// Return visit detection: compare last_seen in localStorage
export function checkReturnVisit(): boolean {
  const key = "ff_gm_last_seen";
  const now = Date.now();
  const last = parseInt(localStorage.getItem(key) ?? "0", 10);
  localStorage.setItem(key, String(now));
  // Return visit if last seen > 24 hours ago (and not first visit)
  return last > 0 && now - last > 24 * 60 * 60 * 1000;
}

// Internal: get the tRPC client lazily to avoid circular imports
let _trpcClient: ReturnType<typeof import("./trpc").trpc.useUtils> | null = null;

/**
 * Low-level fire-and-forget event logger.
 * Called by the trackEvent wrapper and by the usePageTracking hook.
 */
export async function logEvent(
  eventType: UIEventType,
  featureName: string,
  opts: TrackEventOptions = {}
): Promise<void> {
  try {
    const sessionId = getSessionId();
    const page = opts.page ?? window.location.pathname;
    // Use fetch directly to avoid tRPC client circular import issues
    await fetch("/api/trpc/usageMonitor.logUIEvent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: {
          eventType,
          featureName,
          page,
          action: opts.action ?? null,
          sessionId,
          metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        },
      }),
      // Don't wait — fire and forget
      keepalive: true,
    });
  } catch {
    // Silently swallow — tracking must never break the app
  }
}

/**
 * Track a UI event. Fire-and-forget — never throws.
 */
export function trackEvent(
  eventType: UIEventType,
  featureName: string,
  opts: TrackEventOptions = {}
): void {
  // Intentionally not awaited
  void logEvent(eventType, featureName, opts);
}
