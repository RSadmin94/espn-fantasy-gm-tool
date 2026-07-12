/**
 * End-to-end broadcast shadow certification harness.
 *
 * DraftMoment → BroadcastFrame → RfsnBroadcastSnapshot (real components, no mock adapter).
 *
 * Usage:
 *   pnpm exec tsx scripts/_broadcast_shadow_e2e.mts [simulated|mock|scenario|all]
 */
import fs from "node:fs";
import path from "node:path";
import {
  runShadowPipeline,
  validateShadowArtifact,
  type ShadowRunResult,
} from "../server/services/sofia/broadcastShadowPipeline.ts";
import {
  buildMockDraftMoments,
  buildScenarioDraftMoments,
  buildSimulatedDraftMoments,
} from "../server/services/sofia/shadowDraftSources.ts";

const OUT_DIR = path.join(process.cwd(), "scripts", "_broadcast_shadow_output");
const mode = process.argv[2] ?? "all";

function ensureDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function certify(label: string, moments: Awaited<ReturnType<typeof buildSimulatedDraftMoments>>) {
  console.log(`\n--- ${label} (${moments.length} picks) ---`);
  const result = await runShadowPipeline(moments);
  printMetrics(result);
  writeArtifacts(label, result);
  validateRun(label, result);
  return result;
}

function printMetrics(result: ShadowRunResult) {
  const m = result.metrics;
  console.log(`total moments: ${m.totalMoments}`);
  console.log(`commented: ${m.commentedMoments} · silenced: ${m.silencedMoments} (${m.silencePct.toFixed(1)}%)`);
  console.log(`lead voices: Sofia ${m.leadVoiceCounts.sofia ?? 0}, Coach ${m.leadVoiceCounts.coach ?? 0}, Roxanne ${m.leadVoiceCounts.roxanne ?? 0}`);
  console.log(`avg voices/commented moment: ${m.avgVoicesPerCommentedMoment.toFixed(2)}`);
  console.log(`timeouts: ${m.timeoutCount} · expired: ${m.expiredFrames} · adapter failures: ${m.adapterConversionFailures}`);
  console.log(`total voice latency ms: ${m.totalLatencyMs}`);
  if (Object.keys(m.rejectionCategories).length > 0) {
    console.log(`rejections: ${JSON.stringify(m.rejectionCategories)}`);
  }
  console.log(`final adapter queue depth: ${result.finalQueue.length}`);
}

function writeArtifacts(label: string, result: ShadowRunResult) {
  const summary = result.artifacts.map((a) => ({
    pick: a.draftMoment.overallPick,
    level: a.draftMoment.level,
    frameStatus: a.broadcastFrame.public.status,
    leadVoice: a.broadcastFrame.public.primaryVoice?.voice ?? null,
    snapshotPrimary: a.snapshot.primary?.commentator ?? null,
    snapshotSecondary: a.snapshot.secondary?.commentator ?? null,
    deferred: a.broadcastFrame.public.deferredVoices.map((v) => v.voice),
    silenced: a.broadcastFrame.public.status === "suppressed",
  }));
  fs.writeFileSync(
    path.join(OUT_DIR, `${label}-summary.json`),
    JSON.stringify(summary, null, 2),
  );

  const snapshots = result.artifacts
    .filter((a) => a.broadcastFrame.public.status !== "suppressed")
    .slice(0, 5)
    .map((a) => JSON.parse(a.snapshotJson));
  fs.writeFileSync(
    path.join(OUT_DIR, `${label}-snapshots-sample.json`),
    JSON.stringify(snapshots, null, 2),
  );
}

function validateRun(label: string, result: ShadowRunResult) {
  const errors: string[] = [];
  for (const a of result.artifacts) {
    errors.push(...validateShadowArtifact(a).map((e) => `pick ${a.draftMoment.overallPick}: ${e}`));
  }
  if (errors.length > 0) {
    console.log(`VALIDATION ISSUES (${label}):`);
    for (const e of errors.slice(0, 10)) console.log(`  - ${e}`);
  } else {
    console.log(`validation: PASS (${label})`);
  }
}

console.log("===== BROADCAST SHADOW E2E CERTIFICATION =====");
ensureDir();

const runs: Promise<ShadowRunResult>[] = [];
if (mode === "simulated" || mode === "all") runs.push(certify("simulated", buildSimulatedDraftMoments()));
if (mode === "mock" || mode === "all") runs.push(certify("mock", buildMockDraftMoments()));
if (mode === "scenario" || mode === "all") runs.push(certify("scenario", buildScenarioDraftMoments()));

await Promise.all(runs);
console.log(`\nArtifacts written to ${OUT_DIR}`);
process.exit(0);
