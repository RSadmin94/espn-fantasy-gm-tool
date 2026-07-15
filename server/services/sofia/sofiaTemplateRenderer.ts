/**
 * Sofia Phase 1 — deterministic template renderer. No LLM; routing stays internal.
 */
import {
  SOFIA_COMMENTARY_CONTRACT_VERSION,
  type CommentaryRoutingStrategy,
  type SofiaCommentary,
  type SofiaFactPacket,
} from "./sofiaContract";
import { storylineKeywords } from "./sofiaFactPacketBuilder";
import { assertCommentaryGrounded, countWords, type SubjectFallback } from "./sofiaGrounding";

/** Internal routing — never placed on SofiaCommentary (the wire). */
export type InternalCommentaryRouting = {
  strategy: CommentaryRoutingStrategy;
  level: SofiaFactPacket["level"];
  reason: string;
};

function findSelectionClaim(packet: SofiaFactPacket): string {
  const selected = packet.permittedClaims.find((c) => /\bselected\b/i.test(c));
  return selected ?? packet.permittedClaims[0] ?? "";
}

function claimMatchesStoryline(claim: string, storyline: string | null): boolean {
  if (!storyline) return false;
  const lower = claim.toLowerCase();
  return storylineKeywords(storyline).some((kw) => lower.includes(kw));
}

function pickSupportingClaims(packet: SofiaFactPacket, selection: string): string[] {
  const pool = packet.permittedClaims.filter((c) => c !== selection);
  const picked: string[] = [];
  const seen = new Set<string>();

  const tryAdd = (claim: string) => {
    if (!claim || seen.has(claim)) return;
    seen.add(claim);
    picked.push(claim);
  };

  for (const story of [packet.primaryStoryline, packet.secondaryStoryline]) {
    if (!story) continue;
    for (const claim of pool) {
      if (claimMatchesStoryline(claim, story)) tryAdd(claim);
    }
  }

  for (const claim of pool) {
    if (picked.length >= 2) break;
    tryAdd(claim);
  }

  return picked;
}

function assembleWithinBudget(parts: string[], maxWords: number, maxSentences: number): string {
  const sentences: string[] = [];
  let words = 0;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const partWords = countWords(trimmed);
    if (sentences.length >= maxSentences) break;
    if (words > 0 && words + partWords > maxWords) break;
    sentences.push(trimmed.endsWith(".") ? trimmed : `${trimmed}.`);
    words += partWords;
  }

  return sentences.join(" ").trim();
}

function subjectFromPacket(packet: SofiaFactPacket): SubjectFallback {
  return {
    ownerName: packet.owner.ownerName,
    playerName: packet.player.playerName,
    position: packet.player.position,
    overallPick: packet.overallPick,
    round: packet.round,
  };
}

/** Subject-only line built from approved fallback fields and connective allowlist fragments. */
function buildSubjectOnlySelectionLine(subject: SubjectFallback): string {
  return `${subject.ownerName} — ${subject.playerName} (${subject.position}) at pick ${subject.overallPick}, in round ${subject.round}.`;
}

function tryGroundedText(
  text: string,
  permittedClaims: string[],
  subject: SubjectFallback,
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    assertCommentaryGrounded(trimmed, permittedClaims, subject);
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Deterministic fallback hierarchy:
 * full template → permitted selection claim → subject-only line → explicit failure.
 */
function resolveGroundedCommentaryText(
  packet: SofiaFactPacket,
  subject: SubjectFallback,
  candidates: string[],
): string {
  for (const candidate of candidates) {
    const grounded = tryGroundedText(candidate, packet.permittedClaims, subject);
    if (grounded) return grounded;
  }
  throw new Error(
    `Sofia template renderer could not produce grounded commentary for moment ${packet.momentId}`,
  );
}

/** Pure, deterministic template commentary from a fact packet. */
export function renderTemplateCommentary(packet: SofiaFactPacket): SofiaCommentary {
  const routing: InternalCommentaryRouting = {
    strategy: "template",
    level: packet.level,
    reason: "phase1_template_first",
  };
  void routing;

  const maxWords = packet.commentaryBudget.maxWords > 0 ? packet.commentaryBudget.maxWords : 20;
  const maxSentences = packet.commentaryBudget.maxSentences > 0 ? packet.commentaryBudget.maxSentences : 1;

  const subject = subjectFromPacket(packet);
  const selection = findSelectionClaim(packet);
  const parts: string[] = selection ? [selection] : [];

  if (packet.level !== "routine") {
    parts.push(...pickSupportingClaims(packet, selection));
  }

  const fullTemplateText = assembleWithinBudget(parts, maxWords, maxSentences);
  const subjectOnlyText = buildSubjectOnlySelectionLine(subject);
  const text = resolveGroundedCommentaryText(packet, subject, [
    fullTemplateText,
    selection,
    subjectOnlyText,
  ]);

  return {
    contractVersion: SOFIA_COMMENTARY_CONTRACT_VERSION,
    momentId: packet.momentId,
    draftId: packet.draftId,
    leagueId: packet.leagueId,
    subject,
    level: packet.level,
    primaryStoryline: packet.primaryStoryline,
    text,
    source: "template",
    budget: {
      maxWords,
      actualWords: countWords(text),
    },
    validation: {
      grounded: true,
      fabricationCount: 0,
    },
  };
}
