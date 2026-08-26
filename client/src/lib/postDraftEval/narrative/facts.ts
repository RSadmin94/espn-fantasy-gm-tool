import { pdeMayStorytell, pdeSeasonPolicy } from "../historicalIntegrity";
import type { PostDraftEvaluation } from "../types";
import type {
  CommentaryWeight,
  ConsequenceStrength,
  NarrativeConfidence,
  NarrativeFacts,
  NarrativeKind,
  NarrativeKeeper,
  NarrativePickFact,
  NarrativeRedraftPick,
  PickImportance,
} from "./types";
import { EVALUATOR_VERSION, NARRATIVE_VERSION } from "./types";

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}
function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function conf(v: unknown): NarrativeConfidence {
  const s = String(v || "").toUpperCase();
  if (s === "HIGH" || s === "MEDIUM" || s === "LOW" || s === "INSUFFICIENT") return s;
  return "INSUFFICIENT";
}
function kindOf(v: unknown, same: boolean): NarrativeKind {
  const s = String(v || "").toLowerCase();
  if (same || s === "same") return "same";
  if (s === "preferred") return "preferred";
  if (s === "alternative") return "alternative";
  return "none";
}
function nameOf(v: unknown): string {
  return v && typeof v === "object" ? str((v as { name?: unknown }).name) : "";
}
function posOf(v: unknown): string {
  return v && typeof v === "object" ? str((v as { position?: unknown }).position) : "";
}
function playerNames(v: unknown): string[] {
  return Array.isArray(v) ? v.map(nameOf).filter(Boolean) : [];
}

const POS_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "DP"];

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sortedNeeds(values: string[]): string[] {
  return uniqueSorted(values).sort((a, b) => {
    const ia = POS_ORDER.indexOf(a.toUpperCase());
    const ib = POS_ORDER.indexOf(b.toUpperCase());
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b);
  });
}

/** Stable JSON for cache keys: sorted object keys, null/undefined omitted, arrays preserved. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalizeCacheValue(value));
}

export function canonicalizeCacheValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (Array.isArray(value)) return value.map(canonicalizeCacheValue).filter((v) => v !== null);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b))) {
      const next = canonicalizeCacheValue((value as Record<string, unknown>)[key]);
      if (next === null) continue;
      out[key] = next;
    }
    return out;
  }
  return null;
}

/**
 * Cache identity — only fields that should bust storytelling cache.
 * Excludes generated copy, timestamps, display labels, and semantically irrelevant order.
 */
export function narrativeCacheIdentity(facts: NarrativeFacts): Record<string, unknown> {
  return {
    awards: {
      bestPick: facts.bestPick
        ? { actualName: facts.bestPick.actualName, overallPick: facts.bestPick.overallPick }
        : null,
      biggestMiss: facts.biggestMiss
        ? {
            actualName: facts.biggestMiss.actualName,
            altName: facts.biggestMiss.altName,
            overallPick: facts.biggestMiss.overallPick,
          }
        : null,
      turningPoint: facts.turningPoint
        ? {
            actualName: facts.turningPoint.actualName,
            altName: facts.turningPoint.altName,
            overallPick: facts.turningPoint.overallPick,
          }
        : null,
    },
    evaluatorVersion: facts.evaluatorVersion,
    keepers: [...facts.retainedKeepers]
      .map((k) => ({ name: k.name, overallPick: k.overallPick, pos: k.pos }))
      .sort((a, b) => a.overallPick - b.overallPick || a.name.localeCompare(b.name)),
    leagueId: facts.leagueId,
    narrativeVersion: facts.narrativeVersion,
    overallConfidence: facts.overallConfidence,
    overallGrade: facts.overallGrade,
    picks: [...facts.picks]
      .sort((a, b) => a.overallPick - b.overallPick)
      .map((p) => ({
        actualName: p.actualName,
        actualPos: p.actualPos,
        confidence: p.confidence,
        grade: p.grade,
        importance: p.importance,
        independentRivalsName: p.independentRivalsName || p.rivalsName,
        isKeeper: p.isKeeper,
        kind: p.kind,
        openNeeds: sortedNeeds(p.openNeeds),
        otherOptions: uniqueSorted(p.otherOptions.slice(0, 4)),
        overallPick: p.overallPick,
        reasons: uniqueSorted(p.reasons),
        sequentialRedraftName: p.sequentialRedraftName,
      })),
    recommendationCeiling: facts.recommendationCeiling,
    rivalsRedraftGrade: facts.rivalsRedraftGrade,
    season: facts.season,
    sequentialRedraft: [...facts.sequentialRedraftPicks]
      .map((p) => ({ isKeeper: p.isKeeper, name: p.name, overallPick: p.overallPick, pos: p.pos }))
      .sort((a, b) => a.overallPick - b.overallPick || a.name.localeCompare(b.name)),
    strongestPosition: facts.strongestPosition,
    supportStatus: facts.supportStatus,
    teamId: facts.teamId,
    weakestPosition: facts.weakestPosition,
  };
}

function supportOf(season: number): NarrativeFacts["supportStatus"] {
  const policy = pdeSeasonPolicy(season);
  if (policy.support === "LIMITED_SUPPORT") return "LIMITED";
  if (policy.support === "FULLY_SUPPORTED") return "FULL";
  return "UNSUPPORTED";
}

function weightFor(args: {
  kind: NarrativeKind;
  confidence: NarrativeConfidence;
  round: number;
  isKeeper: boolean;
  isBest: boolean;
  isMiss: boolean;
  isTurn: boolean;
  scoreGap: number;
}): CommentaryWeight {
  if (args.isKeeper) return "keeper";
  if (args.confidence === "INSUFFICIENT" && args.kind === "none") return "skip";
  if (args.isBest || args.isMiss || args.isTurn) return "major";
  if (args.kind === "same") return "same";
  if (args.round <= 3 && args.kind === "preferred" && (args.confidence === "HIGH" || args.confidence === "MEDIUM")) {
    return "major";
  }
  if (args.scoreGap >= 12 && args.kind === "preferred") return "major";
  if (args.kind === "preferred" || args.kind === "alternative") return "normal";
  return "skip";
}

function importanceFor(weight: CommentaryWeight, round: number, kind: NarrativeKind): PickImportance {
  if (weight === "major") return "MAJOR";
  if (weight === "keeper") return "NOTABLE";
  if (weight === "same" || (round >= 10 && kind !== "preferred")) return "ROUTINE";
  return "NOTABLE";
}

function callout(
  raw: unknown,
): { round: number; overallPick: number; actualName: string; altName: string | null; why: string } | null {
  const h = rec(raw);
  const actualName = str(h.actualName || h.name);
  if (!actualName) return null;
  return {
    round: num(h.round),
    overallPick: num(h.overallPick, -1),
    actualName,
    altName: str(h.altName) || null,
    why: str(h.why),
  };
}

function laterChaseFor(
  picks: NarrativePickFact[],
  fromOverall: number,
  pos: string,
  isMissOrTurn: boolean,
): NarrativePickFact["laterChase"] {
  if (!pos) return null;
  const later = picks.filter((p) => p.overallPick > fromOverall && p.actualPos === pos && !p.isKeeper);
  if (later.length === 0) return null;
  const strength: ConsequenceStrength = isMissOrTurn || later.length >= 2 ? "hard" : "soft";
  return {
    pos,
    strength,
    picks: later.slice(0, 3).map((p) => ({
      overallPick: p.overallPick,
      round: p.round,
      actualName: p.actualName,
    })),
  };
}

function passedNeedsEarlier(picks: NarrativePickFact[], current: NarrativePickFact): string[] {
  const earlier = picks.filter((p) => p.overallPick < current.overallPick && !p.isKeeper);
  const stillOpen = new Set(current.openNeeds);
  const passed: string[] = [];
  for (const need of stillOpen) {
    const skipped = earlier.some(
      (p) => p.openNeeds.includes(need) && p.actualPos !== need && (p.rivalsPos === need || p.kind === "preferred"),
    );
    if (skipped) passed.push(need);
  }
  return passed;
}

export function storytellingAllowed(season: number): boolean {
  return pdeMayStorytell(season);
}

/** Read-only projection of evaluator output. The narrative layer cannot invent beyond this. */
export function buildNarrativeFacts(
  evaled: PostDraftEvaluation | Record<string, unknown>,
  extras?: { teamName?: string },
): NarrativeFacts {
  const e = rec(evaled);
  const season = num(e.season);
  const policy = pdeSeasonPolicy(season);
  const bestRaw = callout(e.bestPick);
  const miss = callout(e.biggestMiss);
  const turn = callout(e.turningPoint);
  const best = bestRaw
    ? { round: bestRaw.round, overallPick: bestRaw.overallPick, actualName: bestRaw.actualName, why: bestRaw.why }
    : null;
  const bestOverall = best?.overallPick ?? -1;
  const missOverall = miss?.overallPick ?? -1;
  const turnOverall = turn?.overallPick ?? -1;

  const redraftByPick = new Map<number, { name: string; pos: string; isKeeper: boolean; same: boolean }>();
  const sequentialRedraftPicks: NarrativeRedraftPick[] = [];
  for (const raw of Array.isArray(e.redraftPicks) ? e.redraftPicks : []) {
    const row = rec(raw);
    const player = row.player ?? raw;
    const overallPick = num(row.overallPick);
    const mapped = {
      overallPick,
      name: nameOf(player),
      pos: posOf(player),
      isKeeper: Boolean(row.isKeeper),
    };
    sequentialRedraftPicks.push(mapped);
    redraftByPick.set(overallPick, {
      name: mapped.name,
      pos: mapped.pos,
      isKeeper: mapped.isKeeper,
      same: Boolean(row.sameAsOriginal),
    });
  }

  const picks: NarrativePickFact[] = (Array.isArray(e.picks) ? e.picks : []).map((raw) => {
    const p = rec(raw);
    const same = Boolean(p.sameAsRivals);
    const kind = kindOf(p.recommendationKind, same);
    const overallPick = num(p.overallPick);
    const round = num(p.round);
    const confidence = conf(p.recommendationConfidence);
    const rosterSrc = Array.isArray(p.rosterBefore) ? p.rosterBefore : [];
    const isKeeper = Boolean(p.isKeeper);
    const scoreGap = num(p.scoreGap);
    const weight = weightFor({
      kind,
      confidence,
      round,
      isKeeper,
      isBest: overallPick === bestOverall,
      isMiss: overallPick === missOverall,
      isTurn: overallPick === turnOverall,
      scoreGap,
    });
    const openNeeds = Array.isArray(p.openNeedsBefore) ? p.openNeedsBefore.map((n) => str(n)) : [];
    const actualName = nameOf(p.actual);
    const actualPos = posOf(p.actual);
    const independentRivalsName = isKeeper ? "" : nameOf(p.rivals) || (kind === "same" ? actualName : "");
    const independentRivalsPos = isKeeper ? "" : posOf(p.rivals) || actualPos;
    const seq = redraftByPick.get(overallPick);
    const sequentialRedraftName = seq?.name || (isKeeper ? actualName : "");
    const sequentialRedraftPos = seq?.pos || (isKeeper ? actualPos : "");
    return {
      overallPick,
      round,
      roundPick: num(p.roundPick),
      isKeeper,
      actualName,
      actualPos,
      rivalsName: independentRivalsName,
      rivalsPos: independentRivalsPos,
      independentRivalsName,
      independentRivalsPos,
      sequentialRedraftName,
      sequentialRedraftPos,
      sequentialSameAsOriginal: seq ? seq.same : isKeeper || kind === "same",
      kind: isKeeper ? "none" : kind,
      sameAsRivals: isKeeper ? false : same || kind === "same",
      grade: isKeeper ? "—" : str(p.decisionGrade, "—"),
      confidence,
      availabilityConfidence: conf(p.availabilityConfidence),
      reasons: Array.isArray(p.reasons) ? p.reasons.map((r) => str(r)).filter(Boolean) : [],
      why: str(p.why),
      impact: Array.isArray(p.impact) ? p.impact.map((t) => str(t)).filter(Boolean) : [],
      otherOptions: playerNames(p.otherOptions),
      availableTop: playerNames(p.availableTop),
      rosterBefore: rosterSrc.map((r) => str(rec(r).name)).filter(Boolean),
      openNeeds,
      survivesUntilNextPick: p.survivesUntilNextPick == null ? null : Boolean(p.survivesUntilNextPick),
      commentaryWeight: weight,
      importance: importanceFor(weight, round, kind),
      laterChase: null,
      passedNeedsEarlier: [],
    };
  });

  for (const pick of picks) {
    const missedPos = !pick.isKeeper && pick.kind !== "same" && pick.kind !== "none" ? pick.rivalsPos : "";
    pick.laterChase = laterChaseFor(
      picks,
      pick.overallPick,
      missedPos,
      pick.overallPick === missOverall || pick.overallPick === turnOverall,
    );
    pick.passedNeedsEarlier = passedNeedsEarlier(picks, pick);
  }

  const rows = Array.isArray(e.starterRows) ? e.starterRows : [];
  const actualStarters = rows.map((row) => {
    const r = rec(row);
    return { slot: str(r.slot, "—"), name: nameOf(r.actual) || null, pos: posOf(r.actual) || null };
  });
  const rivalsStarters = rows.map((row) => {
    const r = rec(row);
    return { slot: str(r.slot, "—"), name: nameOf(r.redraft) || null, pos: posOf(r.redraft) || null };
  });
  const sequentialRivalsRoster = [
    ...rivalsStarters,
    ...(Array.isArray(e.benchRedraft) ? e.benchRedraft : []).map((player, i) => ({
      slot: `BENCH${i + 1}`,
      name: nameOf(player) || null,
      pos: posOf(player) || null,
    })),
  ];
  const retainedKeepers: NarrativeKeeper[] = picks
    .filter((p) => p.isKeeper)
    .map((p) => ({ overallPick: p.overallPick, name: p.actualName, pos: p.actualPos }))
    .sort((a, b) => a.overallPick - b.overallPick);
  const rosterEnteringLiveDraft = retainedKeepers.map((k) => k.name);
  const positionsFilledBeforeLive = uniqueSorted(retainedKeepers.map((k) => k.pos.toUpperCase()));
  if (sequentialRedraftPicks.length === 0) {
    for (const p of picks) {
      sequentialRedraftPicks.push({
        overallPick: p.overallPick,
        name: p.isKeeper ? p.actualName : p.sequentialRedraftName,
        pos: p.isKeeper ? p.actualPos : p.sequentialRedraftPos,
        isKeeper: p.isKeeper,
      });
    }
  }

  const ceilingRaw = policy.recommendationCeiling;
  const recommendationCeiling: NarrativeConfidence =
    ceilingRaw === "HIGH" || ceilingRaw === "MEDIUM" || ceilingRaw === "LOW" || ceilingRaw === "INSUFFICIENT"
      ? ceilingRaw
      : "INSUFFICIENT";

  return {
    evaluatorVersion: EVALUATOR_VERSION,
    narrativeVersion: NARRATIVE_VERSION,
    leagueId: str(e.leagueId),
    season,
    teamId: num(e.userTeamId),
    teamName: extras?.teamName || "Your team",
    overallGrade: str(e.overallLetter, "—"),
    rivalsRedraftGrade: str(e.redraftLetter, "—"),
    overallConfidence: conf(e.overallConfidence),
    rankingTier: str(e.rankingTier),
    historicalDisclosure: str(e.historicalDisclosure) || null,
    evidenceDisclosure: str(e.evidenceDisclosure),
    supportStatus: supportOf(season),
    recommendationCeiling,
    strongestPosition: str(e.strongestPosition) || null,
    weakestPosition: str(e.weakestPosition) || null,
    bestPick: best,
    biggestMiss: miss,
    turningPoint: turn,
    actualStarters,
    rivalsStarters,
    retainedKeepers,
    rosterEnteringLiveDraft,
    positionsFilledBeforeLive,
    sequentialRivalsRoster,
    sequentialRedraftPicks,
    picks,
  };
}

export function allowedNamesForPick(facts: NarrativeFacts, overallPick: number): Set<string> {
  const pick = facts.picks.find((p) => p.overallPick === overallPick);
  const names = new Set<string>();
  const add = (n: string | null | undefined) => {
    const t = String(n || "")
      .trim()
      .toLowerCase();
    if (t) names.add(t);
  };
  if (!pick) return names;
  add(pick.actualName);
  add(pick.rivalsName);
  add(pick.independentRivalsName);
  add(pick.sequentialRedraftName);
  pick.otherOptions.forEach(add);
  pick.availableTop.forEach(add);
  pick.rosterBefore.forEach(add);
  pick.laterChase?.picks.forEach((p) => add(p.actualName));
  facts.retainedKeepers.forEach((k) => add(k.name));
  return names;
}

export function sequentialRivalsNames(facts: NarrativeFacts): Set<string> {
  const names = new Set<string>();
  const add = (n: string | null | undefined) => {
    const t = String(n || "")
      .trim()
      .toLowerCase();
    if (t) names.add(t);
  };
  for (const k of facts.retainedKeepers) add(k.name);
  for (const row of facts.sequentialRivalsRoster) add(row.name);
  for (const row of facts.rivalsStarters) add(row.name);
  for (const p of facts.sequentialRedraftPicks) add(p.name);
  for (const p of facts.picks) {
    add(p.sequentialRedraftName);
    if (p.isKeeper) add(p.actualName);
  }
  return names;
}

export function allFactNames(facts: NarrativeFacts): Set<string> {
  const names = new Set<string>();
  const add = (n: string | null | undefined) => {
    const t = String(n || "")
      .trim()
      .toLowerCase();
    if (t) names.add(t);
  };
  add(facts.bestPick?.actualName);
  add(facts.biggestMiss?.actualName);
  add(facts.biggestMiss?.altName);
  add(facts.turningPoint?.actualName);
  add(facts.turningPoint?.altName);
  for (const row of [...facts.actualStarters, ...facts.rivalsStarters, ...facts.sequentialRivalsRoster]) add(row.name);
  for (const k of facts.retainedKeepers) add(k.name);
  for (const p of facts.sequentialRedraftPicks) add(p.name);
  for (const p of facts.picks) {
    add(p.actualName);
    add(p.rivalsName);
    add(p.independentRivalsName);
    add(p.sequentialRedraftName);
    p.otherOptions.forEach(add);
    p.availableTop.forEach(add);
    p.rosterBefore.forEach(add);
    p.laterChase?.picks.forEach((c) => add(c.actualName));
  }
  return names;
}

export function narrativeCacheMaterial(facts: NarrativeFacts): string {
  return stableStringify(narrativeCacheIdentity(facts));
}

/** Compact, ranking-free payload for the LLM. Engine decisions stay intact. */
export function compactFactsForLlm(facts: NarrativeFacts) {
  return {
    evaluatorVersion: facts.evaluatorVersion,
    narrativeVersion: facts.narrativeVersion,
    teamName: facts.teamName,
    season: facts.season,
    supportStatus: facts.supportStatus,
    recommendationCeiling: facts.recommendationCeiling,
    overallGrade: facts.overallGrade,
    rivalsRedraftGrade: facts.rivalsRedraftGrade,
    overallConfidence: facts.overallConfidence,
    rankingTier: facts.rankingTier,
    historicalDisclosure: facts.historicalDisclosure,
    evidenceDisclosure: facts.evidenceDisclosure,
    strongestPosition: facts.strongestPosition,
    weakestPosition: facts.weakestPosition,
    retainedKeepers: facts.retainedKeepers,
    rosterEnteringLiveDraft: facts.rosterEnteringLiveDraft,
    positionsFilledBeforeLive: facts.positionsFilledBeforeLive,
    bestPick: facts.bestPick,
    biggestMiss: facts.biggestMiss,
    turningPoint: facts.turningPoint,
    actualStarters: facts.actualStarters,
    sequentialRivalsRoster: facts.sequentialRivalsRoster,
    sequentialRedraftPicks: facts.sequentialRedraftPicks.map((p) => ({
      overallPick: p.overallPick,
      name: p.name,
      pos: p.pos,
      isKeeper: p.isKeeper,
    })),
    layers: {
      pickCard: "Independent recommendation at the actual board this pick faced.",
      sequentialRedraft: "Full alternate Rivals draft after earlier replacements changed the roster.",
    },
    picks: facts.picks.map((p) => ({
      overallPick: p.overallPick,
      round: p.round,
      isKeeper: p.isKeeper,
      actualName: p.actualName,
      actualPos: p.actualPos,
      independentRivalsName: p.isKeeper ? null : p.independentRivalsName || p.rivalsName || null,
      independentRivalsPos: p.isKeeper ? null : p.independentRivalsPos || p.rivalsPos || null,
      sequentialRedraftName: p.isKeeper ? p.actualName : p.sequentialRedraftName || null,
      sequentialRedraftPos: p.isKeeper ? p.actualPos : p.sequentialRedraftPos || null,
      sequentialSameAsOriginal: p.sequentialSameAsOriginal,
      rivalsName: p.isKeeper ? null : p.rivalsName || null,
      rivalsPos: p.isKeeper ? null : p.rivalsPos || null,
      kind: p.kind,
      sameAsRivals: p.sameAsRivals,
      grade: p.grade,
      confidence: p.confidence,
      availabilityConfidence: p.availabilityConfidence,
      reasons: p.reasons,
      why: p.why,
      impact: p.impact.slice(0, 4),
      otherOptions: p.otherOptions.slice(0, 4),
      availableTop: p.importance === "MAJOR" ? p.availableTop.slice(0, 6) : p.otherOptions.slice(0, 3),
      openNeeds: p.openNeeds,
      rosterBefore: p.rosterBefore,
      survivesUntilNextPick: p.survivesUntilNextPick,
      commentaryWeight: p.commentaryWeight,
      importance: p.importance,
      laterChase: p.laterChase
        ? {
            pos: p.laterChase.pos,
            strength: p.laterChase.strength,
            later: p.laterChase.picks.map((c) => `${c.actualName} (pick ${c.overallPick})`),
          }
        : null,
      passedNeedsEarlier: p.passedNeedsEarlier,
    })),
  };
}

export function compactFactsSize(facts: NarrativeFacts): number {
  return JSON.stringify(compactFactsForLlm(facts)).length;
}
