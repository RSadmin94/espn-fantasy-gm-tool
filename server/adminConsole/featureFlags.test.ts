import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isFeatureAllowedForUser } from "./featureFlags";
import { productFeatureIdForAiFeature } from "./productFeatures";
import type { AdminFeatureOverride } from "../../drizzle/schema";

const regular = {
  openId: "user_regular",
  email: "regular@example.com",
  role: "user" as const,
};

function override(partial: Partial<AdminFeatureOverride>): AdminFeatureOverride {
  return {
    featureId: "advisor",
    enabled: true,
    maintenance: false,
    restrictTo: "none",
    updatedAt: new Date(),
    ...partial,
  };
}

describe("feature overrides", () => {
  it("allows a feature with no override", () => {
    expect(isFeatureAllowedForUser(null, regular).allowed).toBe(true);
  });

  it("blocks disabled and maintenance for normal users", () => {
    expect(isFeatureAllowedForUser(override({ enabled: false }), regular).allowed).toBe(false);
    expect(isFeatureAllowedForUser(override({ maintenance: true }), regular).allowed).toBe(false);
  });

  it("maps Advisor LLM feature ids onto the product feature id", () => {
    expect(productFeatureIdForAiFeature("ADVISOR")).toBe("advisor");
  });
});

describe("LLM feature-control contract", () => {
  it("routes invokeLLM through evaluateLlmAccess so restrictTo is enforced server-side", () => {
    const src = readFileSync(new URL("../_core/llm.ts", import.meta.url), "utf8");
    const start = src.indexOf("async function enforceUsageGuards");
    const end = src.indexOf("export async function invokeLLM");
    const guard = src.slice(start, end);
    expect(guard).toContain("evaluateLlmAccess");
    expect(guard).toContain("featureKey");
  });
});
