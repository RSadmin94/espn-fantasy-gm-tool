/** Client helpers for RFSN Live session states and standby presentation. */
import type { RfsnBroadcastSnapshot } from "./rfsnPresentation";

export type RfsnVoiceAudioRef = {
  voice: "sofia" | "coach" | "roxanne";
  commentaryId: string;
  contentType: "audio/wav";
  expiresAt: string;
  status: "pending" | "ready" | "failed" | "expired";
  audioId?: string;
};

export type RfsnLiveAudioStatus = {
  enabled: boolean;
  leagueId?: string;
  draftId: string;
  pickId: string;
  pickNumber: number;
  clips: RfsnVoiceAudioRef[];
  updatedAt: string;
};

export type RfsnAudioState =
  | "disabled"
  | "locked"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "failed";

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
  audioStatus?: RfsnLiveAudioStatus | null;
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

/**
 * Read-only board projection for RFSN Live — uses the polled snapshot when present,
 * otherwise an empty standing-by scaffold (no fabricated picks).
 */
export function resolveRfsnLiveDisplaySnapshot(
  payload: RfsnLivePublicPayload | null | undefined,
  leagueName?: string,
): RfsnBroadcastSnapshot {
  if (payload?.snapshot) {
    return payload.snapshot;
  }
  return createRfsnLiveStandbySnapshot({
    onClockTeam: leagueName ? `${leagueName} draft` : "Standing by for draft",
  });
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
  if (payload.sessionState === "draft_complete" && payload.snapshot.primary) return true;
  if (payload.sessionState === "between_picks" && payload.snapshot.primary) return true;
  return false;
}
