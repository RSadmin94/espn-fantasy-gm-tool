/**
 * draftDecisionBridge.ts — Assembles DraftDecision from a resolved mock pick (Phase 3).
 *
 * Uses existing pick-intelligence builders so plainEnglish text stays identical.
 */

import {
  buildCapPickIntelligence,
  buildDpPickIntelligence,
  buildKeeperPickIntelligence,
  buildNeedPickIntelligence,
  buildOwnerDnaPickIntelligence,
  type PickIntelligence,
  type PickPrimaryFactor,
} from "./draftPickIntelligence";
import { getDefaultDraftDecisionEngine } from "./draftDecisionFactors";
import type {
  DraftDecision,
  DraftDecisionContext,
  DraftPoolPlayerSnapshot,
  OwnerDnaDecisionMeta,
} from "./draftDecisionEngine";
import type { PositionTimingProfile } from "./leagueDraftTimingProfile";

export function resolvePickIntelligence(params: {
  pickNum: number;
  round: number;
  pick: DraftPoolPlayerSnapshot;
  targetPosition: string;
  primaryFactor: PickPrimaryFactor;
  pickReason: string;
  blockedOverrides: string[];
  dpTiming: PositionTimingProfile | null;
  needUrgency: string | null;
  ownerDnaMeta: OwnerDnaDecisionMeta | null;
  ownerConfidence: string | null;
  legacyReason: string;
  isKeeper: boolean;
  keeperRound?: number;
  cappedPosition?: string;
}): PickIntelligence | null {
  const {
    pickNum, round, pick, targetPosition, primaryFactor, pickReason,
    blockedOverrides, dpTiming, needUrgency, ownerDnaMeta, ownerConfidence,
    legacyReason, isKeeper, keeperRound,
  } = params;

  if (isKeeper) {
    return buildKeeperPickIntelligence({
      round: keeperRound ?? round,
      playerName: pick.name,
      position: pick.position,
    });
  }

  if (pick.position === "DP" && dpTiming) {
    let reason = pickReason;
    if (primaryFactor === "LEAGUE_TIMING") {
      reason = `League history DP window — ${reason}`;
    } else if (primaryFactor === "ROSTER_NEED") {
      reason = `${reason} (within league timing window)`;
    }
    return buildDpPickIntelligence({
      pickNum,
      round,
      playerName: pick.name,
      playerAdp: pick.adp,
      primaryFactor,
      profile: dpTiming,
      needUrgency,
      pickReason: reason,
      blockedOverrides,
    });
  }

  if (
    ownerDnaMeta
    && ["QB", "RB", "WR", "TE"].includes(pick.position)
    && (primaryFactor === "OWNER_DNA" || ownerDnaMeta.closeBlocked)
  ) {
    return buildOwnerDnaPickIntelligence({
      pickNum,
      round,
      playerName: pick.name,
      playerAdp: pick.adp,
      applied: primaryFactor === "OWNER_DNA",
      explanation: ownerDnaMeta.explanation,
      blockedReason: ownerDnaMeta.blockedReason,
      positionProbabilities: ownerDnaMeta.positionProbabilities,
      ownerConfidence,
      legacyReason,
      structuredSections: ownerDnaMeta.structuredSections,
    });
  }

  if (primaryFactor === "ROSTER_NEED") {
    return buildNeedPickIntelligence({
      pickNum,
      round,
      playerName: pick.name,
      playerAdp: pick.adp,
      position: targetPosition,
      needUrgency,
      pickReason,
      blockedOverrides,
    });
  }

  if (primaryFactor === "POSITION_CAP") {
    return buildCapPickIntelligence({
      pickNum,
      round,
      playerName: pick.name,
      playerAdp: pick.adp,
      position: pick.position,
      cappedPosition: params.cappedPosition ?? pick.position,
      pickReason,
    });
  }

  return null;
}

export function buildDraftDecisionFromResolvedPick(params: {
  pickNum: number;
  round: number;
  ownerName: string;
  teamName: string;
  pick: DraftPoolPlayerSnapshot;
  targetPosition: string;
  primaryFactor: PickPrimaryFactor;
  pickReason: string;
  blockedOverrides: string[];
  bpa: DraftPoolPlayerSnapshot;
  needUrgency: string | null;
  teamNeeds: Array<{ position: string; urgency: string }>;
  dpTiming: PositionTimingProfile | null;
  ownerDnaMeta: OwnerDnaDecisionMeta | null;
  ownerConfidence: string | null;
  legacyReason: string;
  confidenceScore: number;
  isKeeper?: boolean;
  keeperRound?: number;
  cappedPosition?: string;
}): DraftDecision {
  const pickIntelligence = resolvePickIntelligence({
    ...params,
    isKeeper: params.isKeeper ?? false,
    cappedPosition: params.cappedPosition,
  });

  const ctx: DraftDecisionContext = {
    pickNum: params.pickNum,
    round: params.round,
    ownerName: params.ownerName,
    teamName: params.teamName,
    player: params.pick,
    targetPosition: params.targetPosition,
    primaryFactor: params.isKeeper ? "KEEPER" : params.primaryFactor,
    pickReason: params.pickReason,
    blockedOverrides: params.blockedOverrides,
    bpa: params.bpa,
    needUrgency: params.needUrgency,
    teamNeeds: params.teamNeeds,
    dpTiming: params.dpTiming,
    ownerDnaMeta: params.ownerDnaMeta,
    ownerConfidence: params.ownerConfidence,
    isKeeper: params.isKeeper ?? false,
    keeperRound: params.keeperRound,
    pickIntelligence,
    confidenceScore: params.confidenceScore,
  };

  return getDefaultDraftDecisionEngine().buildDecision(ctx);
}
