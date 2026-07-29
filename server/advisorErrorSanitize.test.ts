import { describe, expect, it, vi, beforeEach } from "vitest";
import { isAdvisorSqlLeakMessage, sanitizeAdvisorClientError } from "./advisorErrorSanitize";
import { isMissingTableError } from "./optionalEnrichmentTable";

describe("sanitizeAdvisorClientError", () => {
  it("strips Drizzle Failed query SQL from client messages", () => {
    const raw =
      "Failed query: select `id`, `userId`, `riskTolerance` from `user_memory` where `user_memory`.`userId` = ? limit ?\nparams: 1,1";
    expect(isAdvisorSqlLeakMessage(raw)).toBe(true);
    const safe = sanitizeAdvisorClientError(new Error(raw));
    expect(safe).not.toMatch(/Failed query/i);
    expect(safe).not.toMatch(/user_memory/);
    expect(safe).not.toMatch(/params:/i);
    expect(safe).toMatch(/temporarily unavailable/i);
  });

  it("preserves rate-limit and trial messages", () => {
    expect(sanitizeAdvisorClientError(new Error("Rate limit exceeded"))).toMatch(/Rate limit/i);
    expect(sanitizeAdvisorClientError(new Error("Your free trial has ended"))).toMatch(/trial/i);
  });
});

describe("isMissingTableError for user_memory", () => {
  it("detects ER_NO_SUCH_TABLE on cause chain (Drizzle wrapper)", () => {
    const cause = Object.assign(new Error("Table 'app.user_memory' doesn't exist"), {
      code: "ER_NO_SUCH_TABLE",
      errno: 1146,
      sqlMessage: "Table 'app.user_memory' doesn't exist",
    });
    const wrapped = Object.assign(new Error("Failed query: select `id` from `user_memory`"), { cause });
    expect(isMissingTableError(wrapped)).toBe(true);
  });
});
