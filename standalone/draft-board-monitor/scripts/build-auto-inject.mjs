/**
 * Bundle RFSN-031B production ESPN live reader (dormant bootstrap) into the extension.
 * Usage: node standalone/draft-board-monitor/scripts/build-auto-inject.mjs
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..", "..");
const outfile = path.join(
  repoRoot,
  "chrome-extension",
  "providers",
  "espn-live",
  "espn-live-reader.iife.js",
);

await esbuild.build({
  entryPoints: [path.join(root, "src", "draft-monitor", "autoInjectEntry.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  outfile,
  minify: false,
  sourcemap: false,
  logLevel: "info",
  alias: {
    "@shared": path.resolve(repoRoot, "shared"),
  },
  loader: {
    ".json": "json",
  },
});

const code = fs.readFileSync(outfile, "utf8");
if (!code.includes("__RFSN_ESPN_LIVE_READER__")) {
  throw new Error("auto-inject build missing handshake marker");
}
if (!code.includes("preferPopup")) {
  throw new Error("auto-inject build missing preferPopup dormancy path");
}
console.log(`[espn-live-reader] wrote ${outfile} (${code.length} chars)`);
