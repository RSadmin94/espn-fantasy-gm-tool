/**
 * Public-safe audio transport types for RFSN Live (additive to text broadcast).
 */
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";

export type RfsnVoiceAudioRef = {
  voice: RfsnCommentatorId;
  commentaryId: string;
  contentType: "audio/wav";
  expiresAt: string;
  status: "pending" | "ready" | "failed" | "expired";
  /** Present only after synthesis bytes are stored. */
  audioId?: string;
};

export type RfsnLiveAudioStatus = {
  enabled: boolean;
  leagueId: string;
  draftId: string;
  pickId: string;
  pickNumber: number;
  clips: RfsnVoiceAudioRef[];
  updatedAt: string;
  /** Server epoch binding — clients may ignore. */
  epoch?: number;
};

export type RfsnAudioFetchIdentity = {
  draftId: string;
  pickId: string;
  pickNumber: number;
  voice: RfsnCommentatorId;
};

export type StoredAudioClip = {
  audioId: string;
  leagueId: string;
  draftId: string;
  pickId: string;
  pickNumber: number;
  commentaryId: string;
  voice: RfsnCommentatorId;
  bytes: Buffer;
  contentType: "audio/wav";
  expiresAt: number;
  epoch: number;
};
