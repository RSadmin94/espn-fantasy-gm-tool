/**
 * Speech-only football abbreviation expansion for TTS.
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
  [/\bS\b/gi, "safety"],
];

/** Expand fantasy football position abbreviations into spoken forms for TTS. */
export function normalizeSpeechForTts(text: string): string {
  let out = text;
  for (const [pattern, spoken] of SPEECH_EXPANSIONS) {
    out = out.replace(pattern, spoken);
  }
  return out;
}
