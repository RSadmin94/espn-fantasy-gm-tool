/**
 * Grounding helpers for template commentary — conservative connective allowlist only.
 * Factual tokens must appear in permittedClaims or the approved subject fallback.
 */

/** Non-factual connective language permitted outside claim text. Review before expanding. */
export const GROUNDING_CONNECTIVE_ALLOWLIST = new Set([
  // articles
  "a",
  "an",
  "the",
  // conjunctions
  "and",
  "or",
  "but",
  // prepositions
  "at",
  "in",
  "of",
  "to",
  "for",
  "with",
  "by",
  "from",
  // fixed structural fragments (matched as phrases in assertCommentaryGrounded)
  "at pick",
  "in round",
  "—",
]);

export type SubjectFallback = {
  ownerName: string;
  playerName: string;
  position: string;
  overallPick: number;
  round: number;
  /** Round-within-draft pick (for draft-slot notation e.g. 1.12). */
  roundPick?: number;
  /** League team count — used to derive round pick when omitted. */
  teamCount?: number;
};

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

function claimVocabulary(permittedClaims: string[]): Set<string> {
  const vocab = new Set<string>();
  for (const claim of permittedClaims) {
    for (const raw of claim.split(/\s+/)) {
      const t = normalizeToken(raw);
      if (t) vocab.add(t);
    }
  }
  return vocab;
}

function subjectVocabulary(subject: SubjectFallback): Set<string> {
  const vocab = new Set<string>();
  const addPhrase = (phrase: string) => {
    for (const raw of phrase.split(/\s+/)) {
      const t = normalizeToken(raw);
      if (t) vocab.add(t);
    }
  };
  addPhrase(subject.ownerName);
  addPhrase(subject.playerName);
  addPhrase(subject.position);
  vocab.add(String(subject.overallPick));
  vocab.add(String(subject.round));
  return vocab;
}

/**
 * Assert every content-bearing token in commentary text is licensed by permittedClaims
 * or the approved subject fallback. Connective allowlist tokens are exempt.
 */
export function assertCommentaryGrounded(
  text: string,
  permittedClaims: string[],
  subject: SubjectFallback,
): void {
  const licensed = new Set([...claimVocabulary(permittedClaims), ...subjectVocabulary(subject)]);
  const lower = text.toLowerCase();

  // Fixed multi-word connective fragments — strip before token scan
  let scanText = lower;
  for (const fragment of ["at pick", "in round", "—"]) {
    scanText = scanText.split(fragment).join(" ");
  }

  const tokens = scanText.split(/\s+/).map(normalizeToken).filter(Boolean);
  const violations: string[] = [];

  for (const token of tokens) {
    if (GROUNDING_CONNECTIVE_ALLOWLIST.has(token)) continue;
    if (licensed.has(token)) continue;
    violations.push(token);
  }

  if (violations.length > 0) {
    throw new Error(`Unlicensed factual tokens in commentary: ${violations.join(", ")}`);
  }
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
