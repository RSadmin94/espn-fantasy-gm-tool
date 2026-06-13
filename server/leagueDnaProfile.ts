// FILE: server/leagueDnaProfile.ts
// Presentation/assembly layer over the existing ManagerDNA engine (leagueDNA.ts).
// Turns the raw per-owner DNA into the "Your League DNA" profile: an evocative
// archetype, a screenshotable free card (primary trait, blind spot, League Twin,
// scorecard) and the full paid dossier. Pure functions; no DB access.

import type { ManagerDNA, ManagerRawData } from "./leagueDNA";
import type { SimGrades, DimRating } from "./draftGradeForDna";

export type DnaGrade =
  | "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-";

export type DnaDimRating = {
  method: "sim" | "style";
  current: { grade: DnaGrade; season: number } | null;
  overall: { grade: DnaGrade; seasonsUsed: number };
  perSeason: Array<{ season: number; grade: DnaGrade }>;
};

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
  /** Per-dimension ratings, each with `current` (most recent covered season) + `overall`
   *  (career average). method="sim" = from the draft-only / roster-management simulation
   *  (drafting, roster) or per-season trade-activity percentile (trading); "style" = the
   *  career heuristic fallback when no weekly coverage exists (current is null). */
  ratings: { trading: DnaDimRating; drafting: DnaDimRating; roster: DnaDimRating };
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
function champsOf(focal: ManagerDNA, all: ManagerDNA[], managers: ManagerRawData[]): ManagerDNA[] {
  const champIds = new Set(
    managers.filter((m) => m.seasonRecords.some((sr) => sr.isChampion)).map((m) => m.memberId),
  );
  return all.filter((d) => champIds.has(d.memberId) && d.memberId !== focal.memberId);
}

/** Position where the focal owner reaches earliest relative to champions. */
function championDraftGap(focal: ManagerDNA, champs: ManagerDNA[]): string | null {
  if (champs.length === 0) return null;
  const positions = new Set<string>();
  for (const d of [focal, ...champs])
    Object.keys(d.draft.biasVsLeague || {}).forEach((pp) => positions.add(pp));
  let worst: { pos: string; gap: number } | null = null;
  for (const pos of positions) {
    const champBias = champs.reduce((acc, d) => acc + (d.draft.biasVsLeague[pos] || 0), 0) / champs.length;
    const gap = (focal.draft.biasVsLeague[pos] || 0) - champBias; // positive = focal reaches earlier
    if (gap >= 0.6 && (!worst || gap > worst.gap)) worst = { pos, gap };
  }
  return worst ? `You draft ${worst.pos} earlier than league champions do.` : null;
}

/** Single headline blind spot for the free card. Always second person - never the
 *  opponent-scouting exploit text (which names the owner in third person). */
function computeBlindSpot(focal: ManagerDNA, all: ManagerDNA[], managers: ManagerRawData[]): string {
  const champs = champsOf(focal, all, managers);
  const gap = championDraftGap(focal, champs);
  if (gap) return gap;
  if (champs.length > 0) {
    const avgChampTrades = champs.reduce((acc, d) => acc + d.trade.avgTradesPerSeason, 0) / champs.length;
    if (focal.trade.avgTradesPerSeason < avgChampTrades - 0.5)
      return "You trade less than your league's champions - they work the market harder than you do.";
  }
  if (focal.tilt.tiltScore >= 50)
    return "You make more reactive moves after losing streaks - tilt shows up in your trades and waivers.";
  if (focal.draft.reachPositions.length > 0)
    return `You reach on ${focal.draft.reachPositions.join(" and ")} earlier than the rest of your league.`;
  if (focal.trade.lossTradeRatio > 1.2)
    return "You trade more when you're losing - deals made from a weak spot tend to favor the other side.";
  return "Your roster turns over faster than your league's contenders.";
}

/** Full self-facing blind-spot list for the paid dossier. */
function computeBlindSpotsList(focal: ManagerDNA, all: ManagerDNA[], managers: ManagerRawData[]): string[] {
  const champs = champsOf(focal, all, managers);
  const out: string[] = [];
  const gap = championDraftGap(focal, champs);
  if (gap) out.push(gap);
  if (focal.tilt.tiltScore >= 50)
    out.push(`Tilt risk: you over-trade and over-churn after losses (${focal.tilt.tiltLabel}).`);
  if (focal.draft.reachPositions.length > 0)
    out.push(`Draft reaches: you take ${focal.draft.reachPositions.join(", ")} earlier than your league, often leaving value at other spots.`);
  if (focal.trade.lossTradeRatio > 1.2)
    out.push("Loss-chasing trades: your deal volume spikes when you're behind, when leverage works against you.");
  if (focal.waiver.injuryOverreactionCount > 0)
    out.push(`Waiver overreaction: you've spiked adds after injuries ${focal.waiver.injuryOverreactionCount} time(s), usually at a premium.`);
  if (out.length === 0)
    out.push("No glaring behavioral leaks - your weak spots are subtle and situational.");
  return out;
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

// Raw per-owner category composites (higher = more of that identity / stronger).
const tradingComposite = (d: ManagerDNA) => d.trade.avgTradesPerSeason;
const draftingComposite = (d: ManagerDNA) =>
  (d.draft.valuePositions.length - d.draft.reachPositions.length) * 10 + (100 - d.exploitabilityScore) * 0.3;
const rosterComposite = (d: ManagerDNA) =>
  (100 - d.tilt.tiltScore) * 0.5 + (100 - d.waiver.rosterChurnRate) * 0.3 + d.waiver.waiverAggression * 0.2;

/** Focal owner's percentile (0-100) within the league on one composite. */
function leaguePercentile(focalVal: number, allVals: number[]): number {
  const valid = allVals.filter((v) => Number.isFinite(v));
  if (valid.length <= 1) return 50;
  const less = valid.filter((v) => v < focalVal).length;
  return (less / (valid.length - 1)) * 100;
}

/** Per-owner career outcomes from season records - the results grades must respect. */
function ownerOutcomes(managers: ManagerRawData[]): Map<string, { successScore: number; pfPerGame: number }> {
  const out = new Map<string, { successScore: number; pfPerGame: number }>();
  for (const m of managers) {
    let w = 0, l = 0, t = 0, pf = 0, po = 0, titles = 0;
    for (const r of m.seasonRecords) {
      w += r.wins; l += r.losses; t += r.ties; pf += r.pf;
      if (r.madePlayoffs) po++;
      if (r.isChampion) titles++;
    }
    const games = w + l + t || 1;
    const seasons = m.seasonRecords.length || 1;
    const winPct = ((w + t * 0.5) / games) * 100;
    const playoffRate = (po / seasons) * 100;
    const titleNorm = (Math.min(titles, 3) / 3) * 100;
    out.set(m.memberId, {
      successScore: winPct * 0.55 + playoffRate * 0.25 + titleNorm * 0.2,
      pfPerGame: pf / games,
    });
  }
  return out;
}

/** Grades are RESULTS-anchored: dominated by how well the owner actually does
 *  (win %, playoff rate, titles, points), with managing style as a secondary tilt.
 *  That is why a champion can never land a failing grade - process alone is never
 *  enough to sink a winner or inflate a loser. */
function computeScorecard(focal: ManagerDNA, all: ManagerDNA[], managers: ManagerRawData[], draftOnlyGrade100: number | null = null): { trading: DnaGrade; drafting: DnaGrade; roster: DnaGrade } {
  const outc = ownerOutcomes(managers);
  const success = (d: ManagerDNA) => outc.get(d.memberId)?.successScore ?? 50;
  const pf = (d: ManagerDNA) => outc.get(d.memberId)?.pfPerGame ?? 0;

  const successVals = all.map(success);
  const pfVals = all.map(pf);
  const draftProcVals = all.map(draftingComposite);
  const tradeActVals = all.map(tradingComposite);
  const steadyVals = all.map(rosterComposite);

  const sP = leaguePercentile(success(focal), successVals);
  const pfP = leaguePercentile(pf(focal), pfVals);
  const dpP = leaguePercentile(draftingComposite(focal), draftProcVals);
  const taP = leaguePercentile(tradingComposite(focal), tradeActVals);
  const stP = leaguePercentile(rosterComposite(focal), steadyVals);

  // Drafting: when we have the draft-only ("no moves after draft day") simulation,
  // that IS the grade - it isolates draft skill from trades/waivers/lineup-setting.
  // Fall back to the style+results blend only where weekly coverage is missing.
  const draftingGrade = draftOnlyGrade100 != null
    ? gradeFromScore(draftOnlyGrade100)
    : gradeFromScore(0.6 * sP + 0.4 * dpP);

  return {
    trading: gradeFromScore(0.55 * sP + 0.45 * taP),
    drafting: draftingGrade,
    roster: gradeFromScore(0.55 * pfP + 0.25 * sP + 0.2 * stP),
  };
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

function dimToRating(dim: DimRating, method: "sim" | "style"): DnaDimRating {
  return {
    method,
    current: dim.current ? { grade: gradeFromScore(dim.current.grade100), season: dim.current.season } : null,
    overall: { grade: gradeFromScore(dim.overall.grade100), seasonsUsed: dim.overall.seasonsUsed },
    perSeason: dim.perSeason.map((x) => ({ season: x.season, grade: gradeFromScore(x.grade100) })),
  };
}

function buildDimLocal(pairs: Array<{ season: number; grade100: number }>): DimRating {
  if (pairs.length === 0) return { current: null, overall: { grade100: 50, seasonsUsed: 0, seasons: [] }, perSeason: [] };
  const avg = pairs.reduce((a, x) => a + x.grade100, 0) / pairs.length;
  return {
    current: { grade100: pairs[0].grade100, season: pairs[0].season },
    overall: { grade100: avg, seasonsUsed: pairs.length, seasons: pairs.map((x) => x.season) },
    perSeason: pairs,
  };
}

/** Per-season Trading rating = focal's trade-count percentile within the league each
 *  season (league-relative activity). Seasons where nobody traded are skipped. */
function tradingDim(focal: ManagerDNA, managers: ManagerRawData[], seasons: number[]): DimRating {
  const focalMgr = managers.find((m) => m.memberId === focal.memberId);
  const pairs: Array<{ season: number; grade100: number }> = [];
  for (const s of seasons) {
    const tradesByOwner = managers.map((m) => m.txnSeasons.find((t) => t.season === s)?.trades ?? 0);
    if (Math.max(0, ...tradesByOwner) === 0) continue;
    const focalTxn = focalMgr?.txnSeasons.find((t) => t.season === s);
    if (!focalTxn) continue;
    pairs.push({ season: s, grade100: leaguePercentile(focalTxn.trades, tradesByOwner) });
  }
  return buildDimLocal(pairs);
}

export function buildLeagueDnaProfile(args: {
  allDna: ManagerDNA[];
  focalMemberId: string;
  managers: ManagerRawData[];
  sim?: SimGrades;
}): LeagueDnaProfile | null {
  const { allDna, focalMemberId, managers, sim } = args;
  const focal = allDna.find((d) => d.memberId === focalMemberId);
  if (!focal) return null;
  const { archetype, desc } = classifyArchetype(focal);

  // Style-based career grades (heuristic): used directly when there's no sim coverage,
  // and as the Trading fallback when a covered league has no tradeable signal.
  const styleCard = computeScorecard(focal, allDna, managers, null);
  const styleDim = (g: DnaGrade): DnaDimRating => ({
    method: "style", current: null, overall: { grade: g, seasonsUsed: 0 }, perSeason: [],
  });

  let ratings: LeagueDnaProfile["ratings"];
  if (sim) {
    const tdim = tradingDim(focal, managers, sim.seasons);
    ratings = {
      trading: tdim.current ? dimToRating(tdim, "sim") : styleDim(styleCard.trading),
      drafting: dimToRating(sim.drafting, "sim"),
      roster: dimToRating(sim.roster, "sim"),
    };
  } else {
    ratings = {
      trading: styleDim(styleCard.trading),
      drafting: styleDim(styleCard.drafting),
      roster: styleDim(styleCard.roster),
    };
  }
  const scorecard = {
    trading: ratings.trading.overall.grade,
    drafting: ratings.drafting.overall.grade,
    roster: ratings.roster.overall.grade,
  };

  return {
    ownerName: focal.ownerName,
    seasonsAnalyzed: focal.seasonsAnalyzed,
    archetype,
    archetypeDesc: desc,
    primaryTrait: computePrimaryTrait(focal, allDna),
    blindSpot: computeBlindSpot(focal, allDna, managers),
    leagueTwin: computeLeagueTwin(focal, allDna),
    scorecard,
    ratings,
    draftDna: focal.draft,
    tradeDna: focal.trade,
    rosterDna: { waiver: focal.waiver, tilt: focal.tilt },
    championComparison: championComparison(focal, allDna, managers),
    blindSpots: computeBlindSpotsList(focal, allDna, managers),
  };
}
