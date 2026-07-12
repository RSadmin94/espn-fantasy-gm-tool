/**
 * Structured telemetry for RFSN Live broadcast — aggregated, sanitized.
 */
import type { BroadcastFrame } from "./broadcastFrameContract";
import type { EditorialPlanId } from "./editorialPlans";

export type LiveBroadcastTelemetryEvent = {
  at: string;
  momentId: string;
  editorialPlan: EditorialPlanId | string | null;
  requestedVoices: string[];
  acceptedVoices: string[];
  suppressedVoices: string[];
  rejectionCategories: Record<string, number>;
  generationLatencyMs: number;
  entailmentLatencyMs: number;
  frameReadyLatencyMs: number;
  staleDiscarded: boolean;
  timedOut: boolean;
  retried: boolean;
  providerFailure: boolean;
  estimatedCostUsd: number;
  featureFlagEnabled: boolean;
  deliverySuccess: boolean;
};

const MAX_EVENTS = 200;
const events: LiveBroadcastTelemetryEvent[] = [];

export function recordLiveBroadcastTelemetry(event: Omit<LiveBroadcastTelemetryEvent, "at">): void {
  events.push({ ...event, at: new Date().toISOString() });
  if (events.length > MAX_EVENTS) events.shift();
}

export function getLiveBroadcastTelemetrySnapshot(): readonly LiveBroadcastTelemetryEvent[] {
  return [...events];
}

export function summarizeFrameTelemetry(
  frame: BroadcastFrame,
  meta: {
    frameReadyLatencyMs: number;
    staleDiscarded: boolean;
    timedOut: boolean;
    retried: boolean;
    providerFailure: boolean;
    estimatedCostUsd: number;
    featureFlagEnabled: boolean;
    deliverySuccess: boolean;
    editorialPlan: string | null;
    requestedVoices: string[];
    entailmentLatencyMs?: number;
  },
): Omit<LiveBroadcastTelemetryEvent, "at"> {
  const momentId =
    frame.public.identity.kind === "draft_pick"
      ? frame.public.identity.pickId
      : frame.public.identity.eventId;

  const acceptedVoices: string[] = [];
  const suppressedVoices: string[] = [];
  const rejectionCategories: Record<string, number> = {};

  for (const v of frame.diagnostics.voiceAttempts) {
    if (v.accepted) acceptedVoices.push(v.voice);
    else {
      suppressedVoices.push(v.voice);
      const cat = v.rejectionCategory ?? "unknown";
      rejectionCategories[cat] = (rejectionCategories[cat] ?? 0) + 1;
    }
  }

  const genMs = frame.diagnostics.voiceAttempts.reduce((s, v) => s + (v.latencyMs ?? 0), 0);

  return {
    momentId,
    editorialPlan: meta.editorialPlan,
    requestedVoices: meta.requestedVoices,
    acceptedVoices,
    suppressedVoices,
    rejectionCategories,
    generationLatencyMs: genMs,
    entailmentLatencyMs: meta.entailmentLatencyMs ?? 0,
    frameReadyLatencyMs: meta.frameReadyLatencyMs,
    staleDiscarded: meta.staleDiscarded,
    timedOut: meta.timedOut,
    retried: meta.retried,
    providerFailure: meta.providerFailure,
    estimatedCostUsd: meta.estimatedCostUsd,
    featureFlagEnabled: meta.featureFlagEnabled,
    deliverySuccess: meta.deliverySuccess,
  };
}

export function resetLiveBroadcastTelemetryForTests(): void {
  events.length = 0;
}
