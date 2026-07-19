import { isLiveDraftSurfaceActive } from "@/lib/liveDraftSurfaceActive";

/**
 * War Room booth snapshot poller gate.
 *
 * DraftWarRoom stays mounted across `/draft/live` ↔ `/draft/mock`.
 * `liveDraftActive` is sticky (toggle), so polling must also require the Live
 * Draft surface (`preferLiveDraft` from the canonical live route).
 */
export function isRfsnWarRoomBroadcastActive(args: {
  liveDraftActive: boolean;
  /** True only on the Live Draft surface (`preferLiveDraft` / `/draft/live`). */
  preferLiveDraft: boolean;
}): boolean {
  return isLiveDraftSurfaceActive(args);
}
