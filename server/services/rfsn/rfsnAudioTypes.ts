/**
 * Public-safe audio transport types for RFSN Live (additive to text broadcast).
 */
import type { RfsnCommentatorId } from "../../../client/src/lib/rfsnPresentation";

export type RfsnVoiceAudioRef = {
  audioId: string;
  voice: RfsnCommentatorId;
  commentaryId: string;
  contentType: "audio/wav";
  expiresAt: string;
  status: "pending" | "ready" | "failed";
};

export type RfsnLiveAudioStatus = {
  enabled: boolean;
  pickId: string;
  clips: RfsnVoiceAudioRef[];
  updatedAt: string;
};
