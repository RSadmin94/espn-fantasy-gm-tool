// FILE: server/leagueDnaProfile.ts
// Presentation/assembly layer over the existing ManagerDNA engine (leagueDNA.ts).
// Turns the raw per-owner DNA into the "Your League DNA" profile: an evocative
// archetype, a screenshotable free card (primary trait, blind spot, League Twin,
// scorecard) and the full paid dossier. Pure functions; no DB access.

import type { ManagerDNA, ManagerRawData } from "./leagueDNA";

export type DnaGrade =
  | "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-";

export type LeagueDnaProfile = {
  ownerName: string;
  seasonsAnalyzed: number;
  // ---- FREE card ----
  archetype: string;
  archetypeDesc: string;
  primaryTrait: string;
  blindSpot: string;
  leagueTwin: { ownerName: string; similarityPct: number } | null;
  scorecard: { trading: DnaGrade; drafting: DnaGrade; roster: DnaGrade };
  // ---- PAID dossier ----
  draftDna: ManagerDNA["draft"] | null;
  tradeDna: ManagerDNA["trade"] | null;
  rosterDna: { waiver: ManagerDNA["waiver"]; tilt: ManagerDNA["tilt"] } | null;
  championComparison: Array<{ category: string; you: string; champions: string; edge: "you" | "champs" | "even" }> | null;
  blindSpots: string[] | null;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

function gradeFromScore(score: number): DnaGrade {
  const s = clamp(score);
  if (s >= 93) return "A+";
  if (s >= 85) return "A";
  if (s >= 78) return "A-";
  if (s >= 71) return "B+";
  if (s >= 64) return "B";
  if (s >= 57) return "B-";
  if (s >= 50) return "C+";
  if (s >= 43) return "C";
  if (s >= 36) return "C-";
  if (s >= 28) return "D+";
  if (s >= 20) return "D";
  return "D-";
}

/** Map raw DNA traits to one of the eight signature archetypes. */
function classifyArchetype(d: ManagerDNA): { archetype: string; desc: string } {
  const tf = d.trade.tradeFrequency;
  const wa = d.waiver.waiverAggression;
  const reach = d.draft.reachPositions.length;
  const value = d.draft.valuePositions.length;
  const kr = d.draft.keeperRate;
  const shark = d.exploitabilityLabel === "Shark" || d.exploitabilityScore <= 28;

  if (kr >= 50)
    return { archetype: "The Dynasty Architect", desc: "You build for the long haul - keepers and continuity over quick fixes." };
  if (tf >= 60)
    return { archetype: "The Aggressive Trader", desc: "You work the phones. The roster you start the season with is never the one you finish with." };
  if (wa >= 70 && tf < 40)
    return { archetype: "The Hoarder", desc: "You churn the wire relentlessly but rarely deal - you'd rather stream than trade." };
  if (reach >= 2)
    return { archetype: "The Draft Gambler", desc: "You trust your board over consensus and reach for the players you believe in." };
  if (value >= 2)
    return { archetype: "The Talent Scout", desc: "You let value fall to you - your best picks come rounds after the league expects them." };
  if ((tf >= 45 || wa >= 55) && kr < 25)
    return { archetype: "The Win-Now GM", desc: "You spend aggressively for this season - future assets are someone else's problem." };
  if (shark)
    return { archetype: "The Opportunist", desc: "You read the market better than your leaguemates and strike when they're desperate." };
  return { archetype: "The Builder", desc: "You move methodically - steady drafting, measured deals, no panic." };
}

function leagueAvg(all: ManagerDNA[], pick: (d: ManagerDNA) => number): number {
  if (all.length === 0) return 0;
  return all.reduce((s, d) => s + (pick(d) || 0), 0) / all.length;
}

/** The single most league-deviant behaviour, phrased for the hero card. */
function computePrimaryTrait(focal: ManagerDNA, all: ManagerDNA[]): string {
  const avgTrades = leagueAvg(all, (d) => d.trade.avgTradesPerSeason) || 0.01;
  const avgAcq = leagueAvg(all, (d) => d.waiver.avgAcquisitionsPerSeason) || 0.01;
  const tradeRatio = focal.trade.avgTradesPerSeason / avgTrades;
  const acqRatio = focal.waiver.avgAcquisitionsPerSeason / avgAcq;

  const candidates: Array<{ spread: number; text: string }> = [];
  if (isFinite(tradeRatio) && focal.trade.avgTradesPerSeason > 0)
    candidates.push({
      spread: Math.abs(tradeRatio - 1),
      text: tradeRatio >= 1
        ? `You complete ${r1(tradeRatio)}x more trades than league average.`
        : `You trade ${r1(1 / Math.max(tradeRatio, 0.01))}x less often than league average.`,
    });
  if (isFinite(acqRatio) && focal.waiver.avgAcquisitionsPerSeason > 0)
    candidates.push({
      spread: Math.abs(acqRatio - 1),
      text: acqRatio >= 1
        ? `You make ${r1(acqRatio)}x more waiver moves than league average.`
        : `You work the waiver wire ${r1(1 / Math.max(acqRatio, 0.01))}x less than league average.`,
    });
  if (focal.draft.reachPositions.length > 0)
    candidates.push({ spread: 0.6 + focal.draft.reachPositions.length * 0.1, text: `You reach on ${focal.draft.reachPositions.join(" and ")} earlier than the rest of your league.` });
  if (focal.draft.keeperRate >= 40)
    candidates.push({ spread: 0.5, text: `You use a keeper slot ${Math.round(focal.draft.keeperRate)}% of the time - one of the most loyal rosters in the league.` });

  candidates.sort((a, b) => b.spread - a.spread);
  return candidates[0]?.text ?? "Your managing style sits right in the middle of your league.";
}

/** Champion-relative blind spot: where you behave least like the owners who win. */
function computeBlindSpot(
  focal: ManagerDNA,
  all: ManagerDNA[],
  managers: ManagerRawData[],
): string {
  const champIds = new Set(
    managers.filter((m) => m.seasonRecords.some((s) => s.isChampion)).map((m) => m.memberId),
  );
  const champs = all.filter((d) => champIds.has(d.memberId) && d.memberId !== focal.memberId);

  if (champs.length > 0) {
    // Biggest position where focal reaches earlier than champions do.
    const positions = new Set<string>();
    for (const d of [focal, ...champs])
      Object.keys(d.draft.biasVsLeague || {}).forEach((p) => positions.add(p));
    let worst: { pos: string; gap: number } | null = null;
    for (const pos of positions) {
      const champBias = champs.reduce((s, d) => s + (d.draft.biasVsLeague[pos] || 0), 0) / champs.length;
      const gap = (focal.draft.biasVsLeague[pos] || 0) - champBias; // positive = focal reaches earlier
      if (gap >= 0.6 && (!worst || gap > worst.gap)) worst = { pos, gap };
    }
    if (worst) return `You draft ${worst.pos} earlier than league champions do.`;

    const avgChampTrades = champs.reduce((s, d) => s + d.trade.avgTradesPerSeason, 0) / champs.length;
    if (focal.trade.avgTradesPerSeason < avgChampTrades - 0.5)
      return "You trade less than your league's champions - they're more active in the market.";
    if (focal.tilt.tiltScore >= 55)
      return "You make more reactive moves after losses than champions, who stay steadier.";
  }
  return focal.exploitWindows[0] ?? "Your roster turns over faster than your league's contenders.";
}

/** Nearest behavioural neighbour - the screenshotable "League Twin". */
function computeLeagueTwin(focal: ManagerDNA, all: ManagerDNA[]): { ownerName: string; similarityPct: number } | null {
  const vec = (d: ManagerDNA) => [
    d.trade.tradeFrequency,
    d.waiver.waiverAggression,
    d.tilt.tiltScore,
    d.exploitabilityScore,
    d.draft.keeperRate,
    d.draft.reachPositions.length * 20,
    d.draft.valuePositions.length * 20,
  ];
  const fv = vec(focal);
  const dims = fv.length;
  const maxDist = Math.sqrt(dims * 100 * 100);
  let best: { ownerName: string; dist: number } | null = null;
  for (const d of all) {
    if (d.memberId === focal.memberId) continue;
    const dv = vec(d);
    let sum = 0;
    for (let i = 0; i < dims; i++) sum += (fv[i] - dv[i]) ** 2;
    const dist = Math.sqrt(sum);
    if (!best || dist < best.dist) best = { ownerName: d.ownerName, dist };
  }
  if (!best) return null;
  return { ownerName: best.ownerName, similarityPct: Math.round(clamp(100 - (best.dist / maxDist) * 100)) };
}

function computeScorecard(d: ManagerDNA): { trading: DnaGrade; drafting: DnaGrade; roster: DnaGrade } {
  // Trading: activity rewarded, chasing losses (lossTradeRatio) penalised.
  const trading = clamp(d.trade.tradeFrequency * 0.75 + (100 - clamp((d.trade.lossTradeRatio - 1) * 50)) * 0.25);
  // Drafting: value finds reward, reaches penalise; market awareness (low exploitability) helps.
  const drafting = clamp(55 + d.draft.valuePositions.length * 11 - d.draft.reachPositions.length * 11 + (100 - d.exploitabilityScore) * 0.15);
  // Roster construction: steadiness rewarded (low tilt + low churn), some waiver work helps.
  const roster = clamp(70 - d.tilt.tiltScore * 0.4 - d.waiver.rosterChurnRate * 0.3 + Math.min(20, d.waiver.waiverAggression * 0.2));
  return { trading: gradeFromScore(trading), drafting: gradeFromScore(drafting), roster: gradeFromScore(roster) };
}

function championComparison(
  focal: ManagerDNA,
  all: ManagerDNA[],
  managers: ManagerRawData[],
): LeagueDnaProfile["championComparison"] {
  const champIds = new Set(
    managers.filter((m) => m.seasonRecords.some((s) => s.isChampion)).map((m) => m.memberId),
  );
  const champs = all.filter((d) => champIds.has(d.memberId) && d.memberId !== focal.memberId);
  if (champs.length === 0) return null;
  const ca = (pick: (d: ManagerDNA) => number) => champs.reduce((s, d) => s + pick(d), 0) / champs.length;
  const row = (category: string, you: number, champ: number, unit: string, higherBetter = true) => {
    const edge: "you" | "champs" | "even" = Math.abs(you - champ) < 0.15 ? "even" : (you > champ) === higherBetter ? "you" : "champs";
    return { category, you: `${r1(you)}${unit}`, champions: `${r1(champ)}${unit}`, edge };
  };
  return [
    row("Trades / season", focal.trade.avgTradesPerSeason, ca((d) => d.trade.avgTradesPerSeason), ""),
    row("Waiver adds / season", focal.waiver.avgAcquisitionsPerSeason, ca((d) => d.waiver.avgAcquisitionsPerSeason), ""),
    row("Keeper usage", focal.draft.keeperRate, ca((d) => d.draft.keeperRate), "%"),
    row("Tilt score", focal.tilt.tiltScore, ca((d) => d.tilt.tiltScore), "", false),
    row("Draft reaches", focal.draft.reachPositions.length, ca((d) => d.draft.reachPositions.length), "", false),
  ];
}

export function buildLeagueDnaProfile(args: {
  allDna: ManagerDNA[];
  focalMemberId: string;
  managers: ManagerRawData[];
}): LeagueDnaProfile | null {
  const { allDna, focalMemberId, managers } = args;
  const focal = allDna.find((d) => d.memberId === focalMemberId);
  if (!focal) return null;
  const { archetype, desc } = classifyArchetype(focal);
  return {
    ownerName: focal.ownerName,
    seasonsAnalyzed: focal.seasonsAnalyzed,
    archetype,
    archetypeDesc: desc,
    primaryTrait: computePrimaryTrait(focal, allDna),
    blindSpot: computeBlindSpot(focal, allDna, managers),
    leagueTwin: computeLeagueTwin(focal, allDna),
    scorecard: computeScorecard(focal),
    draftDna: focal.draft,
    tradeDna: focal.trade,
    rosterDna: { waiver: focal.waiver, tilt: focal.tilt },
    championComparison: championComparison(focal, allDna, managers),
    blindSpots: focal.exploitWindows.length ? focal.exploitWindows : [computeBlindSpot(focal, allDna, managers)],
  };
}
