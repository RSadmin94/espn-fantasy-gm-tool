import type { Express } from "express";
import { collectHealthSnapshot } from "./healthSnapshot";

export function registerHealthRoute(app: Express): void {
  app.get("/api/health", async (_req, res) => {
    const snap = await collectHealthSnapshot();
    res.status(snap.httpStatus).json({
      status: snap.status,
      timestamp: snap.timestamp,
      version: snap.version,
      gitSha: snap.gitSha,
      gitBranch: snap.gitBranch,
      buildTime: snap.buildTime,
      nodeEnv: snap.nodeEnv,
      checks: snap.checks,
      ...(snap.failed.length > 0 && { failed: snap.failed }),
      ...(snap.warnings.length > 0 && {
        warnings: snap.warnings.map((w) =>
          w.includes("LLM_PROVIDER") ? `${w} — AI features disabled` : w,
        ),
      }),
    });
  });
}
