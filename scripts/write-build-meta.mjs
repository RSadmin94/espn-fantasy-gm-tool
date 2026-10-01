/**
 * Write dist/build-meta.json during `pnpm build`.
 *
 * Git identity here is a fallback only. Runtime health prefers
 * RAILWAY_GIT_COMMIT_SHA over this file so a frozen GIT_COMMIT service
 * var cannot keep reporting an old SHA after a Git-triggered deploy.
 *
 * Build-time SHA order: git checkout → RAILWAY_GIT_COMMIT_SHA → GIT_COMMIT.
 * buildTime is always the compile timestamp.
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

function looksLikeGitSha(value) {
  return typeof value === "string" && /^[0-9a-f]{7,40}$/i.test(value.trim());
}

function envSha(...keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (looksLikeGitSha(v)) return v.trim();
  }
  return "";
}

const fullSha = git("git rev-parse HEAD");
const shortSha = git("git rev-parse --short HEAD");
const branch = git("git rev-parse --abbrev-ref HEAD");
const message = git("git log -1 --pretty=%s");
const railwaySha = envSha("RAILWAY_GIT_COMMIT_SHA");
const explicitSha = envSha("GIT_COMMIT");
const gitSha = fullSha || railwaySha || explicitSha || "unknown";
const source = fullSha ? "git" : railwaySha ? "railway" : explicitSha ? "env" : "unknown";

const meta = {
  gitSha,
  gitShaShort: shortSha || (gitSha !== "unknown" ? gitSha.slice(0, 7) : "unknown"),
  gitBranch: branch || process.env.RAILWAY_GIT_BRANCH || "unknown",
  gitCommitMessage: message || process.env.GIT_COMMIT_MESSAGE || "",
  buildTime: new Date().toISOString(),
  source,
};

fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, "build-meta.json");
fs.writeFileSync(out, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
console.log(`[build] Wrote ${out} (${meta.gitShaShort} @ ${meta.buildTime})`);
