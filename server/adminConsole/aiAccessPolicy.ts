/**
 * Central AI access decision for invokeLLM / advisor streams.
 *
 * Usage-day timezone: UTC calendar day (00:00–24:00 UTC).
 * Daily token caps use tokens already consumed that UTC day (in-memory + persisted LLM events).
 *
 * Precedence (first matching deny wins):
 *   1. SUSPENDED / AI_DISABLED (skipped for the application owner)
 *   2. Feature disabled / maintenance / restrictTo
 *   3. Rate-limit cooldown + throttle rolling-24h budget
 *   4. Per-account dailyTokenLimit (UTC day)
 *   5. ALLOW
 *
 * There is no per-account feature-block row. `restricted` status is a throttle (0.2× budget), not a feature deny.
 * Org monthly AI budget is dashboard/alerting only — not a per-request hard block.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, getUserById } from "../db";
import { usageEvents, type User } from "../../drizzle/schema";
import { isOwnerAccount } from "../_core/owners";
import { checkRateLimit, tokensUsedUtcDay, utcUsageDayStart } from "../rateLimiter";
import { evaluateAiPolicy, getAccountControl } from "./accountControls";
import { getFeatureOverride, isFeatureAllowedForUser } from "./featureFlags";
import { productFeatureIdForAiFeature } from "./productFeatures";
import { resolveFeatureId } from "../aiCost/aiFeatures";

export const AI_USAGE_DAY_TIMEZONE = "UTC" as const;

export type AiAccessCode =
  | "SUSPENDED"
  | "AI_DISABLED"
  | "FEATURE_DISABLED"
  | "MAINTENANCE"
  | "RESTRICTED"
  | "RATE_LIMIT"
  | "DAILY_TOKEN_LIMIT"
  | "ALLOW";

export type AiAccessDecision = {
  allowed: boolean;
  reason?: string;
  code: AiAccessCode;
  tokenBudgetMultiplier: number;
  dailyTokenLimit: number | null;
};

export function decideDailyTokenLimit(opts: {
  isOwner: boolean;
  dailyTokenLimit: number | null | undefined;
  tokensUsedToday: number;
}): { allowed: boolean; reason?: string } {
  if (opts.isOwner) return { allowed: true };
  const cap = opts.dailyTokenLimit;
  if (cap == null || cap <= 0) return { allowed: true };
  if (opts.tokensUsedToday >= cap) {
    return {
      allowed: false,
      reason: "Daily AI token limit reached. Resets at 00:00 UTC.",
    };
  }
  return { allowed: true };
}

export function resolveAiAccessDecision(facts: {
  isOwner: boolean;
  accountDenied: boolean;
  accountCode: "SUSPENDED" | "AI_DISABLED";
  accountReason?: string;
  featureDenied: boolean;
  featureCode: "FEATURE_DISABLED" | "MAINTENANCE" | "RESTRICTED";
  featureReason?: string;
  rateLimitDenied: boolean;
  rateLimitReason?: string;
  dailyTokenDenied: boolean;
  dailyTokenReason?: string;
  tokenBudgetMultiplier: number;
  dailyTokenLimit: number | null;
}): AiAccessDecision {
  if (!facts.isOwner && facts.accountDenied) {
    return {
      allowed: false,
      code: facts.accountCode,
      reason: facts.accountReason,
      tokenBudgetMultiplier: 0,
      dailyTokenLimit: null,
    };
  }
  if (facts.featureDenied) {
    return {
      allowed: false,
      code: facts.featureCode,
      reason: facts.featureReason,
      tokenBudgetMultiplier: facts.tokenBudgetMultiplier,
      dailyTokenLimit: facts.dailyTokenLimit,
    };
  }
  if (facts.rateLimitDenied) {
    return {
      allowed: false,
      code: "RATE_LIMIT",
      reason: facts.rateLimitReason,
      tokenBudgetMultiplier: facts.tokenBudgetMultiplier,
      dailyTokenLimit: facts.dailyTokenLimit,
    };
  }
  if (!facts.isOwner && facts.dailyTokenDenied) {
    return {
      allowed: false,
      code: "DAILY_TOKEN_LIMIT",
      reason: facts.dailyTokenReason,
      tokenBudgetMultiplier: facts.tokenBudgetMultiplier,
      dailyTokenLimit: facts.dailyTokenLimit,
    };
  }
  return {
    allowed: true,
    code: "ALLOW",
    tokenBudgetMultiplier: facts.tokenBudgetMultiplier,
    dailyTokenLimit: facts.dailyTokenLimit,
  };
}

function resolveProductFeatureId(featureKey?: string | null, callType?: string): string | null {
  const aiId = resolveFeatureId({ feature: featureKey, callType });
  const fromAi = productFeatureIdForAiFeature(aiId);
  if (fromAi) return fromAi;
  if (featureKey) {
    return productFeatureIdForAiFeature(featureKey) ?? featureKey;
  }
  return null;
}

async function tokensUsedTodayUtc(userId: number): Promise<number> {
  const mem = tokensUsedUtcDay(userId);
  try {
    const db = await getDb();
    if (!db) return mem;
    const start = utcUsageDayStart();
    const rows = await db
      .select({
        tokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.eventCategory, "llm"),
          eq(usageEvents.userId, String(userId)),
          gte(usageEvents.createdAt, start),
        ),
      );
    const persisted = Number(rows[0]?.tokens ?? 0);
    return Math.max(mem, Number.isFinite(persisted) ? persisted : 0);
  } catch {
    return mem;
  }
}

export async function evaluateLlmAccess(opts: {
  userId: number;
  user?: Pick<User, "id" | "openId" | "email" | "role"> | null;
  featureKey?: string | null;
  callType?: string;
}): Promise<AiAccessDecision> {
  const user = opts.user ?? (await getUserById(opts.userId)) ?? null;
  const isOwner = isOwnerAccount(user);
  const policy = isOwner
    ? {
        allowed: true as const,
        tokenBudgetMultiplier: 1,
        dailyTokenLimit: null as number | null,
        reason: undefined as string | undefined,
      }
    : await evaluateAiPolicy(opts.userId);

  const accountDenied = !policy.allowed;
  let accountCode: "SUSPENDED" | "AI_DISABLED" = "AI_DISABLED";
  if (accountDenied && !isOwner) {
    const ctrl = await getAccountControl(opts.userId);
    accountCode = ctrl?.status === "suspended" ? "SUSPENDED" : "AI_DISABLED";
  }

  let featureDenied = false;
  let featureCode: "FEATURE_DISABLED" | "MAINTENANCE" | "RESTRICTED" = "RESTRICTED";
  let featureReason: string | undefined;
  const productId = resolveProductFeatureId(opts.featureKey, opts.callType);
  if (productId) {
    const ov = await getFeatureOverride(productId);
    const feature = isFeatureAllowedForUser(ov, user);
    if (!feature.allowed) {
      featureDenied = true;
      featureCode = ov && !ov.enabled ? "FEATURE_DISABLED" : ov?.maintenance ? "MAINTENANCE" : "RESTRICTED";
      featureReason = feature.reason;
    }
  }

  const rl = checkRateLimit({
    userId: opts.userId,
    callType: opts.callType ?? "advisor",
    isAdmin: user?.role === "admin" || isOwner,
    tokenBudgetMultiplier: isOwner ? 1 : policy.tokenBudgetMultiplier,
    dailyTokenLimit: null,
  });

  const tokensUsedToday = await tokensUsedTodayUtc(opts.userId);
  const dailyCap = decideDailyTokenLimit({
    isOwner,
    dailyTokenLimit: policy.dailyTokenLimit,
    tokensUsedToday,
  });

  return resolveAiAccessDecision({
    isOwner,
    accountDenied,
    accountCode,
    accountReason: policy.reason,
    featureDenied,
    featureCode,
    featureReason,
    rateLimitDenied: !rl.allowed,
    rateLimitReason: rl.reason,
    dailyTokenDenied: !dailyCap.allowed,
    dailyTokenReason: dailyCap.reason,
    tokenBudgetMultiplier: isOwner ? 1 : policy.tokenBudgetMultiplier,
    dailyTokenLimit: isOwner ? null : (policy.dailyTokenLimit ?? null),
  });
}
