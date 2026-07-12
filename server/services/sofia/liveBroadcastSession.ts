/**
 * Ephemeral in-memory live broadcast session — one active build per draft.
 */
import type { RfsnBroadcastSnapshot } from "../../../client/src/lib/rfsnPresentation";
import type { BroadcastFrameStatus } from "./broadcastFrameContract";

import type { RfsnLiveAudioStatus } from "../rfsn/rfsnAudioTypes";

export type RfsnLiveSessionState =
  | "waiting_for_draft"
  | "live"
  | "between_picks"
  | "commentary_pending"
  | "commentary_active"
  | "broadcast_unavailable"
  | "draft_complete";

export type PublicLiveBroadcastPayload = {
  schemaVersion: 1;
  sessionState: RfsnLiveSessionState;
  snapshot: RfsnBroadcastSnapshot | null;
  activePickIdentity: {
    draftId: string;
    pickNumber: number;
    pickId: string;
  } | null;
  frameStatus: BroadcastFrameStatus | "idle";
  generatedAt: string | null;
  draftComplete: boolean;
  /** Additive audio transport — text broadcast works without this. */
  audioStatus?: RfsnLiveAudioStatus | null;
};

type DraftSession = {
  leagueId: string;
  draftId: string;
  epoch: number;
  state: RfsnLiveSessionState;
  payload: PublicLiveBroadcastPayload;
  lastProcessedPickId: string | null;
};

const sessions = new Map<string, DraftSession>();

function sessionKey(leagueId: string, draftId: string): string {
  return `${leagueId}:${draftId}`;
}

export function getOrCreateLiveSession(leagueId: string, draftId: string): DraftSession {
  const key = sessionKey(leagueId, draftId);
  let s = sessions.get(key);
  if (!s) {
    s = {
      leagueId,
      draftId,
      epoch: 0,
      state: "waiting_for_draft",
      lastProcessedPickId: null,
      payload: {
        schemaVersion: 1,
        sessionState: "waiting_for_draft",
        snapshot: null,
        activePickIdentity: null,
        frameStatus: "idle",
        generatedAt: null,
        draftComplete: false,
      },
    };
    sessions.set(key, s);
  }
  return s;
}

export function getLiveSession(leagueId: string, draftId: string): DraftSession | null {
  return sessions.get(sessionKey(leagueId, draftId)) ?? null;
}

export function bumpLiveSessionEpoch(leagueId: string, draftId: string): number {
  const s = getOrCreateLiveSession(leagueId, draftId);
  s.epoch += 1;
  return s.epoch;
}

export function getLiveSessionEpoch(leagueId: string, draftId: string): number {
  return getOrCreateLiveSession(leagueId, draftId).epoch;
}

export function updateLiveSession(
  leagueId: string,
  draftId: string,
  update: Partial<Pick<DraftSession, "state" | "payload" | "lastProcessedPickId">>,
): PublicLiveBroadcastPayload {
  const s = getOrCreateLiveSession(leagueId, draftId);
  if (update.state != null) s.state = update.state;
  if (update.lastProcessedPickId != null) s.lastProcessedPickId = update.lastProcessedPickId;
  if (update.payload) {
    s.payload = { ...s.payload, ...update.payload, sessionState: update.state ?? s.state };
  }
  return s.payload;
}

export function resetLiveSession(leagueId: string, draftId: string): void {
  sessions.delete(sessionKey(leagueId, draftId));
}

export function resetLiveSessionsForTests(): void {
  sessions.clear();
}
