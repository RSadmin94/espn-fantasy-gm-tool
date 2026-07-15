/**
 * Sofia Phase 2B — immutable semantic-evaluation prompt.
 *
 * The model's ENTIRE universe is: one commentary sentence + the permitted claims. Nothing else may be
 * passed — no routing, owner history, receipts, personality, storylines, budget, or DraftMoment. This
 * is enforced by the function signature (it accepts only sentence + claims).
 *
 * The model judges TRUTH, not quality. It must never be asked to assess entertainment, persona, or
 * style — that is the future Comparison Engine's job, on a separate axis.
 */

const SYSTEM_INSTRUCTION = `You are a strict fact-checking judge. You are given a STATEMENT and a list of PERMITTED CLAIMS.
Decide whether the STATEMENT is supported by the PERMITTED CLAIMS, using ONLY those claims as ground truth.

Rules:
- "entail": the statement's factual content is fully supported by the claims (paraphrase is fine).
- "contradict": the statement directly conflicts with a claim — wrong owner, wrong player, wrong number,
  wrong year, reversed subject/object (e.g. "A beat B" when the claim says "B beat A"), reversed direction,
  or dropped negation.
- "neutral": the statement adds something the claims neither support nor contradict — an emotion, a motive,
  an intent, a prediction, or any detail simply not present. Absence of evidence is NEUTRAL, never contradict.
- Judge only against the provided claims. Do not use outside knowledge.
- Reserve "contradict" for direct conflicts with the claims. Never mark unsupported additions as contradictions.

Respond with a single JSON object and nothing else:
{"decision":"entail|neutral|contradict","confidence":0.0,"reason":"brief justification"}
confidence is your certainty from 0 to 1. reason is one short sentence. No markdown, no prose outside the JSON.`;

export function buildEntailmentPrompt(sentence: string, claims: string[]): string {
  const claimBlock = claims.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `${SYSTEM_INSTRUCTION}

PERMITTED CLAIMS:
${claimBlock}

STATEMENT:
${sentence}

JSON:`;
}
