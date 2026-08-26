/**
 * rateLimiter.ts
 *
 * Lightweight per-user in-memory rate limiter for LLM endpoints.
 * Uses a sliding window approach with two limits:
 *   1. Per-minute cooldown  — prevents rapid-fire requests
 *   2. Daily token budget   — prevents runaway cost
 *
 * Design decisions:
 *   - In-memory only (no Redis). Resets on server restart. Good enough for MVP.
 *   - Never throws — returns { allowed: boolean, reason?: string } so callers decide.
 *   - Owner (admin role) gets 5x limits by default.
 *   - All limits are configurable via constants below.
 */

// ─── Configuration ─────────────────────────────────────────────────────────

/** Minimum seconds between advisor/streaming calls per user */
const ADVISOR_COOLDOWN_SECONDS = 5;

/** Minimum seconds between war_room_agent calls per user */
const AGENT_COOLDOWN_SECONDS = 10;

/** Minimum seconds between weekly_briefing calls per user */
const BRIEFING_COOLDOWN_SECONDS = 30;

/** Max LLM tokens per user per UTC calendar day (default budget). */
export const DAILY_TOKEN_BUDGET = 50_000;

/** Daily token accounting uses the UTC calendar day (00:00–24:00 UTC). */
export const AI_USAGE_DAY_TIMEZONE = "UTC";

/** Admin users get this multiplier on all limits */
const ADMIN_MULTIPLIER = 5;

// ─── State ──────────────────────────────────────────────────────────────────

interface CooldownEntry {
  lastCallAt: number; // Unix ms
}

interface DailyUsageEntry {
  windowStart: number; // Unix ms
  tokensUsed: number;
}

const cooldowns = new Map<string, CooldownEntry>(); // key: `${userId}:${callType}`
const dailyUsage = new Map<number, DailyUsageEntry>(); // key: userId — rolling 24h throttle budget
const utcDayUsage = new Map<string, number>(); // key: `${userId}:${yyyy-mm-dd}` UTC calendar day

export function utcUsageDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcUsageDayStart(now = new Date()): Date {
  return new Date(`${utcUsageDayKey(now)}T00:00:00.000Z`);
}

export function tokensUsedUtcDay(userId: number, now = new Date()): number {
  return utcDayUsage.get(`${userId}:${utcUsageDayKey(now)}`) ?? 0;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCooldownSeconds(callType: string): number {
  if (callType === "war_room_agent") return AGENT_COOLDOWN_SECONDS;
  if (callType === "weekly_briefing" || callType === "retrospective") return BRIEFING_COOLDOWN_SECONDS;
  return ADVISOR_COOLDOWN_SECONDS; // advisor, chat, json_structured, fallback
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a user is allowed to make an LLM call.
 * Call this BEFORE invoking the LLM.
 */
export function checkRateLimit(opts: {
  userId: number;
  callType: string;
  isAdmin?: boolean;
  tokenBudgetMultiplier?: number;
  dailyTokenLimit?: number | null;
}): { allowed: boolean; reason?: string } {
  const { userId, callType, isAdmin = false, tokenBudgetMultiplier = 1, dailyTokenLimit } = opts;
  if (tokenBudgetMultiplier <= 0) {
    return { allowed: false, reason: "AI access is disabled for this account." };
  }
  const multiplier = (isAdmin ? ADMIN_MULTIPLIER : 1) * tokenBudgetMultiplier;
  const now = Date.now();

  // 1. Cooldown check
  const cooldownKey = `${userId}:${callType}`;
  const cooldownSecs = getCooldownSeconds(callType) / multiplier;
  const lastEntry = cooldowns.get(cooldownKey);
  if (lastEntry) {
    const elapsedSecs = (now - lastEntry.lastCallAt) / 1000;
    if (elapsedSecs < cooldownSecs) {
      const waitSecs = Math.ceil(cooldownSecs - elapsedSecs);
      return { allowed: false, reason: `Please wait ${waitSecs}s before sending another message.` };
    }
  }

  // 2. Rolling 24h throttle budget
  const dailyBudget = DAILY_TOKEN_BUDGET * multiplier;
  const usage = dailyUsage.get(userId);
  const windowStart = now - 24 * 60 * 60 * 1000;
  if (usage && usage.windowStart > windowStart) {
    if (usage.tokensUsed >= dailyBudget) {
      return { allowed: false, reason: "Daily AI usage limit reached. Resets in 24 hours." };
    }
  }

  // 3. Per-account UTC calendar-day cap
  if (dailyTokenLimit != null && dailyTokenLimit > 0) {
    const usedToday = tokensUsedUtcDay(userId, new Date(now));
    if (usedToday >= dailyTokenLimit) {
      return { allowed: false, reason: "Daily AI token limit reached. Resets at 00:00 UTC." };
    }
  }

  return { allowed: true };
}

/**
 * Record that a call was made. Call this AFTER the LLM responds.
 * Updates both the cooldown timestamp and the daily token counter.
 */
export function recordUsage(opts: {
  userId: number;
  callType: string;
  tokensUsed: number;
}): void {
  const { userId, callType, tokensUsed } = opts;
  const now = Date.now();

  // Update cooldown
  cooldowns.set(`${userId}:${callType}`, { lastCallAt: now });

  // Update rolling 24h usage
  const windowStart = now - 24 * 60 * 60 * 1000;
  const existing = dailyUsage.get(userId);
  if (!existing || existing.windowStart <= windowStart) {
    dailyUsage.set(userId, { windowStart: now, tokensUsed });
  } else {
    existing.tokensUsed += tokensUsed;
  }

  const dayKey = `${userId}:${utcUsageDayKey(new Date(now))}`;
  utcDayUsage.set(dayKey, (utcDayUsage.get(dayKey) ?? 0) + tokensUsed);
}

/**
 * Reset all rate limiter state. Only for use in tests.
 */
export function resetRateLimiter(): void {
  cooldowns.clear();
  dailyUsage.clear();
  utcDayUsage.clear();
}

/**
 * Get the current daily usage for a user (for display in the UI).
 */
export function getDailyUsage(userId: number): { tokensUsed: number; budget: number } {
  const windowStart = Date.now() - 24 * 60 * 60 * 1000;
  const usage = dailyUsage.get(userId);
  if (!usage || usage.windowStart <= windowStart) {
    return { tokensUsed: 0, budget: DAILY_TOKEN_BUDGET };
  }
  return { tokensUsed: usage.tokensUsed, budget: DAILY_TOKEN_BUDGET };
}
