/** Export shadow pipeline results for dev RFSN playback UI. */
import fs from "node:fs";
import path from "node:path";
import { runShadowPipeline, toPlaybackBundle } from "../server/services/sofia/broadcastShadowPipeline.ts";
import { formatDiagnosticTable } from "../server/services/sofia/broadcastShadowDiagnostics.ts";
import {
  buildShadowDraftMoments,
  type ShadowDraftSource,
} from "../server/services/sofia/shadowDraftSources.ts";

const OUT_DIR = path.join(process.cwd(), "client", "public", "dev-shadow", "rfsn-playback");
const sources: ShadowDraftSource[] = ["simulated", "mock", "scenario"];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const source of sources) {
  const moments = buildShadowDraftMoments(source);
  const result = await runShadowPipeline(moments);
  const bundle = toPlaybackBundle(source, result);
  fs.writeFileSync(path.join(OUT_DIR, `${source}.json`), JSON.stringify(bundle, null, 2));
  fs.writeFileSync(
    path.join(OUT_DIR, `${source}-diagnostics.txt`),
    formatDiagnosticTable(result.diagnostics),
  );
  console.log(`\n--- ${source} ---`);
  console.log(`moments: ${result.metrics.totalMoments}`);
  console.log(`silence: ${result.metrics.silencePct.toFixed(1)}%`);
  console.log(`commented: ${result.metrics.commentedMoments}`);
  console.log(`lead voices: ${JSON.stringify(result.metrics.leadVoiceCounts)}`);
}

console.log(`\nPlayback bundles → ${OUT_DIR}`);
console.log("View: pnpm dev:rfsn-playback → http://localhost:5174/rfsn-playback.html");
process.exit(0);
