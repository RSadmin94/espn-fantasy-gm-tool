/**
 * RFSN-055F — deterministic Draft Receipt text.
 *
 * Consumes existing historicalDraftEvaluation results. Does not grade,
 * recompute ADP, or classify reaches. Future SHARE RECEIPT image cards
 * should consume `buildDraftReceipt()`, not reconstruct grades.
 */

export const DRAFT_RECEIPT_PUBLIC_HOST = "fantasyfootballrivals.com";
export const RESULTS_LOW_MAX = 25;
export const RESULTS_HIGH_MIN = 70;
export const STRONG_NIGHT_GRADES = ["A", "B"] as const;
export const WEAK_NIGHT_GRADES = ["D", "F"] as const;
export const MAX_RECEIPT_FACTS = 2;

export type DraftReceiptNight = {
  available: boolean;
  reason: string | null;
  grade: string | null;
  biggestReach: { playerName: string; pick: number } | null;
  biggestSteal: { playerName: string; pick: number } | null;
};

export type DraftReceiptReality = {
  available: boolean;
  reason: string | null;
  draftGrade: number | null;
  rosterMgmtGrade: number | null;
  simulatedRecord: string | null;
  actualRecord: string | null;
  winDifference: number | null;
};

export type DraftReceiptInput = {
  season: number;
  ownerName: string;
  draftNight: DraftReceiptNight;
  draftReality: DraftReceiptReality;
};

export type NightResultsContradiction = "loved-it" | "board-cold" | null;

export type DraftReceiptModel = {
  title: string;
  ownerName: string;
  season: number;
  gradeLines: string[];
  facts: string[];
  taglines: string[];
  closer: string;
  brand: string;
  link: string;
};

function nightLetter(grade: string | null | undefined): string | null {
  const g = String(grade ?? "").trim().toUpperCase();
  return g || null;
}

export function classifyNightResultsContradiction(
  nightGrade: string | null | undefined,
  results: number | null | undefined,
): NightResultsContradiction {
  const letter = nightLetter(nightGrade);
  if (letter == null || results == null || !Number.isFinite(results)) return null;
  const strong = (STRONG_NIGHT_GRADES as readonly string[]).includes(letter);
  const weak = (WEAK_NIGHT_GRADES as readonly string[]).includes(letter);
  if (strong && results <= RESULTS_LOW_MAX) return "loved-it";
  if (weak && results >= RESULTS_HIGH_MIN) return "board-cold";
  return null;
}

function nightLine(night: DraftReceiptNight): string {
  if (night.available && nightLetter(night.grade)) {
    return `Draft Night: ${nightLetter(night.grade)}`;
  }
  const reason = String(night.reason ?? "");
  if (/adp/i.test(reason)) {
    return "Draft Night: Not graded — historical ADP unavailable";
  }
  return "Draft Night: Not graded";
}

function resultsLine(reality: DraftReceiptReality): string | null {
  if (reality.available && reality.draftGrade != null && Number.isFinite(reality.draftGrade)) {
    return `Draft Results: ${reality.draftGrade}`;
  }
  if (!reality.available) return "Draft Results: Not graded";
  return null;
}

function managementLine(reality: DraftReceiptReality): string | null {
  if (reality.available && reality.rosterMgmtGrade != null && Number.isFinite(reality.rosterMgmtGrade)) {
    return `Roster Management: ${reality.rosterMgmtGrade}`;
  }
  return null;
}

function reachFact(row: { playerName: string; pick: number } | null): string | null {
  const name = String(row?.playerName ?? "").trim();
  const pick = Number(row?.pick);
  if (!name || !Number.isFinite(pick) || pick <= 0) return null;
  return `Biggest Reach: ${name} — Pick ${pick}`;
}

function stealFact(row: { playerName: string; pick: number } | null): string | null {
  const name = String(row?.playerName ?? "").trim();
  const pick = Number(row?.pick);
  if (!name || !Number.isFinite(pick) || pick <= 0) return null;
  return `Biggest Steal: ${name} — Pick ${pick}`;
}

function winDiffFact(diff: number): string {
  if (diff > 0) return `Win difference: +${diff}`;
  if (diff < 0) return `Win difference: ${diff}`;
  return "Win difference: 0";
}

/** Wins-losses or wins-losses-ties. Returns total games, or null if unparseable. */
export function recordGameCount(record: string): number | null {
  const t = record.trim();
  if (!t || t === "—") return null;
  const parts = t.split("-").map((p) => Number(p));
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((n) => Number.isFinite(n) && n >= 0)) return null;
  return parts.reduce((sum, n) => sum + n, 0);
}

export const RECORD_COVERAGE_NOTE =
  "Different game counts — replay coverage vs completed season.";

function recordFact(reality: DraftReceiptReality): string | null {
  const sim = String(reality.simulatedRecord ?? "").trim();
  const actual = String(reality.actualRecord ?? "").trim();
  if (sim && actual) {
    const line = `Untouched Draft: ${sim} · Actual Record: ${actual}`;
    const simGames = recordGameCount(sim);
    const actualGames = recordGameCount(actual);
    if (simGames != null && actualGames != null && simGames !== actualGames) {
      return `${line}\n${RECORD_COVERAGE_NOTE}`;
    }
    return line;
  }
  if (reality.winDifference != null && Number.isFinite(reality.winDifference)) {
    return winDiffFact(reality.winDifference);
  }
  return null;
}

function selectFacts(
  night: DraftReceiptNight,
  reality: DraftReceiptReality,
  contradiction: NightResultsContradiction,
): string[] {
  const facts: string[] = [];
  const push = (line: string | null) => {
    if (line && facts.length < MAX_RECEIPT_FACTS) facts.push(line);
  };

  const reach = night.available ? reachFact(night.biggestReach) : null;
  const steal = night.available ? stealFact(night.biggestSteal) : null;
  const records = reality.available ? recordFact(reality) : null;

  if (contradiction === "loved-it") {
    push(steal);
    push(records);
    push(reach);
  } else if (contradiction === "board-cold") {
    push(reach);
    push(records);
    push(steal);
  } else {
    push(reach);
    push(steal);
    push(records);
  }
  return facts;
}

function taglinesFor(
  night: DraftReceiptNight,
  contradiction: NightResultsContradiction,
): { taglines: string[]; closer: string } {
  const letter = nightLetter(night.grade);
  if (contradiction && letter) {
    return {
      taglines: [`DRAFT NIGHT SAID ${letter}.`, "THE SEASON SAID OTHERWISE."],
      closer: "THE RECEIPTS DON'T LIE.",
    };
  }
  if (!night.available) {
    return { taglines: [], closer: "THE BOARD REMEMBERS." };
  }
  return { taglines: [], closer: "THE RECEIPTS DON'T LIE." };
}

export function buildDraftReceipt(input: DraftReceiptInput): DraftReceiptModel {
  const ownerName = String(input.ownerName ?? "").trim() || "Unknown owner";
  const season = Math.floor(Number(input.season));
  const contradiction = classifyNightResultsContradiction(
    input.draftNight.grade,
    input.draftReality.available ? input.draftReality.draftGrade : null,
  );
  const gradeLines = [
    nightLine(input.draftNight),
    resultsLine(input.draftReality),
    managementLine(input.draftReality),
  ].filter((line): line is string => Boolean(line));
  const { taglines, closer } = taglinesFor(input.draftNight, contradiction);
  return {
    title: `RIVALS DRAFT RECEIPT — ${season}`,
    ownerName,
    season,
    gradeLines,
    facts: selectFacts(input.draftNight, input.draftReality, contradiction),
    taglines,
    closer,
    brand: "Fantasy Football Rivals",
    link: `See the receipts: ${DRAFT_RECEIPT_PUBLIC_HOST}`,
  };
}

/** Plain-text clipboard receipt. No markdown, HTML, or tables. */
export function formatDraftReceipt(input: DraftReceiptInput): string {
  const model = buildDraftReceipt(input);
  const blocks: string[][] = [
    [model.title, model.ownerName],
    model.gradeLines,
  ];
  if (model.facts.length > 0) blocks.push(model.facts);
  const punch = [...model.taglines, model.closer];
  blocks.push(punch);
  blocks.push([model.brand, model.link]);
  return blocks.map((b) => b.join("\n")).join("\n\n");
}

export function receiptContainsHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(text);
}
