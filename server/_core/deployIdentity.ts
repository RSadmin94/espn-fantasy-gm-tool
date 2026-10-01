/**
 * Deployment identity for /api/health.
 *
 * Railway Git deploys inject RAILWAY_GIT_COMMIT_SHA. A frozen service env
 * GIT_COMMIT (and the build-meta copy of it) must never override that SHA.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type GitIdentitySource = "railway" | "vercel" | "build-meta" | "env" | "unknown";

export type BuildMeta = {
  gitSha?: string;
  gitBranch?: string;
  buildTime?: string;
  gitCommitMessage?: string;
  source?: string;
};

export type DeployIdentity = {
  gitSha: string;
  gitBranch: string;
  buildTime: string;
  gitIdentitySource: GitIdentitySource;
};

export function looksLikeGitSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value.trim());
}

function firstNonEmpty(env: NodeJS.Dict<string | undefined>, keys: string[]): string {
  for (const key of keys) {
    const v = env[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

function shaFrom(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return looksLikeGitSha(trimmed) ? trimmed : "";
}

/** Prefer build-time metadata written during `pnpm build` over stale BUILD_TIME. */
export function readBuildMeta(): BuildMeta | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "dist", "build-meta.json"),
    path.join(here, "build-meta.json"),
    path.join(here, "..", "build-meta.json"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as BuildMeta;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Precedence:
 * 1. Railway Git SHA (runtime/build injection)
 * 2. Vercel Git SHA
 * 3. Build-meta SHA discovered from git (or Railway) at compile time
 * 4. Explicit GIT_COMMIT
 * 5. Remaining build-meta SHA
 * 6. unknown
 */
export function resolveDeployIdentity(
  env: NodeJS.Dict<string | undefined> = process.env,
  meta: BuildMeta | null = null,
): DeployIdentity {
  const railwaySha = shaFrom(env.RAILWAY_GIT_COMMIT_SHA);
  const vercelSha = shaFrom(env.VERCEL_GIT_COMMIT_SHA);
  const explicitSha = shaFrom(env.GIT_COMMIT);
  const metaSha = shaFrom(typeof meta?.gitSha === "string" ? meta.gitSha : "");
  const metaSource = typeof meta?.source === "string" ? meta.source.trim() : "";
  const legitimateBuildSha =
    metaSha && (metaSource === "git" || metaSource === "railway") ? metaSha : "";

  let gitSha = "unknown";
  let gitIdentitySource: GitIdentitySource = "unknown";

  if (railwaySha) {
    gitSha = railwaySha;
    gitIdentitySource = "railway";
  } else if (vercelSha) {
    gitSha = vercelSha;
    gitIdentitySource = "vercel";
  } else if (legitimateBuildSha) {
    gitSha = legitimateBuildSha;
    gitIdentitySource = metaSource === "railway" ? "railway" : "build-meta";
  } else if (explicitSha) {
    gitSha = explicitSha;
    gitIdentitySource = "env";
  } else if (metaSha) {
    gitSha = metaSha;
    gitIdentitySource = "build-meta";
  }

  const gitBranch =
    firstNonEmpty(env, ["RAILWAY_GIT_BRANCH", "VERCEL_GIT_COMMIT_REF"]) ||
    (typeof meta?.gitBranch === "string" && meta.gitBranch.trim()) ||
    "unknown";

  const buildTime =
    (typeof meta?.buildTime === "string" && meta.buildTime.trim()) ||
    firstNonEmpty(env, ["BUILD_TIME"]) ||
    "unknown";

  return { gitSha, gitBranch, buildTime, gitIdentitySource };
}
