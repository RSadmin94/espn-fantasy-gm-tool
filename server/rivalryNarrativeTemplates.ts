/**
 * rivalryNarrativeTemplates.ts
 *
 * Controlled deterministic narrative statements for rivalry documentary blocks.
 * Consumes story authority + receipt resolver output only — no H2H recomputation,
 * no receipt resolution, no LLM generation, no client-side prose.
 */
import type { H2HResult } from "./h2hAuthority";
import { meetingReceiptId } from "./rivalryStoryAuthority";
import type { DocumentaryFactKey, RivalryStoryResult } from "./rivalryStoryAuthority";
import type { RivalryStoryReceipt } from "./rivalryStoryReceipts";

// ── Public types ──────────────────────────────────────────────────────────────

export type NarrativeBlockKey = "coldOpen" | "taleOfTape" | "currentState" | "receipt";

export type NarrativeStatementKey =
  | "THREE_ELIMINATIONS_LEAD"
  | "DEAD_EVEN_DIFFERENT_LEGACIES_LEAD"
  | "PLAYOFF_OWNER_LEAD"
  | "CAREER_RECORD"
  | "PLAYOFF_RECORD"
  | "RECENT_FORM";

export interface RivalryNarrativeStatement {
  statementKey: NarrativeStatementKey;
  block: NarrativeBlockKey;
  priority: number;
  text: string;
  receiptIds: string[];
  factKeys: DocumentaryFactKey[];
  confidence: number;
}

export interface BuildRivalryNarrativeStatementsInput {
  story: RivalryStoryResult;
  receipts: RivalryStoryReceipt[];
  h2h: H2HResult;
  focalName: string;
  rivalName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRecord(wins: number, losses: number, ties = 0): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

function careerTied(h2h: H2HResult): boolean {
  return Math.abs(h2h.career.wins - h2h.career.losses) <= 1;
}

function playoffTied(h2h: H2HResult): boolean {
  return h2h.playoffs.wins === h2h.playoffs.losses;
}

function receiptsWithFactKey(
  receipts: RivalryStoryReceipt[],
  factKey: DocumentaryFactKey,
): RivalryStoryReceipt[] {
  return receipts.filter((r) => r.factKeys.includes(factKey));
}

function gameReceiptIds(
  receipts: RivalryStoryReceipt[],
  opts: { playoff?: boolean },
): string[] {
  return receipts
    .filter((r) => {
      if (r.type !== "game") return false;
      if (opts.playoff === true) return r.isPlayoff === true;
      if (opts.playoff === false) return r.isPlayoff !== true;
      return true;
    })
    .map((r) => r.receiptId);
}

function recentRsMeetingReceiptIds(h2h: H2HResult): string[] {
  const rs = h2h.meetings
    .filter((m) => !m.isPlayoff)
    .sort((a, b) => a.season - b.season || a.matchupPeriodId - b.matchupPeriodId);
  return rs.slice(-5).map(meetingReceiptId);
}

function titleCountsFromReceipts(
  receipts: RivalryStoryReceipt[],
): { focal: number; rival: number } | null {
  let focal: number | null = null;
  let rival: number | null = null;
  for (const r of receipts) {
    const m = r.receiptId.match(/^title:(focal|rival):(\d+)$/);
    if (!m) continue;
    const count = Number(m[2]);
    if (m[1] === "focal") focal = count;
    else rival = count;
  }
  if (focal === null && rival === null) return null;
  return { focal: focal ?? 0, rival: rival ?? 0 };
}

function playoffChapterWinnerName(
  h2h: H2HResult,
  focalName: string,
  rivalName: string,
): string | null {
  if (h2h.playoffs.games < 2) return null;
  if (h2h.playoffs.wins === h2h.playoffs.losses) return null;
  return h2h.playoffs.wins > h2h.playoffs.losses ? focalName : rivalName;
}

function hasBlock(story: RivalryStoryResult, block: "taleOfTape"): boolean {
  return story.availableBlocks.includes(block);
}

// ── Template builders ─────────────────────────────────────────────────────────

function tryThreeEliminationsLead(
  input: BuildRivalryNarrativeStatementsInput,
): RivalryNarrativeStatement | null {
  const { story, receipts, focalName, rivalName } = input;
  if (story.headline.key !== "THREE_ELIMINATIONS") return null;

  const elimReceipts = receiptsWithFactKey(receipts, "PLAYOFF_ELIMINATION");
  if (elimReceipts.length < 3) return null;

  const count = elimReceipts.length;
  return {
    statementKey: "THREE_ELIMINATIONS_LEAD",
    block: "coldOpen",
    priority: 100,
    text: `${rivalName} has ended ${focalName}'s season ${count} times.`,
    receiptIds: elimReceipts.map((r) => r.receiptId),
    factKeys: ["PLAYOFF_ELIMINATION"],
    confidence: story.headline.confidence,
  };
}

function tryDeadEvenDifferentLegaciesLead(
  input: BuildRivalryNarrativeStatementsInput,
): RivalryNarrativeStatement | null {
  const { story, receipts, h2h } = input;
  if (story.headline.key !== "DEAD_EVEN_DIFFERENT_LEGACIES") return null;
  if (!careerTied(h2h)) return null;

  const titles = titleCountsFromReceipts(receipts);
  const titlesDiffer = titles != null && titles.focal !== titles.rival;
  const playoffDiffers = !playoffTied(h2h) && h2h.playoffs.games > 0;
  if (!playoffDiffers && !titlesDiffer) return null;

  const titleReceipts = receipts
    .filter((r) => r.receiptId.startsWith("title:"))
    .map((r) => r.receiptId);

  return {
    statementKey: "DEAD_EVEN_DIFFERENT_LEGACIES_LEAD",
    block: "coldOpen",
    priority: 90,
    text: "Dead even in the series. Not in the legacy.",
    receiptIds: titleReceipts.length > 0 ? titleReceipts : gameReceiptIds(receipts, { playoff: false }).slice(-3),
    factKeys: ["TITLE_DIVERGENCE"],
    confidence: story.headline.confidence,
  };
}

function tryPlayoffOwnerLead(
  input: BuildRivalryNarrativeStatementsInput,
): RivalryNarrativeStatement | null {
  const { story, receipts, h2h, focalName, rivalName } = input;
  if (story.headline.key !== "PLAYOFF_OWNER") return null;

  const winnerName = playoffChapterWinnerName(h2h, focalName, rivalName);
  if (!winnerName) return null;

  const playoffReceipts = gameReceiptIds(receipts, { playoff: true });

  return {
    statementKey: "PLAYOFF_OWNER_LEAD",
    block: "coldOpen",
    priority: 80,
    text: `${winnerName} owns the playoff chapter.`,
    receiptIds: playoffReceipts,
    factKeys: ["PLAYOFF_MEETING"],
    confidence: story.headline.confidence,
  };
}

function tryCareerRecord(
  input: BuildRivalryNarrativeStatementsInput,
): RivalryNarrativeStatement | null {
  const { story, receipts, h2h } = input;
  if (!hasBlock(story, "taleOfTape")) return null;

  const rsReceipts = gameReceiptIds(receipts, { playoff: false });

  return {
    statementKey: "CAREER_RECORD",
    block: "taleOfTape",
    priority: 50,
    text: `Career: ${formatRecord(h2h.career.wins, h2h.career.losses, h2h.career.ties)}.`,
    receiptIds: rsReceipts,
    factKeys: [],
    confidence: rsReceipts.length > 0 ? 0.95 : 0.7,
  };
}

function tryPlayoffRecord(
  input: BuildRivalryNarrativeStatementsInput,
): RivalryNarrativeStatement | null {
  const { story, receipts, h2h } = input;
  if (!hasBlock(story, "taleOfTape")) return null;
  if (h2h.playoffs.games === 0) return null;

  const playoffReceipts = gameReceiptIds(receipts, { playoff: true });

  return {
    statementKey: "PLAYOFF_RECORD",
    block: "taleOfTape",
    priority: 40,
    text: `Playoffs: ${formatRecord(h2h.playoffs.wins, h2h.playoffs.losses, h2h.playoffs.ties)}.`,
    receiptIds: playoffReceipts,
    factKeys: ["PLAYOFF_MEETING"],
    confidence: playoffReceipts.length > 0 ? 0.95 : 0.75,
  };
}

function tryRecentForm(
  input: BuildRivalryNarrativeStatementsInput,
): RivalryNarrativeStatement | null {
  const { story, h2h } = input;
  if (!hasBlock(story, "taleOfTape")) return null;
  if (h2h.recent5.games === 0) return null;

  const receiptIds = recentRsMeetingReceiptIds(h2h);

  return {
    statementKey: "RECENT_FORM",
    block: "taleOfTape",
    priority: 30,
    text: `Last five: ${formatRecord(h2h.recent5.wins, h2h.recent5.losses, h2h.recent5.ties)}.`,
    receiptIds,
    factKeys: h2h.streak.count >= 3 ? ["STREAK_ACTIVE"] : [],
    confidence: receiptIds.length > 0 ? 0.9 : 0.65,
  };
}

export type BuildRivalryColdOpenTeaserInput = Pick<
  BuildRivalryNarrativeStatementsInput,
  "story" | "h2h" | "focalName" | "rivalName"
>;

function tryThreeEliminationsTeaser(
  input: BuildRivalryColdOpenTeaserInput,
): RivalryNarrativeStatement | null {
  const { story, focalName, rivalName } = input;
  if (story.headline.key !== "THREE_ELIMINATIONS") return null;

  const count = story.headline.receiptIds.length;
  if (count < 3) return null;

  return {
    statementKey: "THREE_ELIMINATIONS_LEAD",
    block: "coldOpen",
    priority: 100,
    text: `${rivalName} has ended ${focalName}'s season ${count} times.`,
    receiptIds: [],
    factKeys: [],
    confidence: story.headline.confidence,
  };
}

function tryDeadEvenDifferentLegaciesTeaser(
  input: BuildRivalryColdOpenTeaserInput,
): RivalryNarrativeStatement | null {
  const { story, h2h } = input;
  if (story.headline.key !== "DEAD_EVEN_DIFFERENT_LEGACIES") return null;
  if (!careerTied(h2h)) return null;

  const hasTitleDivergence = story.documentaryFacts.some((f) => f.factKey === "TITLE_DIVERGENCE");
  const playoffDiffers = !playoffTied(h2h) && h2h.playoffs.games > 0;
  if (!playoffDiffers && !hasTitleDivergence) return null;

  return {
    statementKey: "DEAD_EVEN_DIFFERENT_LEGACIES_LEAD",
    block: "coldOpen",
    priority: 90,
    text: "Dead even in the series. Not in the legacy.",
    receiptIds: [],
    factKeys: [],
    confidence: story.headline.confidence,
  };
}

/** Cold-open teaser from story metadata + H2H only — no receipt resolution (freemium). */
export function buildRivalryColdOpenTeaser(
  input: BuildRivalryColdOpenTeaserInput,
): RivalryNarrativeStatement | null {
  if (!input.story.availableBlocks.includes("coldOpen")) return null;

  const candidates = [
    tryThreeEliminationsTeaser(input),
    tryDeadEvenDifferentLegaciesTeaser(input),
    tryPlayoffOwnerLead({ ...input, receipts: [] }),
  ].filter((s): s is RivalryNarrativeStatement => s != null);

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.priority - a.priority)[0]!;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildRivalryNarrativeStatements(
  input: BuildRivalryNarrativeStatementsInput,
): RivalryNarrativeStatement[] {
  const candidates = [
    tryThreeEliminationsLead(input),
    tryDeadEvenDifferentLegaciesLead(input),
    tryPlayoffOwnerLead(input),
    tryCareerRecord(input),
    tryPlayoffRecord(input),
    tryRecentForm(input),
  ].filter((s): s is RivalryNarrativeStatement => s != null);

  return candidates.sort((a, b) => {
    if (a.block !== b.block) return a.block.localeCompare(b.block);
    return b.priority - a.priority;
  });
}

export function selectTopStatementForBlock(
  statements: RivalryNarrativeStatement[],
  block: NarrativeBlockKey,
): RivalryNarrativeStatement | null {
  const blockStatements = statements.filter((s) => s.block === block);
  if (blockStatements.length === 0) return null;
  return blockStatements.sort((a, b) => b.priority - a.priority)[0]!;
}
