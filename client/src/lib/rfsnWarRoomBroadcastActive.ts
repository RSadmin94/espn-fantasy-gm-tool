import { isLiveDraftSurfaceActive } from "@/lib/liveDraftSurfaceActive";
import { isFantasyProsSimulationBroadcastActive } from "@/lib/fantasyProsMockSession";

/**
 * War Room booth snapshot poller gate.
 *
 * DraftWarRoom stays mounted across `/draft/live` ↔ `/draft/mock`.
 * `liveDraftActive` is sticky (toggle), so ESPN Live polling must also require
 * the Live Draft surface (`preferLiveDraft` from the canonical live route).
 *
 * RFSN-030C: FantasyPros simulation may arm the booth on the Mock surface only.
 */
export function isRfsnWarRoomBroadcastActive(args: {
  liveDraftActive: boolean;
  /** True only on the Live Draft surface (`preferLiveDraft` / `/draft/live`). */
  preferLiveDraft: boolean;
  /** FantasyPros solo mock connector session (Mock surface). */
  fantasyProsSessionActive?: boolean;
}): boolean {
  if (
    isFantasyProsSimulationBroadcastActive({
      fantasyProsSessionActive: Boolean(args.fantasyProsSessionActive),
      preferLiveDraft: args.preferLiveDraft,
    })
  ) {
    return true;
  }
  return isLiveDraftSurfaceActive(args);
}
