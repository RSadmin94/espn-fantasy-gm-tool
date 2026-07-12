/** Client helpers for RFSN Live session states and standby presentation. */
import type { RfsnBroadcastSnapshot } from "./rfsnPresentation";

export type RfsnLiveSessionState =
  | "waiting_for_draft"
  | "live"
  | "between_picks"
  | "commentary_pending"
  | "commentary_active"
  | "broadcast_unavailable"
  | "draft_complete";

export type RfsnLivePublicPayload = {
  schemaVersion: 1;
  sessionState: RfsnLiveSessionState;
  snapshot: RfsnBroadcastSnapshot | null;
  activePickIdentity: {
    draftId: string;
    pickNumber: number;
    pickId: string;
  } | null;
  frameStatus: string;
  generatedAt: string | null;
  draftComplete: boolean;
};

export function createRfsnLiveStandbySnapshot(
  overrides: Partial<RfsnBroadcastSnapshot> = {},
): RfsnBroadcastSnapshot {
  return {
    round: 1,
    pickInRound: 1,
    overallPick: "1.01",
    onClockTeam: "On the clock",
    clockSeconds: 90,
    draftOrder: [],
    board: [],
    significance: "routine",
    momentMeter: 0,
    championshipOdds: [],
    ticker: [],
    queue: [],
    ...overrides,
  };
}

export function liveSessionStatusLabel(state: RfsnLiveSessionState): string {
  switch (state) {
    case "waiting_for_draft":
      return "Standing by for draft";
    case "live":
      return "Live draft";
    case "between_picks":
      return "Between picks";
    case "commentary_pending":
      return "Commentary in progress";
    case "commentary_active":
      return "On air";
    case "broadcast_unavailable":
      return "Broadcast standby";
    case "draft_complete":
      return "Draft complete";
    default:
      return "RFSN Live";
  }
}

export function shouldRenderLiveCommentary(payload: RfsnLivePublicPayload): boolean {
  if (!payload.snapshot) return false;
  if (payload.sessionState === "commentary_active") return true;
  if (payload.sessionState === "between_picks" && payload.snapshot.primary) return true;
  return false;
}
