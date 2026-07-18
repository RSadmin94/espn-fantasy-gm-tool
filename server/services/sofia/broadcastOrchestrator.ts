/**
 * Broadcast Orchestrator — coordinates voice generation, grounding, editorial routing,
 * retries, timeouts, stale protection, and BroadcastFrame construction. Emits BroadcastFrame only.
 */
import type {
  BroadcastContext,
  BroadcastFrame,
  BroadcastFrameStatus,
  BroadcastMomentIdentity,
  BroadcastRejectionCategory,
  BroadcastVoiceDiagnostics,
} from "./broadcastFrameContract";
import {
  buildBroadcastFramePublic,
  deriveBroadcastFrameStatus,
  freezeBroadcastFrame,
} from "./broadcastFrameContract";
import {
  assignEditorialRoles,
  buildEditorialAssignment,
  type EditorialAssignment,
  type VoiceId,
} from "./broadcastEditorialRouting";
import { identitiesEqual } from "./broadcastMomentBridge";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import type { EditorialLedger } from "./editorialLedger";
import { createEditorialLedger } from "./editorialLedger";
import type { FactPacket, PersonalityModule, VoiceResult } from "./broadcastVoice";
import { generateVoice } from "./broadcastVoice";
import type { EntailmentChecker } from "./sofiaDeterministicValidation";
import type { PlayerRegistryOracle } from "./playerRegistryOracle";
import type { RegenerationTelemetry } from "./voiceRegeneration";
import { intentAuditAction } from "../rfsn/intentAudit";

export type BroadcastLogger = {
  warn(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
};

export type BroadcastOrchestratorConfig = {
  voiceTimeoutMs: number;
  maxTransientRetries: number;
};

export type BroadcastOrchestratorDeps = {
  voices: Record<VoiceId, PersonalityModule>;
  checker: EntailmentChecker;
  playerOracle: PlayerRegistryOracle;
  ledger?: EditorialLedger;
  generate?: (prompt: string) => Promise<string>;
  clock?: () => number;
  logger?: BroadcastLogger;
  regenerationTelemetry?: RegenerationTelemetry;
  /** Shadow/cert only — production live broadcast keeps this false/undefined. */
  enableDeterministicRegeneration?: boolean;
};

export type BroadcastOptions = {
  isStillActive?: (identity: BroadcastMomentIdentity) => boolean;
  voiceTimeoutMs?: number;
  maxTransientRetries?: number;
};

const DEFAULT_CONFIG: BroadcastOrchestratorConfig = {
  voiceTimeoutMs: 12_000,
  maxTransientRetries: 1,
};

function mapRejection(rejectedBy: VoiceResult["rejectedBy"], expired: boolean): BroadcastRejectionCategory | undefined {
  if (expired) return undefined;
  if (!rejectedBy) return undefined;
  if (rejectedBy === "generation") return "generation";
  if (rejectedBy === "parse") return "parse";
  return rejectedBy;
}

function toDiagnostics(
  personality: PersonalityModule,
  result: VoiceResult | null,
  meta: {
    attemptCount: number;
    latencyMs: number | null;
    expired?: boolean;
    rejectionCategory?: BroadcastRejectionCategory;
    suppressReason?: string;
  },
): BroadcastVoiceDiagnostics {
  const expired = meta.expired ?? false;
  const accepted = !expired && (result?.accepted ?? false);
  return {
    voice: personality.id,
    commentaryType: personality.commentaryType,
    text: result?.line ?? null,
    accepted,
    suppressed: !accepted,
    rejectionCategory: meta.rejectionCategory ?? mapRejection(result?.rejectedBy ?? null, expired),
    premise: result?.premise ?? null,
    entailment: expired ? "expired" : (result?.entailment ?? "generation_failed"),
    attemptCount: meta.attemptCount,
    latencyMs: meta.latencyMs,
    entityDiagnostics: result?.entityDiagnostics,
    ignoredAmbiguous: result?.ignoredAmbiguous,
    suppressReason: meta.suppressReason ?? result?.suppressReason ?? null,
  };
}

function isTransientFailure(result: VoiceResult): boolean {
  return result.rejectedBy === "generation";
}

export class BroadcastOrchestrator {
  private readonly config: BroadcastOrchestratorConfig;
  private readonly ledger: EditorialLedger;
  private generationEpoch = 0;
  private activeIdentity: BroadcastMomentIdentity | null = null;

  constructor(
    private readonly deps: BroadcastOrchestratorDeps,
    config: Partial<BroadcastOrchestratorConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ledger = deps.ledger ?? createEditorialLedger();
  }

  getLedger(): EditorialLedger {
    return this.ledger;
  }

  getActiveIdentity(): BroadcastMomentIdentity | null {
    return this.activeIdentity;
  }

  async buildFrame(moment: BroadcastMoment, options: BroadcastOptions = {}): Promise<BroadcastFrame> {
    const epoch = ++this.generationEpoch;
    const identity = moment.identity;
    this.activeIdentity = identity;

    const assignment = buildEditorialAssignment(moment, this.ledger);
    const generatedAt = new Date(this.deps.clock?.() ?? Date.now()).toISOString();

    if (assignment.silence) {
      const frame = this.freezeFrame({
        identity,
        momentType: moment.momentType,
        significance: moment.significance,
        headline: moment.headline,
        context: moment.context,
        generatedAt,
        factPacket: moment.factPacket,
        assignment,
        voiceAttempts: [],
        status: "suppressed",
        primary: null,
        secondary: null,
        deferred: [],
        stale: false,
        providerFailures: [],
      });
      this.recordLedger(moment, assignment, frame);
      return frame;
    }

    const voiceAttempts = await this.executeVoices(moment.factPacket, assignment.request, epoch, options);

    const stale =
      epoch !== this.generationEpoch ||
      (options.isStillActive != null && !options.isStillActive(identity));

    if (stale) {
      const expiredAttempts = voiceAttempts.map((v) => ({
        ...v,
        accepted: false,
        suppressed: true,
        rejectionCategory: undefined,
        suppressReason: "stale pick — commentary expired",
        entailment: "expired",
      }));
      return this.freezeFrame({
        identity,
        momentType: moment.momentType,
        significance: moment.significance,
        headline: moment.headline,
        context: moment.context,
        generatedAt,
        factPacket: moment.factPacket,
        assignment,
        voiceAttempts: expiredAttempts,
        status: "expired",
        primary: null,
        secondary: null,
        deferred: [],
        stale: true,
        providerFailures: [],
      });
    }

    const roles = assignEditorialRoles(assignment, voiceAttempts);

    const allProvidersFailed =
      voiceAttempts.length > 0 &&
      voiceAttempts.every((v) => v.rejectionCategory === "generation" || v.rejectionCategory === "provider");

    const status = deriveBroadcastFrameStatus(moment.significance, [...voiceAttempts], { allProvidersFailed });

    const providerFailures = voiceAttempts
      .filter((v) => v.rejectionCategory === "generation" || v.rejectionCategory === "provider")
      .map((v) => `${v.voice}: ${v.suppressReason ?? "provider failure"}`);

    const frame = this.freezeFrame({
      identity,
      momentType: moment.momentType,
      significance: moment.significance,
      headline: moment.headline,
      context: moment.context,
      generatedAt,
      factPacket: moment.factPacket,
      assignment,
      voiceAttempts,
      status,
      primary: roles.primary,
      secondary: roles.secondary,
      deferred: roles.deferred,
      stale: false,
      providerFailures,
    });

    this.recordLedger(moment, assignment, frame);
    return frame;
  }

  private recordLedger(moment: BroadcastMoment, assignment: EditorialAssignment, frame: BroadcastFrame): void {
    const voicesOnAir: VoiceId[] = [];
    if (frame.public.primaryVoice?.accepted) voicesOnAir.push(frame.public.primaryVoice.voice as VoiceId);
    if (frame.public.secondaryVoice?.accepted) voicesOnAir.push(frame.public.secondaryVoice.voice as VoiceId);
    for (const d of frame.public.deferredVoices) {
      if (d.accepted) voicesOnAir.push(d.voice as VoiceId);
    }

    const acceptedTexts: Partial<Record<VoiceId, string | null>> = {};
    for (const v of frame.diagnostics.voiceAttempts) {
      if (v.accepted) acceptedTexts[v.voice as VoiceId] = v.text;
    }

    const decompressionTriggered =
      assignment.plan.decompressionBehavior === "trigger" &&
      voicesOnAir.length > 0 &&
      frame.public.status !== "failed";

    this.ledger.recordFrame({
      planId: assignment.planId,
      leadVoice: (frame.public.primaryVoice?.voice as VoiceId) ?? null,
      voicesOnAir,
      silenced: frame.public.status === "suppressed",
      significance: moment.significance,
      storylines: [...moment.storylines],
      callbackKeys: moment.callbackKeys ?? [],
      acceptedTexts,
      planEnergy: assignment.plan.energyLevel,
      decompressionTriggered,
      decompressionWindow: assignment.plan.decompressionWindowPicks,
    });
  }

  private async executeVoices(
    packet: FactPacket,
    voiceIds: VoiceId[],
    epoch: number,
    options: BroadcastOptions,
  ): Promise<BroadcastVoiceDiagnostics[]> {
    return Promise.all(voiceIds.map((id) => this.executeVoice(packet, this.deps.voices[id]!, epoch, options)));
  }

  private async executeVoice(
    packet: FactPacket,
    personality: PersonalityModule,
    epoch: number,
    options: BroadcastOptions,
  ): Promise<BroadcastVoiceDiagnostics> {
    const timeoutMs = options.voiceTimeoutMs ?? this.config.voiceTimeoutMs;
    const maxRetries = options.maxTransientRetries ?? this.config.maxTransientRetries;
    const start = this.deps.clock?.() ?? Date.now();
    let attemptCount = 0;
    let lastResult: VoiceResult | null = null;

    while (attemptCount <= maxRetries) {
      if (epoch !== this.generationEpoch) {
        return toDiagnostics(personality, lastResult, {
          attemptCount,
          latencyMs: (this.deps.clock?.() ?? Date.now()) - start,
          expired: true,
          suppressReason: "stale pick — generation aborted",
        });
      }

      attemptCount++;
      try {
        const generateFn = this.deps.generate;
        if (!generateFn) {
          return toDiagnostics(personality, null, {
            attemptCount,
            latencyMs: (this.deps.clock?.() ?? Date.now()) - start,
            rejectionCategory: "provider",
            suppressReason: "no generate function configured",
          });
        }

        const result = await this.withTimeout(
          generateVoice(packet, personality, {
            generate: generateFn,
            checker: this.deps.checker,
            playerOracle: this.deps.playerOracle,
            regenerationTelemetry: this.deps.regenerationTelemetry,
            enableDeterministicRegeneration: this.deps.enableDeterministicRegeneration,
          }),
          timeoutMs,
        );

        lastResult = result;

        // RFSN-009A — post-generation intent audit (does not change generation logic).
        if (result.accepted && result.line) {
          const { action, audit } = intentAuditAction(result.line, {
            allowRegenerate: Boolean(this.deps.enableDeterministicRegeneration),
            alreadyRegenerated: Boolean(result.regeneration?.attempted),
          });
          if (action === "regenerate") {
            this.deps.logger?.warn("intent audit — regenerating once", {
              voice: personality.id,
              flagged: audit.ok ? [] : audit.flagged,
            });
            const regen = await this.withTimeout(
              generateVoice(packet, personality, {
                generate: generateFn,
                checker: this.deps.checker,
                playerOracle: this.deps.playerOracle,
                regenerationTelemetry: this.deps.regenerationTelemetry,
                enableDeterministicRegeneration: false,
              }),
              timeoutMs,
            );
            lastResult = regen;
            if (regen.accepted && regen.line) {
              const second = intentAuditAction(regen.line, {
                allowRegenerate: false,
                alreadyRegenerated: true,
              });
              if (second.action === "suppress") {
                lastResult = {
                  ...regen,
                  accepted: false,
                  rejectedBy: "parse",
                  suppressReason: `intent audit: ${second.audit.ok ? "flagged" : second.audit.flagged.join(", ")}`,
                };
              }
            }
          } else if (action === "suppress") {
            lastResult = {
              ...result,
              accepted: false,
              rejectedBy: "parse",
              suppressReason: `intent audit: ${audit.ok ? "flagged" : audit.flagged.join(", ")}`,
            };
          }
        }

        if (lastResult.accepted || !isTransientFailure(lastResult) || attemptCount > maxRetries) {
          return toDiagnostics(personality, lastResult, {
            attemptCount,
            latencyMs: (this.deps.clock?.() ?? Date.now()) - start,
          });
        }

        this.deps.logger?.warn("transient voice failure — retrying", {
          voice: personality.id,
          attempt: attemptCount,
          reason: result.suppressReason,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg === "voice_timeout";
        if (isTimeout || attemptCount > maxRetries) {
          return toDiagnostics(personality, lastResult, {
            attemptCount,
            latencyMs: (this.deps.clock?.() ?? Date.now()) - start,
            rejectionCategory: isTimeout ? "timeout" : "provider",
            suppressReason: isTimeout ? "voice timeout" : msg,
          });
        }
        this.deps.logger?.warn("transient provider error — retrying", { voice: personality.id, attempt: attemptCount });
      }
    }

    return toDiagnostics(personality, lastResult, {
      attemptCount,
      latencyMs: (this.deps.clock?.() ?? Date.now()) - start,
      rejectionCategory: "provider",
      suppressReason: "exhausted retries",
    });
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("voice_timeout")), ms);
      promise
        .then((v) => { clearTimeout(timer); resolve(v); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
  }

  private freezeFrame(input: {
    identity: BroadcastMomentIdentity;
    momentType: string;
    significance: BroadcastFrame["public"]["significance"];
    headline: string | null;
    context: BroadcastContext;
    generatedAt: string;
    factPacket: FactPacket;
    assignment: EditorialAssignment;
    voiceAttempts: BroadcastVoiceDiagnostics[];
    status: BroadcastFrameStatus;
    primary: BroadcastVoiceDiagnostics | null;
    secondary: BroadcastVoiceDiagnostics | null;
    deferred: BroadcastVoiceDiagnostics[];
    stale: boolean;
    providerFailures: string[];
  }): BroadcastFrame {
    const pub = buildBroadcastFramePublic({
      identity: input.identity,
      momentType: input.momentType,
      significance: input.significance,
      headline: input.headline,
      primaryVoice: input.primary,
      secondaryVoice: input.secondary,
      deferredVoices: input.deferred,
      context: input.context,
      generatedAt: input.generatedAt,
      status: input.status,
    });

    return freezeBroadcastFrame({
      public: pub,
      diagnostics: {
        factPacket: input.factPacket,
        voiceAttempts: Object.freeze([...input.voiceAttempts]),
        providerFailures: Object.freeze([...input.providerFailures]),
        stale: input.stale,
      },
    });
  }
}

export { identitiesEqual };
