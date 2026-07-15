/**
 * Sofia Phase 2A — Deterministic Validation.
 *
 * This module performs deterministic lexical and category validation.
 *
 * It does NOT establish semantic entailment. Subject-object relationships, negation scope,
 * comparative meaning, and equivalent paraphrases require a future model-backed EntailmentChecker.
 *
 * This module must not be described as closing the semantic-grounding problem. It proves that output
 * VOCABULARY, NUMBERS, and DIRECTIONAL POLARITY are consistent with the permitted claims — necessary,
 * but not sufficient, for semantic grounding of freely generated text.
 */
import { assertCommentaryGrounded, type SubjectFallback } from "./sofiaGrounding";

export type { SubjectFallback };

export interface DeterministicValidationResult {
  valid: boolean;
  tokenPass: boolean;
  numberPass: boolean;
  polarityPass: boolean;
  failures: Array<{ category: "token" | "number" | "polarity"; message: string }>;
}

/**
 * Directional opposite groups, restricted to the meaning the Draft Moment Engine actually emits.
 * NOTE (divergence from the illustrative spec list, on purpose): in draft-ADP context "past ADP"
 * (available later than ADP = steal) and "ahead of ADP" (drafted earlier = reach) are OPPOSITES, so
 * they sit on opposite sides here — the spec's list grouped them together, which would miss the most
 * important ADP inversion. Ambiguous words (over/above/higher/lower/under/below) are excluded to avoid
 * false positives. "beat"/"fell" are excluded because they are subject-object / context dependent.
 */
const POLARITY_GROUPS: Array<{ name: string; a: string[]; b: string[] }> = [
  { name: "adp_direction", a: ["past", "later", "after"], b: ["ahead", "before", "earlier", "reached", "reach"] },
  { name: "timing_extrema", a: ["earliest", "first"], b: ["latest", "last"] },
  { name: "outcome", a: ["defeated", "topped", "swept"], b: ["lost", "fell short"] },
];

const NUM_RE = /\d+(?:\.\d+)?/g;

function numbersIn(s: string): Set<string> {
  return new Set((s.match(NUM_RE) ?? []).map((n) => n.trim()));
}

function words(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(/\s+/).map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")).filter(Boolean),
  );
}

function polarityOf(text: string, group: { a: string[]; b: string[] }): "a" | "b" | null {
  const lower = text.toLowerCase();
  const w = words(text);
  const has = (t: string) => (t.includes(" ") ? lower.includes(t) : w.has(t));
  const hasA = group.a.some(has);
  const hasB = group.b.some(has);
  if (hasA && !hasB) return "a";
  if (hasB && !hasA) return "b";
  return null; // absent, or both sides present (ambiguous) -> no polarity assertion
}

/** Decimal-safe: split on whitespace AFTER sentence punctuation so 98.8 is not split. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function verifyDeterministicGrounding(
  text: string,
  permittedClaims: string[],
  subject: SubjectFallback,
): DeterministicValidationResult {
  const failures: DeterministicValidationResult["failures"] = [];

  // Layer 1 — token gate (Phase 1). Do not reimplement.
  let tokenPass = true;
  try {
    assertCommentaryGrounded(text, permittedClaims, subject);
  } catch (e) {
    tokenPass = false;
    failures.push({ category: "token", message: e instanceof Error ? e.message : String(e) });
  }

  // Layer 2 — exact-number validation.
  let numberPass = true;
  const licensedNumbers = numbersIn(permittedClaims.join(" "));
  licensedNumbers.add(String(subject.overallPick));
  licensedNumbers.add(String(subject.round));
  for (const n of numbersIn(text)) {
    if (!licensedNumbers.has(n)) {
      numberPass = false;
      failures.push({ category: "number", message: `unlicensed number: ${n}` });
    }
  }

  // Layer 3 — polarity consistency.
  let polarityPass = true;
  const claimText = permittedClaims.join(" ");
  for (const g of POLARITY_GROUPS) {
    const cp = polarityOf(claimText, g);
    const tp = polarityOf(text, g);
    if (cp && tp && cp !== tp) {
      polarityPass = false;
      failures.push({ category: "polarity", message: `polarity inversion: ${g.name}` });
    }
  }

  return { valid: tokenPass && numberPass && polarityPass, tokenPass, numberPass, polarityPass, failures };
}

// ── Entailment interface (model-backed later; async because a real checker calls an LLM) ──────────
export interface EntailmentChecker {
  check(input: {
    sentence: string;
    claims: string[];
    subject: SubjectFallback;
  }): Promise<"entail" | "neutral" | "contradict">;
}

/**
 * Deterministic placeholder. It is honest by construction: it can DISPROVE ("contradict") or be
 * UNCERTAIN ("neutral"), but it NEVER returns "entail" — lexical consistency is not semantic proof.
 * Only a future model-backed checker may return "entail".
 */
export const DeterministicEntailmentPlaceholder: EntailmentChecker = {
  async check({ sentence, claims, subject }) {
    const res = verifyDeterministicGrounding(sentence, claims, subject);
    return res.valid ? "neutral" : "contradict";
  },
};

/**
 * Known semantic-gap categories the deterministic layer cannot decide. These require the model-backed
 * EntailmentChecker. Exported so the eval harness and future work can reference them explicitly.
 */
export const KNOWN_SEMANTIC_GAPS = [
  "subject_object_inversion",
  "negation_scope",
  "comparison_direction",
  "causal_inference",
  "unsupported_motive",
  "semantic_paraphrase",
] as const;
export type KnownSemanticGap = (typeof KNOWN_SEMANTIC_GAPS)[number];
