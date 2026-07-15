import {
  createGradeConfig,
  type GradeConfig,
  type GradeLetter,
} from "./gradeConfig";
import { scoreCeiling } from "./floors";
import { normalizeGradePos } from "./formatProfile";
import {
  applyLetterHysteresis,
  clampLetterJump,
  letterFromPercentile,
} from "./letters";
import { accumulateOpportunityCost } from "./opportunityCost";
import { scorePillars, scoredPickCount } from "./pillars";
import { buildGradeChangeReasons } from "./reasons";
import { countRoster, openStarterNeeds } from "./rosterMath";
import type {
  FormatProfile,
  GradeChangeEvent,
  GradePick,
  LeagueGradeState,
  TeamGradeSnapshot,
} from "./types";
import { blendPillars, interpolateWeights } from "./weights";

export type ComputeLeagueGradesInput = {
  /** teamId → roster picks (keepers + drafted) */
  rostersByTeam: Map<number, GradePick[]>;
  profile: FormatProfile;
  /** Highest locked overall pick number (non-keeper preferred) */
  lastLockedOverallPick: number;
  totalNonKeeperPicks: number;
  previous?: LeagueGradeState | null;
  config?: GradeConfig;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Full order of operations:
 * P/T/C/L → weights → raw → OC → floors → EMA → peer letter (+ reasons).
 */
export function computeLeagueGrades(input: ComputeLeagueGradesInput): LeagueGradeState {
  const cfg = input.config ?? createGradeConfig();
  const total = Math.max(1, input.totalNonKeeperPicks);
  const progress = clamp(input.lastLockedOverallPick / total, 0, 1);
  const weights = interpolateWeights(progress, cfg);
  const prev = input.previous;

  type Instant = {
    teamId: number;
    pickValue: number;
    talent: number;
    construction: number;
    lineupDepth: number;
    opportunityCostSum: number;
    opportunityCost: number;
    lastPickOc: number;
    avgDelta: number;
    scoredPickCount: number;
    rawScore: number;
    smoothedScore: number;
    letter: GradeLetter;
    counts: ReturnType<typeof countRoster>;
    lastPickPos: ReturnType<typeof normalizeGradePos>;
    openNeedBeforeLast: ReturnType<typeof openStarterNeeds>[number] | null;
    floorApplied: boolean;
    sInstant: number;
  };

  const instants: Instant[] = [];

  for (const [teamId, roster] of input.rostersByTeam) {
    const chrono = [...roster].sort((a, b) => a.pickNumber - b.pickNumber);
    const n = scoredPickCount(chrono);
    const pillars = scorePillars(chrono, input.profile, cfg, progress);
    const oc = accumulateOpportunityCost(chrono, input.profile, total, cfg);
    const sRaw = blendPillars(pillars, weights);
    const sAfterOc = sRaw - oc.penalty;
    const ceiling = scoreCeiling({
      progress,
      counts: pillars.counts,
      profile: input.profile,
      cfg,
    });
    const sInstant = clamp(sAfterOc, 0, ceiling);
    const floorApplied = sInstant < sAfterOc - 1e-6 || ceiling < 100;

    const prevSnap = prev?.byTeam.get(teamId);
    const smoothed =
      prevSnap && n >= cfg.smoothing.minScoredPicksForLetter
        ? cfg.smoothing.emaPrevWeight * prevSnap.smoothedScore +
          cfg.smoothing.emaInstantWeight * sInstant
        : sInstant;

    // last pick metadata for reasons
    const last = chrono.filter((p) => !p.isKeeper).at(-1);
    let openNeedBeforeLast: Instant["openNeedBeforeLast"] = null;
    let lastPickPos: Instant["lastPickPos"] = null;
    if (last) {
      lastPickPos = normalizeGradePos(last.position);
      const beforeCounts = countRoster(
        chrono.filter((p) => p.pickNumber < last.pickNumber),
        input.profile,
      );
      const pLast = Number(last.pickNumber) / total;
      const open = openStarterNeeds(beforeCounts, input.profile, {
        kDue: pLast >= cfg.floors.kDueProgress,
        dstDue: pLast >= cfg.floors.dstDueProgress,
      });
      openNeedBeforeLast = open[0] ?? null;
    }

    instants.push({
      teamId,
      pickValue: pillars.pickValue,
      talent: pillars.talent,
      construction: pillars.construction,
      lineupDepth: pillars.lineupDepth,
      opportunityCostSum: oc.sum,
      opportunityCost: oc.penalty,
      lastPickOc: oc.lastPickOc,
      avgDelta: pillars.avgDelta,
      scoredPickCount: n,
      rawScore: sRaw,
      smoothedScore: smoothed,
      letter: "—",
      counts: pillars.counts,
      lastPickPos,
      openNeedBeforeLast,
      floorApplied,
      sInstant,
    });
  }

  // Peer rank on smoothed scores among teams with enough picks
  const ranked = [...instants]
    .filter((t) => t.scoredPickCount >= cfg.smoothing.minScoredPicksForLetter)
    .sort((a, b) => b.smoothedScore - a.smoothedScore);
  const peerScores = ranked.map((t) => t.smoothedScore);
  const totalRanked = ranked.length || 1;

  const letterByTeam = new Map<number, GradeLetter>();
  ranked.forEach((t, i) => {
    const pctl = i / totalRanked;
    let letter = letterFromPercentile(pctl, cfg);
    const prevLetter = prev?.byTeam.get(t.teamId)?.letter ?? "—";
    letter = applyLetterHysteresis({
      previous: prevLetter,
      candidate: letter,
      score: t.smoothedScore,
      peerScoresSortedDesc: peerScores,
      cfg,
    });
    const floorForcesDrop =
      t.floorApplied &&
      letterIndexWorse(letter, prevLetter) &&
      t.sInstant <= cfg.floors.oneCoreVacancyCeiling;
    letter = clampLetterJump(prevLetter, letter, cfg, {
      allowMultiDrop: floorForcesDrop,
    });
    letterByTeam.set(t.teamId, letter);
  });

  const byTeam = new Map<number, TeamGradeSnapshot>();
  const historyByTeam = new Map<number, TeamGradeSnapshot[]>();
  const changes: GradeChangeEvent[] = [];

  for (const t of instants) {
    const letter =
      t.scoredPickCount < cfg.smoothing.minScoredPicksForLetter
        ? "—"
        : (letterByTeam.get(t.teamId) ?? "—");
    const prevSnap = prev?.byTeam.get(t.teamId);
    const snap: TeamGradeSnapshot = {
      teamId: t.teamId,
      atOverallPick: input.lastLockedOverallPick,
      pickValue: t.pickValue,
      talent: t.talent,
      construction: t.construction,
      lineupDepth: t.lineupDepth,
      opportunityCostSum: t.opportunityCostSum,
      opportunityCost: t.opportunityCost,
      lastPickOc: t.lastPickOc,
      avgDelta: t.avgDelta,
      scoredPickCount: t.scoredPickCount,
      rawScore: t.rawScore,
      smoothedScore: t.smoothedScore,
      letter,
      weights: { ...weights },
      lastChange: null,
    };

    if (prevSnap) {
      const event = buildGradeChangeReasons({
        teamId: t.teamId,
        atOverallPick: input.lastLockedOverallPick,
        gradeBefore: prevSnap.letter,
        gradeAfter: letter,
        scoreBefore: prevSnap.smoothedScore,
        scoreAfter: t.smoothedScore,
        before: {
          pickValue: prevSnap.pickValue,
          talent: prevSnap.talent,
          construction: prevSnap.construction,
          lineupDepth: prevSnap.lineupDepth,
          opportunityCost: prevSnap.opportunityCost,
          rawScore: prevSnap.rawScore,
          smoothedScore: prevSnap.smoothedScore,
        },
        after: {
          pickValue: t.pickValue,
          talent: t.talent,
          construction: t.construction,
          lineupDepth: t.lineupDepth,
          opportunityCost: t.opportunityCost,
          rawScore: t.rawScore,
          smoothedScore: t.smoothedScore,
        },
        lastPickOc: t.lastPickOc,
        lastPickPos: t.lastPickPos,
        openNeedBeforeLast: t.openNeedBeforeLast,
        profile: input.profile,
        cfg,
        floorApplied: t.floorApplied,
      });
      if (event) {
        snap.lastChange = event;
        changes.push(event);
      }
    }

    byTeam.set(t.teamId, snap);
    const hist = [...(prev?.historyByTeam.get(t.teamId) ?? [])];
    // Append when overall pick advances or first sample
    if (
      hist.length === 0 ||
      hist[hist.length - 1]!.atOverallPick !== snap.atOverallPick
    ) {
      hist.push(snap);
    } else {
      hist[hist.length - 1] = snap;
    }
    historyByTeam.set(t.teamId, hist);
  }

  return { byTeam, historyByTeam, changes };
}

function letterIndexWorse(a: GradeLetter, b: GradeLetter): boolean {
  const order = ["A", "B", "C", "D", "F", "—"];
  return order.indexOf(a) > order.indexOf(b);
}

/** Map for LiveDraftWrapUp / team badge backward compatibility. */
export function toLegacyDraftGrades(
  state: LeagueGradeState,
): Map<number, { letter: string; avgDelta: number; strength: number }> {
  const out = new Map<number, { letter: string; avgDelta: number; strength: number }>();
  for (const [tid, s] of state.byTeam) {
    out.set(tid, {
      letter: s.letter,
      avgDelta: s.avgDelta,
      strength: s.talent,
    });
  }
  return out;
}
