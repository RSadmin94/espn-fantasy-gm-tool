/**
 * Safe user-facing messages for GM Advisor failures.
 * Never forward raw SQL / Drizzle "Failed query" text to clients.
 */

export function isAdvisorSqlLeakMessage(message: string): boolean {
  const m = String(message ?? "");
  return (
    /Failed query/i.test(m) ||
    /select\s+`/i.test(m) ||
    /from\s+`user_memory`/i.test(m) ||
    /\bER_[A-Z_]+\b/.test(m) ||
    /\berrno\b/i.test(m) ||
    /sqlMessage/i.test(m) ||
    /params:\s*\d/i.test(m)
  );
}

/** Message safe to show in the Advisor UI / SSE error event. */
export function sanitizeAdvisorClientError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Unknown error");
  if (isAdvisorSqlLeakMessage(raw)) {
    return "Advisor is temporarily unavailable. Please try again in a moment.";
  }
  if (/rate limit/i.test(raw)) return raw;
  if (/trial/i.test(raw)) return raw;
  if (/TOO_MANY_REQUESTS/i.test(raw)) return "You've hit the rate limit. Please wait a moment before sending another message.";
  // Strip accidental SQL fragments from otherwise short messages
  if (raw.length > 280 || /`\w+`/.test(raw)) {
    return "Advisor is temporarily unavailable. Please try again in a moment.";
  }
  return raw || "Advisor is temporarily unavailable. Please try again in a moment.";
}
