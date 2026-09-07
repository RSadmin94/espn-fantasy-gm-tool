/**
 * Editorial certification runner — real provider, full line capture, metrics, playback export.
 * Certification-only; not wired to production.
 */
import fs from "node:fs";
import path from "node:path";
import { BroadcastOrchestrator } from "./broadcastOrchestrator";
import { SessionEditorialLedger } from "./editorialLedger";
import { resolveEditorialPlanId, buildEditorialAssignment } from "./broadcastEditorialRouting";
import {
  buildEditorialCertScenarios,
  scenarioToBroadcastMoment,
  type EditorialCertScenario,
} from "./editorialCertScenarios";
import {
  processShadowPick,
  accumulateShadowMetrics,
  type ShadowPipelineMetrics,
  type ShadowPickArtifact,
  type ShadowPipelineState,
} from "./broadcastShadowPipeline";
import {
  createRealShadowBroadcastDeps,
  resolveRealShadowPlayerOracle,
  estimateShadowCertCostUsd,
  type RealShadowTelemetry,
} from "./realBroadcastShadowDeps";
import { draftMomentToBroadcastMoment } from "./broadcastMomentBridge";
import type { BroadcastFrame } from "./broadcastFrameContract";
import type { MomentDiagnosticRow } from "./broadcastShadowDiagnostics";
import { diagnoseMoment } from "./broadcastShadowDiagnostics";

export type VoiceLineRecord = {
  scenarioId: string;
  scenarioLabel: string;
  momentIndex: number;
  pickNumber: number | null;
  editorialPlan: string;
  requestedVoices: string[];
  voice: string;
  accepted: boolean;
  commentary: string | null;
  premise: string | null;
  entailment: string;
  rejectionCategory: string | null;
  suppressReason: string | null;
  latencyMs: number | null;
  attemptCount: number;
  role: "primary" | "secondary" | "deferred" | "rejected" | "unassigned";
};

export type ScenarioResult = {
  scenario: EditorialCertScenario;
  artifacts: CertArtifact[];
  resolvedPlan: string;
  requestedVoices: string[];
  acceptedVoices: string[];
  rejectedVoices: string[];
  silenced: boolean;
  lines: VoiceLineRecord[];
};

export type CertArtifact = ShadowPickArtifact & { isLeagueEvent?: boolean };

export type EditorialCertReport = {
  generatedAt: string;
  scenarioCount: number;
  momentCount: number;
  scenarios: ScenarioResult[];
  acceptedLines: VoiceLineRecord[];
  rejectedLines: VoiceLineRecord[];
  metrics: ShadowPipelineMetrics;
  telemetry: RealShadowTelemetry;
  latency: {
    generation: { p50: number; p95: number; max: number; avg: number };
    entailment: { p50: number; p95: number; max: number; avg: number };
    frame: { p50: number; p95: number; max: number; avg: number };
  };
  grounding: {
    accepted: number;
    rejected: Record<string, number>;
  };
  cost: {
    voiceGenerationCalls: number;
    entailmentCalls: number;
    estimatedUsd: number;
    projected14Team12Round: number;
    projectedFullSeason: number;
  };
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function latencyStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1]! : 0,
    avg: values.length ? Math.round(sum / values.length) : 0,
  };
}

function assignRole(line: VoiceLineRecord, frame: BroadcastFrame): VoiceLineRecord["role"] {
  if (!line.accepted) return "rejected";
  if (frame.public.primaryVoice?.voice === line.voice) return "primary";
  if (frame.public.secondaryVoice?.voice === line.voice) return "secondary";
  if (frame.public.deferredVoices.some((v) => v.voice === line.voice)) return "deferred";
  return "unassigned";
}

function extractLines(
  scenario: EditorialCertScenario,
  artifact: CertArtifact,
  momentIndex: number,
  ledger: SessionEditorialLedger,
): VoiceLineRecord[] {
  const entry = scenario.moments[momentIndex]!;
  const bm = scenarioToBroadcastMoment(entry);
  const assignment = buildEditorialAssignment(bm, ledger);
  const plan = resolveEditorialPlanId(bm);

  return artifact.broadcastFrame.diagnostics.voiceAttempts.map((v) => {
    const base: VoiceLineRecord = {
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      momentIndex,
      pickNumber: artifact.draftMoment?.overallPick ?? null,
      editorialPlan: plan,
      requestedVoices: [...assignment.request],
      voice: v.voice,
      accepted: v.accepted,
      commentary: v.text,
      premise: v.premise,
      entailment: v.entailment,
      rejectionCategory: v.rejectionCategory ?? null,
      suppressReason: v.suppressReason ?? null,
      latencyMs: v.latencyMs,
      attemptCount: v.attemptCount,
      role: "unassigned",
    };
    return { ...base, role: assignRole(base, artifact.broadcastFrame) };
  });
}

function leagueEventArtifact(
  scenario: EditorialCertScenario,
  frame: BroadcastFrame,
  mi: number,
  ledger: SessionEditorialLedger,
): CertArtifact {
  const entry = scenario.moments[mi]!;
  const bm = scenarioToBroadcastMoment(entry);
  const assignment = buildEditorialAssignment(bm, ledger);
  const diagnostic: MomentDiagnosticRow = {
    pickIdentity: `${scenario.id}:${mi}`,
    sourceLevel: bm.significance,
    sourceSignals: bm.signals.join(", ") || "(none)",
    commentaryBudgetEnabled: true,
    resolvedEditorialPlan: resolveEditorialPlanId(bm),
    voicesRequested: assignment.request.join(", ") || "(none)",
    frameStatus: frame.public.status,
    frameLeadVoice: frame.public.primaryVoice?.voice ?? null,
    snapshotPrimary: frame.public.primaryVoice?.voice ?? null,
    snapshotSecondary: frame.public.secondaryVoice?.voice ?? null,
    commentedOrSilent: frame.public.status === "suppressed" ? "silent" : "commented",
    reason: scenario.label,
  };

  const placeholderDm = {
    eventId: `CERT:league:${scenario.id}`,
    leagueId: "CERT",
    draftId: "cert-editorial-2026",
    overallPick: mi + 1,
    round: 1,
    roundPick: 1,
    owner: { teamId: "1", ownerId: "u1", ownerName: "League", identityScope: "person" as const, identitySource: "x" },
    player: { playerId: "evt", playerName: "Event", position: "WR", nflTeam: "KC", adp: 0 },
    rosterBeforePick: {},
    receipts: [],
    signals: [],
    level: bm.significance,
    permittedClaims: bm.factPacket.verifiedFacts,
    forbiddenClaimCategories: [],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    validation: { valid: true, errors: [], warnings: [] },
  };

  return {
    draftMoment: placeholderDm as CertArtifact["draftMoment"],
    broadcastFrame: frame,
    commentaryResults: [],
    snapshot: {
      round: 1,
      pickInRound: 1,
      overallPick: `${mi + 1}.01`,
      onClockTeam: "League",
      clockSeconds: 90,
      draftOrder: [],
      board: [],
      championshipOdds: [],
      significance: bm.significance,
      ticker: [],
      queue: [],
      primary: frame.public.primaryVoice?.accepted
        ? { id: "primary", commentator: frame.public.primaryVoice.voice as "sofia" | "coach" | "roxanne", label: "", text: frame.public.primaryVoice.text ?? "" }
        : undefined,
      secondary: frame.public.secondaryVoice?.accepted
        ? { id: "secondary", commentator: frame.public.secondaryVoice.voice as "sofia" | "coach" | "roxanne", label: "", text: frame.public.secondaryVoice.text ?? "" }
        : undefined,
      breakingNews: bm.context.kind === "breaking_news"
        ? { headline: bm.context.headline, body: bm.context.body }
        : undefined,
    },
    snapshotJson: JSON.stringify(frame.public),
    adapterError: null,
    diagnostic,
    editorialPlanId: resolveEditorialPlanId(bm),
    isLeagueEvent: true,
  };
}

export async function runEditorialCertification(opts: {
  loadPlayerRegistryFromDb?: boolean;
} = {}): Promise<{
  report: EditorialCertReport;
  playbackDir: string;
  handoffPath: string;
}> {
  const oracle = await resolveRealShadowPlayerOracle(opts);
  const { deps, telemetry } = createRealShadowBroadcastDeps(oracle, {
    loadPlayerRegistryFromDb: opts.loadPlayerRegistryFromDb,
  });

  const scenarios = buildEditorialCertScenarios();
  const scenarioResults: ScenarioResult[] = [];
  const metrics: ShadowPipelineMetrics = {
    totalMoments: 0,
    commentedMoments: 0,
    silencedMoments: 0,
    silencePct: 0,
    leadVoiceCounts: {},
    voicesOnCommentedMoments: 0,
    avgVoicesPerCommentedMoment: 0,
    timeoutCount: 0,
    rejectionCategories: {},
    totalLatencyMs: 0,
    expiredFrames: 0,
    adapterConversionFailures: 0,
    staleFrameCount: 0,
  };

  for (const scenario of scenarios) {
    const ledger = new SessionEditorialLedger();
    const orch = new BroadcastOrchestrator(
      { ...deps, ledger },
      { voiceTimeoutMs: 15_000, maxTransientRetries: 1 },
    );

    const artifacts: CertArtifact[] = [];
    const state: ShadowPipelineState = { queue: [], ticker: [] };

    for (let mi = 0; mi < scenario.moments.length; mi++) {
      const entry = scenario.moments[mi]!;
      if (entry.leagueEvent) {
        const frame = await orch.buildFrame(scenarioToBroadcastMoment(entry));
        const artifact = leagueEventArtifact(scenario, frame, mi, ledger);
        artifacts.push(artifact);
        accumulateShadowMetrics(metrics, artifact);
        for (const v of frame.diagnostics.voiceAttempts) {
          metrics.totalLatencyMs += v.latencyMs ?? 0;
          if (v.rejectionCategory === "timeout") metrics.timeoutCount++;
          if (v.rejectionCategory) {
            metrics.rejectionCategories[v.rejectionCategory] =
              (metrics.rejectionCategories[v.rejectionCategory] ?? 0) + 1;
          }
        }
        if (frame.public.status === "suppressed") metrics.silencedMoments++;
        else if (frame.public.primaryVoice?.accepted) {
          metrics.commentedMoments++;
          const lead = frame.public.primaryVoice.voice;
          metrics.leadVoiceCounts[lead] = (metrics.leadVoiceCounts[lead] ?? 0) + 1;
        }
        metrics.totalMoments++;
        continue;
      }

      const artifact = await processShadowPick(orch, entry.draftMoment!, state, entry.bridgeOpts ?? {});
      artifacts.push(artifact);
      accumulateShadowMetrics(metrics, artifact);
    }

    metrics.silencePct = metrics.totalMoments > 0 ? (metrics.silencedMoments / metrics.totalMoments) * 100 : 0;
    metrics.avgVoicesPerCommentedMoment = metrics.commentedMoments > 0
      ? metrics.voicesOnCommentedMoments / metrics.commentedMoments
      : 0;

    const lines = artifacts.flatMap((a, mi) => extractLines(scenario, a, mi, ledger));
    const firstEntry = scenario.moments[0]!;
    const firstBm = scenarioToBroadcastMoment(firstEntry);

    scenarioResults.push({
      scenario,
      artifacts,
      resolvedPlan: resolveEditorialPlanId(firstBm),
      requestedVoices: [...buildEditorialAssignment(firstBm, ledger).request],
      acceptedVoices: [...new Set(lines.filter((l) => l.accepted).map((l) => l.voice))],
      rejectedVoices: [...new Set(lines.filter((l) => !l.accepted).map((l) => l.voice))],
      silenced: artifacts.every((a) => a.broadcastFrame.public.status === "suppressed"),
      lines,
    });
  }

  const acceptedLines = scenarioResults.flatMap((s) => s.lines.filter((l) => l.accepted && l.commentary));
  const rejectedLines = scenarioResults.flatMap((s) => s.lines.filter((l) => !l.accepted || !l.commentary));

  const frameMs = scenarioResults.flatMap((s) =>
    s.lines.map((l) => l.latencyMs).filter((n): n is number => n != null),
  );
  const genPerCall = telemetry.voiceGenerationCalls
    ? Array.from({ length: telemetry.voiceGenerationCalls }, () =>
      Math.round(telemetry.voiceGenerationLatencyMs / telemetry.voiceGenerationCalls),
    )
    : [];
  const entailPerCall = telemetry.entailmentCalls
    ? Array.from({ length: telemetry.entailmentCalls }, () =>
      Math.round(telemetry.entailmentLatencyMs / telemetry.entailmentCalls),
    )
    : [];

  const estimatedUsd = estimateShadowCertCostUsd(telemetry);
  const picksPerDraft = 14 * 12;
  const commentedRate = metrics.commentedMoments / Math.max(1, metrics.totalMoments);
  const avgCallsPerMoment = (telemetry.voiceGenerationCalls + telemetry.entailmentCalls) / Math.max(1, metrics.totalMoments);
  const projectedDraftCalls = Math.ceil(picksPerDraft * commentedRate * avgCallsPerMoment * 2);

  const report: EditorialCertReport = {
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarios.length,
    momentCount: metrics.totalMoments,
    scenarios: scenarioResults,
    acceptedLines,
    rejectedLines,
    metrics,
    telemetry,
    latency: {
      generation: latencyStats(genPerCall),
      entailment: latencyStats(entailPerCall),
      frame: latencyStats(frameMs),
    },
    grounding: {
      accepted: acceptedLines.length,
      rejected: { ...metrics.rejectionCategories },
    },
    cost: {
      voiceGenerationCalls: telemetry.voiceGenerationCalls,
      entailmentCalls: telemetry.entailmentCalls,
      estimatedUsd,
      projected14Team12Round: Math.round((estimatedUsd / Math.max(1, telemetry.voiceGenerationCalls + telemetry.entailmentCalls)) * projectedDraftCalls * 100) / 100,
      projectedFullSeason: Math.round((estimatedUsd / Math.max(1, telemetry.voiceGenerationCalls + telemetry.entailmentCalls)) * projectedDraftCalls * 4 * 100) / 100,
    },
  };

  const playbackDir = path.join(process.cwd(), "client", "public", "dev-shadow", "rfsn-real-provider");
  fs.mkdirSync(playbackDir, { recursive: true });
  fs.writeFileSync(
    path.join(playbackDir, "editorial-cert.json"),
    JSON.stringify({
      source: "editorial-cert-real-provider",
      generatedAt: report.generatedAt,
      moments: scenarioResults.flatMap((s) =>
        s.artifacts.map((a) => ({
          scenarioId: s.scenario.id,
          scenarioLabel: s.scenario.label,
          tags: s.scenario.tags,
          voiceExpectation: s.scenario.voiceExpectation,
          pickNumber: a.draftMoment.overallPick,
          editorialPlanId: a.editorialPlanId,
          diagnostic: a.diagnostic,
          snapshot: a.snapshot,
          frame: {
            status: a.broadcastFrame.public.status,
            primary: a.broadcastFrame.public.primaryVoice,
            secondary: a.broadcastFrame.public.secondaryVoice,
            deferred: a.broadcastFrame.public.deferredVoices,
            attempts: a.broadcastFrame.diagnostics.voiceAttempts,
          },
        })),
      ),
    }, null, 2),
  );

  const handoffDir = path.join(process.cwd(), "scripts", "_editorial_cert_output");
  fs.mkdirSync(handoffDir, { recursive: true });
  const handoffPath = path.join(handoffDir, "claude-handoff.json");
  const handoff = buildClaudeHandoff(report);
  fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));
  fs.writeFileSync(path.join(handoffDir, "full-report.json"), JSON.stringify(report, null, 2));

  return { report, playbackDir, handoffPath };
}

export function buildClaudeHandoff(report: EditorialCertReport) {
  return {
    purpose: "Editorial review handoff — do not rerun models",
    generatedAt: report.generatedAt,
    summary: {
      scenarios: report.scenarioCount,
      moments: report.momentCount,
      acceptedLines: report.acceptedLines.length,
      rejectedLines: report.rejectedLines.length,
      costUsd: report.cost.estimatedUsd,
    },
    acceptedCommentary: report.acceptedLines.map((l) => ({
      scenario: l.scenarioId,
      label: l.scenarioLabel,
      plan: l.editorialPlan,
      voice: l.voice,
      role: l.role,
      line: l.commentary,
      entailment: l.entailment,
      latencyMs: l.latencyMs,
    })),
    rejectedCommentary: report.rejectedLines.map((l) => ({
      scenario: l.scenarioId,
      label: l.scenarioLabel,
      plan: l.editorialPlan,
      voice: l.voice,
      line: l.commentary,
      rejection: l.rejectionCategory,
      reason: l.suppressReason,
      entailment: l.entailment,
      latencyMs: l.latencyMs,
    })),
    metrics: report.metrics,
    telemetry: report.telemetry,
    regeneration: report.telemetry.regeneration,
    latency: report.latency,
    grounding: report.grounding,
    cost: report.cost,
    scenarios: report.scenarios.map((s) => ({
      id: s.scenario.id,
      label: s.scenario.label,
      expectedPlan: s.scenario.expectedPlan,
      resolvedPlan: s.resolvedPlan,
      tags: s.scenario.tags,
      voiceExpectation: s.scenario.voiceExpectation,
      requestedVoices: s.requestedVoices,
      acceptedVoices: s.acceptedVoices,
      rejectedVoices: s.rejectedVoices,
      silenced: s.silenced,
    })),
  };
}
