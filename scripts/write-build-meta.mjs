/**
 * Write dist/build-meta.json from the git checkout actually being built.
 * Health prefers this over stale GIT_COMMIT / BUILD_TIME service env vars
 * (Railway CLI uploads do not refresh those vars; git-triggered rebuilds can).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");

function git(cmd) {
  try {
    return execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const fullSha = git("git rev-parse HEAD");
const shortSha = git("git rev-parse --short HEAD");
const branch = git("git rev-parse --abbrev-ref HEAD");
const message = git("git log -1 --pretty=%s");

const meta = {
  gitSha: fullSha || process.env.GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || "unknown",
  gitShaShort: shortSha || (fullSha ? fullSha.slice(0, 7) : "unknown"),
  gitBranch: branch || process.env.RAILWAY_GIT_BRANCH || "unknown",
  gitCommitMessage: message || process.env.GIT_COMMIT_MESSAGE || "",
  buildTime: new Date().toISOString(),
  source: fullSha ? "git" : "env",
};

fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, "build-meta.json");
fs.writeFileSync(out, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
console.log(`[build] Wrote ${out} (${meta.gitShaShort} @ ${meta.buildTime})`);
