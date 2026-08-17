/**
 * RFSN-055A — Historical draft evaluation for /draft/history Team view.
 *
 * Composes existing authorities. Does not invent a grading formula.
 *   Draft Night  → computeOwnerDraftMetrics + same-season ADP (RFSN-055)
 *   Reach        → classifyReach / selectBiggestClassifiedReach
 *   Steal        → scoreDraftPicks stealDelta (RFSN-055)
 *   Draft Reality → computeDraftReality (untouched draft-day roster replay)
 */
import {
  computeOwnerDraftMetrics,
  type DraftNightPickInput,
} from "../shared/draftNightGrading";
import { selectBiggestClassifiedReach } from "../shared/reachClassification";
import { FLOOR_SEASON, MIN_WEEKS } from "./draftGradeForDna";
import { isUsableAdp, scoreDraftPicks, type DraftPickEvidence, type ScoredDraftPick } from "./draftIntelligence";
import { loadDraftPickEvidence } from "./draftIntelligenceTool";
import { computeDraftReality, type DraftRealityResult, type OwnerImpact } from "./draftRealitySimulator";

export const ADP_UNAVAILABLE_REASON = "Historical ADP unavailable for this season.";
export const REALITY_INSUFFICIENT_REASON = "Insufficient weekly player data.";
export const REALITY_FLOOR_REASON = "Draft Reality coverage starts in 2018.";
export const REALITY_UNMATCHED_REASON = "Draft Reality could not be joined to this draft board.";

const REALITY_CACHE_MS = 30 * 60 * 1000;

type RealityCacheEntry = { at: number; value: DraftRealityResult | null };
const realityCache = new Map<string, RealityCacheEntry>();

export function __resetHistoricalDraftEvalCacheForTests(): void {
  realityCache.clear();
}

export type HistoricalReachSteal = {
  playerName: string;
  pick: number;
  adp: number;
  delta: number;
  round: number;
};

export type DraftNightBlock = {
  available: boolean;
  reason: string | null;
  grade: string | null;
  valueScore: number | null;
  pickCount: number;
  adpPickCount: number;
  biggestReach: HistoricalReachSteal | null;
  biggestSteal: HistoricalReachSteal | null;
};

export type DraftRealityBlock = {
  available: boolean;
  reason: string | null;
  draftGrade: number | null;
  simulatedRank: number | null;
  teamCount: number | null;
  simulatedRecord: string | null;
  actualRecord: string | null;
  simulatedWins: number | null;
  actualWins: number | null;
  winDifference: number | null;
  rosterMgmtGrade: number | null;
};

export type OwnerHistoricalDraftEvaluation = {
  ownerKey: string;
  ownerName: string;
  teamId: number;
  draftNight: DraftNightBlock;
  draftReality: DraftRealityBlock;
};

export type HistoricalDraftEvaluation = {
  season: number;
  leagueId: string;
  owners: OwnerHistoricalDraftEvaluation[];
  draftNightSeasonAvailable: boolean;
  draftNightCoverageReason: string | null;
  draftRealitySeasonAvailable: boolean;
  draftRealityCoverageReason: string | null;
  timingMs: number;
};

function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ownerBucketKey(p: DraftPickEvidence): string {
  if (p.teamId > 0) return `t:${p.teamId}`;
  return `n:${normName(p.ownerName)}`;
}

function emptyNight(reason: string, pickCount = 0, adpPickCount = 0): DraftNightBlock {
  return {
    available: false,
    reason,
    grade: null,
    valueScore: null,
    pickCount,
    adpPickCount,
    biggestReach: null,
    biggestSteal: null,
  };
}

function emptyReality(reason: string): DraftRealityBlock {
  return {
    available: false,
    reason,
    draftGrade: null,
    simulatedRank: null,
    teamCount: null,
    simulatedRecord: null,
    actualRecord: null,
    simulatedWins: null,
    actualWins: null,
    winDifference: null,
    rosterMgmtGrade: null,
  };
}

function biggestStealForOwner(scored: ScoredDraftPick[]): HistoricalReachSteal | null {
  let best: HistoricalReachSteal | null = null;
  for (const p of scored) {
    if (p.isKeeper) continue;
    if (p.stealDelta == null || p.stealDelta <= 0 || p.adp == null) continue;
    if (!best || p.stealDelta > best.delta) {
      best = {
        playerName: p.playerName,
        pick: p.overallPick,
        adp: p.adp,
        delta: p.stealDelta,
        round: p.round,
      };
    }
  }
  return best;
}

function biggestReachForOwner(scored: ScoredDraftPick[]): HistoricalReachSteal | null {
  const eligible = scored.filter((p) => !p.isKeeper && isUsableAdp(p.adp));
  if (eligible.length === 0) return null;
  const teams = eligible[0]?.numberOfTeams ?? 0;
  const hit = selectBiggestClassifiedReach(
    eligible.map((p) => ({
      name: p.playerName,
      teamName: p.ownerName,
      pickNumber: p.overallPick,
      adp: p.adp,
      round: p.round,
    })),
    teams,
  );
  if (!hit) return null;
  return {
    playerName: hit.name,
    pick: hit.pickNumber,
    adp: hit.adp,
    delta: hit.reachDelta,
    round: hit.classification.round,
  };
}

function realityBlockFromImpact(
  impact: OwnerImpact | undefined,
  result: DraftRealityResult,
): DraftRealityBlock {
  if (!impact) return emptyReality(REALITY_INSUFFICIENT_REASON);
  const sim = result.draftOnlyStandings.find((r) => r.ownerKey === impact.ownerKey);
  const act = result.actualStandings.find((r) => r.ownerKey === impact.ownerKey);
  const simulatedWins = sim?.wins ?? null;
  const actualWins = act?.wins ?? null;
  return {
    available: true,
    reason: null,
    draftGrade: impact.draftGrade,
    simulatedRank: impact.draftRank,
    teamCount: result.teamCount,
    simulatedRecord: impact.draftRecord,
    actualRecord: impact.actualRecord,
    simulatedWins,
    actualWins,
    winDifference:
      simulatedWins != null && actualWins != null ? simulatedWins - actualWins : null,
    rosterMgmtGrade: impact.rosterMgmtGrade,
  };
}

function normGuid(s: string): string {
  return (s || "").toLowerCase().replace(/[{}]/g, "");
}

function matchRealityImpact(
  ownerKey: string,
  ownerName: string,
  teamId: number,
  result: DraftRealityResult,
): OwnerImpact | undefined {
  if (teamId > 0) {
    const byTeam = result.ownerImpacts.find((o) => o.teamId != null && o.teamId === teamId);
    if (byTeam) return byTeam;
  }
  const nk = normName(ownerName);
  if (nk) {
    const byName = result.ownerImpacts.find((o) => normName(o.ownerName) === nk);
    if (byName) return byName;
  }
  const gk = normGuid(ownerKey);
  if (!gk) return undefined;
  return result.ownerImpacts.find((o) => normGuid(o.ownerKey) === gk);
}

/**
 * Pure composition: pick evidence + optional Draft Reality result → per-owner evaluation.
 * Used by tests without a database.
 */
export function composeHistoricalDraftEvaluation(args: {
  season: number;
  leagueId: string;
  picks: DraftPickEvidence[];
  reality: DraftRealityResult | null;
  realitySkipReason?: string | null;
  timingMs?: number;
}): HistoricalDraftEvaluation {
  const seasonPicks = args.picks.filter((p) => p.season === args.season);
  const scored = scoreDraftPicks(seasonPicks);

  const adpJoined = scored.filter((p) => !p.isKeeper && isUsableAdp(p.adp));
  const nightSeasonAvailable = adpJoined.length > 0;

  const nightByOwner = new Map<string, ReturnType<typeof computeOwnerDraftMetrics>[number]>();
  if (nightSeasonAvailable) {
    const nightInputs: DraftNightPickInput[] = adpJoined.map((p) => ({
      teamId: String(p.teamId),
      ownerName: p.ownerName,
      playerName: p.playerName,
      position: p.position,
      overallPick: p.overallPick,
      round: p.round,
      adp: p.adp ?? null,
    }));
    for (const m of computeOwnerDraftMetrics(nightInputs)) {
      const key = m.teamId !== "0" && m.teamId !== "" ? `t:${m.teamId}` : `n:${normName(m.ownerName)}`;
      nightByOwner.set(key, m);
    }
  }

  const scoredByOwner = new Map<string, ScoredDraftPick[]>();
  const identityByOwner = new Map<string, { ownerKey: string; ownerName: string; teamId: number }>();
  for (const p of scored) {
    const key = ownerBucketKey(p);
    const list = scoredByOwner.get(key) ?? [];
    list.push(p);
    scoredByOwner.set(key, list);
    if (!identityByOwner.has(key)) {
      identityByOwner.set(key, {
        ownerKey: p.ownerKey || p.ownerName,
        ownerName: p.ownerName,
        teamId: p.teamId,
      });
    }
  }

  const engineReady =
    args.reality != null &&
    args.reality.weeksSimulated >= MIN_WEEKS &&
    args.reality.confidence !== "Limited";

  const draftRows: Array<{
    ident: { ownerKey: string; ownerName: string; teamId: number };
    draftNight: DraftNightBlock;
    impact: OwnerImpact | undefined;
  }> = [];
  for (const [key, ident] of identityByOwner) {
    const ownerScored = scoredByOwner.get(key) ?? [];
    const adpCount = ownerScored.filter((p) => !p.isKeeper && isUsableAdp(p.adp)).length;
    const pickCount = ownerScored.filter((p) => !p.isKeeper).length;
    const nightMetrics = nightByOwner.get(key);

    let draftNight: DraftNightBlock;
    if (!nightSeasonAvailable) {
      draftNight = emptyNight(ADP_UNAVAILABLE_REASON, pickCount, adpCount);
    } else if (!nightMetrics) {
      draftNight = emptyNight(ADP_UNAVAILABLE_REASON, pickCount, adpCount);
    } else {
      draftNight = {
        available: true,
        reason: null,
        grade: nightMetrics.letter,
        valueScore: nightMetrics.valueScore,
        pickCount: nightMetrics.pickCount,
        adpPickCount: adpCount,
        biggestReach: biggestReachForOwner(ownerScored),
        biggestSteal: biggestStealForOwner(ownerScored),
      };
    }

    const impact =
      engineReady && args.reality
        ? matchRealityImpact(ident.ownerKey, ident.ownerName, ident.teamId, args.reality)
        : undefined;
    draftRows.push({ ident, draftNight, impact });
  }

  const matchedCount = draftRows.filter((row) => row.impact).length;
  const realityMatched = engineReady && matchedCount > 0;

  const owners: OwnerHistoricalDraftEvaluation[] = [];
  for (const row of draftRows) {
    let draftReality: DraftRealityBlock;
    if (args.season < FLOOR_SEASON) {
      draftReality = emptyReality(REALITY_FLOOR_REASON);
    } else if (args.realitySkipReason) {
      draftReality = emptyReality(args.realitySkipReason);
    } else if (!args.reality || !engineReady) {
      draftReality = emptyReality(REALITY_INSUFFICIENT_REASON);
    } else if (!realityMatched) {
      draftReality = emptyReality(REALITY_UNMATCHED_REASON);
    } else {
      draftReality = realityBlockFromImpact(row.impact, args.reality);
    }

    owners.push({
      ownerKey: row.ident.ownerKey,
      ownerName: row.ident.ownerName,
      teamId: row.ident.teamId,
      draftNight: row.draftNight,
      draftReality,
    });
  }

  owners.sort((a, b) => {
    const ta = a.teamId > 0 ? a.teamId : 999;
    const tb = b.teamId > 0 ? b.teamId : 999;
    if (ta !== tb) return ta - tb;
    return a.ownerName.localeCompare(b.ownerName);
  });

  const draftRealityCoverageReason =
    args.season < FLOOR_SEASON
      ? REALITY_FLOOR_REASON
      : args.realitySkipReason
        ? args.realitySkipReason
        : !engineReady
          ? REALITY_INSUFFICIENT_REASON
          : !realityMatched
            ? REALITY_UNMATCHED_REASON
            : null;

  return {
    season: args.season,
    leagueId: args.leagueId,
    owners,
    draftNightSeasonAvailable: nightSeasonAvailable,
    draftNightCoverageReason: nightSeasonAvailable ? null : ADP_UNAVAILABLE_REASON,
    draftRealitySeasonAvailable: realityMatched,
    draftRealityCoverageReason,
    timingMs: args.timingMs ?? 0,
  };
}

async function loadRealityCached(leagueId: string, season: number): Promise<DraftRealityResult | null> {
  if (season < FLOOR_SEASON) return null;
  const cacheKey = `${leagueId}:${season}`;
  const hit = realityCache.get(cacheKey);
  if (hit && Date.now() - hit.at < REALITY_CACHE_MS) return hit.value;
  try {
    const value = await computeDraftReality(season, leagueId);
    realityCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch {
    realityCache.set(cacheKey, { at: Date.now(), value: null });
    return null;
  }
}

export async function buildHistoricalDraftEvaluation(args: {
  leagueId: string;
  season: number;
}): Promise<HistoricalDraftEvaluation> {
  const started = Date.now();
  const leagueId = String(args.leagueId).slice(0, 32);
  const season = Math.floor(args.season);
  const picks = await loadDraftPickEvidence(leagueId, { season });
  const reality = await loadRealityCached(leagueId, season);
  return composeHistoricalDraftEvaluation({
    season,
    leagueId,
    picks,
    reality,
    timingMs: Date.now() - started,
  });
}
