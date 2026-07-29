/**
 * Safe user-facing messages for GM Advisor failures.
 * Never forward raw SQL / Drizzle "Failed query" text to clients.
 */

export type AdvisorErrorKind =
  | "sql"
  | "provider"
  | "permission"
  | "rate_limit"
  | "data"
  | "internal";

export function isAdvisorSqlLeakMessage(message: string): boolean {
  const m = String(message ?? "");
  return (
    /Failed query/i.test(m) ||
    /select\s+`/i.test(m) ||
    /from\s+`(?:user_memory|chat_history)`/i.test(m) ||
    /Table '[\w.]+' doesn't exist/i.test(m) ||
    /\bER_[A-Z_]+\b/.test(m) ||
    /\berrno\b/i.test(m) ||
    /sqlMessage/i.test(m) ||
    /params:\s*\d/i.test(m)
  );
}

export function classifyAdvisorError(err: unknown): AdvisorErrorKind {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (isAdvisorSqlLeakMessage(raw)) return "sql";
  if (/rate limit|TOO_MANY_REQUESTS/i.test(raw)) return "rate_limit";
  if (/trial|FORBIDDEN|UNAUTHORIZED|subscription|entitlement|not.*access/i.test(raw)) {
    return "permission";
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|provider|openai|anthropic|model/i.test(raw)) {
    return "provider";
  }
  if (/no draft|draft history|season.*not|missing.*data|could not find/i.test(raw)) {
    return "data";
  }
  return "internal";
}

/** Message safe to show in the Advisor UI / SSE error event. */
export function sanitizeAdvisorClientError(err: unknown): string {
  const kind = classifyAdvisorError(err);
  const raw = err instanceof Error ? err.message : String(err ?? "Unknown error");
  switch (kind) {
    case "sql":
      return "Advisor is temporarily unavailable. Please try again in a moment.";
    case "provider":
      return "The Advisor service is temporarily unavailable. Please try again shortly.";
    case "permission":
      if (/trial/i.test(raw)) return raw;
      return "Your account does not currently have access to GM Advisor.";
    case "rate_limit":
      return "You've hit the rate limit. Please wait a moment before sending another message.";
    case "data":
      return "I could not find enough draft history for the selected season.";
    default:
      if (raw.length > 280 || /`\w+`/.test(raw) || isAdvisorSqlLeakMessage(raw)) {
        return "Advisor is temporarily unavailable. Please try again in a moment.";
      }
      return raw || "Advisor is temporarily unavailable. Please try again in a moment.";
  }
}

/** Stable request id for server logs (not shown to users). */
export function newAdvisorRequestId(): string {
  return `adv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
