/**
 * Sofia Phase 2B — DeepSeek model-backed entailment checker.
 *
 * Responsibility: decide whether a commentary statement is SUPPORTED BY the permitted claims. Truth
 * only — never quality, persona, humor, or drama (those belong to the future Comparison Engine).
 *
 * FAILS CLOSED. `check()` (the frozen EntailmentChecker interface) collapses every failure to
 * "neutral" so nothing downstream breaks. `checkDetailed()` preserves WHY via `status`, so a failed
 * provider call is never mistaken for a genuine "neutral" judgment in the shadow data.
 *
 * The provider is INJECTED — this class never instantiates DeepSeek globally, so tests pass a mock and
 * the untracked smoke script passes a real DeepSeekProvider.
 */
import type { EntailmentChecker, SubjectFallback } from "./sofiaDeterministicValidation";
import { buildEntailmentPrompt } from "./deepseekPrompt";
import { type SofiaModelProvider, SofiaProviderError } from "./modelProvider";

export type DeepSeekCheckStatus =
  | "success"
  | "configuration_error"
  | "timeout"
  | "provider_error"
  | "empty_response"
  | "parse_error"
  | "invalid_decision";

export interface DetailedEntailmentResult {
  decision: "entail" | "neutral" | "contradict";
  confidence: number | null;
  reason: string | null;
  status: DeepSeekCheckStatus;
  latencyMs: number;
}

const DECISIONS = new Set(["entail", "neutral", "contradict"]);
const MAX_REASON_LEN = 400;

function stripFences(raw: string): string {
  return raw.replace(/```json\s*|\s*```/gi, "").trim();
}

/** A provider-error status maps to a fail-closed neutral result. */
function failClosed(status: DeepSeekCheckStatus, latencyMs: number): DetailedEntailmentResult {
  return { decision: "neutral", confidence: null, reason: null, status, latencyMs };
}

export class DeepSeekEntailmentChecker implements EntailmentChecker {
  constructor(private readonly provider: SofiaModelProvider) {}

  /** Frozen-interface method: verdict only. Any failure -> "neutral". */
  async check(input: { sentence: string; claims: string[]; subject: SubjectFallback }): Promise<
    "entail" | "neutral" | "contradict"
  > {
    return (await this.checkDetailed(input)).decision;
  }

  /** Rich result: distinguishes a real judgment from a failure via `status`. Never throws. */
  async checkDetailed(input: {
    sentence: string;
    claims: string[];
    subject?: SubjectFallback;
  }): Promise<DetailedEntailmentResult> {
    const started = Date.now();
    const prompt = buildEntailmentPrompt(input.sentence, input.claims);

    let raw: string;
    try {
      raw = await this.provider.complete(prompt);
    } catch (e) {
      const kind =
        e instanceof SofiaProviderError ? e.kind : ("provider_error" as const);
      return failClosed(kind, Date.now() - started);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      return failClosed("parse_error", Date.now() - started);
    }

    if (!parsed || typeof parsed !== "object" || !DECISIONS.has(parsed.decision)) {
      return failClosed("invalid_decision", Date.now() - started);
    }

    // confidence: telemetry only. Finite 0..1, else null. NEVER used to alter the decision here.
    let confidence: number | null = null;
    if (typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)) {
      confidence = Math.min(1, Math.max(0, parsed.confidence));
    }
    const reason =
      typeof parsed.reason === "string" ? parsed.reason.slice(0, MAX_REASON_LEN) : null;

    return {
      decision: parsed.decision,
      confidence,
      reason,
      status: "success",
      latencyMs: Date.now() - started,
    };
  }
}
