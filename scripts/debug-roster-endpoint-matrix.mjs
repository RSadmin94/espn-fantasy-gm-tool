/**
 * Launcher: runs the TS matrix (DB credentials like fetch-all-historical-data.ts).
 * Usage: node scripts/debug-roster-endpoint-matrix.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ts = path.join(__dirname, "debug-roster-endpoint-matrix.ts");
const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(cmd, ["tsx", ts], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: true,
});
process.exit(r.status === null ? 1 : r.status);
