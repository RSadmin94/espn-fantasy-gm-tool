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
  resolveRealShadowPlayerOracle,
  type RealShadowTelemetry,
} from "./realBroadcastShadowDeps";

const LIVE_VOICE_TIMEOUT_MS = 15_000;

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
