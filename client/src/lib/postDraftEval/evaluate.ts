import {
  buildFormatProfile,
  computeLeagueGrades,
  DEFAULT_GRADE_CONFIG,
  type FormatProfile,
  type GradePick,
  type GradePos,
} from "@/lib/liveDraftGrade";
import { countRoster, openStarterNeeds } from "@/lib/liveDraftGrade/rosterMath";
import {
  addPlayerIdentityKeys,
  auditDraftIntegrity,
  getAvailablePlayersAtPick,
  pickToRankedPlayer,
} from "./availability";
import { playerIdentityKeys } from "./names";
import {
  availabilityConfidenceFromAudit,
  historicalDisclosureFor,
  rankingSourceNoteFor,
  rankingTierFromEvidence,
  recommendationConfidenceFrom,
  CONFIDENCE_WEIGHT,
} from "./confidence";
import type { RankingEvidenceQuality, SuperflexStatus } from "./confidence";
import {
  capRecommendationConfidence,
  pdeMayEvaluate,
  pdeSeasonPolicy,
  type RecommendationCeiling,
} from "./historicalIntegrity";
import { pickIsIdentifiable } from "./playerDisplay";
import { resolveDraftPhase } from "./draftPhase";
import { nextUserOverallPick } from "./survival";
import {
  BIGGEST_MISS_MIN_GAP,
  decisionGradeFromScores,
  isNearTie,
  sameAsRecommended,
  scoreCandidate,
} from "./score";
import type { CandidateScore } from "./types";
import {
  explainPick,
  headlineWhy,
  impactTags,
  recommendationKindFor,
  rivalsPickLabel,
} from "./whyCopy";
import type {
  DataIntegrity,
  HistoricalPick,
  PickReview,
  PostDraftEvaluation,
  RankedPlayer,
  RankingSource,
  RecommendationConfidence,
  StarterRow,
} from "./types";

export type EvaluateInput = {
  leagueId: string;
  season: number;
  userTeamId: number;
  picks: HistoricalPick[];
  board: RankedPlayer[];
  profile: FormatProfile;
  rankingSource: RankingSource;
  rankingSourceNote: string;
  rankingEvidenceQuality?: RankingEvidenceQuality;
  superflexStatus?: SuperflexStatus;
  supportStatus?: import("./historicalIntegrity").SupportStatus;
  recommendationCeiling?: import("./historicalIntegrity").RecommendationCeiling;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function capEvalConfidence(
  value: RecommendationConfidence,
  ceiling?: RecommendationCeiling,
): RecommendationConfidence {
  if (!ceiling) return value;
  const mapped = value as RecommendationCeiling;
  const capped = capRecommendationConfidence(mapped, ceiling);
  return capped === "INSUFFICIENT" ? "INSUFFICIENT" : capped;
}

function emptyUnsupportedEvaluation(input: EvaluateInput): PostDraftEvaluation {
  const picks = [...input.picks].sort((a, b) => a.overallPick - b.overallPick);
  const audit = auditDraftIntegrity(picks);
  return {
    leagueId: input.leagueId,
    season: input.season,
    userTeamId: input.userTeamId,
    integrity: {
      pickCount: picks.length,
      uniqueOverallPicks: audit.uniqueOverallPicks,
      missingPlayerIdCount: audit.missingPlayerIdCount,
      missingPlayerNameCount: audit.missingPlayerNameCount,
      duplicateOverallPicks: audit.duplicateOverallPicks,
      rankingCoveragePct: 0,
      rankingSource: input.rankingSource,
      rankingSourceNote: input.rankingSourceNote,
      canProveAvailability: false,
      warnings: ["Post-Draft Evaluation is not available for this season."],
    },
    format: input.profile,
    overallLetter: "—",
    redraftLetter: "—",
    bestPick: null,
    biggestMiss: null,
    turningPoint: null,
    strongestPosition: null,
    weakestPosition: null,
    valueCaptured: null,
    valueLeftOnBoard: null,
    picks: [],
    starterRows: [],
    benchActual: [],
    benchRedraft: [],
    redraftPicks: [],
    overallConfidence: "INSUFFICIENT",
    rankingTier: "TIER_4_INSUFFICIENT",
    superflexStatus: input.superflexStatus ?? "unknown",
    historicalDisclosure: null,
    evidenceDisclosure: "",
  };
}

function toGradePicks(players: Array<{ overallPick: number; player: RankedPlayer; isKeeper?: boolean }>): GradePick[] {
  return players.map((p) => ({
    pickNumber: p.overallPick,
    position: p.player.position,
    name: p.player.name,
    adp: p.player.adp,
    marketValue: p.player.marketValue,
    projectedPoints: p.player.projectedPoints,
    isKeeper: Boolean(p.isKeeper),
  }));
}

const GRADE_POINTS: Record<string, number> = {
  "A+": 98,
  A: 94,
  "A-": 90,
  "B+": 87,
  B: 83,
  "B-": 80,
  "C+": 76,
  C: 72,
  "C-": 68,
  D: 60,
  F: 48,
  "—": 0,
};

function letterFromPoints(avg: number): string {
  if (avg >= 96) return "A+";
  if (avg >= 92) return "A";
  if (avg >= 88) return "A-";
  if (avg >= 85) return "B+";
  if (avg >= 81) return "B";
  if (avg >= 78) return "B-";
  if (avg >= 74) return "C+";
  if (avg >= 70) return "C";
  if (avg >= 66) return "C-";
  if (avg >= 58) return "D";
  return "F";
}

/** Confidence-weighted pick grades. INSUFFICIENT picks are excluded, not averaged as equals. */
function letterFromReviews(reviews: PickReview[]): string {
  let sum = 0;
  let weight = 0;
  for (const review of reviews) {
    if (review.isKeeper || review.decisionGrade === "—" || review.recommendationConfidence === "INSUFFICIENT") continue;
    const w = CONFIDENCE_WEIGHT[review.recommendationConfidence];
    if (w <= 0) continue;
    sum += (GRADE_POINTS[review.decisionGrade] ?? 75) * w;
    weight += w;
  }
  if (weight < 0.01) return "—";
  return letterFromPoints(sum / weight);
}

function teamLetter(picks: GradePick[], profile: FormatProfile, lastPick: number, total: number): string {
  const state = computeLeagueGrades({
    rostersByTeam: new Map([[1, picks]]),
    profile,
    lastLockedOverallPick: lastPick,
    totalNonKeeperPicks: Math.max(1, total),
    config: DEFAULT_GRADE_CONFIG,
  });
  return state.byTeam.get(1)?.letter ?? "—";
}

function rankSort(a: RankedPlayer, b: RankedPlayer): number {
  const ar = a.ecrRank ?? a.adp ?? 9999;
  const br = b.ecrRank ?? b.adp ?? 9999;
  return Number(ar) - Number(br);
}

function assignStarters(players: RankedPlayer[], profile: FormatProfile): {
  rows: Array<{ slot: string; player: RankedPlayer | null }>;
  bench: RankedPlayer[];
} {
  const pool = [...players].sort(rankSort);
  const take = (pos: string): RankedPlayer | null => {
    const i = pool.findIndex((p) => p.position === pos || (pos === "DEF" && (p.position === "DEF" || p.position === "DP")));
    if (i < 0) return null;
    return pool.splice(i, 1)[0] ?? null;
  };
  const rows: Array<{ slot: string; player: RankedPlayer | null }> = [];
  for (let i = 0; i < profile.starters.QB; i++) rows.push({ slot: i === 0 ? "QB" : `QB${i + 1}`, player: take("QB") });
  for (let i = 0; i < profile.starters.RB; i++) rows.push({ slot: `RB${i + 1}`, player: take("RB") });
  for (let i = 0; i < profile.starters.WR; i++) rows.push({ slot: `WR${i + 1}`, player: take("WR") });
  for (let i = 0; i < profile.starters.TE; i++) rows.push({ slot: i === 0 ? "TE" : `TE${i + 1}`, player: take("TE") });
  for (let i = 0; i < profile.starters.FLEX; i++) {
    const flex = pool.findIndex((p) => profile.flexEligibility.includes(p.position as "RB" | "WR" | "TE" | "QB"));
    rows.push({ slot: i === 0 ? "FLEX" : `FLEX${i + 1}`, player: flex >= 0 ? pool.splice(flex, 1)[0]! : null });
  }
  if (profile.starters.K > 0) rows.push({ slot: "K", player: take("K") });
  if (profile.defenseKey === "DEF" && profile.starters.DEF > 0) rows.push({ slot: "DEF", player: take("DEF") });
  if (profile.defenseKey === "DP" && profile.starters.DP > 0) rows.push({ slot: "DP", player: take("DP") });
  return { rows, bench: pool };
}

function posBalance(players: RankedPlayer[], profile: FormatProfile): { strongest: string | null; weakest: string | null } {
  const need: Array<{ pos: string; have: number; req: number }> = [
    { pos: "QB", have: players.filter((p) => p.position === "QB").length, req: profile.starters.QB },
    { pos: "RB", have: players.filter((p) => p.position === "RB").length, req: profile.starters.RB + Math.min(1, profile.starters.FLEX) },
    { pos: "WR", have: players.filter((p) => p.position === "WR").length, req: profile.starters.WR + Math.min(1, profile.starters.FLEX) },
    { pos: "TE", have: players.filter((p) => p.position === "TE").length, req: profile.starters.TE },
  ];
  const surplus = (r: (typeof need)[number]) => r.have - r.req;
  const strongest = [...need].sort((a, b) => surplus(b) - surplus(a) || b.have - a.have)[0];
  const weakest = [...need].sort((a, b) => surplus(a) - surplus(b) || a.have - b.have)[0];
  return {
    strongest: strongest && surplus(strongest) >= 0 ? strongest.pos : strongest?.pos ?? null,
    weakest: weakest && surplus(weakest) < 0 ? weakest.pos : weakest?.pos ?? null,
  };
}

function avgDelta(players: RankedPlayer[], pickNumbers: number[]): number | null {
  const scored: number[] = [];
  for (let i = 0; i < players.length; i++) {
    const adp = players[i]?.adp ?? players[i]?.ecrRank;
    const pick = pickNumbers[i];
    if (adp == null || pick == null) continue;
    scored.push(pick - Number(adp));
  }
  if (scored.length === 0) return null;
  return scored.reduce((s, n) => s + n, 0) / scored.length;
}

function scoreAvailable(args: {
  available: RankedPlayer[];
  overallPick: number;
  totalPicks: number;
  round: number;
  totalRounds: number;
  countsBefore: Record<GradePos, number>;
  profile: FormatProfile;
  rankingTier: import("./types").RankingTier;
  historicalPicks: HistoricalPick[];
  nextUserOverall: number | null;
}): CandidateScore[] {
  return args.available
    .map((player) =>
      scoreCandidate({
        player,
        overallPick: args.overallPick,
        totalPicks: args.totalPicks,
        round: args.round,
        totalRounds: args.totalRounds,
        countsBefore: args.countsBefore,
        profile: args.profile,
        available: args.available,
        rankingTier: args.rankingTier,
        historicalPicks: args.historicalPicks,
        nextUserOverall: args.nextUserOverall,
      }),
    )
    .sort((a, b) => b.total - a.total);
}

export function evaluatePostDraft(input: EvaluateInput): PostDraftEvaluation {
  const policy = pdeSeasonPolicy(input.season);
  const support = input.supportStatus ?? policy.support;
  if (!pdeMayEvaluate(support)) {
    return emptyUnsupportedEvaluation(input);
  }
  const picks = [...input.picks].sort((a, b) => a.overallPick - b.overallPick);
  const audit = auditDraftIntegrity(picks);
  const userPicks = picks.filter((p) => p.teamId === input.userTeamId);
  const matchedUser = userPicks.filter((p) => {
    const mapped = pickToRankedPlayer(p, input.board);
    return mapped.ecrRank != null || mapped.adp != null;
  }).length;
  const rankingCoveragePct =
    userPicks.length === 0 ? 0 : Math.round((matchedUser / userPicks.length) * 100);
  const identifiableCount = picks.filter((p) =>
    pickIsIdentifiable({ playerId: p.playerId, playerName: p.playerName, position: p.position }),
  ).length;
  const canProveAvailability = picks.length > 0 && identifiableCount === picks.length;
  const warnings = [...audit.warnings];
  if (!canProveAvailability) {
    warnings.push("Player availability is incomplete until every historical pick has a name or id.");
  }
  if (rankingCoveragePct < 50) {
    warnings.push(
      `Only ${rankingCoveragePct}% of this team's picks matched the ranking board. Recommendations use proven availability first; ranking coverage is limited.`,
    );
  }
  if (picks.length > 0 && userPicks.length === 0) {
    warnings.push("No draft picks are assigned to this team for this season.");
  }

  const integrity: DataIntegrity = {
    pickCount: picks.length,
    uniqueOverallPicks: audit.uniqueOverallPicks,
    missingPlayerIdCount: audit.missingPlayerIdCount,
    missingPlayerNameCount: audit.missingPlayerNameCount,
    duplicateOverallPicks: audit.duplicateOverallPicks,
    rankingCoveragePct,
    rankingSource: input.rankingSource,
    rankingSourceNote: input.rankingSourceNote,
    canProveAvailability,
    warnings,
  };

  const rankingTier = rankingTierFromEvidence(input.rankingEvidenceQuality, input.rankingSource);
  const availabilityConfidence = availabilityConfidenceFromAudit({
    integrity,
    canProveAvailability,
  });
  const superflexStatus = input.superflexStatus ?? "unknown";
  const rawRecommendationConfidence = recommendationConfidenceFrom({
    rankingTier,
    availability: availabilityConfidence,
    superflexStatus,
    rankingCoveragePct,
  });
  const ceiling =
    input.recommendationCeiling ??
    (input.rankingEvidenceQuality === "archived" ? undefined : policy.recommendationCeiling);
  const recommendationConfidence = capEvalConfidence(rawRecommendationConfidence, ceiling);
  const evidenceDisclosure = rankingSourceNoteFor({
    source: input.rankingSource,
    quality: input.rankingEvidenceQuality ?? (rankingTier === "TIER_2_SEASON_CACHE" ? "current_cache" : rankingTier === "TIER_3_LEAGUE_ORDER" ? "league_order" : "none"),
    season: input.season,
  });
  const historicalDisclosure = historicalDisclosureFor(rankingTier, input.season);
  const totalRounds = Math.max(1, ...picks.map((p) => p.round), ...userPicks.map((p) => p.round));

  const totalPicks = Math.max(picks.length, 1);
  const reviews: PickReview[] = [];
  const redraftPicks: PostDraftEvaluation["redraftPicks"] = [];
  const altTaken = new Set<string>();
  const altRoster: RankedPlayer[] = [];
  const userKeepers = userPicks.filter((p) => p.isKeeper);
  for (const keeper of userKeepers) {
    const keeperPlayer = pickToRankedPlayer(keeper, input.board);
    addPlayerIdentityKeys(altTaken, {
      playerId: keeperPlayer.playerId,
      name: keeperPlayer.name,
      position: keeperPlayer.position,
    });
    altRoster.push(keeperPlayer);
  }

  for (const pick of userPicks) {
    const available = getAvailablePlayersAtPick({
      overallPick: pick.overallPick,
      historicalDraft: picks,
      userTeamId: input.userTeamId,
      treatUserHistoricalAsTaken: true,
      board: input.board,
    }).available;
    const rosterBeforePicks = [
      ...userKeepers,
      ...userPicks.filter((p) => !p.isKeeper && p.overallPick < pick.overallPick),
    ].sort((a, b) => a.overallPick - b.overallPick);
    const rosterBeforePlayers = rosterBeforePicks.map((p) => pickToRankedPlayer(p, input.board));
    const countsBefore = countRoster(
      toGradePicks(rosterBeforePicks.map((p) => ({ overallPick: p.overallPick, player: pickToRankedPlayer(p, input.board), isKeeper: p.isKeeper }))),
      input.profile,
    );
    const progress = clamp(pick.overallPick / totalPicks, 0, 1);
    const openNeeds = openStarterNeeds(countsBefore, input.profile, {
      kDue: progress >= DEFAULT_GRADE_CONFIG.floors.kDueProgress,
      dstDue: progress >= DEFAULT_GRADE_CONFIG.floors.dstDueProgress,
    });

    const nextUserOverall = nextUserOverallPick(picks, input.userTeamId, pick.overallPick);
    const phaseInfo = resolveDraftPhase({
      round: pick.round,
      totalRounds,
      counts: countsBefore,
      profile: input.profile,
    });
    const actualPlayer = pickToRankedPlayer(pick, input.board);
    const ranked = scoreAvailable({
      available,
      overallPick: pick.overallPick,
      totalPicks,
      round: pick.round,
      totalRounds,
      countsBefore,
      profile: input.profile,
      rankingTier,
      historicalPicks: picks,
      nextUserOverall,
    });

    const actualScore = ranked.find((s) =>
      playerIdentityKeys({ playerId: actualPlayer.playerId, name: actualPlayer.name, position: actualPlayer.position }).some((k) =>
        playerIdentityKeys({ playerId: s.player.playerId, name: s.player.name, position: s.player.position }).includes(k),
      ),
    ) ?? (pick.isKeeper ? null : scoreCandidate({
      player: actualPlayer,
      overallPick: pick.overallPick,
      totalPicks,
      round: pick.round,
      totalRounds,
      countsBefore,
      profile: input.profile,
      available: [actualPlayer, ...available],
      rankingTier,
      historicalPicks: picks,
      nextUserOverall,
    }));

    const best = ranked[0] ?? null;
    const nearTie = isNearTie(actualScore, best, rankingTier);
    const identitySame = pick.isKeeper || sameAsRecommended(actualScore, best);
    const kind = recommendationKindFor({
      same: identitySame,
      confidence: recommendationConfidence,
      nearTie,
    });
    const same = pick.isKeeper || kind === "same" || kind === "none";
    const rivalsPlayer = same ? actualPlayer : best?.player ?? actualPlayer;
    const otherOptions = ranked
      .map((s) => s.player)
      .filter((p) => p.name !== rivalsPlayer.name && p.name !== actualPlayer.name)
      .slice(0, 4);

    const rivalsScore = same ? actualScore : best;
    const scarcityOnRivals = (rivalsScore?.scarcity ?? 0) >= 78;
    const needDifferentiationActive = actualScore?.needDifferentiationActive ?? false;
    const reasons = [...(rivalsScore?.reasons ?? actualScore?.reasons ?? [])];
    const counterpoints = [...(actualScore?.counterpoints ?? [])];
    if (rankingTier === "TIER_3_LEAGUE_ORDER" || rankingTier === "TIER_4_INSUFFICIENT") {
      counterpoints.push("LOW_HISTORICAL_RANK_CONFIDENCE");
    }
    if ((actualScore?.talent ?? 0) >= 80) counterpoints.push("ACTUAL_PLAYER_ELITE_TALENT");

    const why = pick.isKeeper
      ? "Keeper — not graded. This pick was locked before the draft and is included in roster construction only."
      : explainPick({
          actualName: actualPlayer.name,
          actualPos: actualPlayer.position,
          rivalsName: kind === "none" ? null : rivalsPlayer.name,
          rivalsPos: kind === "none" ? null : rivalsPlayer.position,
          sameAsRivals: same,
          kind,
          confidence: recommendationConfidence,
          openNeeds,
          rosterBefore: rosterBeforePlayers.map((p) => ({ name: p.name, position: p.position })),
          actualScore,
          rivalsScore,
          scarcityOnRivals,
          needDifferentiationActive,
          rankingNote: historicalDisclosure,
        });

    reviews.push({
      overallPick: pick.overallPick,
      round: pick.round,
      roundPick: pick.roundPick,
      isKeeper: pick.isKeeper,
      sameAsRivals: same,
      decisionGrade: decisionGradeFromScores({
        actual: actualScore,
        best,
        samePlayer: same,
        isKeeper: pick.isKeeper,
        nearTie,
        confidence: recommendationConfidence,
      }),
      actual: actualPlayer,
      rivals: kind === "none" ? actualPlayer : rivalsPlayer,
      otherOptions,
      why,
      impact: impactTags({
        openNeeds,
        actualPos: actualPlayer.position,
        rivalsPos: kind === "none" ? null : rivalsPlayer.position,
        sameAsRivals: same,
        scarcityOnRivals,
        kind,
        confidence: recommendationConfidence,
        reasons,
      }),
      rosterBefore: rosterBeforePlayers.map((p) => ({ name: p.name, position: p.position })),
      openNeedsBefore: openNeeds,
      availableTop: available.slice().sort(rankSort).slice(0, 8),
      actualScore: actualScore?.total ?? null,
      rivalsScore: rivalsScore?.total ?? null,
      scoreGap: same ? 0 : (rivalsScore?.total ?? 0) - (actualScore?.total ?? 0),
      recommendationConfidence,
      availabilityConfidence,
      rankingTier,
      recommendationKind: kind,
      rivalsLabel: pick.isKeeper ? "Keeper — not graded" : rivalsPickLabel(kind),
      reasons,
      counterpoints,
      draftPhase: phaseInfo.phase,
      survivesUntilNextPick: rivalsScore?.survivesUntilNextPick ?? null,
    });

    const altCounts = countRoster(
      toGradePicks(altRoster.map((p, i) => ({ overallPick: i + 1, player: p }))),
      input.profile,
    );
    const altAvailable = getAvailablePlayersAtPick({
      overallPick: pick.overallPick,
      historicalDraft: picks,
      userTeamId: input.userTeamId,
      rivalsRosterKeys: altTaken,
      treatUserHistoricalAsTaken: false,
      board: input.board,
    }).available;
    const altRanked = pick.isKeeper
      ? []
      : scoreAvailable({
          available: altAvailable,
          overallPick: pick.overallPick,
          totalPicks,
          round: pick.round,
          totalRounds,
          countsBefore: altCounts,
          profile: input.profile,
          rankingTier,
          historicalPicks: picks,
          nextUserOverall,
        });
    const altBest = altRanked[0] ?? null;
    const altActualScore = altRanked.find((s) =>
      playerIdentityKeys({ playerId: actualPlayer.playerId, name: actualPlayer.name, position: actualPlayer.position }).some((k) =>
        playerIdentityKeys({ playerId: s.player.playerId, name: s.player.name, position: s.player.position }).includes(k),
      ),
    ) ?? null;
    const altNear = isNearTie(altActualScore, altBest, rankingTier);
    const altKind = recommendationKindFor({
      same: pick.isKeeper || sameAsRecommended(altActualScore, altBest),
      confidence: recommendationConfidence,
      nearTie: altNear,
    });
    const canSwap =
      !pick.isKeeper &&
      (recommendationConfidence === "HIGH" || recommendationConfidence === "MEDIUM") &&
      altKind !== "none" &&
      altKind !== "same";
    const altChoice = pick.isKeeper || !canSwap ? actualPlayer : altBest?.player ?? actualPlayer;
    const sameAsOriginal =
      playerIdentityKeys({ playerId: actualPlayer.playerId, name: actualPlayer.name, position: actualPlayer.position }).some((k) =>
        playerIdentityKeys({ playerId: altChoice.playerId, name: altChoice.name, position: altChoice.position }).includes(k),
      );
    if (!pick.isKeeper) {
      addPlayerIdentityKeys(altTaken, {
        playerId: altChoice.playerId,
        name: altChoice.name,
        position: altChoice.position,
      });
      altRoster.push(altChoice);
    }
    redraftPicks.push({
      overallPick: pick.overallPick,
      round: pick.round,
      player: altChoice,
      sameAsOriginal,
      isKeeper: pick.isKeeper,
    });
  }

  const actualPlayers = userPicks.map((p) => pickToRankedPlayer(p, input.board));
  const redraftGradePicks = toGradePicks(
    redraftPicks.map((p) => ({ overallPick: p.overallPick, player: p.player, isKeeper: p.isKeeper })),
  );
  const lastPick = userPicks[userPicks.length - 1]?.overallPick ?? picks.length;
  const overallLetter = letterFromReviews(reviews);
  const redraftLetter =
    recommendationConfidence === "LOW" || recommendationConfidence === "INSUFFICIENT"
      ? overallLetter
      : teamLetter(redraftGradePicks, input.profile, lastPick, totalPicks);

  const nonKeeperReviews = reviews.filter((r) => !r.isKeeper);
  const bestSame = [...nonKeeperReviews]
    .filter((r) => r.recommendationKind === "same" || r.sameAsRivals)
    .sort((a, b) => (b.actualScore ?? 0) - (a.actualScore ?? 0))[0];
  const miss = [...nonKeeperReviews]
    .filter((r) => {
      if (r.sameAsRivals || r.recommendationKind === "same" || r.recommendationKind === "none") return false;
      if (r.scoreGap < BIGGEST_MISS_MIN_GAP) return false;
      if (r.recommendationConfidence !== "HIGH" && r.recommendationConfidence !== "MEDIUM") return false;
      if (r.availabilityConfidence !== "HIGH") return false;
      if (r.rankingTier !== "TIER_1_CONTEMPORANEOUS" && r.rankingTier !== "TIER_2_SEASON_CACHE") return false;
      return true;
    })
    .sort((a, b) => b.scoreGap - a.scoreGap)[0];

  const turning = [...nonKeeperReviews]
    .filter((r) => {
      if (r.sameAsRivals || r.recommendationKind === "none" || r.recommendationKind === "same") return false;
      if (r.recommendationConfidence === "LOW" || r.recommendationConfidence === "INSUFFICIENT") return false;
      const missedPos = r.rivals?.position;
      if (!missedPos) return false;
      const later = nonKeeperReviews.filter((x) => x.overallPick > r.overallPick);
      const chase = later.filter((x) => x.actual.position === missedPos);
      return chase.length >= 2 || later.some((x) => x.actual.position === missedPos && (x.actualScore ?? 99) < (r.rivalsScore ?? 0));
    })
    .sort((a, b) => b.scoreGap - a.scoreGap)[0];

  const actualAssign = assignStarters(actualPlayers, input.profile);
  const redraftAssign = assignStarters(altRoster, input.profile);
  const slotSet = new Map<string, StarterRow>();
  for (const row of actualAssign.rows) {
    slotSet.set(row.slot, { slot: row.slot, actual: row.player, redraft: null });
  }
  for (const row of redraftAssign.rows) {
    const existing = slotSet.get(row.slot);
    if (existing) existing.redraft = row.player;
    else slotSet.set(row.slot, { slot: row.slot, actual: null, redraft: row.player });
  }

  const balance = posBalance(actualPlayers, input.profile);
  const valueCaptured = avgDelta(
    actualPlayers,
    userPicks.map((p) => p.overallPick),
  );
  const valueLeftOnBoard = miss ? miss.scoreGap : null;

  return {
    leagueId: input.leagueId,
    season: input.season,
    userTeamId: input.userTeamId,
    integrity,
    format: input.profile,
    overallLetter,
    redraftLetter,
    bestPick: bestSame
      ? {
          label: "Best Pick",
          round: bestSame.round,
          overallPick: bestSame.overallPick,
          actualName: bestSame.actual.name,
          altName: null,
          why: headlineWhy(
            bestSame.actual,
            `at ${bestSame.round}.${String(bestSame.roundPick).padStart(2, "0")} was the strongest decision on the board for this roster.`,
          ),
        }
      : null,
    biggestMiss: miss
      ? {
          label: "Biggest Miss",
          round: miss.round,
          overallPick: miss.overallPick,
          actualName: miss.actual.name,
          altName: miss.rivals?.name ?? null,
          why: miss.why,
        }
      : null,
    turningPoint: turning
      ? {
          label: "Draft Turning Point",
          round: turning.round,
          overallPick: turning.overallPick,
          actualName: turning.actual.name,
          altName: turning.rivals?.name ?? null,
          why: turning.why,
        }
      : null,
    strongestPosition: balance.strongest,
    weakestPosition: balance.weakest,
    valueCaptured,
    valueLeftOnBoard,
    picks: reviews,
    starterRows: [...slotSet.values()],
    benchActual: actualAssign.bench,
    benchRedraft: redraftAssign.bench,
    redraftPicks,
    overallConfidence: recommendationConfidence,
    rankingTier,
    superflexStatus,
    historicalDisclosure,
    evidenceDisclosure,
  };
}

export { buildFormatProfile };
