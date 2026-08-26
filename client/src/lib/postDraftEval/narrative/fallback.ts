import type { GroundedNarrative, NarrativeFacts, NarrativePickFact, PickTake } from "./types";

export const HINDSIGHT_RE =
  /\b(injur(?:y|ed|ies)|on ir\b|out for the season|broke out|busts?\b|finished as|won the (?:league|title|championship)|final standings|week 1[0-7]|projections?|projected|adp|ecr|fantasy points|touchdowns?|yards)\b/i;

export const INSULT_RE =
  /\b(you (?:clearly )?don'?t know how to draft|you'?re (?:a )?bad (?:fantasy )?owner|you have no idea|pathetic draft|you stink)\b/i;

export const STRONG_REC_RE =
  /\b(unquestionably|obviously|clearly should have|you blew this|you should have taken|the right selection was obviously)\b/i;

export function stripHindsight(text: string): string {
  if (!HINDSIGHT_RE.test(text)) return text;
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !HINDSIGHT_RE.test(sentence))
    .join(" ")
    .trim();
}

function verbFor(pick: NarrativePickFact): string {
  if (pick.sameAsRivals || pick.kind === "same") return "Rivals agrees.";
  if (pick.confidence === "HIGH") return "You should have taken";
  if (pick.confidence === "MEDIUM") return "Rivals preferred";
  return "Rivals leans toward";
}

function laterChaseLine(pick: NarrativePickFact): string {
  const chase = pick.laterChase;
  if (!chase || chase.picks.length === 0) return "";
  const names = chase.picks
    .slice(0, 2)
    .map((p) => `${p.actualName} in round ${p.round}`)
    .join(", ");
  if (chase.strength === "hard") {
    return ` That decision became expensive later — you were taking ${names} to cover ${chase.pos}.`;
  }
  return ` That left ${chase.pos} as an unresolved need, and you later addressed it with ${names}.`;
}

function constructionDiff(facts: NarrativeFacts): string {
  const diffs: string[] = [];
  const roster = facts.sequentialRivalsRoster.length > 0 ? facts.sequentialRivalsRoster : facts.rivalsStarters;
  for (const row of facts.actualStarters) {
    const alt = roster.find((r) => r.slot === row.slot);
    if ((row.name || "") === (alt?.name || "")) continue;
    diffs.push(`${row.slot}: ${row.name || "empty"} vs ${alt?.name || "empty"}`);
  }
  if (diffs.length === 0) {
    return "Rivals lands on the same starting lineup you drafted. The gap is mostly bench order, not the opening-day starters.";
  }
  const strength = facts.strongestPosition ? ` Your ${facts.strongestPosition} room was the calling card.` : "";
  const weak =
    facts.weakestPosition && !facts.positionsFilledBeforeLive.includes(facts.weakestPosition.toUpperCase())
      ? ` The ${facts.weakestPosition} chair was the leak.`
      : "";
  return `Rivals restacks your slots only — everyone else's historical picks stay put. ${diffs.slice(0, 4).join("; ")}.${strength}${weak}`;
}

function takeFor(pick: NarrativePickFact): PickTake {
  if (pick.isKeeper) {
    const need = pick.openNeeds[0];
    return {
      overallPick: pick.overallPick,
      headline: `${pick.actualName} changed the board before you ever went on the clock.`,
      explanation: need
        ? `${pick.actualName} locked ${pick.actualPos} before live selections. With that chair handled, Rivals could focus early capital on ${need} and the rest of the construction.`
        : `${pick.actualName} locked ${pick.actualPos} before live selections. Rivals is not grading a decision you didn't get to make — only how that locked piece shaped the rest of the draft.`,
    };
  }
  if (pick.sameAsRivals || pick.kind === "same") {
    return {
      overallPick: pick.overallPick,
      headline: pick.importance === "MAJOR" ? "The board handed you value — and you didn't overthink it." : "Rivals agrees.",
      explanation:
        pick.importance === "ROUTINE"
          ? "Rivals agrees. No need to overthink this one."
          : `You already had enough roster flexibility to take the best remaining answer. ${pick.actualName} fit without forcing a panic reach.`,
    };
  }
  const stem = verbFor(pick);
  const chase = laterChaseLine(pick);
  const prior =
    pick.passedNeedsEarlier.length > 0
      ? ` After passing on ${pick.passedNeedsEarlier.join(" and ")} earlier, the board was asking a different question.`
      : "";
  const headline =
    pick.importance === "MAJOR"
      ? "This is where the draft started getting expensive."
      : pick.confidence === "LOW"
        ? "Rivals would lean another direction here."
        : "Rivals would have gone a different direction.";
  const explanation =
    pick.importance === "ROUTINE"
      ? `${stem} ${pick.rivalsName}.`
      : `${stem} ${pick.rivalsName}. ${pick.why}${prior}${chase}`.replace(/\s+/g, " ").trim();
  return { overallPick: pick.overallPick, headline, explanation };
}

function draftStoryFor(facts: NarrativeFacts): string {
  const miss = facts.biggestMiss;
  const turn = facts.turningPoint;
  const best = facts.bestPick;
  const low =
    facts.overallConfidence === "LOW" ||
    facts.overallConfidence === "INSUFFICIENT" ||
    facts.supportStatus === "LIMITED";
  const approach = (() => {
    if (facts.weakestPosition && facts.positionsFilledBeforeLive.includes(facts.weakestPosition.toUpperCase())) {
      const locked = facts.retainedKeepers.map((k) => `${k.name} at ${k.pos}`).join(" and ");
      return locked
        ? `The live draft opened with ${locked} already locked, so the first questions were about the remaining chairs.`
        : "The opening gave you a usable foundation.";
    }
    if (facts.weakestPosition) {
      return `The opening had pieces, but ${facts.weakestPosition} stayed unresolved long enough to change later decisions.`;
    }
    if (facts.retainedKeepers.length > 0) {
      return `Before live picks, ${facts.retainedKeepers.map((k) => k.name).join(" and ")} already shaped the roster.`;
    }
    return "The opening gave you a usable foundation.";
  })();
  const good = best
    ? `${best.actualName} in round ${best.round} is the keep-this-one moment.`
    : facts.strongestPosition
      ? `The ${facts.strongestPosition} room is the part Rivals would actually live with.`
      : "There were good decisions along the way.";
  const sameHinge = miss && turn && miss.overallPick === turn.overallPick;
  const weaken = miss
    ? `Roster construction started to wobble when ${miss.actualName} came off the board instead of ${miss.altName ?? "the Rivals alternative"} in round ${miss.round}.`
    : "No single pick blew up the board; the issue, if any, is accumulation.";
  const matter = sameHinge
    ? `That pick is the hinge: the later roster shape follows from the opportunity given up there.`
    : turn
      ? `The decision that mattered most was round ${turn.round}: ${turn.actualName} instead of ${turn.altName ?? "the sequential Rivals pick"}.`
      : miss
        ? `The pick that mattered most was ${miss.actualName} in round ${miss.round}.`
        : "No single hinge pick uniquely bent the rest of the roster.";
  const rivals = constructionDiff(facts);
  const hedge = low
    ? " Rivals can reconstruct who was available with confidence, but the historical ranking evidence is thinner, so this is a lean — not a courtroom verdict."
    : "";
  return `${facts.teamName} grades ${facts.overallGrade} on decision quality at the time of the draft — not later results. ${approach} ${good} ${weaken} ${matter} ${rivals}${hedge}`
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyUnavailableNarrative(reason: string): GroundedNarrative {
  return {
    source: "unavailable",
    cached: false,
    unavailableReason: reason,
    openingHeadline: "",
    draftStory: "",
    openingBody: "",
    rivalsSays: "",
    bestPickStory: null,
    biggestMissStory: null,
    turningPointStory: null,
    actualVsRivals: "",
    pickTakes: [],
    pickComments: [],
  };
}

export function buildFallbackNarrative(facts: NarrativeFacts): GroundedNarrative {
  const miss = facts.biggestMiss;
  const turn = facts.turningPoint;
  const best = facts.bestPick;
  const lowEvidence =
    facts.overallConfidence === "INSUFFICIENT" ||
    facts.overallConfidence === "LOW" ||
    facts.supportStatus === "LIMITED";

  const openingHeadline = miss
    ? `Good pieces, but Round ${miss.round} changed the build.`
    : "Clean draft. Rivals is mostly nodding along.";

  const draftStory = draftStoryFor(facts);

  const rivalsSays = lowEvidence
    ? `Rivals Says: ${facts.overallGrade} with an asterisk — availability is solid, ranking evidence is not a time machine.`
    : miss
      ? `Rivals Says: ${facts.overallGrade} draft, and Round ${miss.round} is the one you'd want back.`
      : `Rivals Says: ${facts.overallGrade}. You stacked a roster Rivals would largely live with.`;

  const bestPickStory = best
    ? `${best.actualName} in round ${best.round} is the keep-this-one moment. ${best.why} That is value you did not have to manufacture.`
    : null;

  let biggestMissStory: string | null = null;
  if (miss) {
    const missPick = facts.picks.find((p) => p.overallPick === miss.overallPick);
    const hedge =
      missPick?.confidence === "HIGH"
        ? `You should have taken ${miss.altName}.`
        : missPick?.confidence === "MEDIUM"
          ? `Rivals preferred ${miss.altName}.`
          : `Rivals leans toward ${miss.altName}.`;
    const sameHinge = Boolean(facts.turningPoint && facts.turningPoint.overallPick === miss.overallPick);
    const chase = sameHinge ? "" : missPick ? laterChaseLine(missPick) : "";
    const cost = sameHinge ? " Immediate opportunity cost at this slot." : "";
    biggestMissStory = `${hedge} You took ${miss.actualName} instead.${cost}${chase} ${miss.why}`
      .replace(/\s+/g, " ")
      .trim();
  }

  let turningPointStory: string | null = null;
  if (turn) {
    const turnPick = facts.picks.find((p) => p.overallPick === turn.overallPick);
    const chase = turnPick ? laterChaseLine(turnPick) : "";
    const force =
      turnPick?.laterChase?.strength === "hard"
        ? `That sequence is a decision chain, not a vibes call.${chase}`
        : `That increased the pressure to address the roster a different way later.${chase}`;
    const sameMiss = facts.biggestMiss && facts.biggestMiss.overallPick === turn.overallPick;
    turningPointStory = sameMiss
      ? `Round ${turn.round} is the hinge because of what it did next, not the name on the card. ${force}`.replace(/\s+/g, " ").trim()
      : `Round ${turn.round} is the hinge. ${turn.actualName} instead of ${
          turn.altName ?? "the sequential Rivals pick"
        } is where the roster shape changes. ${force}`.replace(/\s+/g, " ").trim();
  }

  const pickTakes = facts.picks.filter((p) => p.commentaryWeight !== "skip").map(takeFor);
  const pickComments = pickTakes.map((t) => ({
    overallPick: t.overallPick,
    headline: t.headline,
    explanation: t.explanation,
    text: `${t.headline} ${t.explanation}`.trim(),
  }));

  return {
    source: "fallback",
    cached: false,
    unavailableReason: null,
    openingHeadline,
    draftStory,
    openingBody: draftStory,
    rivalsSays,
    bestPickStory,
    biggestMissStory,
    turningPointStory,
    actualVsRivals: constructionDiff(facts),
    pickTakes,
    pickComments,
  };
}
