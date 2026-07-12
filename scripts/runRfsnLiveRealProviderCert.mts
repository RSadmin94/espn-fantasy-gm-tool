/**
 * Internal RFSN Live certification — REAL DeepSeek provider + entailment.
 * Requires RFSN_LIVE_BROADCAST_ENABLED=true and DEEPSEEK_API_KEY.
 *
 * Usage:
 *   npx tsx scripts/runRfsnLiveRealProviderCert.mts
 *   npx tsx scripts/runRfsnLiveRealProviderCert.mts --only huge_value,major_reach,provider_failure
 */
import "dotenv/config";
import { buildEditorialCertScenarios } from "../server/services/sofia/editorialCertScenarios";
import type { DraftMoment } from "../server/services/draftMoments/draftMomentTypes";
import { draftMomentToBroadcastMoment } from "../server/services/sofia/broadcastMomentBridge";
import { buildEditorialAssignment, resolveEditorialPlanId } from "../server/services/sofia/broadcastEditorialRouting";
import { SessionEditorialLedger } from "../server/services/sofia/editorialLedger";
import {
  buildDraftMomentForLockedPick,
  resetLiveDraftMomentSession,
  resetLiveDraftMomentSessionsForTests,
} from "../server/services/sofia/liveDraftMomentSession";
import {
  buildLiveBroadcastFrame,
  resetLiveBroadcastServiceForTests,
} from "../server/services/sofia/liveBroadcastService";
import {
  getLiveSession,
  resetLiveSessionsForTests,
} from "../server/services/sofia/liveBroadcastSession";
import {
  getLiveBroadcastTelemetrySnapshot,
  resetLiveBroadcastTelemetryForTests,
} from "../server/services/sofia/liveBroadcastTelemetry";
import {
  getAccumulatedLiveProviderTelemetry,
  resetAccumulatedLiveProviderTelemetry,
} from "../server/services/sofia/liveBroadcastOrchestratorFactory";
import {
  assertShadowCertApiKey,
  estimateShadowCertCostUsd,
  loadShadowCertEnvFromDotenv,
} from "../server/services/sofia/realBroadcastShadowDeps";
import type { PublicLiveBroadcastPayload } from "../server/services/sofia/liveBroadcastSession";
import type { BroadcastFrame } from "../server/services/sofia/broadcastFrameContract";

const LEAGUE = "CERT";
const DRAFT = "rfsn-live-real-cert";

type BoothShape = "match" | "silent_expected" | "partial" | "mismatch";

type CertExpectation =
  | "silent"
  | "commentary"
  | "commentary_or_partial"
  | "commentary_or_fail_closed_lane_guard"
  | "provider_graceful_degradation";

type VoiceDiagnostic = {
  voice: string;
  accepted: boolean;
  rejectionCategory: string | null;
  suppressReason: string | null;
  generatedText: string | null;
};

type CertScenarioResult = {
  scenario: string;
  pickId: string;
  sessionState: string;
  frameStatus: string;
  editorialPlan: string | null;
  requestedVoices: string[];
  acceptedVoices: string[];
  suppressedVoices: string[];
  rejectionCategories: Record<string, number>;
  frameReadyMs: number;
  generationLatencyMs: number;
  staleDiscarded: boolean;
  providerFailure: boolean;
  snapshotPrimary: string | null;
  snapshotSecondary: string | null;
  snapshotDeferred: number;
  boothMatch: BoothShape;
  expectedBooth: string;
  actualBooth: string;
  voiceDiagnostics: VoiceDiagnostic[];
  certExpectation: CertExpectation;
  certPass: boolean;
  defectClass:
    | "bad_generated_line"
    | "bad_guard_classification"
    | "stale_cert_expectation"
    | "valid_fail_closed_partial"
    | "valid_graceful_degradation"
    | "none"
    | null;
};

const SCENARIO_EXPECTATIONS: Record<string, CertExpectation> = {
  routine_silence: "silent",
  huge_value: "commentary_or_fail_closed_lane_guard",
  major_reach: "commentary_or_partial",
  rivalry_receipt: "commentary",
  historic_reach: "commentary",
  league_milestone: "commentary",
  two_quick_picks: "commentary",
  provider_failure: "provider_graceful_degradation",
  draft_complete: "silent",
};

function assertCertEnvironment(): void {
  if (process.env.RFSN_LIVE_BROADCAST_ENABLED !== "true") {
    throw new Error(
      'RFSN_LIVE_BROADCAST_ENABLED must be "true" for real-provider live certification.',
    );
  }
  loadShadowCertEnvFromDotenv();
  assertShadowCertApiKey();
}

function parseOnlyFilter(argv: string[]): Set<string> | null {
  const idx = argv.indexOf("--only");
  if (idx === -1) return null;
  const raw = argv[idx + 1];
  if (!raw) throw new Error("--only requires a comma-separated scenario list");
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function scenarioMoment(id: string): DraftMoment {
  const scenario = buildEditorialCertScenarios().find((s) => s.id === id);
  const dm = scenario?.moments[0]?.draftMoment;
  if (!dm) throw new Error(`Missing cert scenario: ${id}`);
  return dm;
}

function resetCertIsolation(): void {
  resetLiveSessionsForTests();
  resetLiveBroadcastServiceForTests();
  resetLiveDraftMomentSessionsForTests();
  resetLiveBroadcastTelemetryForTests();
  resetAccumulatedLiveProviderTelemetry();
}

function boothShape(payload: PublicLiveBroadcastPayload | null): BoothShape {
  if (!payload?.snapshot) return "mismatch";
  const snap = payload.snapshot;
  const hasPrimary = Boolean(snap.primary?.text);
  const hasSecondary = Boolean(snap.secondary?.text);
  const deferred = snap.ticker?.length ?? 0;
  if (!hasPrimary && !hasSecondary) return "silent_expected";
  if (hasPrimary) return hasSecondary || deferred > 0 ? "match" : "partial";
  return "mismatch";
}

function describeBooth(payload: PublicLiveBroadcastPayload | null): string {
  if (!payload?.snapshot) return "empty";
  const snap = payload.snapshot;
  const parts: string[] = [];
  if (snap.primary?.text) parts.push(`primary:${snap.primary.commentator}`);
  if (snap.secondary?.text) parts.push(`secondary:${snap.secondary.commentator}`);
  if ((snap.ticker?.length ?? 0) > 0) parts.push(`deferred:${snap.ticker!.length}`);
  return parts.length > 0 ? parts.join(", ") : "empty";
}

function voiceDiagnosticsFromFrame(frame: BroadcastFrame | null): VoiceDiagnostic[] {
  if (!frame) return [];
  return frame.diagnostics.voiceAttempts.map((v) => ({
    voice: v.voice,
    accepted: v.accepted,
    rejectionCategory: v.rejectionCategory ?? null,
    suppressReason: v.suppressReason ?? null,
    generatedText: v.text ?? null,
  }));
}

function classifyDefect(
  expectation: CertExpectation,
  result: Omit<CertScenarioResult, "defectClass" | "certPass">,
): CertScenarioResult["defectClass"] {
  if (result.certExpectation !== expectation) return null;
  if (result.scenario === "provider_failure" && result.certPass) return "valid_graceful_degradation";
  if (result.scenario === "huge_value" && result.certPass && result.frameStatus === "failed") {
    return "valid_fail_closed_partial";
  }
  if (result.scenario === "major_reach" && result.certPass && result.boothMatch === "partial") {
    return "valid_fail_closed_partial";
  }
  if (result.certPass) return "none";
  if (result.scenario === "huge_value" && (result.rejectionCategories.polarity ?? 0) > 0) {
    return "bad_guard_classification";
  }
  if (result.scenario === "major_reach" && (result.rejectionCategories.entailment ?? 0) > 0 && result.boothMatch === "partial") {
    return "stale_cert_expectation";
  }
  return "bad_generated_line";
}

function evaluateCertPass(expectation: CertExpectation, result: {
  boothMatch: BoothShape;
  frameStatus: string;
  sessionState: string;
  acceptedVoices: string[];
  rejectionCategories: Record<string, number>;
  providerFailure: boolean;
  snapshotPrimary: string | null;
}): boolean {
  switch (expectation) {
    case "silent":
      return result.boothMatch === "silent_expected";
    case "commentary":
      return result.boothMatch === "match" || result.boothMatch === "partial";
    case "commentary_or_partial":
      return result.boothMatch === "match" || result.boothMatch === "partial";
    case "commentary_or_fail_closed_lane_guard": {
      const commentaryOk = result.boothMatch === "match" || result.boothMatch === "partial";
      const failClosedOk =
        result.frameStatus === "failed" &&
        result.acceptedVoices.length === 0 &&
        (result.rejectionCategories.polarity ?? 0) > 0 &&
        result.sessionState === "broadcast_unavailable" &&
        !result.snapshotPrimary;
      return commentaryOk || failClosedOk;
    }
    case "provider_graceful_degradation":
      return (
        result.providerFailure &&
        result.acceptedVoices.length === 0 &&
        result.sessionState === "broadcast_unavailable" &&
        !result.snapshotPrimary
      );
    default:
      return false;
  }
}

async function runFrameScenario(
  dm: DraftMoment,
  expectation: CertExpectation,
  scenarioId: string,
): Promise<CertScenarioResult> {
  const started = Date.now();
  const moment = draftMomentToBroadcastMoment(dm);
  const ledger = new SessionEditorialLedger();
  const requestedVoices = buildEditorialAssignment(moment, ledger).request;

  const built = await buildLiveBroadcastFrame({
    moment,
    leagueId: LEAGUE,
    draftId: DRAFT,
    draftMoment: dm,
    useDeterministicProvider: false,
    isStillActive: (id) =>
      id.kind === "draft_pick" &&
      id.draftId === dm.draftId &&
      id.pickNumber === dm.overallPick &&
      id.pickId === dm.eventId,
  });

  const payload =
    built?.publicPayload ??
    getLiveSession(LEAGUE, DRAFT)?.payload ??
    null;
  const session = getLiveSession(LEAGUE, DRAFT);
  const telemetry = getLiveBroadcastTelemetrySnapshot().at(-1);
  const snap = payload?.snapshot;
  const booth = boothShape(payload);
  const editorialPlan = telemetry?.editorialPlan ?? resolveEditorialPlanId(moment);

  const base = {
    scenario: scenarioId,
    pickId: dm.eventId,
    sessionState: payload?.sessionState ?? session?.state ?? "none",
    frameStatus: String(payload?.frameStatus ?? "none"),
    editorialPlan,
    requestedVoices,
    acceptedVoices: telemetry?.acceptedVoices ?? [],
    suppressedVoices: telemetry?.suppressedVoices ?? [],
    rejectionCategories: telemetry?.rejectionCategories ?? {},
    frameReadyMs: telemetry?.frameReadyLatencyMs ?? Date.now() - started,
    generationLatencyMs: telemetry?.generationLatencyMs ?? 0,
    staleDiscarded: telemetry?.staleDiscarded ?? false,
    providerFailure: telemetry?.providerFailure ?? false,
    snapshotPrimary: snap?.primary?.commentator ?? null,
    snapshotSecondary: snap?.secondary?.commentator ?? null,
    snapshotDeferred: snap?.ticker?.length ?? 0,
    boothMatch: booth,
    expectedBooth: expectation,
    actualBooth: describeBooth(payload),
    voiceDiagnostics: voiceDiagnosticsFromFrame(built?.frame ?? null),
    certExpectation: expectation,
  };

  const certPass = evaluateCertPass(expectation, {
    boothMatch: base.boothMatch,
    frameStatus: base.frameStatus,
    sessionState: base.sessionState,
    acceptedVoices: base.acceptedVoices,
    rejectionCategories: base.rejectionCategories,
    providerFailure: base.providerFailure,
    snapshotPrimary: base.snapshotPrimary,
  });

  return {
    ...base,
    certPass,
    defectClass: classifyDefect(expectation, { ...base, certPass, certExpectation: expectation }),
  };
}

async function runMomentScenario(id: string): Promise<CertScenarioResult> {
  resetLiveDraftMomentSession(LEAGUE, DRAFT);
  const dm = scenarioMoment(id);
  return runFrameScenario(dm, SCENARIO_EXPECTATIONS[id] ?? "commentary", id);
}

async function runTwoQuickPicks(): Promise<CertScenarioResult[]> {
  resetLiveDraftMomentSession(LEAGUE, DRAFT);
  const a = buildDraftMomentForLockedPick(LEAGUE, DRAFT, {
    overallPick: 201,
    round: 15,
    roundPick: 1,
    teamId: "1",
    ownerName: "Alice",
    playerId: "q201",
    playerName: "Routine WR 201",
    position: "WR",
  }, { reset: true });
  const b = buildDraftMomentForLockedPick(LEAGUE, DRAFT, {
    overallPick: 202,
    round: 15,
    roundPick: 2,
    teamId: "2",
    ownerName: "Bob",
    playerId: "q202",
    playerName: "Routine WR 202",
    position: "WR",
  });

  const p1 = buildLiveBroadcastFrame({
    moment: draftMomentToBroadcastMoment(a),
    leagueId: LEAGUE,
    draftId: DRAFT,
    draftMoment: a,
    useDeterministicProvider: false,
  });
  const p2 = buildLiveBroadcastFrame({
    moment: draftMomentToBroadcastMoment(b),
    leagueId: LEAGUE,
    draftId: DRAFT,
    draftMoment: b,
    useDeterministicProvider: false,
  });
  await p2;
  await p1;

  const session = getLiveSession(LEAGUE, DRAFT);
  const telemetry = getLiveBroadcastTelemetrySnapshot().at(-1);
  const payload = session?.payload ?? null;
  const booth = boothShape(payload);
  const certPass = session?.lastProcessedPickId === b.eventId;

  return [{
    scenario: "two_quick_picks",
    pickId: b.eventId,
    sessionState: session?.state ?? "none",
    frameStatus: String(payload?.frameStatus ?? "none"),
    editorialPlan: telemetry?.editorialPlan ?? null,
    requestedVoices: telemetry?.requestedVoices ?? [],
    acceptedVoices: telemetry?.acceptedVoices ?? [],
    suppressedVoices: telemetry?.suppressedVoices ?? [],
    rejectionCategories: telemetry?.rejectionCategories ?? {},
    frameReadyMs: telemetry?.frameReadyLatencyMs ?? 0,
    generationLatencyMs: telemetry?.generationLatencyMs ?? 0,
    staleDiscarded: telemetry?.staleDiscarded ?? true,
    providerFailure: false,
    snapshotPrimary: payload?.snapshot?.primary?.commentator ?? null,
    snapshotSecondary: null,
    snapshotDeferred: 0,
    boothMatch: certPass ? booth : "mismatch",
    expectedBooth: "latest pick wins",
    actualBooth: describeBooth(payload),
    voiceDiagnostics: [],
    certExpectation: "commentary",
    certPass,
    defectClass: certPass ? "none" : "bad_generated_line",
  }];
}

async function runProviderFailure(): Promise<CertScenarioResult> {
  resetCertIsolation();
  const saved = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "invalid-key-for-cert";
  const base = scenarioMoment("huge_value");
  const dm: DraftMoment = {
    ...base,
    eventId: "CERT:provider-failure",
    overallPick: 299,
    round: 25,
    roundPick: 4,
  };
  const result = await runFrameScenario(dm, "provider_graceful_degradation", "provider_failure");
  process.env.DEEPSEEK_API_KEY = saved;
  return {
    ...result,
    providerFailure: true,
    boothMatch: result.certPass ? "silent_expected" : result.boothMatch,
  };
}

async function runDraftComplete(): Promise<CertScenarioResult> {
  resetLiveDraftMomentSession(LEAGUE, DRAFT);
  const dm = scenarioMoment("end_of_draft");
  const result = await runFrameScenario(dm, "silent", "draft_complete");
  return {
    ...result,
    certPass: result.boothMatch === "silent_expected",
    defectClass: result.boothMatch === "silent_expected" ? "none" : result.defectClass,
  };
}

async function main() {
  assertCertEnvironment();
  process.env.RFSN_LIVE_BROADCAST_ENABLED = "true";
  const only = parseOnlyFilter(process.argv);

  resetCertIsolation();

  const results: CertScenarioResult[] = [];

  const sequence = [
    "routine_silence",
    "huge_value",
    "major_reach",
    "rivalry_receipt",
    "historic_reach",
    "league_milestone",
  ];

  const shouldRun = (id: string) => !only || only.has(id);

  for (const id of sequence) {
    if (shouldRun(id)) results.push(await runMomentScenario(id));
  }

  if (shouldRun("two_quick_picks")) results.push(...await runTwoQuickPicks());
  if (shouldRun("provider_failure")) results.push(await runProviderFailure());
  if (shouldRun("draft_complete")) results.push(await runDraftComplete());

  const provider = getAccumulatedLiveProviderTelemetry();
  const telemetry = getLiveBroadcastTelemetrySnapshot();
  const estCost = estimateShadowCertCostUsd(provider);
  const failures = results.filter((r) => !r.certPass);

  const summary = {
    voiceGenerationCalls: provider.voiceGenerationCalls,
    voiceGenerationFailures: provider.voiceGenerationFailures,
    entailmentCalls: provider.entailmentCalls,
    entailmentFailures: provider.entailmentFailures,
    avgVoiceLatencyMs: provider.voiceGenerationCalls
      ? Math.round(provider.voiceGenerationLatencyMs / provider.voiceGenerationCalls)
      : 0,
    avgEntailLatencyMs: provider.entailmentCalls
      ? Math.round(provider.entailmentLatencyMs / provider.entailmentCalls)
      : 0,
    totalFrameReadyMs: telemetry.reduce((s, e) => s + e.frameReadyLatencyMs, 0),
    staleDiscards: telemetry.filter((e) => e.staleDiscarded).length,
    providerFailures: telemetry.filter((e) => e.providerFailure).length,
    estimatedCostUsd: estCost,
    acceptedVoiceTotal: telemetry.reduce((s, e) => s + e.acceptedVoices.length, 0),
    suppressedVoiceTotal: telemetry.reduce((s, e) => s + e.suppressedVoices.length, 0),
    certFailures: failures.length,
  };

  console.log("===== RFSN LIVE REAL-PROVIDER CERT =====");
  for (const row of results) {
    console.log(JSON.stringify(row));
  }
  console.log("===== PROVIDER METRICS =====");
  console.log(JSON.stringify(summary));
  console.log("===== REJECTION CATEGORIES (aggregated) =====");
  const rej: Record<string, number> = {};
  for (const e of telemetry) {
    for (const [k, v] of Object.entries(e.rejectionCategories)) {
      rej[k] = (rej[k] ?? 0) + v;
    }
  }
  console.log(JSON.stringify(rej));

  if (failures.length > 0) {
    console.error(`CERT FAILED: ${failures.map((f) => f.scenario).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
