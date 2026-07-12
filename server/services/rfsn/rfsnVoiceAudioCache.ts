/**
 * Shared RFSN Live audio clip + draft status store (cross-instance safe).
 */
import { randomUUID } from "crypto";
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";
import { logRfsnAudio } from "./rfsnAudioInstrumentation";
import {
  deleteAudioClip,
  deleteDraftAudioStatus,
  emptyDraftAudioStatus,
  readAudioClip,
  readDraftAudioStatus,
  writeAudioClip,
  writeDraftAudioStatus,
  type StoredAudioClipRecord,
} from "./rfsnAudioSharedStore";
import type { RfsnAudioFetchIdentity, RfsnLiveAudioStatus, RfsnVoiceAudioRef, StoredAudioClip } from "./rfsnAudioTypes";

const TTL_MS = 30 * 60 * 1000;

function recordToClip(record: StoredAudioClipRecord): StoredAudioClip {
  return {
    audioId: record.audioId,
    leagueId: record.leagueId,
    draftId: record.draftId,
    pickId: record.pickId,
    pickNumber: record.pickNumber,
    commentaryId: record.commentaryId,
    voice: record.voice,
    bytes: Buffer.from(record.bytesBase64, "base64"),
    contentType: "audio/wav",
    expiresAt: record.expiresAtMs,
    epoch: record.epoch,
  };
}

export function resetRfsnVoiceAudioCacheForTests(): void {
  // Shared store reset handled by resetRfsnAudioSharedStoreForTests in tests.
}

export async function clearDraftAudioStatus(
  leagueId: string,
  draftId: string,
): Promise<RfsnLiveAudioStatus> {
  const status = emptyDraftAudioStatus(leagueId, draftId);
  await writeDraftAudioStatus(leagueId, draftId, status);
  logRfsnAudio("draft_status_cleared", { leagueId, draftId });
  return status;
}

export async function initDraftAudioStatus(
  leagueId: string,
  draftId: string,
  pickId: string,
  pickNumber: number,
  epoch: number,
  pending: Array<{ commentaryId: string; voice: RfsnCommentatorId }>,
): Promise<RfsnLiveAudioStatus> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const clips: RfsnVoiceAudioRef[] = pending.map((item) => ({
    voice: item.voice,
    commentaryId: item.commentaryId,
    contentType: "audio/wav",
    expiresAt,
    status: "pending",
  }));
  const status: RfsnLiveAudioStatus = {
    enabled: true,
    leagueId,
    draftId,
    pickId,
    pickNumber,
    clips,
    updatedAt: now,
    epoch,
  };
  await writeDraftAudioStatus(leagueId, draftId, status);
  logRfsnAudio("draft_status_initialized", {
    leagueId,
    draftId,
    pickId,
    pickNumber,
    epoch,
    pendingClips: clips.length,
  });
  return status;
}

export async function storeVoiceAudioClip(input: {
  leagueId: string;
  draftId: string;
  pickId: string;
  pickNumber: number;
  commentaryId: string;
  voice: RfsnCommentatorId;
  bytes: Buffer;
  epoch: number;
}): Promise<RfsnVoiceAudioRef | null> {
  const status = await readDraftAudioStatus(input.leagueId, input.draftId);
  if (
    !status ||
    status.pickId !== input.pickId ||
    status.pickNumber !== input.pickNumber ||
    status.epoch !== input.epoch
  ) {
    return null;
  }

  const audioId = randomUUID();
  const expiresAtMs = Date.now() + TTL_MS;
  const record: StoredAudioClipRecord = {
    audioId,
    leagueId: input.leagueId,
    draftId: input.draftId,
    pickId: input.pickId,
    pickNumber: input.pickNumber,
    commentaryId: input.commentaryId,
    voice: input.voice,
    contentType: "audio/wav",
    expiresAtMs,
    epoch: input.epoch,
    bytesBase64: input.bytes.toString("base64"),
    createdAtMs: Date.now(),
  };
  await writeAudioClip(record);

  const ref: RfsnVoiceAudioRef = {
    audioId,
    voice: input.voice,
    commentaryId: input.commentaryId,
    contentType: "audio/wav",
    expiresAt: new Date(expiresAtMs).toISOString(),
    status: "ready",
  };

  const nextClips = status.clips.map((clip) =>
    clip.commentaryId === input.commentaryId ? ref : clip,
  );
  const nextStatus: RfsnLiveAudioStatus = {
    ...status,
    clips: nextClips,
    updatedAt: new Date().toISOString(),
  };
  await writeDraftAudioStatus(input.leagueId, input.draftId, nextStatus);

  logRfsnAudio("clip_created", {
    audioId,
    leagueId: input.leagueId,
    draftId: input.draftId,
    pickId: input.pickId,
    pickNumber: input.pickNumber,
    voice: input.voice,
    bytes: input.bytes.length,
    epoch: input.epoch,
  });

  return ref;
}

export async function markVoiceAudioFailed(
  leagueId: string,
  draftId: string,
  pickId: string,
  pickNumber: number,
  commentaryId: string,
): Promise<void> {
  const status = await readDraftAudioStatus(leagueId, draftId);
  if (!status || status.pickId !== pickId || status.pickNumber !== pickNumber) return;
  const nextClips = status.clips.map((clip) =>
    clip.commentaryId === commentaryId ? { ...clip, status: "failed" as const } : clip,
  );
  await writeDraftAudioStatus(leagueId, draftId, {
    ...status,
    clips: nextClips,
    updatedAt: new Date().toISOString(),
  });
}

export async function getLiveAudioStatus(
  leagueId: string,
  draftId: string,
): Promise<RfsnLiveAudioStatus | null> {
  const status = await readDraftAudioStatus(leagueId, draftId);
  if (!status) return null;
  const now = Date.now();
  const clips = status.clips.map((clip) => {
    if (clip.status === "ready" && clip.expiresAt && Date.parse(clip.expiresAt) <= now) {
      return { ...clip, status: "expired" as const };
    }
    return clip;
  });
  return { ...status, clips };
}

export async function getStoredAudioClip(
  audioId: string,
  identity?: RfsnAudioFetchIdentity,
): Promise<StoredAudioClip | null> {
  logRfsnAudio("clip_requested", { audioId });

  const record = await readAudioClip(audioId);
  if (!record) {
    logRfsnAudio("clip_not_found", { audioId });
    return null;
  }

  if (record.expiresAtMs <= Date.now()) {
    await deleteAudioClip(audioId);
    logRfsnAudio("clip_expired", { audioId });
    return null;
  }

  if (identity) {
    const mismatch =
      record.draftId !== identity.draftId ||
      record.pickId !== identity.pickId ||
      record.pickNumber !== identity.pickNumber ||
      record.voice !== identity.voice;
    if (mismatch) {
      logRfsnAudio("clip_identity_mismatch", {
        audioId,
        expectedDraftId: identity.draftId,
        expectedPickId: identity.pickId,
        expectedPickNumber: identity.pickNumber,
        expectedVoice: identity.voice,
      });
      return null;
    }
  }

  logRfsnAudio("clip_found", {
    audioId,
    draftId: record.draftId,
    pickId: record.pickId,
    pickNumber: record.pickNumber,
    voice: record.voice,
  });

  return recordToClip(record);
}

export async function resetDraftAudioForTests(leagueId: string, draftId: string): Promise<void> {
  await deleteDraftAudioStatus(leagueId, draftId);
}
