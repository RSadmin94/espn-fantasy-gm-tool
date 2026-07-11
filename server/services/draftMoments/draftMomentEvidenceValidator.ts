/**
 * Draft Moment Engine — evidence validator.
 *
 * The gate between receipts and any future LLM. It (1) builds permittedClaims from AVAILABLE
 * receipts only, (2) enforces identity scope, (3) blocks motive/emotion/award/injury/impact/future
 * language that no receipt supports, and (4) degrades invalid moments to a routine selection-only
 * object rather than throwing — a moment must never break the mock draft.
 */
import { FORBIDDEN_CLAIM_CATEGORIES, type DraftMoment, type DraftMomentReceipt } from "./draftMomentTypes";
import type { ResolvedOwner } from "./draftMomentIdentityService";

const FORBIDDEN_PATTERNS: Array<{ category: string; re: RegExp }> = [
  { category: "owner_emotion", re: /\b(panic|panick\w+|desperat\w+|terrified|scared|afraid|nervous|frustrat\w+|angry|excited|loves?|hates?)\b/i },
  { category: "owner_motivation", re: /\b(because he|because she|because they|trying to|wants? to|hoping|in order to|so that (he|she|they))\b/i },
  { category: "certainty", re: /\b(guaranteed|definitely|certainly|no doubt|lock|surefire|obviously)\b/i },
  { category: "future_outcome", re: /\b(will win|will lose|going to win|going to lose|championship|makes? the playoffs|cost(s|ed)? (him|her|them) the)\b/i },
  { category: "player_award", re: /\b(mvp|all[- ]?pro|pro bowl|rookie of the year|award)\b/i },
  { category: "player_injury", re: /\b(injur\w+|hurt|hamstring|acl|out for|questionable|doubtful)\b/i },
  { category: "prior_season_result", re: /\b(last (year|season) (he|she|they|it)|semifinals?|finals?|collapsed|eliminated)\b/i },
  { category: "rivalry_impact_unless_receipt", re: /\b(at the expense of|denies|steals from|hurts|costs|blocks) \w+/i },
];

export interface FinalizeInput {
  receipts: DraftMomentReceipt[];
  owner: ResolvedOwner;
}

export interface FinalizeResult {
  permittedClaims: string[];
  forbiddenClaimCategories: string[];
  validation: { valid: boolean; errors: string[]; warnings: string[] };
}

export function finalizeClaims(input: FinalizeInput): FinalizeResult {
  const { receipts, owner } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  const rivalryImpactAvailable = receipts.some((r) => r.id === "rivalryImpact" && r.status === "available");

  // candidate claims come ONLY from available receipts that carry a supportedClaim
  const candidates = receipts
    .filter((r) => r.status === "available" && typeof r.supportedClaim === "string" && r.supportedClaim.trim())
    .map((r) => ({ id: r.id, claim: (r.supportedClaim as string).trim() }));

  const permitted: string[] = [];
  for (const c of candidates) {
    // an unsupported/conflicting receipt can never back a claim (guaranteed by the filter above)
    // person-identity gate: person-level phrasing requires proven person scope
    const personLevel = /'s (earliest|latest)|\bhas drafted a\b/.test(c.claim) && !/^This franchise/.test(c.claim);
    if (personLevel && owner.identityScope !== "person") {
      errors.push(`claim '${c.id}' uses person-level language under franchise-only identity`);
      continue;
    }
    // forbidden-language scan (safety net — receipts should never produce these)
    let blocked = false;
    for (const { category, re } of FORBIDDEN_PATTERNS) {
      if (re.test(c.claim)) {
        // rivalry impact allowed only if an impact receipt is present
        if (category === "rivalry_impact_unless_receipt" && rivalryImpactAvailable) continue;
        errors.push(`claim '${c.id}' contains forbidden ${category} language`);
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    permitted.push(c.claim);
  }

  // NOTE: the identity receipt is the first candidate, so a valid selection claim is already first
  // in `permitted`. If it was blocked by the forbidden scan, the moment degrades — we never force it.
  const valid = errors.length === 0;
  return { permittedClaims: permitted, forbiddenClaimCategories: [...FORBIDDEN_CLAIM_CATEGORIES], validation: { valid, errors, warnings } };
}

/** Degrade any moment to a safe routine selection-only object (never throws). */
export function degradeToRoutine(moment: DraftMoment, reason: string): DraftMoment {
  const selection = `${moment.owner.ownerName} selected ${moment.player.playerName} (${moment.player.position}) at pick ${moment.overallPick}, round ${moment.round}.`;
  return {
    ...moment,
    signals: [],
    level: "routine",
    permittedClaims: [selection],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: false, maxSentences: 0, maxWords: 0 },
    validation: { valid: false, errors: [reason], warnings: moment.validation?.warnings ?? [] },
  };
}
