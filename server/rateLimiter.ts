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

/** Max LLM tokens per user per day (rolling 24h window) */
const DAILY_TOKEN_BUDGET = 50_000;

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
const dailyUsage = new Map<number, DailyUsageEntry>(); // key: userId

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
}): { allowed: boolean; reason?: string } {
  const { userId, callType, isAdmin = false } = opts;
  const multiplier = isAdmin ? ADMIN_MULTIPLIER : 1;
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

  // 2. Daily token budget check
  const dailyBudget = DAILY_TOKEN_BUDGET * multiplier;
  const usage = dailyUsage.get(userId);
  const windowStart = now - 24 * 60 * 60 * 1000;
  if (usage && usage.windowStart > windowStart) {
    if (usage.tokensUsed >= dailyBudget) {
      return { allowed: false, reason: "Daily AI usage limit reached. Resets in 24 hours." };
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

  // Update daily usage
  const windowStart = now - 24 * 60 * 60 * 1000;
  const existing = dailyUsage.get(userId);
  if (!existing || existing.windowStart <= windowStart) {
    // Start fresh window
    dailyUsage.set(userId, { windowStart: now, tokensUsed });
  } else {
    existing.tokensUsed += tokensUsed;
  }
}

/**
 * Reset all rate limiter state. Only for use in tests.
 */
export function resetRateLimiter(): void {
  cooldowns.clear();
  dailyUsage.clear();
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
