/**
 * Survives Draft War Room panel unmount (route/tab navigation) without destroying
 * unlock state, replay clips, or the in-flight HTMLAudioElement.
 * Cleared only on explicit draft reset (sessionResetKey bump) or new draftId.
 */
import type { RfsnAudioState } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import type { RfsnLastPlayableClip } from "@/hooks/useRfsnAudioPlayback";

export type WarRoomPersistedAudio = {
  draftId: string;
  audioEl: HTMLAudioElement | null;
  objectUrl: string | null;
  currentTime: number;
  wasPlaying: boolean;
  state: RfsnAudioState;
  unlocked: boolean;
  userEnabled: boolean;
  muted: boolean;
  volume: number;
  lastPlayable: RfsnLastPlayableClip | null;
  lastCard: RfsnCommentaryCard | null;
  activePickKey: string;
};

const sessions = new Map<string, WarRoomPersistedAudio>();

export function warRoomAudioSessionKey(leagueId: string | null | undefined, draftId: string): string {
  return `${leagueId ?? "no-league"}:${draftId}`;
}

export function getWarRoomAudioSession(key: string): WarRoomPersistedAudio | undefined {
  return sessions.get(key);
}

export function setWarRoomAudioSession(key: string, session: WarRoomPersistedAudio): void {
  sessions.set(key, session);
}

export function clearWarRoomAudioSession(key: string): void {
  const s = sessions.get(key);
  if (s?.audioEl) {
    s.audioEl.pause();
    s.audioEl.src = "";
  }
  if (s?.objectUrl) {
    try {
      URL.revokeObjectURL(s.objectUrl);
    } catch {
      // ignore
    }
  }
  sessions.delete(key);
}
