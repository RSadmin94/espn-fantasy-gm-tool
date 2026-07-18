import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { ENV } from "./env";

/** Informational only; never used for pass/fail. */
function optionalEnv(...keys: string[]): string {
  for (const key of keys) {
    const v = process.env[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "unknown";
}

function nodeEnvLabel(): string {
  const v = process.env.NODE_ENV;
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return "unknown";
}

type BuildMeta = {
  gitSha?: string;
  gitBranch?: string;
  buildTime?: string;
  gitCommitMessage?: string;
  source?: string;
};

/** Prefer build-time metadata written during `pnpm build` over stale service env vars. */
function readBuildMeta(): BuildMeta | null {
  const candidates = [
    path.join(process.cwd(), "dist", "build-meta.json"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "build-meta.json"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "build-meta.json"),
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

function looksLikeGitSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value.trim());
}

export function registerHealthRoute(app: Express): void {
  app.get("/api/health", async (_req, res) => {
    const checks: Record<string, "ok" | "missing" | "error" | "warn"> = {};

    // 1. Required env vars
    checks.DATABASE_URL = ENV.databaseUrl ? "ok" : "missing";
    checks.JWT_SECRET = ENV.cookieSecret ? "ok" : "missing";
    checks.ESPN_LEAGUE_ID = process.env.ESPN_LEAGUE_ID ? "ok" : "missing";
    checks.ESPN_S2 = process.env.ESPN_S2 ? "ok" : "missing";
    checks.ESPN_SWID = process.env.ESPN_SWID ? "ok" : "missing";
    checks.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY
      ? "ok"
      : "missing";

    // 2. LLM provider check — warn (not fail) if active provider key is missing
    const llmProvider = ENV.llmProvider ?? "anthropic";
    const llmKeyMap: Record<string, string | undefined> = {
      anthropic: ENV.anthropicApiKey,
      openai: ENV.openaiApiKey,
      gemini: ENV.geminiApiKey,
    };
    const activeLlmKey = llmKeyMap[llmProvider];
    checks[`LLM_PROVIDER(${llmProvider})`] = activeLlmKey ? "ok" : "warn";

    // 3. Database connectivity
    try {
      const conn = await mysql.createConnection(ENV.databaseUrl);
      await conn.execute("SELECT 1");
      await conn.end();
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    // Only hard failures (missing required vars or DB error) cause 503
    const hardFailed = Object.entries(checks).filter(
      ([, v]) => v === "missing" || v === "error"
    );
    const warned = Object.entries(checks).filter(([, v]) => v === "warn");

    const status = hardFailed.length === 0 ? 200 : 503;

    const meta = readBuildMeta();
    const envSha = optionalEnv(
      "GIT_COMMIT",
      "RAILWAY_GIT_COMMIT_SHA",
      "VERCEL_GIT_COMMIT_SHA",
    );
    const metaSha = typeof meta?.gitSha === "string" ? meta.gitSha.trim() : "";
    // Prefer build-meta (actual built commit). Ignore non-sha Railway placeholders.
    const gitSha =
      (metaSha && looksLikeGitSha(metaSha) ? metaSha : "") ||
      (looksLikeGitSha(envSha) ? envSha : "") ||
      metaSha ||
      envSha ||
      "unknown";
    const gitBranch =
      (typeof meta?.gitBranch === "string" && meta.gitBranch.trim()) ||
      optionalEnv("RAILWAY_GIT_BRANCH", "VERCEL_GIT_COMMIT_REF");
    const buildTime =
      (typeof meta?.buildTime === "string" && meta.buildTime.trim()) ||
      optionalEnv("BUILD_TIME");

    res.status(status).json({
      status: status === 200 ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
      gitSha,
      gitBranch,
      buildTime,
      gitIdentitySource: metaSha && looksLikeGitSha(metaSha) ? "build-meta" : "env",
      nodeEnv: nodeEnvLabel(),
      checks,
      ...(hardFailed.length > 0 && {
        failed: hardFailed.map(([k, v]) => `${k}: ${v}`),
      }),
      ...(warned.length > 0 && {
        warnings: warned.map(
          ([k]) => `${k}: key not set — AI features disabled`
        ),
      }),
    });
  });
}
