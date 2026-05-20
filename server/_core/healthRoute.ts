import type { Express } from "express";
import mysql from "mysql2/promise";
import { ENV } from "./env";

export function registerHealthRoute(app: Express): void {
  app.get("/api/health", async (_req, res) => {
    const checks: Record<string, "ok" | "missing" | "error"> = {};

    // 1. Required env vars
    checks.DATABASE_URL = ENV.databaseUrl ? "ok" : "missing";
    checks.JWT_SECRET = ENV.cookieSecret ? "ok" : "missing";
    checks.ANTHROPIC_API_KEY = ENV.anthropicApiKey ? "ok" : "missing";
    checks.ESPN_LEAGUE_ID = process.env.ESPN_LEAGUE_ID ? "ok" : "missing";
    checks.ESPN_S2 = process.env.ESPN_S2 ? "ok" : "missing";
    checks.ESPN_SWID = process.env.ESPN_SWID ? "ok" : "missing";
    checks.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY
      ? "ok"
      : "missing";

    // 2. Database connectivity
    try {
      const conn = await mysql.createConnection(ENV.databaseUrl);
      await conn.execute("SELECT 1");
      await conn.end();
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    const failed = Object.entries(checks).filter(([, v]) => v !== "ok");
    const status = failed.length === 0 ? 200 : 503;

    res.status(status).json({
      status: status === 200 ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
      checks,
      ...(failed.length > 0 && {
        failed: failed.map(([k, v]) => `${k}: ${v}`),
      }),
    });
  });
}
