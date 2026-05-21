import type { Express } from "express";
import mysql from "mysql2/promise";
import { ENV } from "./env";

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
    res.status(status).json({
      status: status === 200 ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
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
