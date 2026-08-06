/**
 * RFSN-048B/C — Presentation-only formatting for Owner Dossier rivalry cards.
 *
 * Does NOT invent rivalry narratives. Displays verified explanation payloads
 * from `rivalryStory.dossierCardExplanations`, including the canonical evidence
 * package so header and Why never disagree (RFSN-048C).
 */
import type { MatchupIntelHighlightRow } from "@/lib/rivalryHighlightSelection";

/** Threat definition labels (do not unify scoring — documentation only). */
export const THREAT_DEFINITION_DOSSIER = "Active matchup threat";
export const THREAT_DEFINITION_ADVISOR = "Advisor composite threat (computeBiggestThreat)";
export const THREAT_DEFINITION_RIVALRY_CENTER = "Rivalry Center playoff-elimination threat";

export type DossierCardKind = "historical" | "currentRival" | "activeThreat";

export type DossierExplanationBullet = {
  text: string;
  factKeys?: string[];
  receiptIds?: string[];
};

export type DossierRivalryEvidenceView = {
  source: "h2hAuthority" | "none" | string;
  scopeLabel: string;
  startSeason: number | null;
  endSeason: number | null;
  includesRegularSeason: boolean;
  includesPlayoffs: boolean;
  wins: number;
  losses: number;
  ties: number;
  meetings: number;
  effectivePct: number;
  recordLine: string;
  coverageLabel: string | null;
  playoffWins?: number;
  playoffLosses?: number;
  playoffTies?: number;
  playoffMeetings?: number;
  playoffRecordLine: string | null;
};

export type DossierRivalryExplanationView = {
  cardKind: DossierCardKind;
  opponentOwnerKey: string;
  opponentOwnerName: string;
  headline: string | null;
  reason: string | null;
  bullets: DossierExplanationBullet[];
  provenance: string[];
  coverageQualifier: string | null;
  matchedAdvisorThreat: boolean;
  evidence?: DossierRivalryEvidenceView | null;
};

function wl(row: MatchupIntelHighlightRow) {
  const wins = Math.max(0, Math.floor(Number(row.wins ?? 0)));
  const losses = Math.max(0, Math.floor(Number(row.losses ?? 0)));
  const ties = Math.max(0, Math.floor(Number(row.ties ?? 0)));
  const games =
    Math.max(0, Math.floor(Number(row.games ?? 0))) || wins + losses + ties;
  return { wins, losses, ties, games };
}

function formatRecord(row: MatchupIntelHighlightRow): string {
  const { wins, losses, ties } = wl(row);
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

/** Fallback only when authority evidence is unavailable. */
export function formatRivalStoryRecordLine(row: MatchupIntelHighlightRow): string {
  const { games } = wl(row);
  const meetings = games === 1 ? "1 meeting" : `${games} meetings`;
  return `${formatRecord(row)} · ${meetings}`;
}

/** Prefer authority evidence record; never mix with matchupIntel totals. */
export function formatCardRecordLine(
  explanation: DossierRivalryExplanationView | null | undefined,
  fallbackRow?: MatchupIntelHighlightRow | null,
): string | null {
  const ev = explanation?.evidence;
  if (ev && ev.source === "h2hAuthority" && ev.meetings > 0 && ev.recordLine) {
    return ev.recordLine;
  }
  if (fallbackRow && (!explanation || explanation.evidence?.source === "none")) {
    // Explicit fallback scope — only when authority package is missing
    return `${formatRivalStoryRecordLine(fallbackRow)} (matchup intel)`;
  }
  return ev?.recordLine && ev.recordLine !== "—" ? ev.recordLine : null;
}

export function formatCardCoverageLabel(
  explanation: DossierRivalryExplanationView | null | undefined,
): string | null {
  const ev = explanation?.evidence;
  if (ev?.coverageLabel) return ev.coverageLabel;
  return explanation?.coverageQualifier ?? null;
}

/** Truncate reason for card density — no semantic rewriting. */
export function truncateExplanationReason(reason: string | null | undefined, max = 220): string | null {
  const t = String(reason ?? "").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Pick at most `max` verified bullets (already authoritative). */
export function selectExplanationBullets(
  bullets: DossierExplanationBullet[] | null | undefined,
  max = 3,
): DossierExplanationBullet[] {
  if (!Array.isArray(bullets)) return [];
  return bullets
    .filter((b) => String(b?.text ?? "").trim().length > 0)
    .slice(0, max)
    .map((b) => ({
      text: String(b.text).trim(),
      factKeys: Array.isArray(b.factKeys) ? b.factKeys.map(String) : [],
      receiptIds: Array.isArray(b.receiptIds) ? b.receiptIds.map(String) : [],
    }));
}

/**
 * Drop bullets that restate the primary header record (RFSN-048C).
 * Playoff / last-five / streak lines stay.
 */
export function filterBulletsAgainstHeaderRecord(
  bullets: DossierExplanationBullet[],
  evidence: DossierRivalryEvidenceView | null | undefined,
): DossierExplanationBullet[] {
  if (!evidence || evidence.meetings <= 0) return bullets;
  const primary = `${evidence.wins}–${evidence.losses}`;
  const primaryTied =
    evidence.ties > 0 ? `${evidence.wins}–${evidence.losses}–${evidence.ties}` : primary;
  return bullets.filter((b) => {
    const t = b.text;
    if (/^Career:/i.test(t)) return false;
    if (t.includes(primaryTied) && /recorded meetings/i.test(t) && !/^Playoffs:/i.test(t)) {
      return false;
    }
    return true;
  });
}

export function explanationForCard(
  explanations: DossierRivalryExplanationView[] | null | undefined,
  cardKind: DossierCardKind,
  opponentOwnerKey?: string | null,
): DossierRivalryExplanationView | null {
  if (!Array.isArray(explanations)) return null;
  const key = String(opponentOwnerKey ?? "").trim().toLowerCase();
  const matches = explanations.filter((e) => e.cardKind === cardKind);
  if (!matches.length) return null;
  if (!key) return matches[0] ?? null;
  return (
    matches.find((e) => String(e.opponentOwnerKey).trim().toLowerCase() === key) ??
    matches.find((e) => String(e.opponentOwnerName).trim().toLowerCase() === key) ??
    matches[0] ??
    null
  );
}

/** Assert header record string is consistent with evidence (for tests). */
export function headerMatchesEvidence(
  recordLine: string | null,
  evidence: DossierRivalryEvidenceView | null | undefined,
): boolean {
  if (!recordLine || !evidence || evidence.source !== "h2hAuthority") return false;
  return recordLine === evidence.recordLine;
}
