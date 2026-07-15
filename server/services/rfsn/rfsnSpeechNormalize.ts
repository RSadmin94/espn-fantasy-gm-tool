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
  // Require S not immediately after an apostrophe (protects leftover contractions).
  [/(?<!['’])\bS\b/gi, "safety"],
];

/**
 * Contractions Kokoro mishandles via apostrophe tokenization.
 * Expand to pronunciation-safe phrases BEFORE possessive of-forms run.
 *
 * Ambiguous 's / 'd / 've / 're forms default to the most common spoken reading
 * in draft commentary (is / would / have / are). We do not attempt "has" for he's /
 * she's unless a following participial cue clearly requires it.
 */
const CONTRACTION_EXPANSIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bwon't\b/gi, "will not"],
  [/\bcan't\b/gi, "cannot"],
  [/\bdon't\b/gi, "do not"],
  [/\bdoesn't\b/gi, "does not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bisn't\b/gi, "is not"],
  [/\baren't\b/gi, "are not"],
  [/\bwasn't\b/gi, "was not"],
  [/\bweren't\b/gi, "were not"],
  [/\bhaven't\b/gi, "have not"],
  [/\bhasn't\b/gi, "has not"],
  [/\bhadn't\b/gi, "had not"],
  [/\bcouldn't\b/gi, "could not"],
  [/\bwouldn't\b/gi, "would not"],
  [/\bshouldn't\b/gi, "should not"],
  [/\bmustn't\b/gi, "must not"],
  [/\bmightn't\b/gi, "might not"],
  [/\bneedn't\b/gi, "need not"],
  [/\bain't\b/gi, "is not"],
  [/\bshan't\b/gi, "shall not"],
  [/\blet's\b/gi, "let us"],
  [/\bthat's\b/gi, "that is"],
  [/\bwhat's\b/gi, "what is"],
  [/\bwhere's\b/gi, "where is"],
  [/\bwhen's\b/gi, "when is"],
  [/\bhow's\b/gi, "how is"],
  [/\bwho's\b/gi, "who is"],
  [/\bthere's\b/gi, "there is"],
  [/\bhere's\b/gi, "here is"],
  [/\bit's\b/gi, "it is"],
  // he's / she's: "has" when followed by a past participle-like token; else "is".
  [/\bhe's\s+(been|gone|done|had|got|gotten|seen|taken|made|given)\b/gi, "he has $1"],
  [/\bshe's\s+(been|gone|done|had|got|gotten|seen|taken|made|given)\b/gi, "she has $1"],
  [/\bhe's\b/gi, "he is"],
  [/\bshe's\b/gi, "she is"],
  [/\bthey're\b/gi, "they are"],
  [/\bwe're\b/gi, "we are"],
  [/\byou're\b/gi, "you are"],
  [/\bthey're\b/gi, "they are"],
  [/\bi'm\b/gi, "I am"],
  [/\bi've\b/gi, "I have"],
  [/\bi'll\b/gi, "I will"],
  [/\bi'd\b/gi, "I would"],
  [/\bthey've\b/gi, "they have"],
  [/\bwe've\b/gi, "we have"],
  [/\byou've\b/gi, "you have"],
  [/\bthey'll\b/gi, "they will"],
  [/\bwe'll\b/gi, "we will"],
  [/\byou'll\b/gi, "you will"],
  [/\bhe'd\b/gi, "he would"],
  [/\bshe'd\b/gi, "she would"],
  [/\bthey'd\b/gi, "they would"],
  [/\bwe'd\b/gi, "we would"],
  [/\byou'd\b/gi, "you would"],
  [/\bwhat'll\b/gi, "what will"],
  [/\bwhat'd\b/gi, "what did"],
  [/\bthat'll\b/gi, "that will"],
  [/\bthat'd\b/gi, "that would"],
];

/** Tokens still treated as contractions for possessive-skip (post-expansion leftovers). */
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
 * Expand common English contractions into pronunciation-safe phrases for Kokoro.
 * Must run after apostrophe folding and before possessive of-forms.
 */
export function expandContractionsForTts(text: string): string {
  let out = text;
  for (const [pattern, spoken] of CONTRACTION_EXPANSIONS) {
    out = out.replace(pattern, spoken);
  }
  return out;
}

/**
 * Make possessives pronunciation-safe without scrubbing remaining contractions.
 *
 * Prefer a light rewrite:
 *   Rod's roster  → the roster of Rod
 *   James' roster → the roster of James
 */
export function normalizePossessivesForTts(text: string): string {
  let out = text;

  // Plural / sibilant bare possessives: James' → James's (then of-form below).
  out = out.replace(/\b([A-Za-z]+)'(?![sS])(?=[\s.,:;!?]|$)/g, "$1's");

  // "X's Y" / "the X's Y" → "the Y of X" when X's is not a leftover contraction.
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
  const folded = normalizeApostrophesForTts(text);
  const contracted = expandContractionsForTts(folded);
  const possessed = normalizePossessivesForTts(contracted);
  return expandFootballAbbreviationsForTts(possessed);
}
