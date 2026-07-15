import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";

export type ClipReadiness = "missing" | "pending" | "ready" | "failed" | "expired";

export type PlaybackGateInput = {
  ttsAvailable: boolean;
  userEnabled: boolean;
  unlocked: boolean;
  card: RfsnCommentaryCard | null;
  audioStatus: RfsnLiveAudioStatus | null | undefined;
  isPlaying: boolean;
  playInFlight: boolean;
  playbackStartedForCardId: string | null;
  targetCardId: string | null;
};

export type PlaybackGateResult =
  | { action: "wait"; reason: "no-card" | "disabled" | "locked" | "no-status" | "clip-pending" | "clip-missing" | "already-playing" | "already-started" }
  | { action: "fallback"; reason: "clip-failed" | "clip-expired" }
  | { action: "play"; clipAudioId: string };

export function clipReadiness(
  audioStatus: RfsnLiveAudioStatus | null | undefined,
  commentaryId: string,
): ClipReadiness {
  if (!audioStatus?.enabled) return "missing";
  const clip = audioStatus.clips.find((c) => c.commentaryId === commentaryId);
  if (!clip) return "missing";
  if (clip.status === "failed") return "failed";
  if (clip.status === "expired") return "expired";
  if (clip.status === "pending" || !clip.audioId) return "pending";
  return "ready";
}

/** Idempotent gate: at most one play attempt per commentary card until reset. */
export function evaluatePlaybackGate(input: PlaybackGateInput): PlaybackGateResult {
  const cardId = input.targetCardId ?? input.card?.id ?? null;
  if (!cardId || !input.card) return { action: "wait", reason: "no-card" };
  if (!input.ttsAvailable || !input.userEnabled) return { action: "wait", reason: "disabled" };
  if (!input.unlocked) return { action: "wait", reason: "locked" };
  if (input.isPlaying || input.playInFlight) return { action: "wait", reason: "already-playing" };
  if (input.playbackStartedForCardId === cardId) {
    return { action: "wait", reason: "already-started" };
  }

  const readiness = clipReadiness(input.audioStatus, cardId);
  if (readiness === "missing" || readiness === "pending") {
    return { action: "wait", reason: readiness === "pending" ? "clip-pending" : "clip-missing" };
  }
  if (readiness === "failed") return { action: "fallback", reason: "clip-failed" };
  if (readiness === "expired") return { action: "fallback", reason: "clip-expired" };
  if (!input.audioStatus) return { action: "wait", reason: "no-status" };

  const clip = input.audioStatus.clips.find((c) => c.commentaryId === cardId);
  if (!clip?.audioId) return { action: "wait", reason: "clip-pending" };
  return { action: "play", clipAudioId: clip.audioId };
}

export type PlaybackTraceEvent = {
  ts: number;
  event: string;
  cardId?: string;
  clipStatus?: ClipReadiness;
  detail?: string;
};

export function createPlaybackTracer(enabled: boolean): {
  log: (event: string, detail?: { cardId?: string; clipStatus?: ClipReadiness; detail?: string }) => void;
  events: PlaybackTraceEvent[];
} {
  const events: PlaybackTraceEvent[] = [];
  return {
    events,
    log: (event, detail) => {
      if (!enabled) return;
      events.push({
        ts: Date.now(),
        event,
        cardId: detail?.cardId,
        clipStatus: detail?.clipStatus,
        detail: detail?.detail,
      });
    },
  };
}
