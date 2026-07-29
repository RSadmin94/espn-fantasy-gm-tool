import { describe, expect, it } from "vitest";
import {
  isAdvisorSqlLeakMessage,
  sanitizeAdvisorClientError,
  classifyAdvisorError,
  newAdvisorRequestId,
} from "./advisorErrorSanitize";
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

  it("strips missing chat_history table errors", () => {
    const raw =
      "Failed query: select `id` from `chat_history` where (`chat_history`.`userId` = ?)\nparams: 1\nTable 'railway.chat_history' doesn't exist";
    expect(isAdvisorSqlLeakMessage(raw)).toBe(true);
    expect(classifyAdvisorError(new Error(raw))).toBe("sql");
    const safe = sanitizeAdvisorClientError(new Error(raw));
    expect(safe).not.toMatch(/chat_history/);
    expect(safe).not.toMatch(/Failed query/i);
  });

  it("maps provider timeouts to a safe provider message", () => {
    expect(classifyAdvisorError(new Error("OpenAI timeout ETIMEDOUT"))).toBe("provider");
    expect(sanitizeAdvisorClientError(new Error("OpenAI timeout ETIMEDOUT"))).toMatch(
      /Advisor service is temporarily unavailable/i,
    );
  });

  it("maps permission errors distinctly", () => {
    expect(classifyAdvisorError(new Error("subscription required"))).toBe("permission");
    expect(sanitizeAdvisorClientError(new Error("subscription required"))).toMatch(
      /does not currently have access/i,
    );
  });

  it("preserves rate-limit and trial messages", () => {
    expect(sanitizeAdvisorClientError(new Error("Rate limit exceeded"))).toMatch(/Rate limit/i);
    expect(sanitizeAdvisorClientError(new Error("Your free trial has ended"))).toMatch(/trial/i);
  });

  it("creates stable request ids", () => {
    expect(newAdvisorRequestId()).toMatch(/^adv_/);
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
