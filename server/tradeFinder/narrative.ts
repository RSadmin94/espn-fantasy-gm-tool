/**
 * Optional AI narrative. Deterministic ranking is already final.
 * AI may only rewrite why/risk from grounded facts. On any failure, leave deterministic text.
 */
import type { TradeFinderCandidate } from "./types";

const BANNED = [
  /\d+\s*%\s*(chance|likely|probability)/i,
  /\bwill accept\b/i,
  /\bloves?\b/i,
  /\bhates?\b/i,
  /\balways\b/i,
  /\bnever trades?\b/i,
];

export interface NarrativeDraft {
  index: number;
  why: string;
  risk: string;
}

export function parseNarrativePayload(raw: string, expected: number): NarrativeDraft[] | null {
  if (!raw || expected <= 0) return null;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== expected) return null;
    const out: NarrativeDraft[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i] as { index?: unknown; why?: unknown; risk?: unknown };
      if (typeof row.why !== "string" || typeof row.risk !== "string") return null;
      const idx = typeof row.index === "number" ? row.index : i;
      if (idx !== i) return null;
      out.push({ index: i, why: row.why.trim(), risk: row.risk.trim() });
    }
    return out;
  } catch {
    return null;
  }
}

export function isGroundedNarrative(text: string, facts: string): boolean {
  if (!text || text.length > 420) return false;
  for (const re of BANNED) {
    if (re.test(text)) return false;
  }
  // Invented proper names: any Capitalized token of length >= 4 that is not in the fact packet.
  const tokens = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? [];
  for (const tok of tokens) {
    if (tok.length < 4) continue;
    if (["You", "Your", "They", "Their", "Rivals", "Fairness", "Balanced", "Slight", "Edge", "Watch"].includes(tok)) {
      continue;
    }
    if (!facts.includes(tok)) return false;
  }
  return true;
}

export function applyNarratives(
  trades: TradeFinderCandidate[],
  rawAi: string | null | undefined,
): { trades: TradeFinderCandidate[]; applied: boolean } {
  if (!rawAi || trades.length === 0) return { trades, applied: false };
  const drafts = parseNarrativePayload(rawAi, trades.length);
  if (!drafts) return { trades, applied: false };
  const next = trades.map((t, i) => {
    const facts = [
      t.partnerName,
      ...t.youGive.map((a) => a.name),
      ...t.youReceive.map((a) => a.name),
      t.fairness,
      t.tradeFit,
      t.opportunity,
      t.rivalsVerdict,
      t.whyTheydConsider,
      t.theCost,
      t.whyThisWorks,
      t.riskWatchout,
      t.behaviorNote ?? "",
    ].join(" | ");
    const d = drafts[i];
    const whyOk = isGroundedNarrative(d.why, facts);
    const riskOk = isGroundedNarrative(d.risk, facts);
    return {
      ...t,
      whyAi: whyOk ? d.why : null,
      riskAi: riskOk ? d.risk : null,
    };
  });
  const applied = next.some((t) => t.whyAi || t.riskAi);
  return { trades: next, applied };
}
