/**
 * Production RFSN Live broadcast service — thin wrapper around BroadcastOrchestrator.
 */
import type { BroadcastFrame, BroadcastMomentIdentity } from "./broadcastFrameContract";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { draftMomentToBroadcastMoment } from "./broadcastMomentBridge";
import { resolveEditorialPlanId, buildEditorialAssignment } from "./broadcastEditorialRouting";
import { SessionEditorialLedger } from "./editorialLedger";
import {
  broadcastFrameToCommentaryResults,
  broadcastContextToRfsn,
  draftMomentToRfsnDraftBoard,
} from "./broadcastFrameToRfsnBridge";
import { buildRfsnBroadcastSnapshot } from "../../../client/src/lib/rfsnBroadcastAdapter";
import type { RfsnBroadcastSnapshot } from "../../../client/src/lib/rfsnPresentation";
import { estimateShadowCertCostUsd } from "./realBroadcastShadowDeps";
import { isRfsnLiveBroadcastEnabled } from "./liveBroadcastFeature";
import {
  bumpLiveSessionEpoch,
  getLiveSession,
  getLiveSessionEpoch,
  hasWrapUpBeenProcessed,
  markWrapUpProcessed,
  updateLiveSession,
  type PublicLiveBroadcastPayload,
  type RfsnLiveSessionState,
} from "./liveBroadcastSession";
import { recordLiveBroadcastTelemetry, summarizeFrameTelemetry } from "./liveBroadcastTelemetry";
import { scheduleLiveFrameAudio } from "../rfsn/rfsnLiveTtsService";
import {
  leagueContextEngine,
  isLeagueContextDebugEnabled,
  type LeagueContextDebug,
} from "../rfsn/leagueContextEngine";
import {
  createDeterministicLiveOrchestrator,
  createProductionLiveOrchestrator,
  mergeAccumulatedLiveProviderTelemetry,
} from "./liveBroadcastOrchestratorFactory";
import type { RealShadowTelemetry } from "./realBroadcastShadowDeps";
import type { BroadcastOrchestrator } from "./broadcastOrchestrator";
import { getLockedPicksForSession } from "./liveDraftMomentSession";
import {
  buildDraftWrapUpBroadcastMoment,
  summarizeDraftWrapUp,
  wrapUpEventIdForDraft,
} from "./liveDraftWrapUp";

export type BuildLiveBroadcastFrameInput = {
  moment: BroadcastMoment;
  leagueId: string;
  draftId: string;
  draftMoment?: DraftMoment;
  isStillActive?: (identity: BroadcastMomentIdentity) => boolean | Promise<boolean>;
  useDeterministicProvider?: boolean;
  /** When true, public payload is marked draft-complete (wrap-up / final frame). */
  markDraftComplete?: boolean;
  /** Temporary acceptance-only context engine trace. */
  leagueContextDebug?: LeagueContextDebug | null;
};

export type LiveBroadcastBuildResult = {
  frame: BroadcastFrame;
  snapshot: RfsnBroadcastSnapshot;
  publicPayload: PublicLiveBroadcastPayload;
};

const ledgers = new Map<string, SessionEditorialLedger>();

function ledgerForDraft(leagueId: string, draftId: string): SessionEditorialLedger {
  const key = `${leagueId}:${draftId}`;
  let ledger = ledgers.get(key);
  if (!ledger) {
    ledger = new SessionEditorialLedger();
    ledgers.set(key, ledger);
  }
  return ledger;
}

function sessionStateFromFrame(frame: BroadcastFrame): RfsnLiveSessionState {
  if (frame.public.status === "failed") return "broadcast_unavailable";
  if (frame.public.status === "expired" || frame.diagnostics.stale) return "between_picks";
  if (frame.public.status === "suppressed") return "between_picks";
  const hasAccepted =
    frame.public.primaryVoice?.accepted ||
    frame.public.secondaryVoice?.accepted ||
    frame.public.deferredVoices.some((v) => v.accepted);
  if (!hasAccepted) return "between_picks";
  return "commentary_active";
}

function pickIdentityFromMoment(moment: BroadcastMoment, draftId: string) {
  if (moment.identity.kind === "draft_pick") {
    return {
      draftId: moment.identity.draftId,
      pickNumber: moment.identity.pickNumber,
      pickId: moment.identity.pickId,
    };
  }
  if (moment.identity.kind === "league_event") {
    return {
      draftId,
      pickNumber: 0,
      pickId: moment.identity.eventId,
    };
  }
  return { draftId, pickNumber: 1, pickId: "evt" };
}

function toPublicPayload(
  frame: BroadcastFrame,
  snapshot: RfsnBroadcastSnapshot,
  sessionState: RfsnLiveSessionState,
  draftComplete: boolean,
  moment: BroadcastMoment,
  draftId: string,
  leagueContextDebug?: LeagueContextDebug | null,
): PublicLiveBroadcastPayload {
  const payload: PublicLiveBroadcastPayload = {
    schemaVersion: 1,
    sessionState,
    snapshot,
    activePickIdentity: pickIdentityFromMoment(moment, draftId),
    frameStatus: frame.public.status,
    generatedAt: frame.public.generatedAt,
    draftComplete,
  };
  if (isLeagueContextDebugEnabled() && leagueContextDebug) {
    payload.leagueContextDebug = leagueContextDebug;
  }
  return payload;
}

function snapshotFromFrame(
  frame: BroadcastFrame,
  draftMoment: DraftMoment,
  moment: BroadcastMoment,
): RfsnBroadcastSnapshot {
  const commentaryResults = broadcastFrameToCommentaryResults(frame, draftMoment);
  const identity = pickIdentityFromMoment(moment, draftMoment.draftId);
  const adapterOut = buildRfsnBroadcastSnapshot({
    draft: draftMomentToRfsnDraftBoard(draftMoment),
    activeMoment:
      frame.public.status === "suppressed" || frame.public.status === "expired"
        ? null
        : {
            identity,
            significance: draftMoment.level,
            context: broadcastContextToRfsn(frame.public.context),
            onAir: true,
          },
    commentaryResults,
    queue: [],
    existingTicker: [],
  });
  return adapterOut.snapshot;
}

async function resolveOrchestrator(
  ledger: SessionEditorialLedger,
  useDeterministic: boolean,
): Promise<{
  orchestrator: BroadcastOrchestrator;
  estimatedCost: () => number;
  productionTelemetry: RealShadowTelemetry | null;
}> {
  if (useDeterministic) {
    return {
      orchestrator: createDeterministicLiveOrchestrator(ledger),
      estimatedCost: () => 0,
      productionTelemetry: null,
    };
  }
  const { orchestrator, telemetry } = await createProductionLiveOrchestrator(ledger);
  return {
    orchestrator,
    estimatedCost: () => estimateShadowCertCostUsd(telemetry),
    productionTelemetry: telemetry,
  };
}

export async function buildLiveBroadcastFrame(
  input: BuildLiveBroadcastFrameInput,
): Promise<LiveBroadcastBuildResult | null> {
  if (!isRfsnLiveBroadcastEnabled()) return null;
  if (!input.draftMoment) return null;

  const started = Date.now();
  const epoch = bumpLiveSessionEpoch(input.leagueId, input.draftId);
  const ledger = ledgerForDraft(input.leagueId, input.draftId);
  const identity = pickIdentityFromMoment(input.moment, input.draftId);
  const draftComplete = Boolean(input.markDraftComplete);

  updateLiveSession(input.leagueId, input.draftId, {
    state: "commentary_pending",
    payload: {
      schemaVersion: 1,
      sessionState: "commentary_pending",
      snapshot: null,
      activePickIdentity: identity,
      frameStatus: "pending",
      generatedAt: null,
      draftComplete,
    },
  });

  const { orchestrator, estimatedCost, productionTelemetry } = await resolveOrchestrator(
    ledger,
    input.useDeterministicProvider ?? false,
  );

  let frame: BroadcastFrame;
  try {
    frame = await orchestrator.buildFrame(input.moment, {
      isStillActive: (id) => {
        if (getLiveSessionEpoch(input.leagueId, input.draftId) !== epoch) return false;
        const active = input.isStillActive?.(id);
        return active instanceof Promise ? false : (active ?? true);
      },
    });
    if (productionTelemetry) {
      mergeAccumulatedLiveProviderTelemetry(productionTelemetry);
    }
  } catch {
    updateLiveSession(input.leagueId, input.draftId, { state: "broadcast_unavailable" });
    recordLiveBroadcastTelemetry({
      momentId: identity.pickId,
      editorialPlan: resolveEditorialPlanId(input.moment),
      requestedVoices: buildEditorialAssignment(input.moment, ledger).request,
      acceptedVoices: [],
      suppressedVoices: [],
      rejectionCategories: { provider: 1 },
      generationLatencyMs: 0,
      entailmentLatencyMs: 0,
      frameReadyLatencyMs: Date.now() - started,
      staleDiscarded: false,
      timedOut: false,
      retried: false,
      providerFailure: true,
      estimatedCostUsd: 0,
      featureFlagEnabled: true,
      deliverySuccess: false,
    });
    return null;
  }

  const stale = getLiveSessionEpoch(input.leagueId, input.draftId) !== epoch || frame.diagnostics.stale;
  if (stale) {
    recordLiveBroadcastTelemetry({
      ...summarizeFrameTelemetry(frame, {
        frameReadyLatencyMs: Date.now() - started,
        staleDiscarded: true,
        timedOut: false,
        retried: false,
        providerFailure: false,
        estimatedCostUsd: estimatedCost(),
        featureFlagEnabled: true,
        deliverySuccess: false,
        editorialPlan: resolveEditorialPlanId(input.moment),
        requestedVoices: buildEditorialAssignment(input.moment, ledger).request,
      }),
      staleDiscarded: true,
    });
    return null;
  }

  const snapshot = snapshotFromFrame(frame, input.draftMoment, input.moment);
  const sessionState = sessionStateFromFrame(frame);
  const publicPayload = toPublicPayload(
    frame,
    snapshot,
    sessionState,
    draftComplete,
    input.moment,
    input.draftId,
    input.leagueContextDebug,
  );

  updateLiveSession(input.leagueId, input.draftId, {
    state: sessionState,
    payload: publicPayload,
    lastProcessedPickId: input.draftMoment.eventId,
  });

  recordLiveBroadcastTelemetry(
    summarizeFrameTelemetry(frame, {
      frameReadyLatencyMs: Date.now() - started,
      staleDiscarded: false,
      timedOut: frame.diagnostics.voiceAttempts.some((v) => v.rejectionCategory === "timeout"),
      retried: frame.diagnostics.voiceAttempts.some((v) => (v.attemptCount ?? 1) > 1),
      providerFailure: frame.diagnostics.providerFailures.length > 0,
      estimatedCostUsd: estimatedCost(),
      featureFlagEnabled: true,
      deliverySuccess: true,
      editorialPlan: resolveEditorialPlanId(input.moment),
      requestedVoices: buildEditorialAssignment(input.moment, ledger).request,
      entailmentLatencyMs: productionTelemetry
        ? productionTelemetry.entailmentLatencyMs
        : 0,
    }),
  );

  scheduleLiveFrameAudio({
    leagueId: input.leagueId,
    draftId: input.draftId,
    epoch,
    frame,
    snapshot,
    pickId: identity.pickId,
    pickNumber: identity.pickNumber,
  });

  return { frame, snapshot, publicPayload };
}

export async function processDraftWrapUp(
  input: {
    leagueId: string;
    draftId: string;
    finalDraftMoment: DraftMoment;
    teamCount?: number;
    useDeterministicProvider?: boolean;
  },
): Promise<PublicLiveBroadcastPayload | null> {
  if (!isRfsnLiveBroadcastEnabled()) return null;

  const eventId = wrapUpEventIdForDraft(input.draftId);
  if (hasWrapUpBeenProcessed(input.leagueId, input.draftId)) {
    return getLiveSessionPayload(input.leagueId, input.draftId);
  }

  markWrapUpProcessed(input.leagueId, input.draftId, eventId);

  const picks = getLockedPicksForSession(input.leagueId, input.draftId);
  const summary = summarizeDraftWrapUp(picks, input.teamCount ?? 14);
  const wrapMoment = buildDraftWrapUpBroadcastMoment(input.leagueId, input.draftId, summary);

  const result = await buildLiveBroadcastFrame({
    moment: wrapMoment,
    leagueId: input.leagueId,
    draftId: input.draftId,
    draftMoment: input.finalDraftMoment,
    useDeterministicProvider: input.useDeterministicProvider,
    markDraftComplete: true,
    isStillActive: () => true,
  });

  if (!result) {
    return getLiveSessionPayload(input.leagueId, input.draftId);
  }

  updateLiveSession(input.leagueId, input.draftId, {
    state: "draft_complete",
    payload: { ...result.publicPayload, draftComplete: true, sessionState: "draft_complete" },
  });

  return getLiveSessionPayload(input.leagueId, input.draftId);
}

export async function processLockedDraftMoment(
  draftMoment: DraftMoment,
  opts: { draftComplete?: boolean; useDeterministicProvider?: boolean; userId?: number | null } = {},
): Promise<PublicLiveBroadcastPayload | null> {
  if (!isRfsnLiveBroadcastEnabled()) return null;

  const broadcastMoment = draftMomentToBroadcastMoment(draftMoment);
  // RFSN-005 — League Context Engine (after moment build, before editorial routing).
  const { moment: enrichedMoment, debug } = await leagueContextEngine.enrich(broadcastMoment, {
    leagueId: draftMoment.leagueId,
    draftId: draftMoment.draftId,
    userId: opts.userId,
  });

  const result = await buildLiveBroadcastFrame({
    moment: enrichedMoment,
    leagueId: draftMoment.leagueId,
    draftId: draftMoment.draftId,
    draftMoment,
    useDeterministicProvider: opts.useDeterministicProvider,
    leagueContextDebug: isLeagueContextDebugEnabled() ? debug : null,
    isStillActive: (id) =>
      id.kind === "draft_pick" &&
      id.draftId === draftMoment.draftId &&
      id.pickNumber === draftMoment.overallPick &&
      id.pickId === draftMoment.eventId,
  });

  if (!result) {
    if (opts.draftComplete) {
      updateLiveSession(draftMoment.leagueId, draftMoment.draftId, { state: "draft_complete" });
    }
    return getLiveSessionPayload(draftMoment.leagueId, draftMoment.draftId);
  }

  if (opts.draftComplete) {
    updateLiveSession(draftMoment.leagueId, draftMoment.draftId, {
      state: "draft_complete",
      payload: { ...result.publicPayload, draftComplete: true, sessionState: "draft_complete" },
    });
    return getLiveSessionPayload(draftMoment.leagueId, draftMoment.draftId);
  }

  return result.publicPayload;
}

function getLiveSessionPayload(leagueId: string, draftId: string): PublicLiveBroadcastPayload | null {
  return getLiveSession(leagueId, draftId)?.payload ?? null;
}

export function resetLiveBroadcastServiceForTests(): void {
  ledgers.clear();
}
