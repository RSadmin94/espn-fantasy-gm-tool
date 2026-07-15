/**
 * Production live orchestrator factories — no regeneration, shared ledger per draft.
 */
import type { EditorialLedger } from "./editorialLedger";
import { BroadcastOrchestrator } from "./broadcastOrchestrator";
import { COACH, ROXANNE, SOFIA } from "./voicePersonalities";
import { DEFAULT_PLAYER_REGISTRY_ORACLE } from "./playerRegistryOracle";
import { createShadowGroundedVoiceProvider } from "./shadowGroundedVoiceProvider";
import {
  createRealShadowBroadcastDeps,
  emptyRealShadowTelemetry,
  resolveRealShadowPlayerOracle,
  type RealShadowTelemetry,
} from "./realBroadcastShadowDeps";

const LIVE_VOICE_TIMEOUT_MS = 15_000;

let accumulatedProviderTelemetry: RealShadowTelemetry = emptyRealShadowTelemetry();

function mergeProviderTelemetry(next: RealShadowTelemetry): void {
  accumulatedProviderTelemetry.voiceGenerationCalls += next.voiceGenerationCalls;
  accumulatedProviderTelemetry.entailmentCalls += next.entailmentCalls;
  accumulatedProviderTelemetry.voiceGenerationFailures += next.voiceGenerationFailures;
  accumulatedProviderTelemetry.entailmentFailures += next.entailmentFailures;
  accumulatedProviderTelemetry.voiceGenerationLatencyMs += next.voiceGenerationLatencyMs;
  accumulatedProviderTelemetry.entailmentLatencyMs += next.entailmentLatencyMs;
  for (const [k, v] of Object.entries(next.providerErrors)) {
    accumulatedProviderTelemetry.providerErrors[k] =
      (accumulatedProviderTelemetry.providerErrors[k] ?? 0) + v;
  }
}

export function getAccumulatedLiveProviderTelemetry(): RealShadowTelemetry {
  return { ...accumulatedProviderTelemetry, providerErrors: { ...accumulatedProviderTelemetry.providerErrors } };
}

export function resetAccumulatedLiveProviderTelemetry(): void {
  accumulatedProviderTelemetry = emptyRealShadowTelemetry();
}

export function createDeterministicLiveOrchestrator(ledger: EditorialLedger): BroadcastOrchestrator {
  return new BroadcastOrchestrator(
    {
      voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
      checker: { async check() { return "entail" as const; } },
      playerOracle: DEFAULT_PLAYER_REGISTRY_ORACLE,
      generate: createShadowGroundedVoiceProvider(),
      ledger,
    },
    { voiceTimeoutMs: LIVE_VOICE_TIMEOUT_MS, maxTransientRetries: 1 },
  );
}

export async function createProductionLiveOrchestrator(
  ledger: EditorialLedger,
): Promise<{ orchestrator: BroadcastOrchestrator; telemetry: RealShadowTelemetry }> {
  const oracle = await resolveRealShadowPlayerOracle({ loadPlayerRegistryFromDb: true });
  const { deps, telemetry } = createRealShadowBroadcastDeps(oracle, {
    orchestratorVoiceTimeoutMs: LIVE_VOICE_TIMEOUT_MS,
  });
  const orchestrator = new BroadcastOrchestrator(
    {
      voices: deps.voices,
      checker: deps.checker,
      playerOracle: deps.playerOracle,
      generate: deps.generate,
      ledger,
    },
    { voiceTimeoutMs: LIVE_VOICE_TIMEOUT_MS, maxTransientRetries: 1 },
  );
  return { orchestrator, telemetry };
}

export function mergeAccumulatedLiveProviderTelemetry(next: RealShadowTelemetry): void {
  mergeProviderTelemetry(next);
}
