/**
 * RFSN-009A — Intent Language Audit.
 * Post-generation filter on produced lines. Does not change generation logic.
 * Prefer suppress over incorrect commentary.
 *
 * Backlog (no code in Phase 1):
 * - RFSN-009B Advanced Intent Modeling — relax only when measured intent signals exist
 * - RFSN-008 — (logged for sequencing; not implemented here)
 */

export type IntentAuditPass = { ok: true; flagged: [] };
export type IntentAuditFail = { ok: false; flagged: string[] };
export type IntentAuditResult = IntentAuditPass | IntentAuditFail;

/**
 * Word-boundary, case-insensitive claims of intent / internal state we cannot prove.
 * RFSN-009B (measured intent) is deferred — do not relax this list here.
 */
export const INTENT_FLAGGED_PHRASES: readonly string[] = [
  "wanted",
  "targeting",
  "targeted",
  "hoped",
  "planned",
  "revenge",
  "scared",
  "afraid",
  "regretted",
  "knew he would",
  "knew she would",
  "knew they would",
  "was trying to spite",
  "out of fear",
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build once — phrase list is fixed for Phase 1. */
const INTENT_PATTERN = new RegExp(
  `\\b(?:${INTENT_FLAGGED_PHRASES.map(escapeRegExp).join("|")})\\b`,
  "gi",
);

/**
 * Scan a produced line for forbidden intent / internal-state language.
 */
export function auditIntentLanguage(line: string): IntentAuditResult {
  const text = String(line ?? "");
  if (!text.trim()) return { ok: true, flagged: [] };

  const flagged: string[] = [];
  const seen = new Set<string>();
  INTENT_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INTENT_PATTERN.exec(text)) != null) {
    const phrase = m[0].toLowerCase();
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    flagged.push(phrase);
  }

  if (flagged.length === 0) return { ok: true, flagged: [] };
  return { ok: false, flagged };
}

export type IntentAuditAction = "pass" | "suppress" | "regenerate";

/**
 * Decide action for a generated line.
 * Default on flag: suppress. Caller may request one regenerate if orchestrator supports retry.
 */
export function intentAuditAction(
  line: string,
  opts: { allowRegenerate?: boolean; alreadyRegenerated?: boolean } = {},
): { action: IntentAuditAction; audit: IntentAuditResult } {
  const audit = auditIntentLanguage(line);
  if (audit.ok) return { action: "pass", audit };
  if (opts.allowRegenerate && !opts.alreadyRegenerated) {
    return { action: "regenerate", audit };
  }
  return { action: "suppress", audit };
}
