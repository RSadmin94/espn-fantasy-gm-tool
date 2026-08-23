import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, recordUsage, resetRateLimiter } from "./rateLimiter";

describe("throttled AI budget at the rate-limiter boundary", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("allows a throttled user below 20% of the daily budget", () => {
    recordUsage({ userId: 42, callType: "advisor", tokensUsed: 9_000 });
    const rl = checkRateLimit({
      userId: 42,
      callType: "weekly_briefing",
      tokenBudgetMultiplier: 0.2,
    });
    expect(rl.allowed).toBe(true);
  });

  it("denies a throttled user at or above 20% of the daily budget", () => {
    recordUsage({ userId: 42, callType: "advisor", tokensUsed: 10_000 });
    const rl = checkRateLimit({
      userId: 42,
      callType: "weekly_briefing",
      tokenBudgetMultiplier: 0.2,
    });
    expect(rl.allowed).toBe(false);
    expect(rl.reason).toMatch(/Daily AI usage limit/i);
  });

  it("denies AI when the policy multiplier is 0", () => {
    const rl = checkRateLimit({
      userId: 42,
      callType: "advisor",
      tokenBudgetMultiplier: 0,
    });
    expect(rl.allowed).toBe(false);
  });

  it("enforces dailyTokenLimit on the UTC calendar day independently of throttle", () => {
    recordUsage({ userId: 7, callType: "advisor", tokensUsed: 500 });
    expect(
      checkRateLimit({ userId: 7, callType: "weekly_briefing", dailyTokenLimit: 1000 }).allowed,
    ).toBe(true);
    recordUsage({ userId: 7, callType: "advisor", tokensUsed: 500 });
    expect(
      checkRateLimit({ userId: 7, callType: "weekly_briefing", dailyTokenLimit: 1000 }).allowed,
    ).toBe(false);
  });
});
