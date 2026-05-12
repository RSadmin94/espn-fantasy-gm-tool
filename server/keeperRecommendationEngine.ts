/**
 * keeperRecommendationEngine.ts — 2026 keeper recommendations for ATLANTAS FINEST.
 *
 * Philosophy:
 *   RECOMMENDATIONS = VALUE (round cost vs open-pool ADP) + ROSTER NEED
 *   DNA = PREDICT what each manager will actually do (behavior, biases, tendencies)
 */
import type { ManagerDNA } from "./leagueDNA";

export interface EligibleKeeper {
  playerId: number;
  playerName: string;
  position: string;
  round2025: number;
  round2024: number | null;
  roundCost2026: number | null;
  consecutiveYears: number;
  isIneligible: boolean;
  valueTier: string;
  valueLabel: string;
}

export interface TeamEligibilityData {
  teamId: number;
  teamName: string;
  players: EligibleKeeper[];
  ineligibleCount: number;
  eligibleCount: number;
}

export interface KeeperOption {
  playerId: number;
  playerName: string;
  position: string;
  roundCost2026: number;
  estimatedAdpRound: number;
  roundSavings: number;
  score: number;
  valueScore: number;
  needScore: number;
  valueTier: string;
  valueLabel: string;
  valueReasoning: string;
  needReasoning: string;
  risk: "low" | "medium" | "high";
  riskNote: string;
}

export interface DnaBehaviorPrediction {
  keeperBehavior: string;
  draftBehavior: string;
  biasWarnings: string[];
  exploitabilityNote: string;
  gmArchetype: string;
}

export interface TeamKeeperRecommendation {
  teamId: number;
  teamName: string;
  ownerName: string;
  primaryRecommendation: KeeperOption | null;
  alternativeOption: KeeperOption | null;
  allOptions: KeeperOption[];
  ineligiblePlayers: EligibleKeeper[];
  draftStrategyNote: string;
  dnaPrediction: DnaBehaviorPrediction;
}

const POSITION_ADP_ROUND: Record<string, number> = {
  QB: 6, RB: 3, WR: 3, TE: 5, K: 14, DEF: 13,
};

function estimateAdpRound(position: string): number {
  return POSITION_ADP_ROUND[position?.toUpperCase()] ?? 7;
}

function scoreValue(position: string, roundCost: number): { score: number; reasoning: string } {
  const adp = estimateAdpRound(position);
  const savings = adp - roundCost;
  if (savings >= 5) return { score: 95, reasoning: 'Exceptional deal — costs round ' + roundCost + ' but would go round ' + adp + ' in the open pool (' + savings + ' rounds of savings)' };
  if (savings >= 4) return { score: 85, reasoning: 'Elite value — ' + savings + ' rounds cheaper than open-pool ADP (round ' + adp + ')' };
  if (savings >= 3) return { score: 75, reasoning: 'Strong value — ' + savings + ' rounds cheaper than open-pool ADP (round ' + adp + ')' };
  if (savings >= 2) return { score: 62, reasoning: 'Good value — ' + savings + ' rounds cheaper than open-pool ADP (round ' + adp + ')' };
  if (savings >= 1) return { score: 48, reasoning: 'Fair value — ' + savings + ' round cheaper than open-pool ADP (round ' + adp + ')' };
  if (savings === 0) return { score: 30, reasoning: 'Break-even — keeper cost equals open-pool ADP (round ' + adp + ')' };
  return { score: Math.max(5, 20 + savings * 8), reasoning: 'Poor value — ' + Math.abs(savings) + ' rounds MORE expensive than open-pool ADP (round ' + adp + '); better to let them return to the pool' };
}

function scoreNeed(
  position: string,
  teamPlayers: EligibleKeeper[],
  ineligiblePlayers: EligibleKeeper[],
): { score: number; reasoning: string } {
  const pos = position?.toUpperCase() || '';
  const losingAtPos = ineligiblePlayers.filter(p => p.position?.toUpperCase() === pos).length;
  const otherEligibleAtPos = teamPlayers.filter(p => !p.isIneligible && p.position?.toUpperCase() === pos).length;

  let baseNeed = 50;
  if (['RB', 'WR'].includes(pos)) baseNeed = 65;
  else if (['TE', 'QB'].includes(pos)) baseNeed = 50;
  else if (['K', 'DEF'].includes(pos)) baseNeed = 15;

  const lossBoost = losingAtPos * 15;
  const coveragePenalty = Math.max(0, otherEligibleAtPos - 1) * 20;
  const finalScore = Math.min(100, Math.max(0, baseNeed + lossBoost - coveragePenalty));

  let reasoning = '';
  if (losingAtPos > 0 && !['K', 'DEF'].includes(pos)) {
    reasoning = 'Losing ' + losingAtPos + ' ' + pos + ' to the pool — keeping one here fills a real gap';
  } else if (['RB', 'WR'].includes(pos)) {
    reasoning = pos + ' is always scarce in the open pool — locking one in is smart';
  } else if (['K', 'DEF'].includes(pos)) {
    reasoning = pos + ' is abundant in the open pool — low roster need';
  } else {
    reasoning = 'Moderate positional need at ' + pos;
  }
  if (otherEligibleAtPos > 1) reasoning += '; already have ' + otherEligibleAtPos + ' eligible ' + pos + ' keepers';
  return { score: finalScore, reasoning };
}

function assessRisk(position: string, roundCost: number): { risk: 'low' | 'medium' | 'high'; note: string } {
  const adp = estimateAdpRound(position);
  const savings = adp - roundCost;
  if (position?.toUpperCase() === 'RB') {
    if (roundCost <= 2) return { risk: 'high', note: 'RBs at early round costs carry injury risk — one bad preseason and the value evaporates' };
    if (roundCost <= 4) return { risk: 'medium', note: 'RBs are volatile — solid value but monitor preseason health' };
    return { risk: 'low', note: 'Late-round RB keeper — low downside' };
  }
  if (savings >= 4) return { risk: 'low', note: 'Massive value cushion — even a down year likely beats open-pool replacement' };
  if (savings >= 2) return { risk: 'low', note: 'Enough value buffer to absorb a modest regression' };
  if (savings >= 0) return { risk: 'medium', note: 'Thin margin — player needs to perform at or above ADP to justify the keep' };
  return { risk: 'high', note: 'Negative value — only keep if you have strong conviction this player outperforms their ADP' };
}

function buildDnaPrediction(
  dna: ManagerDNA | null,
  _primaryRecommendation: KeeperOption | null,
  allOptions: KeeperOption[],
): DnaBehaviorPrediction {
  if (!dna) {
    return {
      keeperBehavior: 'No DNA profile available — prediction unavailable',
      draftBehavior: 'Unknown draft tendencies',
      biasWarnings: [],
      exploitabilityNote: 'Insufficient data',
      gmArchetype: 'Unknown',
    };
  }

  const arch = dna.gmArchetype?.toLowerCase() ?? '';
  const tilt = dna.tilt;
  const biasWarnings: string[] = [];

  let keeperBehavior = '';
  if (arch.includes('waiver') || arch.includes('hawk')) {
    keeperBehavior = 'As a Waiver Hawk, ' + dna.ownerName + ' likely prioritizes high-upside skill players. They may overlook a boring but valuable RB keeper in favor of a flashy WR or QB.';
    if (allOptions.some(o => o.position?.toUpperCase() === 'RB' && o.roundSavings >= 2)) {
      biasWarnings.push('Waiver-hawk bias may cause them to skip the highest-value RB keeper');
    }
  } else if (arch.includes('trade') || arch.includes('shark')) {
    keeperBehavior = 'As a Trade Shark, ' + dna.ownerName + ' may keep the player with the most trade leverage rather than the best roster fit.';
    biasWarnings.push('May keep a player primarily for trade bait rather than roster need');
  } else if (arch.includes('data') || arch.includes('analyst')) {
    keeperBehavior = 'As a Data Analyst, ' + dna.ownerName + ' likely runs the numbers and keeps the highest round-savings player. Most likely to make the optimal choice.';
  } else if (arch.includes('loyal') || arch.includes('hold')) {
    keeperBehavior = 'As a Loyalist, ' + dna.ownerName + ' tends to keep players they have had for multiple seasons regardless of value. Watch for a sentimental choice over the optimal pick.';
    biasWarnings.push('Loyalty bias may override pure value logic');
  } else if (arch.includes('panic') || arch.includes('reactive')) {
    keeperBehavior = dna.ownerName + ' has reactive tendencies — they may overthink the keeper decision and second-guess themselves close to the deadline.';
    biasWarnings.push('Reactive manager — may change their keeper decision late based on news or peer pressure');
  } else {
    keeperBehavior = dna.ownerName + ' (' + dna.gmArchetype + ') will likely follow conventional wisdom on keeper value.';
  }

  const tradeFreq = dna.trade?.tradeFrequency ?? 0;
  const lossRatio = dna.trade?.lossTradeRatio ?? 0;

  let draftBehavior = '';
  if (tradeFreq > 0.6) {
    draftBehavior = 'High trade frequency (' + Math.round(tradeFreq * 100) + '% of seasons) — expect them to be active on draft day, potentially trading picks to move up for a target.';
  } else if (tradeFreq < 0.3) {
    draftBehavior = 'Low trade frequency — they will likely sit tight and draft their board without dealing picks.';
  } else {
    draftBehavior = 'Moderate trade activity — may deal a mid-round pick if the right opportunity arises.';
  }

  if (lossRatio > 0.5) {
    draftBehavior += ' High loss-trade ratio (' + Math.round(lossRatio * 100) + '%) suggests they often sell from desperation — exploitable if in a weak draft position.';
    biasWarnings.push('High loss-trade ratio (' + Math.round(lossRatio * 100) + '%) — prone to panic trades; target their picks');
  }

  const tiltScore = tilt?.tiltScore ?? 0;
  let exploitabilityNote = '';
  if (tiltScore > 70) {
    exploitabilityNote = 'High tilt score (' + tiltScore + ') — exploitable. Offer a trade right after a bad draft pick to capitalize on frustration.';
  } else if (tiltScore > 40) {
    exploitabilityNote = 'Moderate tilt score (' + tiltScore + ') — occasionally reactive; watch for opportunities after a bad early-round pick.';
  } else {
    exploitabilityNote = 'Low tilt score (' + tiltScore + ') — composed manager, unlikely to make reactive mistakes on draft day.';
  }

  const desperationTriggers = dna.trade?.desperation_triggers ?? 0;
  if (desperationTriggers > 0) {
    biasWarnings.push('Known desperation pattern: ' + desperationTriggers + ' season(s) with panic-trade spikes after bad starts');
  }

  return { keeperBehavior, draftBehavior, biasWarnings, exploitabilityNote, gmArchetype: dna.gmArchetype ?? 'Unknown' };
}

function buildDraftStrategyNote(
  primaryRec: KeeperOption | null,
  allOptions: KeeperOption[],
  ineligiblePlayers: EligibleKeeper[],
): string {
  if (!primaryRec) {
    if (ineligiblePlayers.length > 0) {
      const names = ineligiblePlayers.map(p => p.playerName + ' (' + p.position + ')').join(', ');
      return 'No eligible keepers — all 2025 keepers (' + names + ') must return to the pool. This team drafts from a clean slate in 2026 with no locked rounds.';
    }
    return 'No keeper data available — drafts from a clean slate.';
  }

  const lockedRound = primaryRec.roundCost2026;
  const pos = primaryRec.position?.toUpperCase();
  const freeEarlyRounds = Array.from({ length: lockedRound - 1 }, (_, i) => i + 1);
  const fillPos = pos === 'RB' ? 'WR/TE' : pos === 'WR' ? 'RB/TE' : 'RB/WR';

  let note = 'Keeping ' + primaryRec.playerName + ' (' + pos + ') at round ' + lockedRound + ' locks that slot. ';
  if (freeEarlyRounds.length > 0) {
    note += 'Rounds ' + freeEarlyRounds.join(', ') + ' are fully open — prioritize ' + fillPos + ' in those slots. ';
  }
  if (ineligiblePlayers.length > 0) {
    const returningPositions = Array.from(new Set(ineligiblePlayers.map(p => p.position?.toUpperCase())));
    note += 'Losing ' + ineligiblePlayers.map(p => p.playerName).join(', ') + ' to the pool — target ' + returningPositions.join('/') + ' depth in mid rounds.';
  }
  const skipped = allOptions.find(o => o.playerId !== primaryRec.playerId && o.score >= 60);
  if (skipped) {
    note += ' If they skip keeping ' + primaryRec.playerName + ', ' + skipped.playerName + ' (' + skipped.position + ') is a viable fallback at round ' + skipped.roundCost2026 + '.';
  }
  return note;
}

export function buildKeeperRecommendations(
  eligibilityData: TeamEligibilityData[],
  dnaProfiles: ManagerDNA[],
  draftOrder2026: Array<{ teamId: number; teamName: string; ownerName?: string; pickNumber?: number }> | null,
): TeamKeeperRecommendation[] {
  const dnaMap = new Map(dnaProfiles.map(d => [d.ownerName.toLowerCase(), d]));

  return eligibilityData.map(team => {
    const dna = Array.from(dnaMap.values()).find(d =>
      d.ownerName &&
      team.teamName.toLowerCase().includes(d.ownerName.toLowerCase().split(' ')[0].toLowerCase())
    ) ?? null;

    const draftEntry = draftOrder2026?.find(d => d.teamId === team.teamId) ?? null;
    const ownerName = draftEntry?.ownerName ?? dna?.ownerName ?? team.teamName;

    const eligiblePlayers = team.players.filter(p => !p.isIneligible && p.roundCost2026 !== null);
    const ineligiblePlayers = team.players.filter(p => p.isIneligible);
    const allOptions: KeeperOption[] = eligiblePlayers.map(p => {
      const adpRound = estimateAdpRound(p.position);
      const roundSavings = adpRound - p.roundCost2026!;
      const { score: valueScore, reasoning: valueReasoning } = scoreValue(p.position, p.roundCost2026!);
      const { score: needScore, reasoning: needReasoning } = scoreNeed(p.position, team.players, ineligiblePlayers);
      const { risk, note: riskNote } = assessRisk(p.position, p.roundCost2026!);
      const compositeScore = Math.round(valueScore * 0.6 + needScore * 0.4);

      return {
        playerId: p.playerId,
        playerName: p.playerName,
        position: p.position,
        roundCost2026: p.roundCost2026!,
        estimatedAdpRound: adpRound,
        roundSavings,
        score: compositeScore,
        valueScore,
        needScore,
        valueTier: p.valueTier,
        valueLabel: p.valueLabel,
        valueReasoning,
        needReasoning,
        risk,
        riskNote,
      };
    }).sort((a, b) => b.score - a.score);

    const primaryRecommendation = allOptions[0] ?? null;
    const alternativeOption =
      allOptions[1] && primaryRecommendation && primaryRecommendation.score - allOptions[1].score <= 15
        ? allOptions[1]
        : null;

    const dnaPrediction = buildDnaPrediction(dna, primaryRecommendation, allOptions);
    const draftStrategyNote = buildDraftStrategyNote(primaryRecommendation, allOptions, ineligiblePlayers);

    return {
      teamId: team.teamId,
      teamName: team.teamName,
      ownerName,
      primaryRecommendation,
      alternativeOption,
      allOptions,
      ineligiblePlayers,
      draftStrategyNote,
      dnaPrediction,
    };
  });
}
