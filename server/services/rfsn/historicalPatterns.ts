/**
 * Evidence-backed historical pattern collectors.
 * Emit HistoricalContext only when source evidence exists — never invent.
 */

import type { BroadcastMoment } from "../sofia/broadcastMomentTypes";
import {
  type HistoricalContext,
  significanceWeight,
} from "./historicalContext";
import { scoreNarrativeHeat } from "./narrativeHeat";
import {
  type LeagueContextSnapshot,
  choicesForOwner,
  findChampionshipForOwner,
  priorPlayerConnections,
  rivalryForOwner,
} from "./leagueContextCache";
import { buildRivalryHistoricalContext } from "./rivalStorylines";

export type PatternPickSubject = {
  ownerName: string;
  playerName: string;
  position: string;
  overallPick: number;
  round: number;
};

function subjectFromMoment(moment: BroadcastMoment): PatternPickSubject {
  const s = moment.factPacket.subject;
  return {
    ownerName: s.ownerName,
    playerName: s.playerName,
    position: s.position,
    overallPick: s.overallPick,
    round: s.round,
  };
}

function baseSignificance(moment: BroadcastMoment): number {
  return significanceWeight(moment.significance);
}

/** Championship titles from hallOfFame championships.leaderboard (GUID/ownerKey). */
export function collectChampionshipContext(
  moment: BroadcastMoment,
  snapshot: LeagueContextSnapshot,
): HistoricalContext | null {
  const subj = subjectFromMoment(moment);
  const row = findChampionshipForOwner(snapshot, subj.ownerName);
  if (!row || row.titles < 1) return null;

  const seasons =
    row.titleSeasons.length > 0
      ? ` (${row.titleSeasons.slice(0, 4).join(", ")}${row.titleSeasons.length > 4 ? ", …" : ""})`
      : "";
  const fact =
    row.titles === 1
      ? `${row.displayName} has 1 championship title in this league${seasons}.`
      : `${row.displayName} has ${row.titles} championship titles in this league${seasons}.`;

  return {
    fact,
    evidence: [
      {
        source: "espn.hallOfFame",
        ref: `championships.leaderboard:${row.ownerKey}`,
      },
    ],
    confidence: 0.98,
    significance: baseSignificance(moment),
    narrativeType: "championship",
    narrativeHeat: scoreNarrativeHeat("championship", { titleCount: row.titles }),
  };
}

/** Prior drafts of the same player by this owner (choice ledger + normalizePlayerKey). */
export function collectPlayerConnectionContext(
  moment: BroadcastMoment,
  snapshot: LeagueContextSnapshot,
): HistoricalContext | null {
  const subj = subjectFromMoment(moment);
  const prior = priorPlayerConnections(snapshot, subj.ownerName, subj.playerName);
  if (prior.length === 0) return null;

  const seasons = [...new Set(prior.map((p) => p.season))].sort((a, b) => b - a);
  const seasonList = seasons.slice(0, 3).join(", ");
  const fact =
    seasons.length === 1
      ? `${subj.ownerName} previously selected ${subj.playerName} in ${seasonList}.`
      : `${subj.ownerName} previously selected ${subj.playerName} in ${seasons.length} prior drafts (${seasonList}).`;

  return {
    fact,
    evidence: prior.slice(0, 5).map((p) => ({
      source: "choiceLedger",
      ref: `${p.ownerKey}:${p.season}:${p.overallPick}:${p.playerKey}`,
    })),
    confidence: 0.85,
    significance: baseSignificance(moment),
    narrativeType: "player_connection",
    narrativeHeat: scoreNarrativeHeat("player_connection", {
      connectionNotability: Math.min(1, seasons.length / 3),
      repeatCount: seasons.length,
    }),
  };
}

/**
 * Repeat position behavior / draft DNA from multi-season choice ledger.
 * Observable only: same position taken in early rounds across ≥2 seasons.
 */
export function collectRepeatBehaviorContext(
  moment: BroadcastMoment,
  snapshot: LeagueContextSnapshot,
): HistoricalContext | null {
  const subj = subjectFromMoment(moment);
  const picks = choicesForOwner(snapshot, subj.ownerName);
  if (picks.length < 2) return null;

  const pos = String(subj.position ?? "").toUpperCase();
  if (!pos || pos === "UNK") return null;

  // Early-round history at this position (rounds 1–4)
  const earlySamePos = picks.filter((p) => p.position.toUpperCase() === pos && p.round <= 4);
  const seasons = [...new Set(earlySamePos.map((p) => p.season))];
  if (seasons.length < 2) return null;

  // Current pick should also be early-ish to count as repeat DNA signal
  if (subj.round > 4) return null;

  const fact = `${subj.ownerName} has selected ${pos} in rounds 1–4 in ${seasons.length} prior seasons — a repeated roster construction pattern.`;

  return {
    fact,
    evidence: earlySamePos.slice(0, 6).map((p) => ({
      source: "choiceLedger",
      ref: `draft_dna:${p.ownerKey}:${p.season}:R${p.round}:${p.position}`,
    })),
    confidence: 0.85,
    significance: baseSignificance(moment),
    narrativeType: "repeat_behavior",
    narrativeHeat: scoreNarrativeHeat("repeat_behavior", { repeatCount: seasons.length }),
  };
}

/**
 * Breaking tendency: current early pick position is rare in this owner's early-round history.
 */
export function collectBreakingTendencyContext(
  moment: BroadcastMoment,
  snapshot: LeagueContextSnapshot,
): HistoricalContext | null {
  const subj = subjectFromMoment(moment);
  if (subj.round > 4) return null;

  const picks = choicesForOwner(snapshot, subj.ownerName).filter((p) => p.round <= 4);
  if (picks.length < 4) return null;

  const pos = String(subj.position ?? "").toUpperCase();
  if (!pos) return null;

  const samePos = picks.filter((p) => p.position.toUpperCase() === pos).length;
  const rate = samePos / picks.length;
  // Break = unusual vs own history (< 15% of early picks)
  if (rate >= 0.15) return null;

  const fact = `${subj.ownerName} rarely takes ${pos} in rounds 1–4 historically (${samePos} of ${picks.length} early picks) — this selection breaks that pattern.`;

  return {
    fact,
    evidence: [
      {
        source: "choiceLedger",
        ref: `breaking_tendency:${normKey(subj.ownerName)}:${pos}:rate=${rate.toFixed(2)}`,
      },
    ],
    confidence: 0.85,
    significance: baseSignificance(moment),
    narrativeType: "breaking_tendency",
    narrativeHeat: scoreNarrativeHeat("breaking_tendency", {
      deviationStrength: 1 - rate,
    }),
  };
}

function normKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Rivalry H2H + aggregate playoff eliminations (no invented seasons). */
export function collectRivalryContext(
  moment: BroadcastMoment,
  snapshot: LeagueContextSnapshot,
): HistoricalContext | null {
  const subj = subjectFromMoment(moment);
  const pair = rivalryForOwner(snapshot, subj.ownerName);
  if (!pair) return null;
  return buildRivalryHistoricalContext(pair, baseSignificance(moment));
}

/**
 * Enrich from existing ADP / reach classification — does not invent deltas.
 */
export function collectMajorReachOrStealContext(moment: BroadcastMoment): HistoricalContext | null {
  const reach = moment.reachClassification;
  const signals = moment.signals ?? [];
  const subj = subjectFromMoment(moment);
  const sig = baseSignificance(moment);

  if (reach?.isReach && (reach.severity === "big" || reach.severity === "massive")) {
    const mag = Math.abs(reach.reachDelta);
    const fact = `${subj.ownerName} selected ${subj.playerName} ${mag} picks ahead of ADP (${reach.severity} reach).`;
    return {
      fact,
      evidence: [
        {
          source: "reachClassification",
          ref: `major_reach:${reach.severity}:${mag}`,
        },
      ],
      confidence: 0.9,
      significance: sig,
      narrativeType: "major_reach",
      narrativeHeat: scoreNarrativeHeat("major_reach", { adpMagnitude: mag }),
    };
  }

  const stealSignals = signals.filter((s) => /STEAL/i.test(s));
  if (stealSignals.length === 0) return null;
  const stealStrong = stealSignals.some((s) => /strong/i.test(s));
  // Major steal airing requires strong steal or major/historic significance
  if (!stealStrong && moment.significance !== "major" && moment.significance !== "historic") {
    return null;
  }
  const fact = `${subj.ownerName} selected ${subj.playerName} later than ADP — classified as a steal on the board.`;
  return {
    fact,
    evidence: [
      {
        source: "draftMoment.signals",
        ref: `major_steal:${stealSignals.join(",")}`,
      },
    ],
    confidence: 0.85,
    significance: sig,
    narrativeType: "major_steal",
    narrativeHeat: scoreNarrativeHeat("major_steal", { adpMagnitude: stealStrong ? 30 : 20 }),
  };
}

/** Collect all evidence-backed contexts for a moment (may include low-heat). */
export function collectHistoricalContexts(
  moment: BroadcastMoment,
  snapshot: LeagueContextSnapshot,
): HistoricalContext[] {
  const out: HistoricalContext[] = [];
  const push = (c: HistoricalContext | null) => {
    if (c) out.push(c);
  };

  push(collectChampionshipContext(moment, snapshot));
  push(collectRivalryContext(moment, snapshot));
  push(collectBreakingTendencyContext(moment, snapshot));
  push(collectRepeatBehaviorContext(moment, snapshot));
  push(collectPlayerConnectionContext(moment, snapshot));
  push(collectMajorReachOrStealContext(moment));

  return out;
}
