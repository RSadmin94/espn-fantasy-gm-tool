import mysql from "mysql2/promise";
import { ENV } from "./env";

export type HealthCheckValue = "ok" | "missing" | "error" | "warn";

export type HealthSnapshot = {
  status: "ok" | "degraded";
  httpStatus: number;
  timestamp: string;
  version: string;
  gitSha: string;
  gitBranch: string;
  buildTime: string;
  nodeEnv: string;
  checks: Record<string, HealthCheckValue>;
  failed: string[];
  warnings: string[];
};

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

/** Same checks as GET /api/health — no invented components. */
export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
  const checks: Record<string, HealthCheckValue> = {};

  checks.DATABASE_URL = ENV.databaseUrl ? "ok" : "missing";
  checks.JWT_SECRET = ENV.cookieSecret ? "ok" : "missing";
  checks.ESPN_LEAGUE_ID = process.env.ESPN_LEAGUE_ID ? "ok" : "missing";
  checks.ESPN_S2 = process.env.ESPN_S2 ? "ok" : "missing";
  checks.ESPN_SWID = process.env.ESPN_SWID ? "ok" : "missing";
  checks.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY ? "ok" : "missing";
  checks.CLERK_SECRET_KEY = ENV.clerkSecretKey ? "ok" : "warn";

  const llmProvider = ENV.llmProvider ?? "anthropic";
  const llmKeyMap: Record<string, string | undefined> = {
    anthropic: ENV.anthropicApiKey,
    openai: ENV.openaiApiKey,
    gemini: ENV.geminiApiKey,
  };
  const activeLlmKey = llmKeyMap[llmProvider];
  checks[`LLM_PROVIDER(${llmProvider})`] = activeLlmKey ? "ok" : "warn";

  try {
    const conn = await mysql.createConnection(ENV.databaseUrl);
    await conn.execute("SELECT 1");
    await conn.end();
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const hardFailed = Object.entries(checks).filter(([, v]) => v === "missing" || v === "error");
  const warned = Object.entries(checks).filter(([, v]) => v === "warn");
  const httpStatus = hardFailed.length === 0 ? 200 : 503;

  return {
    status: httpStatus === 200 ? "ok" : "degraded",
    httpStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
    gitSha: optionalEnv("GIT_COMMIT", "RAILWAY_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_SHA"),
    gitBranch: optionalEnv("RAILWAY_GIT_BRANCH", "VERCEL_GIT_COMMIT_REF"),
    buildTime: optionalEnv("BUILD_TIME"),
    nodeEnv: nodeEnvLabel(),
    checks,
    failed: hardFailed.map(([k, v]) => `${k}: ${v}`),
    warnings: warned.map(([k]) => `${k}: not set`),
  };
}
