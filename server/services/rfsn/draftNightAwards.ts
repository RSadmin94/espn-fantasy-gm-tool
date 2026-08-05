/**
 * RFSN Draft Night Show — award contracts and selection.
 * Produces explainable awards; does not generate persona commentary.
 */

import type { HistoricalContext } from "./historicalContext";
import { passesAirRule, DEFAULT_CONFIDENCE_THRESHOLD, DEFAULT_HEAT_THRESHOLD } from "./historicalContext";
import type { OwnerDraftMetrics } from "../../../shared/draftNightGrading";

export type DraftNightAwardType =
  | "winner_of_the_night"
  | "biggest_mistake"
  | "sleeper_value"
  | "under_intense_pressure";

export type DraftNightPersona = "sofia" | "coach" | "roxanne";

export type DraftNightAward = {
  awardType: DraftNightAwardType;
  ownerKey: string;
  ownerName: string;
  title: string;
  /** Observable fact for the award — not a finished analyst line. */
  fact: string;
  decision?: string;
  impact?: string;
  playerName?: string;
  metrics: {
    draftGrade: string;
    valueScore: number;
    constructionScore: number;
    lineupScore: number;
  };
  evidence: HistoricalContext[];
  confidence: number;
  narrativeHeat: number;
  persona: DraftNightPersona;
};

export type DraftNightShowResult = {
  awards: DraftNightAward[];
  suppressed: Array<{ awardType: DraftNightAwardType; reason: string }>;
  summaryFacts: string[];
};

export type PressureCandidate = {
  ownerName: string;
  ownerKey: string;
  championshipTitles: number;
  titleSeasons: number[];
  playoffEliminationsInflicted: number;
  h2hRecord?: string;
  draftLetter: string;
  rawScore: number;
};

const AWARD_CONFIDENCE_MIN = DEFAULT_CONFIDENCE_THRESHOLD;
const AWARD_HEAT_MIN = DEFAULT_HEAT_THRESHOLD;

function metricsFrom(m: OwnerDraftMetrics): DraftNightAward["metrics"] {
  return {
    draftGrade: m.letter,
    valueScore: m.valueScore,
    constructionScore: m.constructionScore,
    lineupScore: m.lineupScore,
  };
}

function awardPassesGates(confidence: number, narrativeHeat: number): boolean {
  return confidence >= AWARD_CONFIDENCE_MIN && narrativeHeat >= AWARD_HEAT_MIN;
}

/** Winner of the Night — highest overall draft grade (Sofia). */
export function selectWinnerOfTheNight(
  owners: readonly OwnerDraftMetrics[],
  evidence: HistoricalContext[] = [],
): DraftNightAward | null {
  // Owners are pre-sorted best→worst; take the top eligible with enough picks.
  const eligible = owners.filter((o) => o.letter !== "—" && o.pickCount >= 3);
  if (eligible.length < 2) return null;
  const winner = eligible[0]!;

  const aired = evidence.filter((e) => passesAirRule(e));
  const conf = 0.9;
  const heat = 75 + Math.min(20, Math.round(winner.rawScore * 20));
  if (!awardPassesGates(conf, heat)) return null;

  const champ = aired.find((e) => e.narrativeType === "championship");
  const fact = champ
    ? `${winner.ownerName} produced the highest final draft grade (${winner.letter})${champ.fact.includes("championship") ? ` — ${champ.fact}` : "."}`
    : `${winner.ownerName} produced the highest final draft grade (${winner.letter}) in this draft.`;

  return {
    awardType: "winner_of_the_night",
    ownerKey: winner.ownerKey,
    ownerName: winner.ownerName,
    title: "Winner of the Night",
    fact,
    metrics: metricsFrom(winner),
    evidence: aired,
    confidence: conf,
    narrativeHeat: heat,
    persona: "sofia",
  };
}

/** Biggest Mistake — most damaging reach / construction hit (Coach). */
export function selectBiggestMistake(
  owners: readonly OwnerDraftMetrics[],
  evidence: HistoricalContext[] = [],
): DraftNightAward | null {
  let best: { owner: OwnerDraftMetrics; reach: NonNullable<OwnerDraftMetrics["worstReach"]> } | null = null;
  for (const o of owners) {
    if (!o.worstReach || o.worstReach.reachDelta < 15) continue;
    if (!best || o.worstReach.reachDelta > best.reach.reachDelta) {
      best = { owner: o, reach: o.worstReach };
    }
  }
  if (!best) return null;

  const conf = best.reach.reachDelta >= 25 ? 0.92 : 0.85;
  const heat = Math.min(95, 55 + best.reach.reachDelta);
  if (!awardPassesGates(conf, heat)) return null;

  const aired = evidence.filter((e) => passesAirRule(e));
  const hist = aired.find(
    (e) => e.narrativeType === "breaking_tendency" || e.narrativeType === "repeat_behavior",
  );

  const decision = `${best.owner.ownerName} selected ${best.reach.playerName} ${best.reach.reachDelta.toFixed(0)} picks ahead of ADP at pick ${best.reach.pick}.`;
  const impact = hist
    ? `This decision created a roster construction issue relative to historical patterns — ${hist.fact}`
    : `This decision created a roster construction / value problem (owner draft grade ${best.owner.letter}, avg ADP delta ${best.owner.avgAdpDelta.toFixed(1)}).`;

  return {
    awardType: "biggest_mistake",
    ownerKey: best.owner.ownerKey,
    ownerName: best.owner.ownerName,
    title: "Biggest Mistake",
    fact: decision,
    decision,
    impact,
    playerName: best.reach.playerName,
    metrics: metricsFrom(best.owner),
    evidence: aired,
    confidence: conf,
    narrativeHeat: heat,
    persona: "coach",
  };
}

/** Sleeper Value — best ADP discount (Sofia). */
export function selectSleeperValue(
  owners: readonly OwnerDraftMetrics[],
  evidence: HistoricalContext[] = [],
): DraftNightAward | null {
  let best: { owner: OwnerDraftMetrics; pick: NonNullable<OwnerDraftMetrics["bestValuePick"]> } | null = null;
  for (const o of owners) {
    if (!o.bestValuePick || o.bestValuePick.valueDelta < 8) continue;
    if (!best || o.bestValuePick.valueDelta > best.pick.valueDelta) {
      best = { owner: o, pick: o.bestValuePick };
    }
  }
  if (!best) return null;

  const conf = 0.9;
  const heat = Math.min(90, 50 + best.pick.valueDelta);
  if (!awardPassesGates(conf, heat)) return null;

  const aired = evidence.filter((e) => passesAirRule(e));
  const fact = `${best.owner.ownerName} found value in ${best.pick.playerName} — selected ${best.pick.valueDelta.toFixed(0)} picks later than ADP (${best.pick.adp.toFixed(0)} → pick ${best.pick.pick}).`;

  return {
    awardType: "sleeper_value",
    ownerKey: best.owner.ownerKey,
    ownerName: best.owner.ownerName,
    title: "Sleeper Value",
    fact,
    playerName: best.pick.playerName,
    metrics: metricsFrom(best.owner),
    evidence: aired,
    confidence: conf,
    narrativeHeat: heat,
    persona: "sofia",
  };
}

/**
 * Under Intense Pressure — championship / rivalry stakes (Roxanne).
 * Requires evidence-backed championship or rivalry pressure + meaningful draft outcome.
 */
export function selectUnderIntensePressure(
  candidates: readonly PressureCandidate[],
  evidenceByOwner: Map<string, HistoricalContext[]>,
): DraftNightAward | null {
  let best: {
    c: PressureCandidate;
    evidence: HistoricalContext[];
    heat: number;
    conf: number;
    fact: string;
  } | null = null;

  for (const c of candidates) {
    const evidence = (evidenceByOwner.get(c.ownerName.trim().toLowerCase()) ?? []).filter((e) =>
      passesAirRule(e),
    );
    const champ = evidence.find((e) => e.narrativeType === "championship");
    const rivalry = evidence.find((e) => e.narrativeType === "rivalry");
    if (!champ && !rivalry && c.championshipTitles < 1) continue;

    const titles = c.championshipTitles || (champ ? 1 : 0);
    const heat = Math.min(
      95,
      70 + titles * 5 + Math.min(15, c.playoffEliminationsInflicted * 3),
    );
    const conf = champ || c.championshipTitles > 0 ? 0.92 : 0.85;
    if (!awardPassesGates(conf, heat)) continue;

    let fact: string;
    if (titles >= 1 || champ) {
      const seasons =
        c.titleSeasons.length > 0
          ? ` (${c.titleSeasons.slice(0, 3).join(", ")})`
          : "";
      fact =
        titles === 1
          ? `${c.ownerName} enters as a defending / prior champion${seasons} — this draft carries championship expectations (draft grade ${c.draftLetter}).`
          : `${c.ownerName} enters with ${titles} championship titles${seasons} — this draft carries elevated expectations (draft grade ${c.draftLetter}).`;
    } else if (rivalry) {
      fact = `${c.ownerName} drafted under rivalry pressure — ${rivalry.fact} Draft grade: ${c.draftLetter}.`;
    } else {
      continue;
    }

    if (!best || heat > best.heat) {
      best = { c, evidence, heat, conf, fact };
    }
  }

  if (!best) return null;

  return {
    awardType: "under_intense_pressure",
    ownerKey: best.c.ownerKey,
    ownerName: best.c.ownerName,
    title: "Under Intense Pressure",
    fact: best.fact,
    metrics: {
      draftGrade: best.c.draftLetter,
      valueScore: best.c.rawScore,
      constructionScore: best.c.rawScore,
      lineupScore: best.c.rawScore,
    },
    evidence: best.evidence,
    confidence: best.conf,
    narrativeHeat: best.heat,
    persona: "roxanne",
  };
}

export function buildDraftNightShow(args: {
  owners: readonly OwnerDraftMetrics[];
  evidenceByOwner: Map<string, HistoricalContext[]>;
  pressureCandidates: readonly PressureCandidate[];
  /** When false, suppress ADP-based awards instead of fabricating from shadow ADP. */
  adpAvailable?: boolean;
}): DraftNightShowResult {
  const suppressed: DraftNightShowResult["suppressed"] = [];
  const awards: DraftNightAward[] = [];
  const adpAvailable = args.adpAvailable !== false;

  const winnerEv =
    args.owners[0] != null
      ? args.evidenceByOwner.get(args.owners[0].ownerName.trim().toLowerCase()) ?? []
      : [];
  const winner = selectWinnerOfTheNight(args.owners, winnerEv);
  if (winner) awards.push(winner);
  else suppressed.push({ awardType: "winner_of_the_night", reason: "Insufficient grade separation or sample." });

  if (!adpAvailable) {
    suppressed.push({ awardType: "biggest_mistake", reason: "ADP unavailable" });
    suppressed.push({ awardType: "sleeper_value", reason: "ADP unavailable" });
  } else {
    // Mistake: attach evidence for the mistaken owner after selection
    const mistakeProbe = selectBiggestMistake(args.owners, []);
    if (mistakeProbe) {
      const ev = args.evidenceByOwner.get(mistakeProbe.ownerName.trim().toLowerCase()) ?? [];
      const mistake = selectBiggestMistake(args.owners, ev);
      if (mistake) awards.push(mistake);
      else suppressed.push({ awardType: "biggest_mistake", reason: "No catastrophic draft mistake detected." });
    } else {
      suppressed.push({ awardType: "biggest_mistake", reason: "No catastrophic draft mistake detected." });
    }

    const sleeperProbe = selectSleeperValue(args.owners, []);
    if (sleeperProbe) {
      const ev = args.evidenceByOwner.get(sleeperProbe.ownerName.trim().toLowerCase()) ?? [];
      const sleeper = selectSleeperValue(args.owners, ev);
      if (sleeper) awards.push(sleeper);
      else suppressed.push({ awardType: "sleeper_value", reason: "No clear sleeper value above heat threshold." });
    } else {
      suppressed.push({ awardType: "sleeper_value", reason: "No clear sleeper value above heat threshold." });
    }
  }

  const pressure = selectUnderIntensePressure(args.pressureCandidates, args.evidenceByOwner);
  if (pressure) awards.push(pressure);
  else suppressed.push({ awardType: "under_intense_pressure", reason: "No evidence-backed pressure candidate." });

  const summaryFacts = [
    ...awards.map((a) => a.fact),
    ...suppressed
      .filter((s) => s.awardType === "biggest_mistake")
      .map((s) => s.reason),
  ];

  return { awards, suppressed, summaryFacts };
}
