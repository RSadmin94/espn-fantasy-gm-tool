import { isLiveDraftSurfaceActive } from "@/lib/liveDraftSurfaceActive";
import { isFantasyProsSimulationBroadcastActive } from "@/lib/fantasyProsMockSession";

/**
 * War Room booth snapshot poller gate.
 *
 * DraftWarRoom stays mounted across `/draft/live` ↔ `/draft/mock`.
 * `liveDraftActive` is sticky (toggle), so ESPN Live polling must also require
 * the Live Draft surface (`preferLiveDraft` from the canonical live route).
 *
 * Booth arms when any active adapter session is feeding the shared Draft Engine:
 * - Live + ESPN League
 * - Mock + FantasyPros Mock
 * - Mock + RFSN Local Mock
 */
export function isRfsnWarRoomBroadcastActive(args: {
  liveDraftActive: boolean;
  /** True only on the Live Draft surface (`preferLiveDraft` / `/draft/live`). */
  preferLiveDraft: boolean;
  /** FantasyPros solo mock connector session (Mock surface). */
  fantasyProsSessionActive?: boolean;
  /** RFSN Local Mock generating picks on the Mock surface. */
  rfsnLocalMockSessionActive?: boolean;
}): boolean {
  if (
    isFantasyProsSimulationBroadcastActive({
      fantasyProsSessionActive: Boolean(args.fantasyProsSessionActive),
      preferLiveDraft: args.preferLiveDraft,
    })
  ) {
    return true;
  }
  if (
    Boolean(args.rfsnLocalMockSessionActive) &&
    !args.preferLiveDraft &&
    args.liveDraftActive
  ) {
    return true;
  }
  return isLiveDraftSurfaceActive(args);
}
