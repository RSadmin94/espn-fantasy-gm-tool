/**
 * Sofia Phase 1 — project a shipped DraftMoment into a SofiaFactPacket.
 * Pure projection: copies grounded fields only; adds provisional exclusivity scoring.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import {
  EXCLUSIVITY_CLASS,
  SOFIA_FACT_PACKET_CONTRACT_VERSION,
  type ExclusivityDimension,
  type SofiaFactPacket,
  type SofiaFactReceipt,
} from "./sofiaContract";

/** Provisional — NOT in the frozen contract. Replaced by benchmark-calibrated weights in the 50-moment eval. */
const CLASS_VALUE = { high: 1.0, medium: 0.5, low: 0.2 } as const;

const STORYLINE_KEYWORDS: Record<string, string[]> = {
  REACH: ["reach", "ahead of adp", "ahead of adp.", "adp"],
  STEAL: ["fell", "past adp", "value"],
  TIER_BREAK: ["tier", "cliff", "next"],
  TIER_CLIFF: ["tier", "cliff", "next"],
  PATTERN_BREAK: ["earliest", "pattern", "record", "on record"],
  POSITION_RUN: ["in the last", " picks", "position"],
  DP_TIMING: ["dp", "league-typical", "typical"],
};

function receiptAvailable(moment: DraftMoment, id: string): boolean {
  return moment.receipts.some((r) => r.id === id && r.status === "available");
}

function hasSignal(moment: DraftMoment, name: string): boolean {
  return moment.signals.some((s) => s.startsWith(name));
}

/** Map present signals/receipts to exclusivity dimensions for this moment. */
export function presentExclusivityDimensions(moment: DraftMoment): ExclusivityDimension[] {
  const present = new Set<ExclusivityDimension>();

  if (hasSignal(moment, "PATTERN_BREAK")) {
    present.add("patternBreak");
  } else {
    const timing = moment.receipts.find((r) => r.id === "ownerTiming");
    if (timing?.status === "available") {
      const v = timing.value as { patternBreak?: boolean } | undefined;
      if (v?.patternBreak) present.add("patternBreak");
    }
  }

  if (receiptAvailable(moment, "ownerTendency") || receiptAvailable(moment, "ownerTiming")) {
    present.add("ownerHistory");
  }
  if (receiptAvailable(moment, "rivalry")) present.add("rivalry");
  if (receiptAvailable(moment, "positionRun") || hasSignal(moment, "CONSEQUENTIAL_RUN")) {
    present.add("positionRun");
  }
  if (
    hasSignal(moment, "REACH") ||
    hasSignal(moment, "STEAL") ||
    hasSignal(moment, "TIER_CLIFF") ||
    receiptAvailable(moment, "adpDelta") ||
    receiptAvailable(moment, "tierCliff")
  ) {
    present.add("adp");
  }
  if (receiptAvailable(moment, "rosterNeed")) {
    const need = moment.receipts.find((r) => r.id === "rosterNeed");
    const v = need?.value as { needsStarter?: boolean } | undefined;
    if (v?.needsStarter !== false) present.add("rosterNeed");
  }

  return [...present];
}

/**
 * Provisional exclusivity score.
 * Replaced by benchmark-calibrated weights in the 50-moment eval; do not add numeric weights to the frozen contract.
 */
export function scoreExclusivity(moment: DraftMoment): { score: number; drivers: string[] } {
  const dimensions = presentExclusivityDimensions(moment);
  if (dimensions.length === 0) return { score: 0, drivers: [] };

  const ranked = dimensions
    .map((dim) => ({
      dim,
      value: CLASS_VALUE[EXCLUSIVITY_CLASS[dim]],
    }))
    .sort((a, b) => b.value - a.value || a.dim.localeCompare(b.dim));

  return {
    score: ranked[0]!.value,
    drivers: ranked.map((r) => r.dim),
  };
}

function seasonFromDraftId(draftId: string): number {
  const match = draftId.match(/-(\d{4})$/);
  return match ? Number(match[1]) : 0;
}

function mapReceipts(receipts: DraftMoment["receipts"]): SofiaFactReceipt[] {
  return receipts.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    source: r.source,
    authority: r.authority,
    confidence: r.confidence,
    value: r.value,
    supportedClaim: r.supportedClaim,
    notes: r.notes,
  }));
}

/** Pure projection: DraftMoment → SofiaFactPacket. Adds no facts beyond the moment. */
export function buildSofiaFactPacket(moment: DraftMoment): SofiaFactPacket {
  const exclusivity = scoreExclusivity(moment);
  return {
    contractVersion: SOFIA_FACT_PACKET_CONTRACT_VERSION,
    momentId: moment.eventId,
    leagueId: moment.leagueId,
    draftId: moment.draftId,
    season: seasonFromDraftId(moment.draftId),
    overallPick: moment.overallPick,
    round: moment.round,
    roundPick: moment.roundPick,
    owner: { ...moment.owner },
    player: { ...moment.player },
    rosterBeforePick: { ...moment.rosterBeforePick },
    receipts: mapReceipts(moment.receipts),
    signals: [...moment.signals],
    level: moment.level,
    permittedClaims: [...moment.permittedClaims],
    forbiddenClaimCategories: [...moment.forbiddenClaimCategories],
    primaryStoryline: moment.primaryStoryline,
    secondaryStoryline: moment.secondaryStoryline,
    exclusivity,
    commentaryBudget: { ...moment.commentaryBudget },
    validation: {
      valid: moment.validation.valid,
      errors: [...moment.validation.errors],
      warnings: [...moment.validation.warnings],
    },
  };
}

export function storylineKeywords(storyline: string | null): string[] {
  if (!storyline) return [];
  return STORYLINE_KEYWORDS[storyline] ?? [storyline.toLowerCase().replace(/_/g, " ")];
}
