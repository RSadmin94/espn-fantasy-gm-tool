// Funnel instrumentation helper.
//
// Goal: a DURABLE visitorId (localStorage) that survives refresh, tab close, and the
// Clerk sign-in redirect, so anonymous receipt/Dossier views can be stitched to later
// signup / claim / checkout / paid-conversion events. A per-session sessionId
// (sessionStorage) is also generated to populate logUIEvent.sessionId, but visitorId is
// the durable stitch key (sent in event metadata for both anonymous and logged-in events).
//
// Fire-and-forget: this never throws into the UI and never changes paywall/claim/token logic.
import { useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";

const VISITOR_KEY = "ffr_visitor_id";
const SESSION_KEY = "ffr_session_id";

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* fall through */ }
  return "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readOrCreate(getStore: () => Storage | undefined, key: string): string {
  try {
    const store = getStore();
    if (!store) return genId();
    let v = store.getItem(key);
    if (!v) { v = genId(); store.setItem(key, v); }
    return v;
  } catch {
    // Storage blocked (private mode, etc.) — fall back to an ephemeral id rather than break tracking.
    return genId();
  }
}

/** Durable across sessions/tabs/redirects. The stitch key. */
export function getVisitorId(): string {
  return readOrCreate(() => (typeof window !== "undefined" ? window.localStorage : undefined), VISITOR_KEY);
}

/** Per-session (sessionStorage). Preserved/populated for logUIEvent.sessionId; not the stitch key. */
export function getSessionId(): string {
  return readOrCreate(() => (typeof window !== "undefined" ? window.sessionStorage : undefined), SESSION_KEY);
}

type FunnelEventType = "page_view" | "feature_open" | "cta_click";

type TrackOpts = {
  eventType?: FunnelEventType;
  page?: string | null;
  action?: string | null;
  extra?: Record<string, unknown>;
};

/**
 * Returns a stable `track(step, opts?)` that fires a funnel event through the existing
 * usageMonitor.logUIEvent mutation, injecting visitorId (metadata) + sessionId. The funnel
 * step name lives in `featureName`, matching the existing convention (e.g. "dna_snapshot_viewed").
 */
export function useFunnel() {
  const log = (trpc as any).usageMonitor.logUIEvent.useMutation();
  const mutateRef = useRef<(args: unknown) => void>(() => {});
  mutateRef.current = log.mutate;

  return useCallback((step: string, opts?: TrackOpts) => {
    try {
      mutateRef.current({
        eventType: opts?.eventType ?? "feature_open",
        featureName: step,
        page: opts?.page ?? null,
        action: opts?.action ?? null,
        sessionId: getSessionId(),
        metadata: JSON.stringify({ visitorId: getVisitorId(), ...(opts?.extra ?? {}) }),
      });
    } catch {
      /* fire-and-forget */
    }
  }, []);
}
