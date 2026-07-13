/**
 * Real model-backed shadow broadcast stack — certification only.
 *
 * Wires DeepSeek voice generation + DeepSeek entailment into BroadcastOrchestrator.
 * Not used by production routes, endpoints, or vitest (tests inject deterministic doubles).
 */
import fs from "node:fs";
import path from "node:path";
import type { EntailmentChecker } from "./sofiaDeterministicValidation";
import { BroadcastOrchestrator, type BroadcastOrchestratorDeps } from "./broadcastOrchestrator";
import { COACH, ROXANNE, SOFIA } from "./voicePersonalities";
import {
  DEFAULT_PLAYER_REGISTRY_ORACLE,
  loadPlayerRegistryOracleFromDb,
  type PlayerRegistryOracle,
} from "./playerRegistryOracle";
import { DeepSeekEntailmentChecker } from "./deepseekEntailmentChecker";
import { DeepSeekProvider, SofiaProviderError } from "./modelProvider";
import type { ShadowPipelineMetrics } from "./broadcastShadowPipeline";
import { emptyRegenerationTelemetry, type RegenerationTelemetry } from "./voiceRegeneration";

export type RealShadowTelemetry = {
  voiceGenerationCalls: number;
  entailmentCalls: number;
  voiceGenerationFailures: number;
  entailmentFailures: number;
  voiceGenerationLatencyMs: number;
  entailmentLatencyMs: number;
  providerErrors: Record<string, number>;
  regeneration: RegenerationTelemetry;
};

export type RealShadowDepsOptions = {
  voiceTimeoutMs?: number;
  entailTimeoutMs?: number;
  voiceModel?: string;
  entailModel?: string;
  playerOracle?: PlayerRegistryOracle;
  /** When true, load gm_player_registry; falls back to embedded seed. */
  loadPlayerRegistryFromDb?: boolean;
  orchestratorVoiceTimeoutMs?: number;
};

const ESTIMATED_VOICE_INPUT_TOKENS = 450;
const ESTIMATED_VOICE_OUTPUT_TOKENS = 80;
const ESTIMATED_ENTAIL_INPUT_TOKENS = 320;
const ESTIMATED_ENTAIL_OUTPUT_TOKENS = 40;
/** Rough DeepSeek flash pricing for certification budgeting (USD per 1M tokens). */
const EST_INPUT_USD_PER_M = 0.14;
const EST_OUTPUT_USD_PER_M = 0.28;

export function emptyRealShadowTelemetry(): RealShadowTelemetry {
  return {
    voiceGenerationCalls: 0,
    entailmentCalls: 0,
    voiceGenerationFailures: 0,
    entailmentFailures: 0,
    voiceGenerationLatencyMs: 0,
    entailmentLatencyMs: 0,
    providerErrors: {},
    regeneration: emptyRegenerationTelemetry(),
  };
}

function recordProviderError(telemetry: RealShadowTelemetry, kind: string): void {
  telemetry.providerErrors[kind] = (telemetry.providerErrors[kind] ?? 0) + 1;
}

export function loadShadowCertEnvFromDotenv(): void {
  if (process.env.DEEPSEEK_API_KEY) return;
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => /^\s*DEEPSEEK_API_KEY\s*=/.test(l));
  if (line) {
    process.env.DEEPSEEK_API_KEY = line
      .replace(/^\s*DEEPSEEK_API_KEY\s*=\s*/, "")
      .replace(/^["']|["']$/g, "")
      .trim();
  }
}

export function assertShadowCertApiKey(): void {
  loadShadowCertEnvFromDotenv();
  if (!process.env.DEEPSEEK_API_KEY?.trim()) {
    throw new Error(
      "DEEPSEEK_API_KEY is required for real shadow certification. Set it in .env or the environment.",
    );
  }
}

export async function resolveRealShadowPlayerOracle(
  opts: Pick<RealShadowDepsOptions, "loadPlayerRegistryFromDb" | "playerOracle"> = {},
): Promise<PlayerRegistryOracle> {
  if (opts.playerOracle) return opts.playerOracle;
  if (opts.loadPlayerRegistryFromDb) return loadPlayerRegistryOracleFromDb();
  return DEFAULT_PLAYER_REGISTRY_ORACLE;
}

export function createRealShadowBroadcastDeps(
  oracle: PlayerRegistryOracle,
  opts: RealShadowDepsOptions = {},
): { deps: BroadcastOrchestratorDeps; telemetry: RealShadowTelemetry } {
  assertShadowCertApiKey();

  const telemetry = emptyRealShadowTelemetry();

  const voiceProvider = new DeepSeekProvider({
    model: opts.voiceModel,
    timeoutMs: opts.voiceTimeoutMs ?? 20_000,
    jsonMode: true,
  });

  const entailProvider = new DeepSeekProvider({
    model: opts.entailModel,
    timeoutMs: opts.entailTimeoutMs ?? 20_000,
    jsonMode: true,
  });

  const innerChecker = new DeepSeekEntailmentChecker(entailProvider);

  const generate = async (prompt: string): Promise<string> => {
    telemetry.voiceGenerationCalls++;
    const started = Date.now();
    try {
      const text = await voiceProvider.complete(prompt);
      telemetry.voiceGenerationLatencyMs += Date.now() - started;
      return text;
    } catch (e) {
      telemetry.voiceGenerationFailures++;
      const kind = e instanceof SofiaProviderError ? e.kind : "provider_error";
      recordProviderError(telemetry, kind);
      throw e;
    }
  };

  const checker: EntailmentChecker = {
    async check(input) {
      telemetry.entailmentCalls++;
      const detailed = await innerChecker.checkDetailed(input);
      telemetry.entailmentLatencyMs += detailed.latencyMs;
      if (detailed.status !== "success") {
        telemetry.entailmentFailures++;
        recordProviderError(telemetry, detailed.status);
      }
      return detailed.decision;
    },
  };

  return {
    deps: {
      voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
      checker,
      playerOracle: oracle,
      generate,
      regenerationTelemetry: telemetry.regeneration,
      enableDeterministicRegeneration: true,
    },
    telemetry,
  };
}

export async function createRealShadowBroadcastOrchestrator(
  opts: RealShadowDepsOptions = {},
): Promise<{ orchestrator: BroadcastOrchestrator; telemetry: RealShadowTelemetry }> {
  const oracle = await resolveRealShadowPlayerOracle(opts);
  const { deps, telemetry } = createRealShadowBroadcastDeps(oracle, opts);
  const orchestrator = new BroadcastOrchestrator(deps, {
    voiceTimeoutMs: opts.orchestratorVoiceTimeoutMs ?? 12_000,
  });
  return { orchestrator, telemetry };
}

export function estimateShadowCertCostUsd(telemetry: RealShadowTelemetry): number {
  const voiceIn = telemetry.voiceGenerationCalls * ESTIMATED_VOICE_INPUT_TOKENS;
  const voiceOut = telemetry.voiceGenerationCalls * ESTIMATED_VOICE_OUTPUT_TOKENS;
  const entailIn = telemetry.entailmentCalls * ESTIMATED_ENTAIL_INPUT_TOKENS;
  const entailOut = telemetry.entailmentCalls * ESTIMATED_ENTAIL_OUTPUT_TOKENS;
  const inputUsd = ((voiceIn + entailIn) / 1_000_000) * EST_INPUT_USD_PER_M;
  const outputUsd = ((voiceOut + entailOut) / 1_000_000) * EST_OUTPUT_USD_PER_M;
  return Math.round((inputUsd + outputUsd) * 10_000) / 10_000;
}

export function summarizeRealShadowTelemetry(
  telemetry: RealShadowTelemetry,
  metrics: ShadowPipelineMetrics,
): string {
  const avgVoiceMs = telemetry.voiceGenerationCalls
    ? Math.round(telemetry.voiceGenerationLatencyMs / telemetry.voiceGenerationCalls)
    : 0;
  const avgEntailMs = telemetry.entailmentCalls
    ? Math.round(telemetry.entailmentLatencyMs / telemetry.entailmentCalls)
    : 0;
  const estCost = estimateShadowCertCostUsd(telemetry);

  const lines = [
    "===== REAL PROVIDER SHADOW TELEMETRY =====",
    `voice generation calls: ${telemetry.voiceGenerationCalls} (failures ${telemetry.voiceGenerationFailures}, avg ${avgVoiceMs}ms)`,
    `entailment calls: ${telemetry.entailmentCalls} (failures ${telemetry.entailmentFailures}, avg ${avgEntailMs}ms)`,
    `regeneration: ${telemetry.regeneration.regenerated} attempted, ${telemetry.regeneration.regeneratedAccepted} accepted, ${telemetry.regeneration.regeneratedRejected} rejected, ${telemetry.regeneration.finalSuppression} final suppression`,
    `regeneration added latency (avg): ${telemetry.regeneration.regenerated ? Math.round(telemetry.regeneration.addedLatencyMs / telemetry.regeneration.regenerated) : 0}ms`,
    `orchestrator voice latency total: ${metrics.totalLatencyMs}ms`,
    `timeouts: ${metrics.timeoutCount} · expired frames: ${metrics.expiredFrames}`,
    `rejections: ${JSON.stringify(metrics.rejectionCategories)}`,
    `estimated API cost (rough): $${estCost.toFixed(4)}`,
  ];

  if (Object.keys(telemetry.providerErrors).length > 0) {
    lines.push(`provider errors: ${JSON.stringify(telemetry.providerErrors)}`);
  }

  return lines.join("\n");
}
