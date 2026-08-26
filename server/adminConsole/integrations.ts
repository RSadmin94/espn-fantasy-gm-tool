import { ENV } from "../_core/env";
import { collectHealthSnapshot } from "../_core/healthSnapshot";
import { isRfsnTtsOperational } from "../services/rfsn/rfsnTtsConfig";
import { getDb } from "../db";
import { usageEvents } from "../../drizzle/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { resolveDateRange } from "../aiCost/dateRange";

function configured(value: string | undefined | null): "Configured" | "Not configured" {
  return value && value.trim() ? "Configured" : "Not configured";
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function loadAdminIntegrations() {
  const health = await collectHealthSnapshot();
  const mtd = resolveDateRange({ preset: "mtd" });
  const db = await getDb();

  let providerUsage: Array<{
    provider: string;
    model: string;
    requests: number;
    tokens: number;
    costUsd: number;
    errors: number;
    avgLatencyMs: number;
  }> = [];
  if (db) {
    const rows = await db
      .select({
        provider: usageEvents.provider,
        model: usageEvents.model,
        requests: sql<number>`COUNT(*)`,
        tokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)`,
        errors: sql<number>`SUM(CASE WHEN ${usageEvents.status} = 'ERROR' THEN 1 ELSE 0 END)`,
        latency: sql<number>`COALESCE(AVG(${usageEvents.durationMs}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          gte(usageEvents.createdAt, mtd.start),
        ),
      )
      .groupBy(usageEvents.provider, usageEvents.model);
    providerUsage = rows.map((r) => ({
      provider: r.provider ?? "UNATTRIBUTED",
      model: r.model ?? "unknown",
      requests: num(r.requests),
      tokens: num(r.tokens),
      costUsd: num(r.cost),
      errors: num(r.errors),
      avgLatencyMs: num(r.latency),
    }));
  }

  const llmProvider = ENV.llmProvider ?? "anthropic";
  return {
    secretsNeverExposed: true,
    components: [
      {
        id: "web",
        name: "Web application",
        status: "HEALTHY" as const,
        detail: "This Admin Console is being served.",
      },
      {
        id: "api",
        name: "API",
        status: health.httpStatus === 200 ? "HEALTHY" : "DEGRADED",
        detail: `Health HTTP ${health.httpStatus}`,
      },
      {
        id: "database",
        name: "Database",
        status: health.checks.database === "ok" ? "HEALTHY" : health.checks.database === "error" ? "DOWN" : "UNKNOWN",
        configured: configured(ENV.databaseUrl),
        detail: health.checks.database,
      },
      {
        id: "clerk",
        name: "Clerk / Authentication",
        status: ENV.clerkSecretKey ? "HEALTHY" : "DEGRADED",
        configured: configured(ENV.clerkSecretKey),
        detail: "Failed sign-in logs are not stored in this app.",
      },
      {
        id: "espn",
        name: "ESPN integration",
        status:
          process.env.ESPN_S2 && process.env.ESPN_SWID
            ? "HEALTHY"
            : "UNKNOWN",
        configured: configured(process.env.ESPN_S2),
        detail: "Per-user league credentials are stored encrypted; keys are never returned.",
      },
      {
        id: "llm",
        name: `AI provider (${llmProvider})`,
        status: health.checks[`LLM_PROVIDER(${llmProvider})`] === "ok" ? "HEALTHY" : "DEGRADED",
        configured: configured(
          llmProvider === "openai"
            ? ENV.openaiApiKey
            : llmProvider === "gemini"
              ? ENV.geminiApiKey
              : ENV.anthropicApiKey,
        ),
        detail: `Active LLM_PROVIDER=${llmProvider}`,
      },
      {
        id: "anthropic",
        name: "Anthropic",
        status: ENV.anthropicApiKey ? "HEALTHY" : "UNKNOWN",
        configured: configured(ENV.anthropicApiKey),
      },
      {
        id: "openai",
        name: "OpenAI",
        status: ENV.openaiApiKey ? "HEALTHY" : "UNKNOWN",
        configured: configured(ENV.openaiApiKey),
      },
      {
        id: "gemini",
        name: "Gemini",
        status: ENV.geminiApiKey ? "HEALTHY" : "UNKNOWN",
        configured: configured(ENV.geminiApiKey),
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        status: process.env.DEEPSEEK_API_KEY ? "HEALTHY" : "UNKNOWN",
        configured: configured(process.env.DEEPSEEK_API_KEY),
        detail: "Used for commentary entailment / shadow evaluation, not the primary LLM router.",
      },
      {
        id: "kokoro",
        name: "Kokoro TTS",
        status: isRfsnTtsOperational() ? "HEALTHY" : "UNKNOWN",
        configured: isRfsnTtsOperational() ? "Configured" : "Not configured",
      },
      {
        id: "stripe",
        name: "Stripe",
        status: ENV.stripeSecretKey ? "HEALTHY" : "UNKNOWN",
        configured: configured(ENV.stripeSecretKey),
      },
      {
        id: "odds",
        name: "The Odds API",
        status: ENV.oddsApiKey ? "HEALTHY" : "UNKNOWN",
        configured: configured(ENV.oddsApiKey),
      },
    ],
    providerUsage,
    health,
    qwen: {
      inUse: false,
      note: "Qwen is mentioned as a possible Sofia provider swap but is not wired as a live API in this repository.",
    },
  };
}

export function mapHealthCheckToStatus(value: string | undefined): "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN" {
  if (value === "ok") return "HEALTHY";
  if (value === "warn") return "DEGRADED";
  if (value === "error" || value === "missing") return "DOWN";
  return "UNKNOWN";
}
