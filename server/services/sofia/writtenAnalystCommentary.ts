/**
 * Fact-driven written commentary for Sofia / Coach / Roxanne.
 * Deterministic live provider (voice beta off) — varies structure so lines do not mail-merge.
 */

export type AnalystVoiceId = "sofia" | "coach" | "roxanne";
export type CommentarySignificance = "routine" | "notable" | "major" | "historic";

export type CommentarySubject = {
  ownerName: string;
  playerName: string;
  position: string;
  overallPick: number;
  round: number;
};

export type CommentaryFacts = {
  subject: CommentarySubject;
  verifiedFacts: string[];
  storylines: string[];
  significance: CommentarySignificance;
};

type Angle =
  | "adp_ahead"
  | "adp_fell"
  | "roster_need"
  | "position_run"
  | "timing"
  | "rivalry"
  | "frequency"
  | "storyline"
  | "identity";

const TXN_RECEIPT_RE =
  /^(.+?)\s+selected\s+(.+?)\s+\((\w+)\)\s+at pick\s+(\d+),\s*round\s+(\d+)\.?$/i;

/** Test helper kept for suite resets — variation is now pure (no session state). */
export function resetCommentaryVariationState(): void {
  // no-op: lines are seeded purely from pick/identity facts
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickVariant(seed: string, count: number): number {
  return hashSeed(seed) % Math.max(1, count);
}

function chooseLine(
  _voice: AnalystVoiceId,
  subject: CommentarySubject,
  candidates: string[],
  seed: string,
): string {
  // Pure selection — same facts always yield the same line (shadow determinism).
  // Cross-pick variety comes from large structurally-distinct pools + seed includes pick/owner/player.
  const idx = pickVariant(`${seed}:v${subject.overallPick}`, candidates.length);
  return candidates[idx]!;
}

function isTxnReceipt(fact: string): boolean {
  return TXN_RECEIPT_RE.test(fact.trim()) || /\bselected\b.+\bat pick\b/i.test(fact);
}

function nonReceiptFacts(facts: string[]): string[] {
  return facts.map((f) => f.trim()).filter((f) => f && !isTxnReceipt(f));
}

function firstMatch(facts: string[], re: RegExp): string | null {
  for (const f of facts) {
    if (re.test(f)) return f.replace(/\.$/, "");
  }
  return null;
}

function parseAdpDelta(facts: string[]): { kind: "ahead" | "fell"; picks: number; fact: string } | null {
  for (const f of facts) {
    let m = f.match(/(\d+(?:\.\d+)?)\s+picks ahead of ADP/i);
    if (m) {
      const picks = Math.round(Number(m[1]));
      if (picks <= 0) continue;
      return { kind: "ahead", picks, fact: f.replace(/\.$/, "") };
    }
    m = f.match(/fell\s+(\d+(?:\.\d+)?)\s+picks past ADP/i);
    if (m) {
      const picks = Math.round(Number(m[1]));
      if (picks <= 0) continue;
      return { kind: "fell", picks, fact: f.replace(/\.$/, "") };
    }
  }
  return null;
}

function wantsLonger(sig: CommentarySignificance, extraCount: number): boolean {
  if (sig === "major" || sig === "historic") return true;
  if (sig === "notable" && extraCount >= 1) return true;
  return false;
}

type FactBundle = {
  extras: string[];
  adp: { kind: "ahead" | "fell"; picks: number; fact: string } | null;
  rosterNeed: string | null;
  posRun: string | null;
  timing: string | null;
  rivalry: string | null;
  frequency: string | null;
  storyline: string | null;
};

function bundleFacts(input: CommentaryFacts): FactBundle {
  const extras = nonReceiptFacts(input.verifiedFacts);
  return {
    extras,
    adp: parseAdpDelta(extras),
    rosterNeed: firstMatch(extras, /still needed a starting/i),
    posRun: firstMatch(extras, /\d+\s+\w+s in the last/i),
    timing: firstMatch(extras, /earliest|latest|tracked history|has not drafted/i),
    rivalry: firstMatch(extras, /rival/i),
    frequency: firstMatch(extras, /has drafted a .+ in \d+ of \d+/i),
    storyline: input.storylines[0] ? input.storylines[0].replace(/_/g, " ").toLowerCase() : null,
  };
}

/** Rotate which evidence angle leads — never hard-code the same priority every pick. */
function availableAngles(b: FactBundle): Angle[] {
  const angles: Angle[] = [];
  if (b.adp?.kind === "ahead") angles.push("adp_ahead");
  if (b.adp?.kind === "fell") angles.push("adp_fell");
  if (b.rosterNeed) angles.push("roster_need");
  if (b.posRun) angles.push("position_run");
  if (b.timing) angles.push("timing");
  if (b.rivalry) angles.push("rivalry");
  if (b.frequency) angles.push("frequency");
  if (b.storyline && b.storyline !== "early round floor") angles.push("storyline");
  if (angles.length === 0) angles.push("identity");
  return angles;
}

function chooseAngle(angles: Angle[], seed: string): Angle {
  return angles[pickVariant(seed, angles.length)]!;
}

function accompanyFact(b: FactBundle, primary: Angle): string | null {
  if (primary !== "adp_ahead" && primary !== "adp_fell" && b.adp) return b.adp.fact;
  if (primary !== "roster_need" && b.rosterNeed) return b.rosterNeed;
  if (primary !== "timing" && b.timing) return b.timing;
  if (primary !== "position_run" && b.posRun) return b.posRun;
  if (primary !== "frequency" && b.frequency) return b.frequency;
  if (primary !== "rivalry" && b.rivalry) return b.rivalry;
  return null;
}

function sofiaLine(input: CommentaryFacts): { line: string; premise: string } {
  const s = input.subject;
  const b = bundleFacts(input);
  const angles = availableAngles(b);
  // Sofia prefers receipt-bearing angles when present
  const receiptBias = angles.filter((a) =>
    ["adp_ahead", "adp_fell", "timing", "frequency", "position_run", "roster_need", "rivalry"].includes(a),
  );
  const pool = receiptBias.length > 0 ? receiptBias : angles;
  const angle = chooseAngle(pool, `sofia:angle:${s.overallPick}:${s.playerName}`);
  const long = wantsLonger(input.significance, b.extras.length);
  const second = long ? accompanyFact(b, angle) : null;
  const seed = `sofia:${angle}:${s.overallPick}:${s.ownerName}`;

  let candidates: string[] = [];
  let premise = b.extras[0] ?? input.verifiedFacts[0] ?? `${s.playerName} to ${s.ownerName}`;

  if (angle === "adp_ahead" && b.adp) {
    premise = b.adp.fact;
    candidates = [
      `${s.playerName} sits ${b.adp.picks} picks ahead of ADP on ${s.ownerName}'s card.`,
      `ADP receipt: ${s.ownerName} paid ${b.adp.picks} picks early for ${s.playerName}.`,
      `${s.ownerName}'s ${s.playerName} land is ${b.adp.picks} ahead of consensus.`,
      `The board tape shows ${s.playerName} going ${b.adp.picks} picks early to ${s.ownerName}.`,
    ];
  } else if (angle === "adp_fell" && b.adp) {
    premise = b.adp.fact;
    candidates = [
      `${s.playerName} fell ${b.adp.picks} picks past ADP — ${s.ownerName} has the receipt.`,
      `Fall of ${b.adp.picks} vs ADP: ${s.playerName} to ${s.ownerName} at ${s.position}.`,
      `${s.ownerName} claims ${s.playerName} after a ${b.adp.picks}-pick slide past ADP.`,
      `Board value receipt — ${s.playerName} was still there ${b.adp.picks} picks late.`,
    ];
  } else if (angle === "timing" && b.timing) {
    premise = b.timing;
    candidates = [
      `${b.timing}.`,
      `League history note: ${b.timing}.`,
      `${b.timing} — tied to ${s.playerName} at pick ${s.overallPick}.`,
    ];
  } else if (angle === "frequency" && b.frequency) {
    premise = b.frequency;
    candidates = [
      `${b.frequency}.`,
      `Franchise pattern on the receipt: ${b.frequency}.`,
      `${b.frequency} ${s.playerName} continues it.`,
    ];
  } else if (angle === "roster_need" && b.rosterNeed) {
    premise = b.rosterNeed;
    const need = b.rosterNeed.replace(/\.$/, "");
    candidates = [
      `${need}. ${s.playerName} is the documented fill.`,
      `Roster receipt: starting ${s.position} was open — ${s.playerName} closes the fact.`,
      `${s.ownerName} had no starting ${s.position}; ${s.playerName} is now on the books.`,
    ];
  } else if (angle === "position_run" && b.posRun) {
    premise = b.posRun;
    const run = b.posRun.replace(/\.$/, "");
    candidates = [
      `${run}. ${s.ownerName} takes ${s.playerName}.`,
      `Run receipt: ${run}.`,
      `${s.playerName} lands amid the scramble — ${run}.`,
    ];
  } else if (angle === "rivalry" && b.rivalry) {
    premise = b.rivalry;
    const riv = b.rivalry.replace(/\.$/, "");
    candidates = [
      `${riv}.`,
      `Tracked rivalry on the board: ${riv}.`,
      `${riv}. ${s.playerName} is the pick logged.`,
    ];
  } else if (angle === "storyline" && b.storyline) {
    premise = input.verifiedFacts[0] ?? premise;
    candidates = [
      `${s.playerName} (${s.position}) to ${s.ownerName} in round ${s.round} — ${b.storyline} on record.`,
      `Round ${s.round} receipt under ${b.storyline}: ${s.playerName} for ${s.ownerName}.`,
    ];
  } else {
    candidates = [
      `${s.playerName} is logged to ${s.ownerName} as a ${s.position} after pick ${s.overallPick}.`,
      `Pick ${s.overallPick}: ${s.ownerName} has ${s.playerName} (${s.position}).`,
      `${s.ownerName}'s round-${s.round} ${s.position} is ${s.playerName}.`,
      `${s.playerName} (${s.position}) joins ${s.ownerName} in round ${s.round}.`,
    ];
  }

  if (second && long) {
    candidates = candidates.map((c) => {
      const tail = second.replace(/\.$/, "");
      if (c.includes(tail.slice(0, 18))) return c;
      return `${c.replace(/\.$/, "")}. ${tail}.`;
    });
  }

  return { line: chooseLine("sofia", s, candidates, seed), premise };
}

function coachLine(input: CommentaryFacts): { line: string; premise: string } {
  const s = input.subject;
  const b = bundleFacts(input);
  const angles = availableAngles(b);
  // Coach prefers construction angles but must rotate — include ADP when present
  const coachBias = angles.filter((a) =>
    ["roster_need", "adp_ahead", "adp_fell", "position_run", "frequency", "identity"].includes(a),
  );
  const pool = coachBias.length > 0 ? coachBias : angles;
  const angle = chooseAngle(pool, `coach:angle:${s.overallPick}:${s.playerName}:${s.position}`);
  const long = wantsLonger(input.significance, b.extras.length);
  const seed = `coach:${angle}:${s.overallPick}:${s.playerName}`;

  let candidates: string[] = [];
  let premise = b.extras[0] ?? input.verifiedFacts[0] ?? `${s.position} for ${s.ownerName}`;

  if (angle === "roster_need" && b.rosterNeed) {
    premise = b.rosterNeed;
    // Structurally distinct — never a single "closed a starting hole" mail-merge.
    candidates = [
      `${s.playerName} fills ${s.ownerName}'s open starter at ${s.position} — now the late rounds can chase upside.`,
      `Before this card, ${s.ownerName} was short a starting ${s.position}. ${s.playerName} ends that.`,
      `Build order: get the ${s.position} starter right. ${s.ownerName} does it with ${s.playerName}.`,
      `${s.position} was the missing starter piece; ${s.playerName} puts ${s.ownerName}'s foundation in place.`,
      `Round ${s.round} spend on ${s.playerName} is about starting slots, not vibes.`,
      `${s.ownerName} wasn't fielding a complete ${s.position} yet — ${s.playerName} changes the lineup math.`,
      `Construction move: secure ${s.position} with ${s.playerName}, leave the flier board for later.`,
      `You draft starters first. ${s.ownerName} just did — ${s.playerName} at ${s.position}.`,
    ];
  } else if (angle === "adp_ahead" && b.adp) {
    premise = b.adp.fact;
    candidates = [
      `${b.adp.picks} picks of ADP premium for ${s.playerName} means ${s.position} was non-negotiable.`,
      `Paying up that far for ${s.playerName} thins wait-and-see later — ${s.position} is locked early.`,
      `${s.ownerName} refused to roll the ${s.position} board. The ADP tax on ${s.playerName} shows it.`,
      `Early ${s.position} capital spent: ${s.playerName} costs ${b.adp.picks} vs consensus.`,
    ];
  } else if (angle === "adp_fell" && b.adp) {
    premise = b.adp.fact;
    candidates = [
      `${s.playerName}'s ${b.adp.picks}-pick fall is roster ballast — ${s.position} without an early burn.`,
      `That's disciplined: take the ${s.position} discount (${s.playerName}) and keep future picks flexible.`,
      `Board value into the build — ${s.ownerName} upgrades ${s.position} on a slide.`,
      `${s.playerName} falling that far fixes ${s.position} depth without warping the plan.`,
    ];
  } else if (angle === "position_run" && b.posRun) {
    premise = b.posRun;
    candidates = [
      `${b.posRun} Sitting out risks worse ${s.position} leftovers; ${s.playerName} is the react.`,
      `Run pressure at ${s.position} — ${s.ownerName} grabs ${s.playerName} before the cliff.`,
      `When the board floods ${s.position}, you answer. ${s.playerName} is that answer.`,
      `Positional insurance mid-run: ${s.playerName} for ${s.ownerName}.`,
    ];
  } else if (angle === "frequency" && b.frequency) {
    premise = b.frequency;
    candidates = [
      `${b.frequency} ${s.playerName} fits that pattern into this year's build.`,
      `Tendency into construction: ${b.frequency}`,
    ];
  } else {
    candidates = [
      `${s.position} spend in round ${s.round} reshapes ${s.ownerName}'s remaining needs.`,
      `${s.playerName} at ${s.position} — watch how thin that spot gets after this.`,
      `Card impact: ${s.ownerName}'s ${s.position} room just got spent on ${s.playerName}.`,
      `Round ${s.round} ${s.position} addition changes what ${s.ownerName} can chase next.`,
    ];
  }

  if (long && angle === "roster_need" && b.adp) {
    candidates = candidates.map(
      (c) => `${c.replace(/\.$/, "")} (${b.adp!.picks} vs ADP on the same card).`,
    );
  }

  return { line: chooseLine("coach", s, candidates, seed), premise };
}

function roxanneLine(input: CommentaryFacts): { line: string; premise: string } {
  const s = input.subject;
  const b = bundleFacts(input);
  const angles = availableAngles(b);
  const roxBias = angles.filter((a) =>
    ["rivalry", "adp_ahead", "adp_fell", "position_run", "storyline", "identity"].includes(a),
  );
  const pool = roxBias.length > 0 ? roxBias : angles;
  const angle = chooseAngle(pool, `roxanne:angle:${s.overallPick}:${s.ownerName}`);
  const long = wantsLonger(input.significance, b.extras.length);
  const seed = `roxanne:${angle}:${s.overallPick}:${s.playerName}`;

  let candidates: string[] = [];
  let premise = b.extras[0] ?? input.verifiedFacts[0] ?? `${s.ownerName} + ${s.playerName}`;

  if (angle === "rivalry" && b.rivalry) {
    premise = b.rivalry;
    candidates = [
      `${b.rivalry} ${s.playerName} just became league-chat fuel.`,
      `Rival set activated — ${s.ownerName} with ${s.playerName} is going to age loudly.`,
      `${b.rivalry} Don't act surprised when the replies start.`,
      `Heat check: ${s.playerName} to ${s.ownerName} with that rivalry already on file.`,
    ];
  } else if (angle === "adp_ahead" && b.adp) {
    premise = b.adp.fact;
    candidates = [
      `${s.ownerName} jumped ${b.adp.picks} picks early for ${s.playerName} — the room will not forget.`,
      `Reach energy: ${s.playerName} that early is season-long bulletin-board material.`,
      `Somebody in this league just watched ${s.playerName} come off ${b.adp.picks} early.`,
      `${b.adp.picks}-pick reach for ${s.playerName}. File it for trash-talk Tuesday.`,
    ];
  } else if (angle === "adp_fell" && b.adp) {
    premise = b.adp.fact;
    candidates = [
      `${s.playerName} sliding ${b.adp.picks} spots is a gift — ${s.ownerName} opens the present.`,
      `Fallers change vibes. ${s.playerName} to ${s.ownerName} is going to look smarter every week.`,
      `Chaos drop: ${s.playerName} was still there. ${s.ownerName} capitalizes.`,
      `Steal talk starts now — ${b.adp.picks} past ADP into ${s.ownerName}'s pile.`,
    ];
  } else if (angle === "position_run" && b.posRun) {
    premise = b.posRun;
    const run = b.posRun.replace(/\.$/, "");
    candidates = [
      `${run}. ${s.ownerName} hops in with ${s.playerName}.`,
      `Run clock is loud — ${s.playerName} is ${s.ownerName}'s answer at ${s.position}.`,
      `${s.ownerName} doesn't spectate the ${s.position} pile; ${s.playerName} is the dive.`,
      `Board stampede note: ${run}. Then ${s.playerName}.`,
      `${s.playerName} mid-run for ${s.ownerName} — everybody saw the scramble.`,
    ];
  } else {
    candidates = [
      `${s.playerName} hits ${s.ownerName}'s board and the temperature shifts.`,
      `Draft-room reaction speed: ${s.ownerName} and ${s.playerName} just became a story.`,
      `${s.ownerName} with ${s.playerName} — expect opinions, not applause.`,
      `Consequences later; noise now. ${s.playerName} is on ${s.ownerName}.`,
      `That's a reply-thread pick — ${s.playerName} in round ${s.round}.`,
    ];
  }

  if (long && angle === "adp_ahead" && b.rosterNeed) {
    candidates = candidates.map(
      (c) => `${c.replace(/\.$/, "")} Starter need made them aggressive.`,
    );
  }

  return { line: chooseLine("roxanne", s, candidates, seed), premise };
}

export function composeAnalystCommentary(
  voice: AnalystVoiceId,
  input: CommentaryFacts,
): { line: string; premise: string } {
  if (voice === "sofia") return sofiaLine(input);
  if (voice === "coach") return coachLine(input);
  return roxanneLine(input);
}

export function composeWrapUpCommentary(
  voice: AnalystVoiceId,
  verifiedFacts: string[],
): { line: string; premise: string } {
  const factLine =
    verifiedFacts.find((f) => /Draft complete:/i.test(f)) ??
    verifiedFacts[0] ??
    "Draft complete: picks are in.";
  const value = verifiedFacts.find((f) => /Best value:/i.test(f));
  const reach = verifiedFacts.find((f) => /Biggest reach:/i.test(f));
  const topPos = verifiedFacts.find((f) => /Most drafted position:/i.test(f));

  if (voice === "sofia") {
    if (value) return { line: `${factLine.replace(/\.$/, "")}. ${value.replace(/\.$/, "")}.`, premise: factLine };
    if (reach) return { line: `${factLine.replace(/\.$/, "")}. ${reach.replace(/\.$/, "")}.`, premise: factLine };
    return { line: factLine.endsWith(".") ? factLine : `${factLine}.`, premise: factLine };
  }
  if (voice === "coach") {
    if (topPos) {
      return {
        line: `${topPos.replace(/\.$/, "")} That skew is where this league spent its draft capital.`,
        premise: topPos,
      };
    }
    if (reach) {
      return {
        line: `Final board check: the reach stands out — those early spends will define roster stress by midseason.`,
        premise: reach,
      };
    }
    return {
      line: "Now read the thin positions — that's where trade season starts.",
      premise: factLine,
    };
  }
  if (value) {
    return {
      line: `Best-value gossip is already loaded: ${value.replace(/\.$/, "")}. September will settle it.`,
      premise: value,
    };
  }
  return {
    line: "Boards locked — this league will replay these cards until kickoff.",
    premise: factLine,
  };
}

/** Parse a buildVoicePrompt string into structured facts for deterministic generation. */
export function parseVoicePromptForCommentary(prompt: string): {
  voice: AnalystVoiceId;
  facts: CommentaryFacts;
  isWrapUp: boolean;
} {
  const voice: AnalystVoiceId = /^You are Sofia\b/m.test(prompt)
    ? "sofia"
    : /^You are Coach\b/m.test(prompt)
      ? "coach"
      : "roxanne";

  const verifiedFacts = [...prompt.matchAll(/^\d+\.\s*(.+)$/gm)].map((m) => m[1]!.trim());
  const storylines = [...prompt.matchAll(/^- (.+)$/gm)].map((m) => m[1]!.trim());

  const momentMatch = prompt.match(
    /MOMENT:\s*(.+?)\s+selected\s+(.+?)\s+\((\w+)\)\s+at pick (\d+), round (\d+)/i,
  );
  const subject: CommentarySubject = {
    ownerName: momentMatch?.[1] ?? "Owner",
    playerName: momentMatch?.[2] ?? "Player",
    position: momentMatch?.[3] ?? "WR",
    overallPick: Number(momentMatch?.[4] ?? 1),
    round: Number(momentMatch?.[5] ?? 1),
  };

  const sigMatch = prompt.match(/SIGNIFICANCE:\s*(routine|notable|major|historic)/i);
  const significance = (sigMatch?.[1]?.toLowerCase() ?? "notable") as CommentarySignificance;

  const isWrapUp = /DRAFT_WRAP_UP|Draft complete:/i.test(prompt);

  return {
    voice,
    isWrapUp,
    facts: {
      subject,
      verifiedFacts: verifiedFacts.length
        ? verifiedFacts
        : [
            `${subject.ownerName} selected ${subject.playerName} (${subject.position}) at pick ${subject.overallPick}, round ${subject.round}.`,
          ],
      storylines,
      significance,
    },
  };
}
