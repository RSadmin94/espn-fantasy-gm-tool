/**
 * Speech-only normalization for TTS.
 * Displayed commentary text must remain unchanged — normalize only the string
 * sent to the TTS provider.
 */

const SPEECH_EXPANSIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Longer / multi-letter first so they win over single-letter rules.
  [/\bD\/ST\b/gi, "defense"],
  [/\bDST\b/gi, "defense"],
  [/\bDEF\b/gi, "defense"],
  [/\bQB\b/gi, "quarterback"],
  [/\bRB\b/gi, "running back"],
  [/\bWR\b/gi, "wide receiver"],
  [/\bTE\b/gi, "tight end"],
  [/\bDL\b/gi, "defensive lineman"],
  [/\bDE\b/gi, "defensive end"],
  [/\bDT\b/gi, "defensive tackle"],
  [/\bLB\b/gi, "linebacker"],
  [/\bCB\b/gi, "cornerback"],
  [/\bFS\b/gi, "free safety"],
  [/\bSS\b/gi, "strong safety"],
  [/\bK\b/gi, "kicker"],
  // Require S not immediately after an apostrophe (protects it's / he's / she's).
  [/(?<!['’])\bS\b/gi, "safety"],
];

/** ASCII apostrophe contractions — leave these untouched for Kokoro lexicon hits. */
const CONTRACTION_TOKENS = new Set([
  "ain't",
  "aren't",
  "can't",
  "couldn't",
  "didn't",
  "doesn't",
  "don't",
  "hadn't",
  "hasn't",
  "haven't",
  "he'd",
  "he'll",
  "he's",
  "here's",
  "how'd",
  "how'll",
  "how's",
  "i'd",
  "i'll",
  "i'm",
  "i've",
  "isn't",
  "it'd",
  "it'll",
  "it's",
  "let's",
  "mightn't",
  "mustn't",
  "needn't",
  "oughtn't",
  "shan't",
  "she'd",
  "she'll",
  "she's",
  "shouldn't",
  "that'd",
  "that'll",
  "that's",
  "there'd",
  "there'll",
  "there's",
  "they'd",
  "they'll",
  "they're",
  "they've",
  "wasn't",
  "we'd",
  "we'll",
  "we're",
  "we've",
  "weren't",
  "what'd",
  "what'll",
  "what're",
  "what's",
  "what've",
  "where'd",
  "where's",
  "who'd",
  "who'll",
  "who's",
  "who've",
  "won't",
  "wouldn't",
  "you'd",
  "you'll",
  "you're",
  "you've",
]);

/** Fold typographic apostrophes Kokoro often tokenizes as punctuation. */
export function normalizeApostrophesForTts(text: string): string {
  return text.replace(/[\u2018\u2019\u201B\u2032\u02BC]/g, "'");
}

function isContractionToken(token: string): boolean {
  return CONTRACTION_TOKENS.has(token.toLowerCase());
}

/**
 * Make possessives pronunciation-safe without scrubbing contractions.
 *
 * Kokoro (Misaki lexicon path) often mishandles `'s` / curly `’s` on names and
 * ordinary possessives. Prefer a light rewrite:
 *   Rod's roster  → the roster of Rod
 *   James' roster → the roster of James
 * while leaving don't / can't / it's / they're alone.
 */
export function normalizePossessivesForTts(text: string): string {
  let out = normalizeApostrophesForTts(text);

  // Plural / sibilant bare possessives: James' → James's (then of-form below).
  out = out.replace(/\b([A-Za-z]+)'(?![sS])(?=[\s.,:;!?]|$)/g, "$1's");

  // "X's Y" / "the X's Y" → "the Y of X" when X's is not a contraction.
  out = out.replace(
    /\b(?:the\s+)?([A-Za-z][A-Za-z']*)'s\s+([A-Za-z][A-Za-z'-]*)\b/gi,
    (full, owner: string, owned: string) => {
      const possessive = `${owner}'s`;
      if (isContractionToken(possessive)) return full;
      if (/^[a-z]/.test(owner)) {
        return `the ${owned} of the ${owner}`;
      }
      return `the ${owned} of ${owner}`;
    },
  );

  // Trailing / clause-final possessives: "… Collins's." → "… Collins."
  // Prefer dropping the possessive clitic so G2P speaks the base name cleanly.
  out = out.replace(/\b([A-Za-z][A-Za-z']*)'s\b(?=\s*[,.;:!?]|$)/g, (full, owner: string) => {
    if (isContractionToken(full)) return full;
    return owner;
  });

  return out;
}

/** Expand fantasy football position abbreviations into spoken forms for TTS. */
export function expandFootballAbbreviationsForTts(text: string): string {
  let out = text;
  for (const [pattern, spoken] of SPEECH_EXPANSIONS) {
    out = out.replace(pattern, spoken);
  }
  return out;
}

/** Full speech-only pipeline applied immediately before Kokoro synthesis. */
export function normalizeSpeechForTts(text: string): string {
  return expandFootballAbbreviationsForTts(normalizePossessivesForTts(text));
}
