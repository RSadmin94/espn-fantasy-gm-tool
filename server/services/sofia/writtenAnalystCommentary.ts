/**
 * Fact-driven written commentary lines for Sofia / Coach / Roxanne.
 * Used by the deterministic live provider (voice beta off) so booth text is not a transaction log.
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

const TXN_RECEIPT_RE =
  /^(.+?)\s+selected\s+(.+?)\s+\((\w+)\)\s+at pick\s+(\d+),\s*round\s+(\d+)\.?$/i;

function pickVariant(seed: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, count);
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
    if (m) return { kind: "ahead", picks: Math.round(Number(m[1])), fact: f.replace(/\.$/, "") };
    m = f.match(/fell\s+(\d+(?:\.\d+)?)\s+picks past ADP/i);
    if (m) return { kind: "fell", picks: Math.round(Number(m[1])), fact: f.replace(/\.$/, "") };
  }
  return null;
}

function wantsLonger(sig: CommentarySignificance, extraCount: number): boolean {
  if (sig === "major" || sig === "historic") return true;
  if (sig === "notable" && extraCount >= 1) return true;
  return false;
}

function sofiaLine(input: CommentaryFacts): { line: string; premise: string } {
  const { subject: s, verifiedFacts, storylines, significance } = input;
  const extras = nonReceiptFacts(verifiedFacts);
  const premise = extras[0] ?? verifiedFacts[0] ?? `${s.playerName} to ${s.ownerName} in round ${s.round}.`;
  const adp = parseAdpDelta(extras);
  const rosterNeed = firstMatch(extras, /still needed a starting/i);
  const posRun = firstMatch(extras, /\d+\s+\w+s in the last/i);
  const timing = firstMatch(extras, /earliest|latest|tracked history|has drafted a/i);
  const rivalry = firstMatch(extras, /rival/i);
  const long = wantsLonger(significance, extras.length);

  if (adp?.kind === "ahead") {
    const lead = `${s.playerName} went ${adp.picks} picks ahead of ADP for ${s.ownerName}`;
    if (long && rosterNeed) return { line: `${lead}. ${rosterNeed}.`, premise: adp.fact };
    if (long && timing) return { line: `${lead}. ${timing}.`, premise: adp.fact };
    return { line: `${lead}.`, premise: adp.fact };
  }
  if (adp?.kind === "fell") {
    const lead = `${s.playerName} fell ${adp.picks} picks past ADP before ${s.ownerName} claimed the ${s.position}`;
    if (long && posRun) return { line: `${lead}. ${posRun}.`, premise: adp.fact };
    return { line: `${lead}.`, premise: adp.fact };
  }
  if (timing) {
    return {
      line: long && extras[1] ? `${timing}. ${extras[1].replace(/\.$/, "")}.` : `${timing}.`,
      premise: timing,
    };
  }
  if (rosterNeed) {
    return {
      line: `${s.ownerName} still needed a starting ${s.position} — ${s.playerName} is the receipt.`,
      premise: rosterNeed,
    };
  }
  if (posRun) {
    return { line: `${posRun} ${s.ownerName} takes ${s.playerName}.`, premise: posRun };
  }
  if (rivalry) {
    return { line: `${rivalry} ${s.playerName} is the pick on the board.`, premise: rivalry };
  }
  if (storylines[0]) {
    const hook = storylines[0].replace(/_/g, " ").toLowerCase();
    return {
      line: `${s.playerName} (${s.position}) lands with ${s.ownerName} in round ${s.round} — ${hook} on the receipt.`,
      premise: premise,
    };
  }

  // Routine / identity-only: concise, non-transaction wording
  const routines = [
    `${s.playerName} is on ${s.ownerName}'s roster as a ${s.position} after pick ${s.overallPick}.`,
    `Round ${s.round}: ${s.ownerName} has ${s.playerName} (${s.position}).`,
    `${s.ownerName} locks ${s.playerName} at ${s.position} in round ${s.round}.`,
  ];
  return {
    line: routines[pickVariant(`${s.overallPick}:${s.playerName}:sofia`, routines.length)]!,
    premise,
  };
}

function coachLine(input: CommentaryFacts): { line: string; premise: string } {
  const { subject: s, verifiedFacts, significance } = input;
  const extras = nonReceiptFacts(verifiedFacts);
  const premise = extras[0] ?? verifiedFacts[0] ?? `${s.position} for ${s.ownerName}`;
  const adp = parseAdpDelta(extras);
  const rosterNeed = firstMatch(extras, /still needed a starting/i);
  const posRun = firstMatch(extras, /\d+\s+\w+s in the last/i);
  const long = wantsLonger(significance, extras.length);

  if (rosterNeed) {
    const line = long
      ? `${s.ownerName} just closed a starting ${s.position} hole with ${s.playerName} — that stabilizes the build before the board thins.`
      : `Starting ${s.position} need met — ${s.playerName} fits the construction.`;
    return { line, premise: rosterNeed };
  }
  if (adp?.kind === "ahead") {
    const line = long
      ? `Paying ${adp.picks} picks of ADP premium for ${s.playerName} locks ${s.position} early and forces thinner choices later.`
      : `That ADP premium says ${s.position} was the priority over waiting the board.`;
    return { line, premise: adp.fact };
  }
  if (adp?.kind === "fell") {
    const line = long
      ? `${s.playerName} falling ${adp.picks} picks is roster value — ${s.ownerName} strengthens ${s.position} without burning an early chip.`
      : `Value at ${s.position} — that fall helps the back half of the roster.`;
    return { line, premise: adp.fact };
  }
  if (posRun) {
    return {
      line: long
        ? `${posRun} Sitting out means scarcer ${s.position} later — ${s.ownerName} is reacting to board pressure.`
        : `Board run at ${s.position} — taking ${s.playerName} is positional insurance.`,
      premise: posRun,
    };
  }

  const routines = [
    `${s.position} on the card in round ${s.round} — construction over flash.`,
    `Watch the ${s.position} depth after this; ${s.ownerName} just spent a round there.`,
    `${s.playerName} changes the ${s.position} math on ${s.ownerName}'s roster.`,
  ];
  return {
    line: routines[pickVariant(`${s.overallPick}:${s.playerName}:coach`, routines.length)]!,
    premise,
  };
}

function roxanneLine(input: CommentaryFacts): { line: string; premise: string } {
  const { subject: s, verifiedFacts, significance } = input;
  const extras = nonReceiptFacts(verifiedFacts);
  const premise = extras[0] ?? verifiedFacts[0] ?? `${s.ownerName} + ${s.playerName}`;
  const adp = parseAdpDelta(extras);
  const rivalry = firstMatch(extras, /rival/i);
  const posRun = firstMatch(extras, /\d+\s+\w+s in the last/i);
  const long = wantsLonger(significance, extras.length);

  if (rivalry) {
    const line = long
      ? `${rivalry} Now ${s.playerName} is on ${s.ownerName}'s board — screenshot that before the group chat loses it.`
      : `Rival heat on the clock — ${s.playerName} is going to live rent-free.`;
    return { line, premise: rivalry };
  }
  if (adp?.kind === "ahead") {
    return {
      line: long
        ? `${s.ownerName} just paid ${adp.picks} picks early for ${s.playerName}. The draft room heard that — somebody's cursing the board.`
        : `${s.ownerName} reached for ${s.playerName} — that one's going to be a season-long argument.`,
      premise: adp.fact,
    };
  }
  if (adp?.kind === "fell") {
    return {
      line: long
        ? `${s.playerName} falling ${adp.picks} spots is chaos. Bookmark ${s.ownerName} — this is the steal people replay in week 8.`
        : `Faller alert: ${s.playerName} to ${s.ownerName}. Someone slept.`,
      premise: adp.fact,
    };
  }
  if (posRun) {
    return {
      line: `${posRun} ${s.ownerName} jumped in with ${s.playerName} — run panic is real.`,
      premise: posRun,
    };
  }

  const routines = [
    `${s.ownerName} just put ${s.playerName} on the board — the room felt that.`,
    `That's a draft-room reaction pick: ${s.playerName} changes the temperature.`,
    `Consequences incoming — ${s.playerName} to ${s.ownerName} is going to draw replies.`,
  ];
  return {
    line: routines[pickVariant(`${s.overallPick}:${s.playerName}:roxanne`, routines.length)]!,
    premise,
  };
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
        line: `${topPos.replace(/\.$/, "")} That tells you where this league built pressure all night.`,
        premise: topPos,
      };
    }
    if (reach) {
      return {
        line: `The big reach stands out in the final ledger — construction choices will define these rosters by week 6.`,
        premise: reach,
      };
    }
    return {
      line: "Scan the thin positions now — that's where championships get lost between the trades.",
      premise: factLine,
    };
  }
  if (value) {
    return {
      line: `Best-value energy is already starting fights: ${value.replace(/\.$/, "")}. Don't act surprised in September.`,
      premise: value,
    };
  }
  return {
    line: "Boards are set — this draft room is going to rehearse these picks all season.",
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
