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
  archetypeReceipt: string;
  identityRank: { rank: number; of: number } | null;
  badges: Array<{ label: string; receipt: string; tier: "champion" | "dynasty" | "villain" | "gatekeeper" }>;
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

// === Relative-role archetype (Pass 1) =======================================
// Identity is league-RELATIVE: a manager is classified by the trait on which they
// deviate most from their OWN league (z-score), so every league yields a varied
// cast instead of everyone defaulting to one bucket. No neutral fallback. Honesty
// floors block hollow claims (no "Trade Shark" who never trades). "The Rock" is the
// always-eligible identity for genuinely low-activity managers.

type MedalRow = { season: number; championOwner: string | null; runnerUpOwner: string | null; thirdPlaceOwner: string | null };

const r2 = (n: number) => Math.round(n * 10) / 10;
const capR = (n: number) => Math.min(Math.max(n, 0), 9.9);

type ArchetypeAxis = {
  key: string;
  label: string;
  desc: string;
  /** oriented so HIGHER = more of this identity (inverse traits are negated) */
  oriented: (d: ManagerDNA) => number;
  /** honesty floor: may the focal manager legitimately claim this role at all? */
  qualifies: (focal: ManagerDNA) => boolean;
  /** quantified, league-relative proof line shown under the role */
  receipt: (focal: ManagerDNA, all: ManagerDNA[]) => string;
};

const ARCHETYPE_AXES: ArchetypeAxis[] = [
  {
    key: "trade_shark", label: "The Trade Shark",
    desc: "You work the phones. The roster you start the year with is never the one you finish with.",
    oriented: (d) => d.trade.avgTradesPerSeason,
    qualifies: (f) => f.trade.avgTradesPerSeason >= 0.5,
    receipt: (f, all) => {
      const avg = leagueAvg(all, (d) => d.trade.avgTradesPerSeason) || 0.01;
      const ratio = f.trade.avgTradesPerSeason / avg;
      return ratio >= 1.05
        ? `You make ${r2(capR(ratio))}x more trades than your league - the phone is always ringing.`
        : `You trade the most in your league - ${r2(f.trade.avgTradesPerSeason)} a season.`;
    },
  },
  {
    key: "waiver_predator", label: "The Waiver Predator",
    desc: "You live on the wire - first to every breakout, quickest to cut bait.",
    oriented: (d) => d.waiver.avgAcquisitionsPerSeason,
    qualifies: (f) => f.waiver.avgAcquisitionsPerSeason >= 3,
    receipt: (f, all) => {
      const avg = leagueAvg(all, (d) => d.waiver.avgAcquisitionsPerSeason) || 0.01;
      const ratio = f.waiver.avgAcquisitionsPerSeason / avg;
      return ratio >= 1.05
        ? `You hit the waiver wire ${r2(capR(ratio))}x harder than your league average.`
        : `You add the most off waivers in your league - ${Math.round(f.waiver.avgAcquisitionsPerSeason)} a season.`;
    },
  },
  {
    key: "draft_gambler", label: "The Draft Gambler",
    desc: "You trust your board over consensus and reach for the players you believe in.",
    oriented: (d) => d.draft.reachPositions.length,
    qualifies: (f) => f.draft.reachPositions.length >= 1,
    receipt: (f) => `You reach on ${f.draft.reachPositions.join(" and ")} earlier than the rest of your league.`,
  },
  {
    key: "talent_scout", label: "The Talent Scout",
    desc: "You let value fall to you - your best picks come rounds after the league expects them.",
    oriented: (d) => d.draft.valuePositions.length,
    qualifies: (f) => f.draft.valuePositions.length >= 1,
    receipt: (f) => `You find your value at ${f.draft.valuePositions.join(" and ")} - you let them fall further than your league does.`,
  },
  {
    key: "chaos_agent", label: "The Chaos Agent",
    desc: "Your roster never sits still - constant motion, for better or worse.",
    oriented: (d) => d.waiver.rosterChurnRate,
    qualifies: (f) => f.waiver.rosterChurnRate >= 20,
    receipt: (f, all) => {
      const avg = leagueAvg(all, (d) => d.waiver.rosterChurnRate) || 0.01;
      const ratio = f.waiver.rosterChurnRate / avg;
      return ratio >= 1.05
        ? `Your roster turns over ${r2(capR(ratio))}x faster than your league - never the same week to week.`
        : `You churn your roster more than anyone in your league.`;
    },
  },
  {
    key: "the_rock", label: "The Rock",
    desc: "You build on draft day and trust it - the steadiest hand in the league.",
    oriented: (d) => -d.waiver.rosterChurnRate,
    qualifies: (f) => f.seasonsAnalyzed >= 2,
    receipt: (f, all) => {
      if (f.waiver.rosterChurnRate < 1)
        return `You barely touch your roster after draft day - the steadiest hand in your league.`;
      const avg = leagueAvg(all, (d) => d.waiver.rosterChurnRate) || 0.01;
      const ratio = capR(avg / Math.max(f.waiver.rosterChurnRate, 0.01));
      return ratio >= 1.05
        ? `You churn your roster ${r2(ratio)}x less than your league - draft it and trust it.`
        : `You touch your roster less than anyone in your league.`;
    },
  },
  {
    key: "hothead", label: "The Hothead",
    desc: "You manage on emotion - a loss lights a fire that shows up in your moves.",
    oriented: (d) => d.tilt.tiltScore,
    qualifies: (f) => f.tilt.tiltScore >= 40,
    receipt: () => `You make the most reactive moves after a loss of anyone in your league.`,
  },
  {
    key: "opportunist", label: "The Opportunist",
    desc: "You read the market better than your leaguemates and strike when they're desperate.",
    oriented: (d) => -d.exploitabilityScore,
    qualifies: (f) => f.exploitabilityScore <= 35 || f.exploitabilityLabel === "Shark",
    receipt: () => `You buy low better than your leaguemates - you strike when they are desperate.`,
  },
];

function axisStats(all: ManagerDNA[], oriented: (d: ManagerDNA) => number): { mean: number; std: number } {
  const vals = all.map(oriented).filter((v) => Number.isFinite(v));
  const mean = vals.reduce((sum, v) => sum + v, 0) / (vals.length || 1);
  const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (vals.length || 1);
  return { mean, std: Math.sqrt(variance) };
}

/** League-relative archetype: the axis on which the focal manager is most extreme
 *  (z-score) among axes whose honesty floor they clear. There is no "Builder"
 *  default; The Rock is always eligible so quiet managers still get a true label. */
function classifyRelativeArchetype(
  focal: ManagerDNA,
  all: ManagerDNA[],
): { archetype: string; desc: string; receipt: string; identityRank: { rank: number; of: number } | null } {
  let best: { axis: ArchetypeAxis; claim: number } | null = null;
  for (const axis of ARCHETYPE_AXES) {
    if (!axis.qualifies(focal)) continue;
    const { mean, std } = axisStats(all, axis.oriented);
    const claim = std > 0 ? (axis.oriented(focal) - mean) / std : 0;
    if (!best || claim > best.claim) best = { axis, claim };
  }
  const axis = best?.axis ?? ARCHETYPE_AXES.find((a) => a.key === "the_rock")!;
  const fv = axis.oriented(focal);
  const higher = all.filter((d) => axis.oriented(d) > fv).length;
  const identityRank = all.length > 1 ? { rank: higher + 1, of: all.length } : null;
  return { archetype: axis.label, desc: axis.desc, receipt: axis.receipt(focal, all), identityRank };
}

// === Earned badges (Pass 1) =================================================
// Rare, absolute, prestige. Titles/finals are resolved from the authoritative
// medals table by matching each season's medal team-name to the manager's team
// that season (within-season match). Under-matching only MISSES a badge - it can
// never fabricate one. Many managers earn none; that scarcity is the point.

function normName(s: string): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

type BadgeStat = { titles: number; titleSeasons: number[]; runnerUps: number; thirds: number; seasons: number; winPct: number; playoffRate: number };

function badgeStats(managers: ManagerRawData[], medals: MedalRow[]): Map<string, BadgeStat> {
  const bySeason = new Map<number, MedalRow>();
  for (const m of medals) bySeason.set(m.season, m);
  const out = new Map<string, BadgeStat>();
  for (const mgr of managers) {
    let titles = 0, runnerUps = 0, thirds = 0, w = 0, l = 0, t = 0, po = 0;
    const titleSeasons: number[] = [];
    for (const sr of mgr.seasonRecords) {
      w += sr.wins; l += sr.losses; t += sr.ties;
      if (sr.madePlayoffs) po++;
      const med = bySeason.get(sr.season);
      const tn = normName(sr.teamName ?? "");
      if (med && tn) {
        if (normName(med.championOwner ?? "") === tn) { titles++; titleSeasons.push(sr.season); }
        else if (normName(med.runnerUpOwner ?? "") === tn) runnerUps++;
        else if (normName(med.thirdPlaceOwner ?? "") === tn) thirds++;
      }
    }
    const games = w + l + t || 1;
    const seasons = mgr.seasonRecords.length || 1;
    out.set(mgr.memberId, {
      titles, titleSeasons: titleSeasons.sort((a, b) => a - b), runnerUps, thirds,
      seasons: mgr.seasonRecords.length,
      winPct: ((w + t * 0.5) / games) * 100,
      playoffRate: (po / seasons) * 100,
    });
  }
  return out;
}

type EarnedBadge = { label: string; receipt: string; tier: "champion" | "dynasty" | "villain" | "gatekeeper" };

function computeEarnedBadges(focalId: string, stats: Map<string, BadgeStat>): EarnedBadge[] {
  const me = stats.get(focalId);
  if (!me) return [];
  const all = [...stats.entries()];
  let villainId: string | null = null;
  let bestTitles = 0, bestWin = -1;
  for (const [id, st] of all) {
    if (st.titles > bestTitles || (st.titles === bestTitles && st.winPct > bestWin)) {
      bestTitles = st.titles; bestWin = st.winPct; villainId = id;
    }
  }
  if (bestTitles < 1) villainId = null;
  const winPctsEligible = all.map(([, st]) => st).filter((st) => st.seasons >= 3).map((st) => st.winPct).sort((a, b) => b - a);
  const cutoff = winPctsEligible.length >= 3 ? winPctsEligible[Math.max(0, Math.floor(winPctsEligible.length / 3) - 1)] : Infinity;

  const out: EarnedBadge[] = [];
  if (me.titles >= 2)
    out.push({ tier: "dynasty", label: "Dynasty Architect", receipt: `${me.titles} titles (${me.titleSeasons.join(", ")}) - the closest thing this league has to a dynasty.` });
  if (me.titles >= 1)
    out.push({ tier: "champion", label: me.titles > 1 ? `${me.titles}x Champion` : "Champion", receipt: `Won it all in ${me.titleSeasons.join(", ")}.` });
  if (villainId === focalId)
    out.push({ tier: "villain", label: "League Villain", receipt: `More rings than anyone in the league (${me.titles}) - the one they are all chasing.` });
  if (me.titles === 0 && me.seasons >= 3 && me.winPct >= cutoff)
    out.push({ tier: "gatekeeper", label: "The Gatekeeper", receipt: `A top-tier record over ${me.seasons} seasons - ${Math.round(me.winPct)}% wins, still chasing the ring.` });

  const order: Record<EarnedBadge["tier"], number> = { villain: 0, dynasty: 1, champion: 2, gatekeeper: 3 };
  return out.sort((a, b) => order[a.tier] - order[b.tier]);
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
  medals?: MedalRow[];
}): LeagueDnaProfile | null {
  const { allDna, focalMemberId, managers, sim, medals } = args;
  const focal = allDna.find((d) => d.memberId === focalMemberId);
  if (!focal) return null;
  // League-relative comparisons use the CURRENT league (members present in the latest
  // season), not 18 years of departed/ghost member GUIDs - otherwise the baseline and
  // identity rank are diluted by people who aren't in the league anymore.
  const latestSeason = Math.max(0, ...managers.flatMap((m) => m.seasonRecords.map((r) => r.season)));
  const currentIds = new Set(
    managers.filter((m) => m.seasonRecords.some((r) => r.season === latestSeason)).map((m) => m.memberId),
  );
  let peers = allDna.filter((d) => currentIds.has(d.memberId));
  if (peers.length < 6) peers = allDna; // safety: never rank against too small a set
  if (!peers.some((d) => d.memberId === focal.memberId)) peers = [...peers, focal];
  const { archetype, desc, receipt: archetypeReceipt, identityRank } = classifyRelativeArchetype(focal, peers);
  const badges = computeEarnedBadges(focal.memberId, badgeStats(managers, medals ?? []));

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
    archetypeReceipt,
    identityRank,
    badges,
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
