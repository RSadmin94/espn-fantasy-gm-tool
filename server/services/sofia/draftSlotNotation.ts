/**
 * Draft-slot notation — round.roundPick forms (e.g. 1.12) licensed only when the moment authorizes them.
 * Ordinary decimals (e.g. 98.8 ADP) remain governed by the numeric tolerance guard.
 */
import type { SubjectFallback } from "./sofiaGrounding";

export type DraftSlotRef = { round: number; roundPick: number };

const DRAFT_SLOT_TOKEN_RE = /\b(\d{1,2})\.(\d{1,2})\b/g;

/** Parse R.PP only when both parts are valid draft-slot components — not arbitrary decimals. */
export function parseDraftSlotToken(token: string): DraftSlotRef | null {
  const m = token.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!m) return null;
  const round = Number(m[1]);
  const roundPick = Number(m[2]);
  if (round < 1 || round > 25 || roundPick < 1 || roundPick > 32) return null;
  return { round, roundPick };
}

function slotKey(round: number, roundPick: number): string {
  return `${round}.${roundPick}`;
}

/** Authorized round.roundPick strings for this moment. */
export function licensedDraftSlots(
  subject: SubjectFallback,
  claims: string[],
  teamCount = 14,
): Set<string> {
  const slots = new Set<string>();
  const roundPick = subject.roundPick ?? deriveRoundPick(subject.overallPick, subject.round, teamCount);
  if (roundPick != null && roundPick >= 1) {
    slots.add(slotKey(subject.round, roundPick));
    if (roundPick < 10) slots.add(`${subject.round}.0${roundPick}`);
  }

  const claimsText = claims.join(" ");
  for (const m of claimsText.matchAll(/\bround\s+(\d{1,2})\b/gi)) {
    const r = Number(m[1]);
    for (const p of claimsText.matchAll(new RegExp(`pick\\s+(\\d{1,2}).{0,24}round\\s+${r}\\b`, "gi"))) {
      slots.add(slotKey(r, Number(p[1])));
    }
    for (const p of claimsText.matchAll(new RegExp(`round\\s+${r}.{0,24}pick\\s+(\\d{1,2})\\b`, "gi"))) {
      slots.add(slotKey(r, Number(p[1])));
    }
  }
  return slots;
}

function deriveRoundPick(overallPick: number, round: number, teamCount: number): number | null {
  if (overallPick < 1 || round < 1 || teamCount < 1) return null;
  const rp = overallPick - (round - 1) * teamCount;
  return rp >= 1 && rp <= teamCount ? rp : null;
}

export function extractDraftSlotTokens(line: string): string[] {
  return [...line.matchAll(DRAFT_SLOT_TOKEN_RE)].map((m) => m[0]!);
}

export function checkDraftSlotNotation(
  line: string,
  subject: SubjectFallback,
  claims: string[],
  teamCount = 14,
): { pass: boolean; violations: string[] } {
  const licensed = licensedDraftSlots(subject, claims, teamCount);
  const violations: string[] = [];
  for (const token of extractDraftSlotTokens(line)) {
    const parsed = parseDraftSlotToken(token);
    if (!parsed) continue;
    if (!licensed.has(token) && !licensed.has(slotKey(parsed.round, parsed.roundPick))) {
      violations.push(token);
    }
  }
  return { pass: violations.length === 0, violations };
}

/** Tokens in the line that are licensed draft-slot notation (excluded from decimal number guard). */
export function licensedDraftSlotTokensInLine(
  line: string,
  subject: SubjectFallback,
  claims: string[],
  teamCount = 14,
): Set<string> {
  const licensed = licensedDraftSlots(subject, claims, teamCount);
  const out = new Set<string>();
  for (const token of extractDraftSlotTokens(line)) {
    const parsed = parseDraftSlotToken(token);
    if (!parsed) continue;
    if (licensed.has(token) || licensed.has(slotKey(parsed.round, parsed.roundPick))) {
      out.add(token);
    }
  }
  return out;
}
