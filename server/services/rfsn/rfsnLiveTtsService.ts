/**
 * Fire-and-forget analyst speech generation for accepted RFSN Live voices.
 */
import { buildBoothCommentarySequence } from "../../../client/src/lib/rfsnBoothPresentation";
import type { RfsnBroadcastSnapshot } from "../../../client/src/lib/rfsnPresentation";
import type { BroadcastFrame } from "../sofia/broadcastFrameContract";
import { getLiveSession, getLiveSessionEpoch, updateLiveSession } from "../sofia/liveBroadcastSession";
import { memCache } from "../../memCache";
import { synthesizeAnalystSpeech } from "./kokoroTtsClient";
import type { RfsnLiveAudioStatus } from "./rfsnAudioTypes";
import {
  clearDraftAudioStatus,
  getLiveAudioStatus,
  initDraftAudioStatus,
  markVoiceAudioFailed,
  storeVoiceAudioClip,
} from "./rfsnVoiceAudioCache";
import { isRfsnTtsOperational } from "./rfsnTtsConfig";
import { recordRfsnTtsTelemetry } from "./rfsnTtsTelemetry";

const MAX_CONCURRENT = 3;
let inFlight = 0;
const waitQueue: Array<() => void> = [];

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
    const next = waitQueue.shift();
    if (next) next();
  }
}

function boothTargets(snapshot: RfsnBroadcastSnapshot) {
  return buildBoothCommentarySequence(snapshot).map((card) => ({
    commentaryId: card.id,
    voice: card.commentator,
    text: card.text.trim(),
  }));
}

function mergeAudioIntoPayload(
  leagueId: string,
  draftId: string,
  audioStatus: RfsnLiveAudioStatus,
): void {
  const session = getLiveSession(leagueId, draftId);
  if (!session) return;
  updateLiveSession(leagueId, draftId, {
    payload: {
      ...session.payload,
      audioStatus,
    },
  });
}

async function publishAudioStatus(leagueId: string, draftId: string): Promise<void> {
  const status = await getLiveAudioStatus(leagueId, draftId);
  if (status) mergeAudioIntoPayload(leagueId, draftId, status);
}

async function publishClearedAudio(leagueId: string, draftId: string): Promise<void> {
  const status = await clearDraftAudioStatus(leagueId, draftId);
  mergeAudioIntoPayload(leagueId, draftId, status);
}

async function synthesizeOne(input: {
  leagueId: string;
  draftId: string;
  pickId: string;
  pickNumber: number;
  epoch: number;
  commentaryId: string;
  voice: string;
  text: string;
}): Promise<void> {
  if (getLiveSessionEpoch(input.leagueId, input.draftId) !== input.epoch) {
    recordRfsnTtsTelemetry({
      voice: input.voice,
      commentaryId: input.commentaryId,
      pickId: input.pickId,
      event: "audio_stale_discard",
    });
    return;
  }

  recordRfsnTtsTelemetry({
    voice: input.voice,
    commentaryId: input.commentaryId,
    pickId: input.pickId,
    event: "audio_requested",
  });

  try {
    const cacheKey = `rfsn-tts:${input.voice}:${input.text}`;
    const result = await withConcurrencyLimit(() =>
      memCache(cacheKey, 10 * 60_000, () =>
        synthesizeAnalystSpeech({ voice: input.voice, text: input.text }),
      ),
    );

    if (getLiveSessionEpoch(input.leagueId, input.draftId) !== input.epoch) {
      recordRfsnTtsTelemetry({
        voice: input.voice,
        commentaryId: input.commentaryId,
        pickId: input.pickId,
        event: "audio_stale_discard",
        upstreamLatencyMs: result.durationMs,
        bytes: result.bytes.length,
        cacheStatus: result.cacheStatus,
      });
      return;
    }

    const stored = await storeVoiceAudioClip({
      leagueId: input.leagueId,
      draftId: input.draftId,
      pickId: input.pickId,
      pickNumber: input.pickNumber,
      commentaryId: input.commentaryId,
      voice: input.voice as "sofia" | "coach" | "roxanne",
      bytes: result.bytes,
      epoch: input.epoch,
    });

    if (!stored) {
      recordRfsnTtsTelemetry({
        voice: input.voice,
        commentaryId: input.commentaryId,
        pickId: input.pickId,
        event: "audio_stale_discard",
        upstreamLatencyMs: result.durationMs,
        bytes: result.bytes.length,
        cacheStatus: result.cacheStatus,
      });
      return;
    }

    recordRfsnTtsTelemetry({
      voice: input.voice,
      commentaryId: input.commentaryId,
      pickId: input.pickId,
      event: "audio_success",
      upstreamLatencyMs: result.durationMs,
      bytes: result.bytes.length,
      cacheStatus: result.cacheStatus,
    });
    await publishAudioStatus(input.leagueId, input.draftId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "synthesis failed";
    const event = message === "timeout" ? "audio_timeout" : "audio_failure";
    recordRfsnTtsTelemetry({
      voice: input.voice,
      commentaryId: input.commentaryId,
      pickId: input.pickId,
      event,
      error: message === "timeout" ? "timeout" : "synthesis failed",
    });
    await markVoiceAudioFailed(
      input.leagueId,
      input.draftId,
      input.pickId,
      input.pickNumber,
      input.commentaryId,
    );
    await publishAudioStatus(input.leagueId, input.draftId);
  }
}

export function scheduleLiveFrameAudio(input: {
  leagueId: string;
  draftId: string;
  epoch: number;
  frame: BroadcastFrame;
  snapshot: RfsnBroadcastSnapshot;
  pickId: string;
  pickNumber: number;
}): void {
  void (async () => {
    if (!isRfsnTtsOperational()) {
      await publishClearedAudio(input.leagueId, input.draftId);
      return;
    }

    const suppressed =
      input.frame.public.status === "suppressed" ||
      input.frame.public.status === "expired" ||
      input.frame.public.status === "failed" ||
      input.frame.diagnostics.stale;

    if (suppressed) {
      await publishClearedAudio(input.leagueId, input.draftId);
      return;
    }

    const targets = boothTargets(input.snapshot).filter((t) => t.text.length > 0);
    if (targets.length === 0) {
      await publishClearedAudio(input.leagueId, input.draftId);
      return;
    }

    const audioStatus = await initDraftAudioStatus(
      input.leagueId,
      input.draftId,
      input.pickId,
      input.pickNumber,
      input.epoch,
      targets.map((t) => ({ commentaryId: t.commentaryId, voice: t.voice })),
    );
    mergeAudioIntoPayload(input.leagueId, input.draftId, audioStatus);

    for (const target of targets) {
      void synthesizeOne({
        leagueId: input.leagueId,
        draftId: input.draftId,
        pickId: input.pickId,
        pickNumber: input.pickNumber,
        epoch: input.epoch,
        commentaryId: target.commentaryId,
        voice: target.voice,
        text: target.text,
      });
    }
  })();
}

export function resetRfsnLiveTtsServiceForTests(): void {
  inFlight = 0;
  waitQueue.length = 0;
  memCache.invalidateAll();
}
