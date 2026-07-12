/**
 * BroadcastFrame contract — frozen editorial output between grounded voice generation
 * and the RFSN presentation adapter.
 *
 * Flow (future):
 *   Draft Moment → Broadcast Orchestrator → BroadcastFrame → rfsnBroadcastAdapter → UI
 *
 * Role assignment: the future orchestrator / frame builder assigns primary, secondary,
 * and deferred voices BEFORE emitting a BroadcastFrame. The RFSN adapter only validates
 * presentation limits and maps roles into RfsnBroadcastSnapshot.
 *
 * Breaking schema changes require incrementing BROADCAST_FRAME_SCHEMA_VERSION and a migration ADR.
 */
import type { CommentaryType, FactPacket } from "./broadcastVoice";
import type { AmbiguousMention } from "./playerRegistryOracle";
import type { EntityGuardViolation } from "./voiceGrounding";

export const BROADCAST_FRAME_SCHEMA_VERSION = 1 as const;

export type BroadcastFrameSchemaVersion = typeof BROADCAST_FRAME_SCHEMA_VERSION;

export type BroadcastMomentIdentity =
  | {
      kind: "draft_pick";
      draftId: string;
      pickNumber: number;
      pickId: string;
    }
  | {
      kind: "league_event";
      leagueId: string;
      eventId: string;
      occurredAt: string;
    };

export type BroadcastSignificance = "routine" | "notable" | "major" | "historic";

export type BroadcastFrameStatus =
  | "pending"
  | "partial"
  | "ready"
  | "suppressed"
  | "expired"
  | "failed";

export type BroadcastRejectionCategory =
  | "entity"
  | "number"
  | "polarity"
  | "entailment"
  | "generation"
  | "parse"
  | "timeout"
  | "provider";

export type BroadcastContext =
  | { kind: "breaking_news"; headline: string; body: string }
  | { kind: "position_run"; count: number; position: string }
  | { kind: "league_storyline"; title: string; body: string }
  | { kind: "championship_odds"; teams: readonly { team: string; pct: number }[] }
  | { kind: "none" };

/** Presentation-safe voice output — no prompts, provider payloads, or entailment transcripts. */
export type BroadcastVoicePublic = {
  voice: string;
  commentaryType: CommentaryType;
  text: string | null;
  accepted: boolean;
  suppressed: boolean;
  rejectionCategory?: BroadcastRejectionCategory;
};

/** Internal voice diagnostics for shadow evaluation and logs. */
export type BroadcastVoiceDiagnostics = BroadcastVoicePublic & {
  premise: string | null;
  entailment: string;
  attemptCount: number;
  latencyMs: number | null;
  entityDiagnostics?: readonly EntityGuardViolation[];
  ignoredAmbiguous?: readonly AmbiguousMention[];
  suppressReason?: string | null;
};

export type BroadcastFramePublic = {
  schemaVersion: BroadcastFrameSchemaVersion;
  identity: BroadcastMomentIdentity;
  momentType: string;
  significance: BroadcastSignificance;
  headline: string | null;
  primaryVoice: BroadcastVoicePublic | null;
  secondaryVoice: BroadcastVoicePublic | null;
  deferredVoices: readonly BroadcastVoicePublic[];
  context: BroadcastContext;
  generatedAt: string;
  status: BroadcastFrameStatus;
};

export type BroadcastFrameDiagnostics = {
  factPacket: FactPacket;
  voiceAttempts: readonly BroadcastVoiceDiagnostics[];
  providerFailures: readonly string[];
  stale: boolean;
};

export type BroadcastFrame = {
  public: BroadcastFramePublic;
  diagnostics: BroadcastFrameDiagnostics;
};

export function toPublicVoice(diag: BroadcastVoiceDiagnostics): BroadcastVoicePublic {
  return {
    voice: diag.voice,
    commentaryType: diag.commentaryType,
    text: diag.text,
    accepted: diag.accepted,
    suppressed: diag.suppressed,
    rejectionCategory: diag.rejectionCategory,
  };
}

export function stripDiagnostics(frame: BroadcastFrame): BroadcastFramePublic {
  return frame.public;
}

export function assertBroadcastFrameVersion(frame: BroadcastFramePublic): void {
  if (frame.schemaVersion !== BROADCAST_FRAME_SCHEMA_VERSION) {
    throw new Error(`Unsupported BroadcastFrame schema version: ${frame.schemaVersion}`);
  }
}

export function serializeBroadcastFrame(frame: BroadcastFrame): string {
  return JSON.stringify(frame);
}

export function parseBroadcastFrame(raw: string): BroadcastFrame {
  const frame = JSON.parse(raw) as BroadcastFrame;
  assertBroadcastFrameVersion(frame.public);
  return frame;
}

/** Derive frame status from voice outcomes — editorial routing is upstream; this is a pure reducer. */
export function deriveBroadcastFrameStatus(
  significance: BroadcastSignificance,
  voices: readonly BroadcastVoiceDiagnostics[],
  opts: { stale?: boolean; allProvidersFailed?: boolean } = {},
): BroadcastFrameStatus {
  if (opts.stale) return "expired";
  if (opts.allProvidersFailed) return "failed";
  if (significance === "routine" && voices.every((v) => !v.accepted)) return "suppressed";
  const accepted = voices.filter((v) => v.accepted);
  if (accepted.length === 0 && voices.length > 0) return "failed";
  if (accepted.length > 0 && accepted.length < voices.length) return "partial";
  if (accepted.length > 0) return "ready";
  return "pending";
}

export function buildBroadcastFramePublic(input: {
  identity: BroadcastMomentIdentity;
  momentType: string;
  significance: BroadcastSignificance;
  headline?: string | null;
  primaryVoice?: BroadcastVoiceDiagnostics | null;
  secondaryVoice?: BroadcastVoiceDiagnostics | null;
  deferredVoices?: readonly BroadcastVoiceDiagnostics[];
  context?: BroadcastContext;
  generatedAt?: string;
  status?: BroadcastFrameStatus;
}): BroadcastFramePublic {
  const deferred = input.deferredVoices ?? [];
  const voices = [input.primaryVoice, input.secondaryVoice, ...deferred].filter(Boolean) as BroadcastVoiceDiagnostics[];
  return {
    schemaVersion: BROADCAST_FRAME_SCHEMA_VERSION,
    identity: input.identity,
    momentType: input.momentType,
    significance: input.significance,
    headline: input.headline ?? null,
    primaryVoice: input.primaryVoice ? toPublicVoice(input.primaryVoice) : null,
    secondaryVoice: input.secondaryVoice ? toPublicVoice(input.secondaryVoice) : null,
    deferredVoices: deferred.map(toPublicVoice),
    context: input.context ?? { kind: "none" },
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    status: input.status ?? deriveBroadcastFrameStatus(input.significance, voices),
  };
}

export function freezeBroadcastFrame(frame: BroadcastFrame): BroadcastFrame {
  return Object.freeze({
    public: Object.freeze({
      ...frame.public,
      deferredVoices: Object.freeze([...frame.public.deferredVoices]),
      primaryVoice: frame.public.primaryVoice ? Object.freeze({ ...frame.public.primaryVoice }) : null,
      secondaryVoice: frame.public.secondaryVoice ? Object.freeze({ ...frame.public.secondaryVoice }) : null,
    }),
    diagnostics: Object.freeze({
      ...frame.diagnostics,
      voiceAttempts: Object.freeze(frame.diagnostics.voiceAttempts.map((v) => Object.freeze({ ...v }))),
      providerFailures: Object.freeze([...frame.diagnostics.providerFailures]),
    }),
  });
}
