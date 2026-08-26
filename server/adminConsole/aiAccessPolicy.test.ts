import { describe, expect, it } from "vitest";
import { decideDailyTokenLimit, resolveAiAccessDecision } from "./aiAccessPolicy";
import { isFeatureAllowedForUser } from "./featureFlags";
import type { AdminFeatureOverride } from "../../drizzle/schema";

const regular = { openId: "user_regular", email: "a@b.com", role: "user" as const };
const admin = { openId: "user_admin", email: "admin@b.com", role: "admin" as const };
const owner = {
  openId: "user_owner_x",
  email: "owner@b.com",
  role: "owner" as const,
};

function ov(partial: Partial<AdminFeatureOverride>): AdminFeatureOverride {
  return {
    featureId: "advisor",
    enabled: true,
    maintenance: false,
    restrictTo: "none",
    updatedAt: new Date(),
    ...partial,
  };
}

describe("dailyTokenLimit (UTC day)", () => {
  it("allows when no daily limit is set", () => {
    expect(decideDailyTokenLimit({ isOwner: false, dailyTokenLimit: null, tokensUsedToday: 80_000 }).allowed).toBe(
      true,
    );
  });

  it("allows when usage is below the daily limit", () => {
    expect(decideDailyTokenLimit({ isOwner: false, dailyTokenLimit: 1000, tokensUsedToday: 999 }).allowed).toBe(true);
  });

  it("denies when usage is exactly at the daily limit", () => {
    expect(decideDailyTokenLimit({ isOwner: false, dailyTokenLimit: 1000, tokensUsedToday: 1000 }).allowed).toBe(false);
  });

  it("denies when usage is over the daily limit", () => {
    expect(decideDailyTokenLimit({ isOwner: false, dailyTokenLimit: 1000, tokensUsedToday: 1001 }).allowed).toBe(false);
  });

  it("does not apply the daily limit to the application owner", () => {
    expect(decideDailyTokenLimit({ isOwner: true, dailyTokenLimit: 1, tokensUsedToday: 50_000 }).allowed).toBe(true);
  });
});

describe("restrictTo at the policy boundary", () => {
  it("NORMAL feature allows a normal user", () => {
    expect(isFeatureAllowedForUser(ov({ restrictTo: "none" }), regular).allowed).toBe(true);
  });

  it("OWNER-only feature denies normal and admin users, allows owner", () => {
    const ownerOnly = ov({ restrictTo: "owner" });
    expect(isFeatureAllowedForUser(ownerOnly, regular).allowed).toBe(false);
    expect(isFeatureAllowedForUser(ownerOnly, admin).allowed).toBe(false);
    expect(isFeatureAllowedForUser(ownerOnly, owner).allowed).toBe(true);
  });

  it("ADMIN restrictTo allows admin and owner, denies normal users", () => {
    const adminOnly = ov({ restrictTo: "admin" });
    expect(isFeatureAllowedForUser(adminOnly, regular).allowed).toBe(false);
    expect(isFeatureAllowedForUser(adminOnly, admin).allowed).toBe(true);
    expect(isFeatureAllowedForUser(adminOnly, owner).allowed).toBe(true);
  });
});

describe("policy precedence", () => {
  const base = {
    isOwner: false,
    accountDenied: false,
    accountCode: "AI_DISABLED" as const,
    featureDenied: false,
    featureCode: "RESTRICTED" as const,
    rateLimitDenied: false,
    dailyTokenDenied: false,
    tokenBudgetMultiplier: 1,
    dailyTokenLimit: 1000 as number | null,
  };

  it("SUSPENDED wins over feature, rate limit, and daily token denials", () => {
    const d = resolveAiAccessDecision({
      ...base,
      accountDenied: true,
      accountCode: "SUSPENDED",
      featureDenied: true,
      rateLimitDenied: true,
      dailyTokenDenied: true,
    });
    expect(d.code).toBe("SUSPENDED");
    expect(d.allowed).toBe(false);
  });

  it("feature restrictTo wins over rate limit and daily token denials", () => {
    const d = resolveAiAccessDecision({
      ...base,
      featureDenied: true,
      featureCode: "RESTRICTED",
      rateLimitDenied: true,
      dailyTokenDenied: true,
    });
    expect(d.code).toBe("RESTRICTED");
  });

  it("rate limit wins over daily token limit", () => {
    const d = resolveAiAccessDecision({
      ...base,
      rateLimitDenied: true,
      dailyTokenDenied: true,
    });
    expect(d.code).toBe("RATE_LIMIT");
  });

  it("daily token limit denies when stronger restrictions are clear", () => {
    const d = resolveAiAccessDecision({
      ...base,
      dailyTokenDenied: true,
    });
    expect(d.code).toBe("DAILY_TOKEN_LIMIT");
    expect(d.allowed).toBe(false);
  });

  it("allows when no restriction applies", () => {
    expect(resolveAiAccessDecision(base).code).toBe("ALLOW");
  });

  it("owner skips account and daily-token denials but still honors feature blocks", () => {
    expect(
      resolveAiAccessDecision({
        ...base,
        isOwner: true,
        accountDenied: true,
        accountCode: "SUSPENDED",
        dailyTokenDenied: true,
      }).code,
    ).toBe("ALLOW");
    expect(
      resolveAiAccessDecision({
        ...base,
        isOwner: true,
        featureDenied: true,
        featureCode: "FEATURE_DISABLED",
      }).code,
    ).toBe("FEATURE_DISABLED");
  });
});
