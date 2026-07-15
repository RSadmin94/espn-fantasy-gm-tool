import { describe, it, expect } from "vitest";
import { DeepSeekEntailmentChecker, type DeepSeekCheckStatus } from "./deepseekEntailmentChecker";
import { SofiaProviderError, type SofiaModelProvider, type SofiaProviderErrorKind } from "./modelProvider";
import { runShadow, summarizeShadow, type ShadowItem } from "./deepseekShadowRunner";
import type { SubjectFallback } from "./sofiaDeterministicValidation";

// ── Test doubles — live in the test file, never in the runtime provider module ──
function mockProvider(behavior: string | (() => never)): SofiaModelProvider {
  return {
    async complete() {
      if (typeof behavior === "function") return behavior();
      return behavior;
    },
  };
}
const jsonProvider = (decision: string, confidence: unknown = 0.9, reason = "ok"): SofiaModelProvider =>
  mockProvider(JSON.stringify({ decision, confidence, reason }));
const throwingProvider = (kind: SofiaProviderErrorKind): SofiaModelProvider =>
  mockProvider(() => {
    throw new SofiaProviderError(kind, "sanitized message");
  });

const claims = ["Mark Deroux beat Rod Sellers 4 times."];
const subject: SubjectFallback = { ownerName: "Mark Deroux", playerName: "Rod Sellers", position: "NA", overallPick: 0, round: 0 };
const input = (sentence: string) => ({ sentence, claims, subject });

describe("DeepSeekEntailmentChecker — verdict mapping (mock model)", () => {
  it("maps a valid entailment", async () => {
    const c = new DeepSeekEntailmentChecker(jsonProvider("entail"));
    const d = await c.checkDetailed(input("Mark Deroux has beaten Rod Sellers four times."));
    expect(d.decision).toBe("entail");
    expect(d.status).toBe("success");
    expect(await c.check(input("x"))).toBe("entail");
  });

  it("maps a contradiction (e.g. subject-object inversion, wrong owner/player/number/year)", async () => {
    const c = new DeepSeekEntailmentChecker(jsonProvider("contradict"));
    expect((await c.checkDetailed(input("Rod Sellers beat Mark Deroux four times."))).decision).toBe("contradict");
  });

  it("maps an unsupported addition (emotion / motivation / prediction) to neutral", async () => {
    const c = new DeepSeekEntailmentChecker(jsonProvider("neutral"));
    expect((await c.checkDetailed(input("Mark Deroux was thrilled to beat Rod four times."))).decision).toBe("neutral");
  });

  it("passes a dull-but-true persona control (never punishes boring)", async () => {
    const c = new DeepSeekEntailmentChecker(jsonProvider("entail"));
    expect((await c.checkDetailed(input("Record: Mark Deroux 4 wins over Rod Sellers."))).decision).toBe("entail");
  });

  it("treats confidence as telemetry: clamps to [0,1], nulls non-numbers, never alters the decision", async () => {
    expect((await new DeepSeekEntailmentChecker(jsonProvider("entail", 1.5)).checkDetailed(input("x"))).confidence).toBe(1);
    expect((await new DeepSeekEntailmentChecker(jsonProvider("entail", -0.4)).checkDetailed(input("x"))).confidence).toBe(0);
    expect((await new DeepSeekEntailmentChecker(jsonProvider("entail", "high")).checkDetailed(input("x"))).confidence).toBeNull();
  });

  it("strips markdown fences before parsing", async () => {
    const c = new DeepSeekEntailmentChecker(mockProvider('```json\n{"decision":"contradict","confidence":0.8,"reason":"x"}\n```'));
    expect((await c.checkDetailed(input("x"))).decision).toBe("contradict");
  });
});

describe("DeepSeekEntailmentChecker — fails closed (never reports a failed call as a real judgment)", () => {
  const failureCases: Array<[string, SofiaModelProvider, DeepSeekCheckStatus]> = [
    ["missing key / config", throwingProvider("configuration_error"), "configuration_error"],
    ["timeout", throwingProvider("timeout"), "timeout"],
    ["provider error", throwingProvider("provider_error"), "provider_error"],
    ["empty response", throwingProvider("empty_response"), "empty_response"],
    ["unparseable body", mockProvider("this is not json"), "parse_error"],
    ["out-of-enum decision", mockProvider(JSON.stringify({ decision: "maybe", confidence: 0.5 })), "invalid_decision"],
  ];

  for (const [name, provider, expectedStatus] of failureCases) {
    it(`${name} -> neutral with status ${expectedStatus}`, async () => {
      const d = await new DeepSeekEntailmentChecker(provider).checkDetailed(input("x"));
      expect(d.decision).toBe("neutral");
      expect(d.status).toBe(expectedStatus);
      expect(d.status).not.toBe("success"); // adjustment #1: a failure is never a success
      expect(d.confidence).toBeNull();
    });
  }

  it("check() collapses every failure to neutral for the frozen interface", async () => {
    for (const [, provider] of failureCases) {
      expect(await new DeepSeekEntailmentChecker(provider).check(input("x"))).toBe("neutral");
    }
  });
});

describe("shadow runner (injected mock checker)", () => {
  const items: ShadowItem[] = [
    { id: "s1", commentary: "Mark Deroux beat Rod Sellers 4 times.", claims, expected: "entail" },
    { id: "s2", commentary: "Rod Sellers beat Mark Deroux 4 times.", claims, expected: "contradict" },
    { id: "s3", commentary: "Mark Deroux selected Rod at pick 89.", claims, subject, expected: "neutral" }, // has subject -> deterministic runs
  ];

  it("produces a full result per item and a correct summary", async () => {
    const checker = new DeepSeekEntailmentChecker(jsonProvider("neutral")); // oracle returns neutral for all
    const results = await runShadow(items, checker);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "success")).toBe(true);
    // s3 has a subject, so deterministic ran (pass or fail); s1/s2 have none -> skipped
    expect(results.find((r) => r.id === "s3")!.deterministicResult).not.toBe("skipped");
    expect(results.find((r) => r.id === "s1")!.deterministicResult).toBe("skipped");

    const summary = summarizeShadow(results);
    expect(summary.total).toBe(3);
    expect(summary.succeeded).toBe(3);
    expect(summary.evaluated).toBe(3);
    expect(summary.matched).toBe(1); // only s3 expected neutral, and the oracle returned neutral
    expect(summary.mismatches.map((m) => m.id).sort()).toEqual(["s1", "s2"]);
    expect(summary.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records failure status without crashing the run", async () => {
    const checker = new DeepSeekEntailmentChecker(throwingProvider("timeout"));
    const results = await runShadow(items, checker);
    expect(results.every((r) => r.status === "timeout" && r.semanticResult === "neutral")).toBe(true);
    expect(summarizeShadow(results).failed).toBe(3);
  });
});
