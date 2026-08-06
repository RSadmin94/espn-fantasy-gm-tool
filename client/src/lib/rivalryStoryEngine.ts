/**
 * RFSN-048B — Presentation-only formatting for Owner Dossier rivalry cards.
 *
 * Does NOT invent rivalry narratives, playoff claims, streaks, or eliminations.
 * Displays verified explanation payloads from `rivalryStory.dossierCardExplanations`.
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

/** Record line for cards: `27–27–2 · 56 meetings`. */
export function formatRivalStoryRecordLine(row: MatchupIntelHighlightRow): string {
  const { games } = wl(row);
  const meetings = games === 1 ? "1 meeting" : `${games} meetings`;
  return `${formatRecord(row)} · ${meetings}`;
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
