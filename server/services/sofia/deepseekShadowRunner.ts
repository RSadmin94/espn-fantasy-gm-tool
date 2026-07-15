/**
 * Sofia Phase 2B — shadow runner. Measurement only: runs commentary through deterministic validation
 * and the model-backed entailment checker, and returns per-item results. It does NOT persist, expose
 * an endpoint, route, or alter any commentary. The checker is INJECTED (tests pass a mock-backed
 * checker; the untracked smoke passes a real DeepSeek-backed one) — nothing is instantiated globally.
 */
import { verifyDeterministicGrounding, type SubjectFallback } from "./sofiaDeterministicValidation";
import type { DeepSeekEntailmentChecker, DeepSeekCheckStatus } from "./deepseekEntailmentChecker";
import { ENTAILMENT_FIXTURES, type EntailmentFixture } from "./deepseekFixtures";

export interface ShadowItem {
  id: string;
  momentId?: string;
  commentary: string;
  claims: string[];
  subject?: SubjectFallback;
  expected?: "entail" | "neutral" | "contradict";
}

export interface ShadowResult {
  id: string;
  momentId: string | null;
  commentary: string;
  deterministicResult: "pass" | "fail" | "skipped";
  semanticResult: "entail" | "neutral" | "contradict";
  status: DeepSeekCheckStatus;
  confidence: number | null;
  reason: string | null;
  latencyMs: number;
  failures: string[];
  expected: "entail" | "neutral" | "contradict" | null;
  match: boolean | null;
}

export async function runShadow(
  items: ShadowItem[],
  checker: DeepSeekEntailmentChecker,
): Promise<ShadowResult[]> {
  const results: ShadowResult[] = [];
  for (const item of items) {
    let deterministicResult: ShadowResult["deterministicResult"] = "skipped";
    let failures: string[] = [];
    if (item.subject) {
      const det = verifyDeterministicGrounding(item.commentary, item.claims, item.subject);
      deterministicResult = det.valid ? "pass" : "fail";
      failures = det.failures.map((f) => `${f.category}: ${f.message}`);
    }

    const d = await checker.checkDetailed({
      sentence: item.commentary,
      claims: item.claims,
      subject: item.subject,
    });

    results.push({
      id: item.id,
      momentId: item.momentId ?? null,
      commentary: item.commentary,
      deterministicResult,
      semanticResult: d.decision,
      status: d.status,
      confidence: d.confidence,
      reason: d.reason,
      latencyMs: d.latencyMs,
      failures,
      expected: item.expected ?? null,
      match: item.expected ? d.decision === item.expected : null,
    });
  }
  return results;
}

export interface ShadowSummary {
  total: number;
  succeeded: number; // model call returned a real judgment
  failed: number; // fail-closed (any non-success status)
  matched: number; // semanticResult === expected (only where expected is set)
  evaluated: number; // items with an expected label
  avgLatencyMs: number;
  statusCounts: Record<string, number>;
  mismatches: Array<{ id: string; expected: string | null; got: string; status: string; commentary: string }>;
}

export function summarizeShadow(results: ShadowResult[]): ShadowSummary {
  const statusCounts: Record<string, number> = {};
  let latencyTotal = 0;
  let matched = 0;
  let evaluated = 0;
  const mismatches: ShadowSummary["mismatches"] = [];
  for (const r of results) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    latencyTotal += r.latencyMs;
    if (r.expected) {
      evaluated++;
      if (r.match) matched++;
      else mismatches.push({ id: r.id, expected: r.expected, got: r.semanticResult, status: r.status, commentary: r.commentary });
    }
  }
  const succeeded = results.filter((r) => r.status === "success").length;
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    matched,
    evaluated,
    avgLatencyMs: results.length ? Math.round(latencyTotal / results.length) : 0,
    statusCounts,
    mismatches,
  };
}

/** Convert the declared eval fixtures into shadow items (no subject -> deterministic skipped). */
export function fixturesToShadowItems(fixtures: EntailmentFixture[] = ENTAILMENT_FIXTURES): ShadowItem[] {
  return fixtures.map((f) => ({ id: f.id, commentary: f.sentence, claims: f.claims, expected: f.expected }));
}
