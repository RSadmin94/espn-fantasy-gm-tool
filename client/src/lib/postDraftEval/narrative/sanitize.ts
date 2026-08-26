import { allFactNames, allowedNamesForPick, sequentialRivalsNames } from "./facts";
import { buildFallbackNarrative, HINDSIGHT_RE, INSULT_RE, STRONG_REC_RE, stripHindsight } from "./fallback";
import type { GroundedNarrative, NarrativeFacts, PickTake, StorytellingSource } from "./types";

function asText(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function mentionsUnknownPlayer(text: string, allowed: Set<string>, universe: Set<string>): boolean {
  const lower = text.toLowerCase();
  for (const name of universe) {
    if (!name || name.length < 4 || allowed.has(name)) continue;
    if (lower.includes(name)) return true;
  }
  return false;
}

function extractedRecommendation(text: string): string | null {
  const m = text.match(
    /(?:should have taken|rivals preferred|rivals leans toward|stronger construction play was|would have taken|rivals would take)\s+([^.,;]+)/i,
  );
  return m?.[1]?.trim() || null;
}

function recommendationMatches(text: string, rivalsName: string): boolean {
  if (!rivalsName) return true;
  const extracted = extractedRecommendation(text);
  if (!extracted) return true;
  return extracted.toLowerCase().includes(rivalsName.toLowerCase()) || rivalsName.toLowerCase().includes(extracted.toLowerCase());
}

function contradictsGrade(text: string, grade: string): boolean {
  if (!grade || grade === "—" || grade === "—") return false;
  const claimed = text.match(/\b(?:grade(?:d)?|that was(?: really)?(?: an?)?)\s*([A-F][+-]?)\b/i);
  if (!claimed?.[1]) return false;
  return claimed[1].toUpperCase() !== grade.toUpperCase();
}

const RIVALS_TOOK_RE =
  /(?:rivals took|rivals drafted|the rivals draft added|the alternate (?:roster|draft) (?:selected|took|added)|rivals'? (?:redraft|alternate roster) (?:took|selected|added|landed(?:\s+on)?))\s+([A-Z][A-Za-z.''-]+(?:\s+[A-Z][A-Za-z.''-]+){0,3})/gi;

const POS_WORD: Record<string, RegExp> = {
  QB: /\b(qb|quarterbacks?)\b/i,
  RB: /\b(rb|running backs?)\b/i,
  WR: /\b(wr|receivers?)\b/i,
  TE: /\b(te|tight ends?)\b/i,
};

const EMPTY_CHAIR_RE =
  /blind spot|ignored|soft(?:er)?(?:\s+on|\s+at)|waited too long|never addressed|left (?:the )?(?:qb|rb|wr|te|tight end|quarterback|running back|receiver) (?:empty|open|unresolved)|(?:te|tight end|qb|quarterback|rb|running back|wr|receiver).{0,28}(?:was empty|were empty|was ignored)/i;

const HARD_CAUSE_RE =
  /forced (?:a )?later chase|became expensive later|that sequence is a decision chain|you were then forced/;

function nameKey(n: string): string {
  return n.trim().toLowerCase();
}

function textMentionsName(text: string, name: string): boolean {
  const n = nameKey(name);
  return n.length >= 4 && text.toLowerCase().includes(n);
}

function sequentialAllowedHas(allowed: Set<string>, named: string): boolean {
  const needle = nameKey(named);
  if (!needle) return true;
  for (const name of allowed) {
    if (needle.includes(name) || name.includes(needle)) return true;
  }
  return false;
}

export function claimsNonSequentialRedraftPlayer(text: string, facts: NarrativeFacts): boolean {
  const allowed = sequentialRivalsNames(facts);
  const universe = allFactNames(facts);
  for (const match of text.matchAll(RIVALS_TOOK_RE)) {
    const named = match[1]?.trim() ?? "";
    if (!named) continue;
    for (const name of universe) {
      if (name.length < 4) continue;
      if (named.toLowerCase().includes(name) || name.includes(named.toLowerCase())) {
        if (!allowed.has(name)) return true;
      }
    }
    if (![...universe].some((name) => named.toLowerCase().includes(name) || name.includes(named.toLowerCase()))) {
      if (!sequentialAllowedHas(allowed, named)) return true;
    }
  }
  return false;
}

export function claimsKeeperPositionEmpty(text: string, facts: NarrativeFacts): boolean {
  const filled = new Set(facts.positionsFilledBeforeLive.map((p) => p.toUpperCase()));
  if (filled.size === 0) return false;
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!EMPTY_CHAIR_RE.test(sentence)) continue;
    for (const pos of filled) {
      const word = POS_WORD[pos];
      if (word?.test(sentence)) return true;
    }
  }
  return false;
}

export function claimsUnsupportedCausality(text: string, facts: NarrativeFacts, pickOverall?: number): boolean {
  if (!HARD_CAUSE_RE.test(text)) return false;
  if (pickOverall != null) {
    const pick = facts.picks.find((p) => p.overallPick === pickOverall);
    return pick?.laterChase?.strength !== "hard";
  }
  return !facts.picks.some((p) => p.laterChase?.strength === "hard");
}

function normalizeForOverlap(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeForOverlap(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalizeForOverlap(b).split(" ").filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit += 1;
  return hit / Math.min(ta.size, tb.size);
}

function mentionsPair(text: string, a: string, b: string | null): boolean {
  if (!b) return false;
  return textMentionsName(text, a) && textMentionsName(text, b);
}

function groundedText(
  proposed: unknown,
  fallback: string | null,
  allowed: Set<string>,
  universe: Set<string>,
  opts?: { lowConfidence?: boolean },
): string | null {
  if (!fallback) return null;
  const cleaned = stripHindsight(asText(proposed));
  if (!cleaned || HINDSIGHT_RE.test(cleaned) || INSULT_RE.test(cleaned)) return fallback;
  if (mentionsUnknownPlayer(cleaned, allowed, universe)) return fallback;
  if (opts?.lowConfidence && STRONG_REC_RE.test(cleaned)) return fallback;
  return cleaned;
}

function normalizeTakes(draft: Record<string, unknown>): Array<{ overallPick: number; headline: string; explanation: string }> {
  const out: Array<{ overallPick: number; headline: string; explanation: string }> = [];
  const takes = draft.pickTakes;
  if (takes && typeof takes === "object" && !Array.isArray(takes)) {
    for (const [key, value] of Object.entries(takes as Record<string, unknown>)) {
      const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      out.push({
        overallPick: Number(key),
        headline: asText(row.headline),
        explanation: asText(row.explanation ?? row.text),
      });
    }
  } else if (Array.isArray(takes)) {
    for (const row of takes) {
      const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      out.push({
        overallPick: Number(r.overallPick),
        headline: asText(r.headline),
        explanation: asText(r.explanation ?? r.text),
      });
    }
  }
  const comments = draft.pickComments;
  if (Array.isArray(comments)) {
    for (const row of comments) {
      const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const overallPick = Number(r.overallPick);
      if (out.some((t) => t.overallPick === overallPick)) continue;
      out.push({
        overallPick,
        headline: asText(r.headline),
        explanation: asText(r.explanation ?? r.text),
      });
    }
  }
  return out;
}

function acceptTake(
  facts: NarrativeFacts,
  pickOverall: number,
  headline: string,
  explanation: string,
): PickTake | null {
  const pick = facts.picks.find((p) => p.overallPick === pickOverall);
  if (!pick || pick.commentaryWeight === "skip") return null;
  const universe = allFactNames(facts);
  const allowed = allowedNamesForPick(facts, pickOverall);
  const low = pick.confidence === "LOW" || pick.confidence === "INSUFFICIENT" || facts.supportStatus === "LIMITED";
  const combined = `${headline} ${explanation}`.trim();
  if (!combined) return null;
  if (HINDSIGHT_RE.test(combined) || INSULT_RE.test(combined)) return null;
  if (mentionsUnknownPlayer(combined, allowed, universe)) return null;
  if (contradictsGrade(combined, pick.grade)) return null;
  if (pick.isKeeper && /should have taken|rivals preferred|biggest miss|decision grade|you blew/i.test(combined)) {
    return null;
  }
  if (pick.sameAsRivals && /should have taken|mistake|blown|wrong pick|screwed/i.test(combined)) return null;
  if (!pick.isKeeper && pick.kind !== "same" && pick.kind !== "none" && !recommendationMatches(combined, pick.rivalsName)) {
    return null;
  }
  const extraTakes = [...combined.matchAll(/should have taken\s+([^.,;]+)/gi)];
  for (const match of extraTakes) {
    const named = match[1]?.trim().toLowerCase() ?? "";
    if (!named) continue;
    const ok =
      (pick.rivalsName && named.includes(pick.rivalsName.toLowerCase())) ||
      named.includes(pick.actualName.toLowerCase());
    if (!ok) return null;
  }
  if (low && STRONG_REC_RE.test(combined)) return null;
  if (claimsKeeperPositionEmpty(combined, facts)) return null;
  if (claimsUnsupportedCausality(combined, facts, pickOverall)) return null;
  const cleanHeadline = stripHindsight(headline) || null;
  const cleanExpl = stripHindsight(explanation) || null;
  if (!cleanHeadline && !cleanExpl) return null;
  return {
    overallPick: pickOverall,
    headline: cleanHeadline || "Rivals Take",
    explanation: cleanExpl || cleanHeadline || "",
  };
}

/** Clamp any model output to evaluator facts. Engine values always win. */
export function groundNarrative(
  facts: NarrativeFacts,
  draft: (Partial<GroundedNarrative> & Record<string, unknown>) | null | undefined,
  source: StorytellingSource = "llm",
): GroundedNarrative {
  const fallback = buildFallbackNarrative(facts);
  const universe = allFactNames(facts);
  if (!draft) return { ...fallback, source: source === "llm" ? "fallback" : source };

  const low =
    facts.overallConfidence === "LOW" || facts.overallConfidence === "INSUFFICIENT" || facts.supportStatus === "LIMITED";
  let draftStory =
    groundedText(draft.draftStory ?? draft.openingBody, fallback.draftStory, universe, universe, { lowConfidence: low }) ??
    fallback.draftStory;
  if (claimsKeeperPositionEmpty(draftStory, facts) || claimsNonSequentialRedraftPlayer(draftStory, facts) || claimsUnsupportedCausality(draftStory, facts)) {
    draftStory = fallback.draftStory;
  }
  const openingHeadline = stripHindsight(asText(draft.openingHeadline)) || fallback.openingHeadline;
  const safeHeadline =
    HINDSIGHT_RE.test(openingHeadline) || INSULT_RE.test(openingHeadline) || (low && STRONG_REC_RE.test(openingHeadline))
      ? fallback.openingHeadline
      : openingHeadline;

  let rivalsSays =
    groundedText(draft.rivalsSays, fallback.rivalsSays, universe, universe, { lowConfidence: low }) ?? fallback.rivalsSays;
  if (rivalsSays && !/^rivals says/i.test(rivalsSays)) rivalsSays = `Rivals Says: ${rivalsSays}`;

  const bestPickStory = facts.bestPick
    ? groundedText(
        draft.bestPickStory ?? draft.bestPickExplanation,
        fallback.bestPickStory,
        new Set([facts.bestPick.actualName.toLowerCase()]),
        universe,
        { lowConfidence: low },
      )
    : null;

  let biggestMissStory = facts.biggestMiss
    ? groundedText(
        draft.biggestMissStory ?? draft.biggestMissExplanation,
        fallback.biggestMissStory,
        new Set(
          [facts.biggestMiss.actualName, facts.biggestMiss.altName].filter(Boolean).map((n) => String(n).toLowerCase()),
        ),
        universe,
        { lowConfidence: low },
      )
    : null;
  if (biggestMissStory && claimsKeeperPositionEmpty(biggestMissStory, facts)) {
    biggestMissStory = fallback.biggestMissStory;
  }

  let turningPointStory = facts.turningPoint
    ? groundedText(
        draft.turningPointStory ?? draft.turningPointExplanation,
        fallback.turningPointStory,
        new Set(
          [facts.turningPoint.actualName, facts.turningPoint.altName].filter(Boolean).map((n) => String(n).toLowerCase()),
        ),
        universe,
        { lowConfidence: low },
      )
    : null;
  if (turningPointStory && claimsKeeperPositionEmpty(turningPointStory, facts)) {
    turningPointStory = fallback.turningPointStory;
  }

  let actualVsRivals =
    groundedText(draft.actualVsRivals ?? draft.redraftExplanation, fallback.actualVsRivals, universe, universe, {
      lowConfidence: low,
    }) ?? fallback.actualVsRivals;
  if (
    claimsNonSequentialRedraftPlayer(actualVsRivals, facts) ||
    claimsKeeperPositionEmpty(actualVsRivals, facts) ||
    claimsUnsupportedCausality(actualVsRivals, facts)
  ) {
    actualVsRivals = fallback.actualVsRivals;
  }

  const incoming = normalizeTakes((draft as Record<string, unknown>) ?? {});
  const byPick = new Map<number, PickTake>();
  for (const row of incoming) {
    const accepted = acceptTake(facts, row.overallPick, row.headline, row.explanation);
    if (accepted) byPick.set(row.overallPick, accepted);
  }

  const pickTakes = fallback.pickTakes.map((row) => byPick.get(row.overallPick) ?? row);
  const diversified = applySectionDiversity(facts, {
    draftStory,
    biggestMissStory: facts.biggestMiss ? biggestMissStory ?? fallback.biggestMissStory : null,
    turningPointStory: facts.turningPoint ? turningPointStory ?? fallback.turningPointStory : null,
    pickTakes,
    fallback,
  });

  const pickComments = diversified.pickTakes.map((t) => ({
    overallPick: t.overallPick,
    headline: t.headline,
    explanation: t.explanation,
    text: `${t.headline} ${t.explanation}`.trim(),
  }));

  return {
    source,
    cached: Boolean(draft.cached),
    unavailableReason: null,
    openingHeadline: safeHeadline,
    draftStory: diversified.draftStory,
    openingBody: diversified.draftStory,
    rivalsSays,
    bestPickStory: facts.bestPick ? bestPickStory ?? fallback.bestPickStory : null,
    biggestMissStory: diversified.biggestMissStory,
    turningPointStory: diversified.turningPointStory,
    actualVsRivals,
    pickTakes: diversified.pickTakes,
    pickComments,
  };
}

function applySectionDiversity(
  facts: NarrativeFacts,
  args: {
    draftStory: string;
    biggestMissStory: string | null;
    turningPointStory: string | null;
    pickTakes: PickTake[];
    fallback: GroundedNarrative;
  },
): {
  draftStory: string;
  biggestMissStory: string | null;
  turningPointStory: string | null;
  pickTakes: PickTake[];
} {
  const miss = facts.biggestMiss;
  const turn = facts.turningPoint;
  if (!miss || !turn || miss.overallPick !== turn.overallPick) return args;
  const pairA = miss.actualName;
  const pairB = miss.altName;
  let biggestMissStory = args.biggestMissStory;
  let turningPointStory = args.turningPointStory;
  const missText = biggestMissStory ?? "";
  const turnText = turningPointStory ?? "";
  const sameCopy = normalizeForOverlap(missText) === normalizeForOverlap(turnText) && missText.length > 0;
  const overlappingPair = mentionsPair(missText, pairA, pairB) && mentionsPair(turnText, pairA, pairB) && tokenOverlap(missText, turnText) >= 0.72;
  if (sameCopy || overlappingPair) {
    biggestMissStory = args.fallback.biggestMissStory;
    turningPointStory = args.fallback.turningPointStory;
  }
  const pickTakes = args.pickTakes.map((take) => {
    if (take.overallPick !== miss.overallPick) return take;
    const fb = args.fallback.pickTakes.find((t) => t.overallPick === take.overallPick);
    if (!fb) return take;
    const takeText = `${take.headline} ${take.explanation}`;
    const reprintsMiss = normalizeForOverlap(take.explanation) === normalizeForOverlap(missText) || tokenOverlap(take.explanation, missText) >= 0.8;
    if (reprintsMiss && mentionsPair(takeText, pairA, pairB)) {
      return { ...fb, explanation: fb.explanation };
    }
    return take;
  });
  return {
    draftStory: args.draftStory,
    biggestMissStory,
    turningPointStory,
    pickTakes,
  };
}

export function assertGrounded(facts: NarrativeFacts, narrative: GroundedNarrative): string[] {
  const errors: string[] = [];
  const universe = allFactNames(facts);
  if (!facts.biggestMiss && narrative.biggestMissStory) errors.push("invented_biggest_miss");
  if (!facts.bestPick && narrative.bestPickStory) errors.push("invented_best_pick");
  if (!facts.turningPoint && narrative.turningPointStory) errors.push("invented_turning_point");
  if (HINDSIGHT_RE.test(narrative.draftStory) || INSULT_RE.test(narrative.draftStory)) errors.push("story_ungrounded");
  if (facts.supportStatus === "LIMITED" && STRONG_REC_RE.test(`${narrative.draftStory} ${narrative.rivalsSays}`)) {
    errors.push("limited_overclaim");
  }
  if (claimsNonSequentialRedraftPlayer(narrative.actualVsRivals, facts)) errors.push("redraft_nonsequential_player");
  if (claimsKeeperPositionEmpty(narrative.draftStory, facts) || claimsKeeperPositionEmpty(narrative.actualVsRivals, facts)) {
    errors.push("keeper_position_empty");
  }
  if (claimsUnsupportedCausality(narrative.draftStory, facts)) errors.push("unsupported_causality");
  for (const take of narrative.pickTakes) {
    const pick = facts.picks.find((p) => p.overallPick === take.overallPick);
    const text = `${take.headline} ${take.explanation}`;
    if (!pick) {
      errors.push(`comment_unknown_pick_${take.overallPick}`);
      continue;
    }
    if (HINDSIGHT_RE.test(text) || INSULT_RE.test(text)) errors.push(`hindsight_${take.overallPick}`);
    if (mentionsUnknownPlayer(text, allowedNamesForPick(facts, take.overallPick), universe)) {
      errors.push(`unknown_player_${take.overallPick}`);
    }
    if (pick.isKeeper && /should have taken|decision grade/i.test(text)) errors.push(`keeper_graded_${take.overallPick}`);
    if (!pick.isKeeper && pick.kind !== "same" && pick.kind !== "none" && !recommendationMatches(text, pick.rivalsName)) {
      errors.push(`rival_mismatch_${take.overallPick}`);
    }
    if ((pick.confidence === "LOW" || facts.supportStatus === "LIMITED") && STRONG_REC_RE.test(text)) {
      errors.push(`low_overclaim_${take.overallPick}`);
    }
  }
  return errors;
}
