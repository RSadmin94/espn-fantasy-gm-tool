/**
 * End-to-end shadow broadcast pipeline — wires real components without production routes.
 *
 * DraftMoment → broadcastMomentBridge → BroadcastOrchestrator → BroadcastFrame
 *   → broadcastFrameToRfsnBridge → rfsnBroadcastAdapter → RfsnBroadcastSnapshot
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import type { BroadcastFrame, BroadcastContext } from "./broadcastFrameContract";
import { draftMomentToBroadcastMoment } from "./broadcastMomentBridge";
import { BroadcastOrchestrator } from "./broadcastOrchestrator";
import { COACH, ROXANNE, SOFIA } from "./voicePersonalities";
import { buildPlayerRegistryOracle } from "./playerRegistryOracle";
import { createShadowGroundedVoiceProvider } from "./shadowGroundedVoiceProvider";
import type { EditorialPlanId } from "./editorialPlans";
import {
  broadcastContextToRfsn,
  broadcastFrameToCommentaryResults,
  draftMomentToRfsnDraftBoard,
  serializeRfsnSnapshot,
} from "./broadcastFrameToRfsnBridge";
import type { RfsnBroadcastSnapshot, RfsnQueuedMoment, RfsnTickerItem } from "../../../client/src/lib/rfsnPresentation";
import {
  buildRfsnBroadcastSnapshot,
  pickIdentityKey,
  type RfsnCommentaryResult,
} from "../../../client/src/lib/rfsnBroadcastAdapter";
import { diagnoseMoment, type MomentDiagnosticRow } from "./broadcastShadowDiagnostics";
import { resolveEditorialPlanId } from "./broadcastEditorialRouting";

export type ShadowPickArtifact = {
  draftMoment: DraftMoment;
  broadcastFrame: BroadcastFrame;
  commentaryResults: readonly RfsnCommentaryResult[];
  snapshot: RfsnBroadcastSnapshot;
  snapshotJson: string;
  adapterError: string | null;
  diagnostic: MomentDiagnosticRow;
  editorialPlanId: string;
};

export type ShadowPipelineMetrics = {
  totalMoments: number;
  commentedMoments: number;
  silencedMoments: number;
  silencePct: number;
  leadVoiceCounts: Record<string, number>;
  voicesOnCommentedMoments: number;
  avgVoicesPerCommentedMoment: number;
  timeoutCount: number;
  rejectionCategories: Record<string, number>;
  totalLatencyMs: number;
  expiredFrames: number;
  adapterConversionFailures: number;
  staleFrameCount: number;
};

export type ShadowPipelineState = {
  queue: RfsnQueuedMoment[];
  ticker: RfsnTickerItem[];
};

export type ShadowRunResult = {
  artifacts: ShadowPickArtifact[];
  metrics: ShadowPipelineMetrics;
  finalQueue: RfsnQueuedMoment[];
  diagnostics: MomentDiagnosticRow[];
};

export type RfsnPlaybackBundle = {
  source: string;
  generatedAt: string;
  moments: Array<{
    pickNumber: number;
    pickId: string;
    editorialPlanId: string;
    diagnostic: MomentDiagnosticRow;
    snapshot: RfsnBroadcastSnapshot;
  }>;
};

function emptyMetrics(): ShadowPipelineMetrics {
  return {
    totalMoments: 0,
    commentedMoments: 0,
    silencedMoments: 0,
    silencePct: 0,
    leadVoiceCounts: { sofia: 0, coach: 0, roxanne: 0 },
    voicesOnCommentedMoments: 0,
    avgVoicesPerCommentedMoment: 0,
    timeoutCount: 0,
    rejectionCategories: {},
    totalLatencyMs: 0,
    expiredFrames: 0,
    adapterConversionFailures: 0,
    staleFrameCount: 0,
  };
}

export function createShadowBroadcastOrchestrator(
  orchestrator?: BroadcastOrchestrator,
): BroadcastOrchestrator {
  if (orchestrator) return orchestrator;
  const entailChecker = { async check() { return "entail" as const; } };

  return new BroadcastOrchestrator({
    voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
    checker: entailChecker,
    playerOracle: buildPlayerRegistryOracle([]),
    generate: createShadowGroundedVoiceProvider(),
  });
}

export async function processShadowPick(
  orchestrator: BroadcastOrchestrator,
  draftMoment: DraftMoment,
  state: ShadowPipelineState,
  opts: {
    context?: BroadcastContext;
    momentType?: string;
    overrideDecompression?: boolean;
    editorialPlanId?: EditorialPlanId;
  } = {},
): Promise<ShadowPickArtifact> {
  const broadcastMoment = draftMomentToBroadcastMoment(draftMoment, opts);
  const frame = await orchestrator.buildFrame(broadcastMoment, {
    isStillActive: (id) =>
      id.kind === "draft_pick" &&
      id.draftId === draftMoment.draftId &&
      id.pickNumber === draftMoment.overallPick &&
      id.pickId === draftMoment.eventId,
  });

  const commentaryResults = broadcastFrameToCommentaryResults(frame, draftMoment);
  const identity = {
    draftId: draftMoment.draftId,
    pickNumber: draftMoment.overallPick,
    pickId: draftMoment.eventId,
  };

  let snapshot: RfsnBroadcastSnapshot;
  let adapterError: string | null = null;

  try {
    const adapterOut = buildRfsnBroadcastSnapshot({
      draft: draftMomentToRfsnDraftBoard(draftMoment),
      activeMoment: frame.public.status === "suppressed" || frame.public.status === "expired"
        ? null
        : {
            identity,
            significance: draftMoment.level,
            context: broadcastContextToRfsn(frame.public.context),
            onAir: true,
          },
      commentaryResults,
      queue: state.queue,
      existingTicker: state.ticker,
    });
    snapshot = adapterOut.snapshot;
    state.queue = adapterOut.queue;
    state.ticker = [...snapshot.ticker];
  } catch (err) {
    adapterError = err instanceof Error ? err.message : String(err);
    const draft = draftMomentToRfsnDraftBoard(draftMoment);
    snapshot = {
      round: draft.round,
      pickInRound: draft.pickInRound,
      overallPick: draft.overallPick,
      onClockTeam: draft.onClockTeam,
      clockSeconds: draft.clockSeconds,
      draftOrder: [...draft.draftOrder],
      board: [...draft.board],
      championshipOdds: [...draft.championshipOdds],
      significance: draftMoment.level,
      ticker: [...state.ticker],
      queue: [...state.queue],
    };
  }

  return {
    draftMoment,
    broadcastFrame: frame,
    commentaryResults,
    snapshot,
    snapshotJson: serializeRfsnSnapshot(snapshot),
    adapterError,
    diagnostic: diagnoseMoment(draftMoment, frame, snapshot, orchestrator.getLedger()),
    editorialPlanId: resolveEditorialPlanId(broadcastMoment),
  };
}

export function accumulateShadowMetrics(
  metrics: ShadowPipelineMetrics,
  artifact: ShadowPickArtifact,
): void {
  metrics.totalMoments++;
  const frame = artifact.broadcastFrame;

  if (frame.public.status === "suppressed") metrics.silencedMoments++;
  if (frame.public.status === "expired" || frame.diagnostics.stale) {
    metrics.expiredFrames++;
    metrics.staleFrameCount++;
  }
  if (artifact.adapterError) metrics.adapterConversionFailures++;

  const commented = frame.public.primaryVoice?.accepted ||
    frame.public.secondaryVoice?.accepted ||
    frame.public.deferredVoices.some((v) => v.accepted);

  if (commented) {
    metrics.commentedMoments++;
    const onAir = [
      frame.public.primaryVoice,
      frame.public.secondaryVoice,
      ...frame.public.deferredVoices,
    ].filter((v) => v?.accepted).length;
    metrics.voicesOnCommentedMoments += onAir;
    const lead = frame.public.primaryVoice?.voice;
    if (lead) metrics.leadVoiceCounts[lead] = (metrics.leadVoiceCounts[lead] ?? 0) + 1;
  }

  for (const v of frame.diagnostics.voiceAttempts) {
    metrics.totalLatencyMs += v.latencyMs ?? 0;
    if (v.rejectionCategory === "timeout") metrics.timeoutCount++;
    if (v.rejectionCategory) {
      metrics.rejectionCategories[v.rejectionCategory] =
        (metrics.rejectionCategories[v.rejectionCategory] ?? 0) + 1;
    }
  }

  metrics.silencePct = metrics.totalMoments > 0
    ? (metrics.silencedMoments / metrics.totalMoments) * 100
    : 0;
  metrics.avgVoicesPerCommentedMoment = metrics.commentedMoments > 0
    ? metrics.voicesOnCommentedMoments / metrics.commentedMoments
    : 0;
}

export async function runShadowPipeline(
  moments: readonly DraftMoment[],
  orchestrator?: BroadcastOrchestrator,
): Promise<ShadowRunResult> {
  const orch = createShadowBroadcastOrchestrator(orchestrator);
  const state: ShadowPipelineState = { queue: [], ticker: [] };
  const metrics = emptyMetrics();
  const artifacts: ShadowPickArtifact[] = [];

  for (const dm of moments) {
    const artifact = await processShadowPick(orch, dm, state);
    artifacts.push(artifact);
    accumulateShadowMetrics(metrics, artifact);
  }

  return {
    artifacts,
    metrics,
    finalQueue: state.queue,
    diagnostics: artifacts.map((a) => a.diagnostic),
  };
}

export function toPlaybackBundle(source: string, result: ShadowRunResult): RfsnPlaybackBundle {
  return {
    source,
    generatedAt: new Date().toISOString(),
    moments: result.artifacts.map((a) => ({
      pickNumber: a.draftMoment.overallPick,
      pickId: a.draftMoment.eventId,
      editorialPlanId: a.editorialPlanId,
      diagnostic: a.diagnostic,
      snapshot: a.snapshot,
    })),
  };
}

export function validateShadowArtifact(artifact: ShadowPickArtifact): string[] {
  const errors: string[] = [];
  const dm = artifact.draftMoment;
  const frame = artifact.broadcastFrame;

  if (frame.public.identity.kind === "draft_pick") {
    if (frame.public.identity.pickNumber !== dm.overallPick) {
      errors.push("identity pickNumber mismatch");
    }
    if (frame.public.identity.pickId !== dm.eventId) {
      errors.push("identity pickId mismatch");
    }
  }

  if (frame.public.status === "expired") {
    errors.push("unexpected expired frame in sequential run");
  }

  for (const r of artifact.commentaryResults) {
    if (r.pickNumber !== dm.overallPick || r.pickId !== dm.eventId) {
      errors.push("commentary identity mismatch");
    }
  }

  const expectedKey = pickIdentityKey({
    draftId: dm.draftId,
    pickNumber: dm.overallPick,
    pickId: dm.eventId,
  });
  for (const q of artifact.snapshot.queue) {
    if (q.id === expectedKey && frame.public.status !== "suppressed") {
      // queued same pick is acceptable for overflow paths
    }
  }

  const snapshot = artifact.snapshot;
  if (snapshot.primary && frame.public.primaryVoice &&
    snapshot.primary.commentator !== frame.public.primaryVoice.voice) {
    errors.push(`snapshot primary ${snapshot.primary.commentator} !== frame lead ${frame.public.primaryVoice.voice}`);
  }

  return errors;
}

export function validateSnapshotDeterminism(a: RfsnBroadcastSnapshot, b: RfsnBroadcastSnapshot): boolean {
  return serializeRfsnSnapshot(a) === serializeRfsnSnapshot(b);
}
