/**
 * Short-lived in-memory audio clip store for RFSN Live delivery.
 */
import { randomUUID } from "crypto";
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";
import type { RfsnLiveAudioStatus, RfsnVoiceAudioRef } from "./rfsnAudioTypes";

const TTL_MS = 30 * 60 * 1000;
const MAX_CLIPS = 250;

type StoredClip = {
  audioId: string;
  leagueId: string;
  draftId: string;
  pickId: string;
  commentaryId: string;
  voice: RfsnCommentatorId;
  bytes: Buffer;
  contentType: "audio/wav";
  expiresAt: number;
  epoch: number;
};

type DraftAudioState = {
  pickId: string;
  epoch: number;
  clips: Map<string, RfsnVoiceAudioRef>;
  updatedAt: string;
};

const clips = new Map<string, StoredClip>();
const draftAudio = new Map<string, DraftAudioState>();

function draftKey(leagueId: string, draftId: string): string {
  return `${leagueId}:${draftId}`;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, clip] of clips) {
    if (clip.expiresAt <= now) clips.delete(id);
  }
  if (clips.size <= MAX_CLIPS) return;
  const sorted = [...clips.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (const [id] of sorted.slice(0, clips.size - MAX_CLIPS)) {
    clips.delete(id);
  }
}

export function resetRfsnVoiceAudioCacheForTests(): void {
  clips.clear();
  draftAudio.clear();
}

export function initDraftAudioStatus(
  leagueId: string,
  draftId: string,
  pickId: string,
  epoch: number,
  pending: Array<{ commentaryId: string; voice: RfsnCommentatorId }>,
): RfsnLiveAudioStatus {
  const now = new Date().toISOString();
  const clipMap = new Map<string, RfsnVoiceAudioRef>();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  for (const item of pending) {
    clipMap.set(item.commentaryId, {
      audioId: "",
      voice: item.voice,
      commentaryId: item.commentaryId,
      contentType: "audio/wav",
      expiresAt,
      status: "pending",
    });
  }
  const state: DraftAudioState = { pickId, epoch, clips: clipMap, updatedAt: now };
  draftAudio.set(draftKey(leagueId, draftId), state);
  return toPublicStatus(state, true);
}

export function storeVoiceAudioClip(input: {
  leagueId: string;
  draftId: string;
  pickId: string;
  commentaryId: string;
  voice: RfsnCommentatorId;
  bytes: Buffer;
  epoch: number;
}): RfsnVoiceAudioRef | null {
  const key = draftKey(input.leagueId, input.draftId);
  const state = draftAudio.get(key);
  if (!state || state.pickId !== input.pickId || state.epoch !== input.epoch) {
    return null;
  }

  pruneExpired();
  const audioId = randomUUID();
  const expiresAt = Date.now() + TTL_MS;
  clips.set(audioId, {
    audioId,
    leagueId: input.leagueId,
    draftId: input.draftId,
    pickId: input.pickId,
    commentaryId: input.commentaryId,
    voice: input.voice,
    bytes: input.bytes,
    contentType: "audio/wav",
    expiresAt,
    epoch: input.epoch,
  });

  const ref: RfsnVoiceAudioRef = {
    audioId,
    voice: input.voice,
    commentaryId: input.commentaryId,
    contentType: "audio/wav",
    expiresAt: new Date(expiresAt).toISOString(),
    status: "ready",
  };
  state.clips.set(input.commentaryId, ref);
  state.updatedAt = new Date().toISOString();
  return ref;
}

export function markVoiceAudioFailed(
  leagueId: string,
  draftId: string,
  pickId: string,
  commentaryId: string,
  epoch: number,
): void {
  const state = draftAudio.get(draftKey(leagueId, draftId));
  if (!state || state.pickId !== pickId || state.epoch !== epoch) return;
  const existing = state.clips.get(commentaryId);
  if (!existing) return;
  state.clips.set(commentaryId, { ...existing, status: "failed" });
  state.updatedAt = new Date().toISOString();
}

export function getLiveAudioStatus(
  leagueId: string,
  draftId: string,
): RfsnLiveAudioStatus | null {
  const state = draftAudio.get(draftKey(leagueId, draftId));
  if (!state) return null;
  return toPublicStatus(state, true);
}

export function getStoredAudioClip(audioId: string): StoredClip | null {
  pruneExpired();
  const clip = clips.get(audioId);
  if (!clip || clip.expiresAt <= Date.now()) {
    clips.delete(audioId);
    return null;
  }
  return clip;
}

function toPublicStatus(state: DraftAudioState, enabled: boolean): RfsnLiveAudioStatus {
  return {
    enabled,
    pickId: state.pickId,
    clips: [...state.clips.values()],
    updatedAt: state.updatedAt,
  };
}
