import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiPolicyFromControl } from "./accountControls";

describe("AI usage policy", () => {
  it("allows NORMAL / no control row", () => {
    expect(aiPolicyFromControl(null)).toEqual({ allowed: true, tokenBudgetMultiplier: 1, dailyTokenLimit: null });
    expect(aiPolicyFromControl({ status: "active", aiDisabled: false })).toEqual({
      allowed: true,
      tokenBudgetMultiplier: 1,
      dailyTokenLimit: null,
    });
  });

  it("allows WATCH without changing the budget", () => {
    expect(aiPolicyFromControl({ status: "watched", aiDisabled: false })).toEqual({
      allowed: true,
      tokenBudgetMultiplier: 1,
      dailyTokenLimit: null,
    });
  });

  it("throttles THROTTLED and RESTRICTED to 20% of the daily budget", () => {
    expect(aiPolicyFromControl({ status: "throttled", aiDisabled: false })).toEqual({
      allowed: true,
      tokenBudgetMultiplier: 0.2,
      dailyTokenLimit: null,
    });
    expect(aiPolicyFromControl({ status: "restricted", aiDisabled: false })).toEqual({
      allowed: true,
      tokenBudgetMultiplier: 0.2,
      dailyTokenLimit: null,
    });
  });

  it("denies AI_DISABLED and SUSPENDED", () => {
    expect(aiPolicyFromControl({ status: "active", aiDisabled: true })).toMatchObject({
      allowed: false,
      tokenBudgetMultiplier: 0,
    });
    expect(aiPolicyFromControl({ status: "suspended", aiDisabled: false })).toMatchObject({
      allowed: false,
      tokenBudgetMultiplier: 0,
    });
  });
});

describe("denied mutations do not write success audit rows", () => {
  it("runs ownerProtectionCheck and throws before writeAdminAudit in setAccountControl", () => {
    const src = readFileSync(new URL("./accountControls.ts", import.meta.url), "utf8");
    const start = src.indexOf("export async function setAccountControl");
    const end = src.indexOf("export async function setUserRole");
    const fn = src.slice(start, end);
    const protectIdx = fn.indexOf("ownerProtectionCheck");
    const throwIdx = fn.indexOf("if (!protection.allowed)");
    const auditIdx = fn.indexOf("writeAdminAudit");
    expect(protectIdx).toBeGreaterThan(0);
    expect(throwIdx).toBeGreaterThan(protectIdx);
    expect(auditIdx).toBeGreaterThan(throwIdx);
  });
});
