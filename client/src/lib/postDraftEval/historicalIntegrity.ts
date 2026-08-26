/**
 * Read-only Post-Draft Evaluation historical-season integrity classifier.
 * Does not score picks, mutate recaps, or infer missing league settings.
 */

export type IntegrityGrade = "PASS" | "WARN" | "FAIL";
export type AvailabilityGrade = "HIGH" | "MEDIUM" | "LOW" | "IMPOSSIBLE";
export type SupportStatus = "FULLY_SUPPORTED" | "LIMITED_SUPPORT" | "UNSUPPORTED" | "NO_DATA";
export type SettingsSource = "ESPN_RELIABLE" | "STORED" | "INFERRED" | "UNKNOWN";
export type SuperflexFlag = "YES" | "NO" | "UNKNOWN";
export type RankingTierLabel = "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4";
export type RecommendationCeiling = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type SeasonIntegrityInput = {
  season: number;
  pickCount: number;
  expectedPicks: number | null;
  duplicateOverall: number;
  missingOverallCount: number;
  distinctTeamIdsInPicks: number;
  zeroTeamIdPicks: number;
  userPickCount: number;
  userTeamPresentInTeamsTable: boolean;
  leagueName: string | null;
  expectedLeagueName?: string;
  foreignLeagueEvidence: boolean;
  playerIdCoveragePct: number;
  namedCoveragePct: number;
  identifiablePct: number;
  snakeOk: boolean;
  settingsSource: SettingsSource;
  superflex: SuperflexFlag;
  keeperFieldExists: boolean;
  keeperCount: number;
  rankingTier: RankingTierLabel;
};

export type SeasonIntegrityResult = {
  season: number;
  status: SupportStatus;
  completeness: IntegrityGrade;
  teamIdentity: IntegrityGrade;
  playerIdentity: IntegrityGrade;
  draftOrder: IntegrityGrade;
  availability: AvailabilityGrade;
  userPicksFound: number;
  rosterReconstruction: IntegrityGrade;
  settingsSource: SettingsSource;
  superflex: SuperflexFlag;
  rankingTier: RankingTierLabel;
  availabilityConfidence: AvailabilityGrade;
  recommendationCeiling: RecommendationCeiling;
  reasons: string[];
};

const FULLY_MIN_IDENTIFIABLE = 90;
const LIMITED_MIN_IDENTIFIABLE = 80;
const USER_PICKS_MIN = 8;

function completenessGrade(input: SeasonIntegrityInput): IntegrityGrade {
  if (input.pickCount <= 0) return "FAIL";
  const expected = input.expectedPicks;
  if (expected != null && expected > 0) {
    const ratio = input.pickCount / expected;
    if (ratio < 0.85) return "FAIL";
    if (input.duplicateOverall > 0) return "FAIL";
    if (input.missingOverallCount > 0) return ratio < 0.95 ? "FAIL" : "WARN";
    if (ratio < 0.97) return "WARN";
  } else if (input.duplicateOverall > 0 || input.missingOverallCount > 2) {
    return "FAIL";
  }
  return "PASS";
}

function teamIdentityGrade(input: SeasonIntegrityInput): IntegrityGrade {
  if (input.foreignLeagueEvidence) return "FAIL";
  if (input.pickCount <= 0) return "FAIL";
  if (input.zeroTeamIdPicks / input.pickCount >= 0.5) return "FAIL";
  if (input.userPickCount <= 0) return "FAIL";
  if (!input.userTeamPresentInTeamsTable) return "FAIL";
  const expected = input.expectedLeagueName?.trim().toLowerCase();
  const actual = input.leagueName?.trim().toLowerCase() ?? "";
  if (expected && actual && actual !== expected) return "FAIL";
  if (input.zeroTeamIdPicks > 0) return "WARN";
  if (input.distinctTeamIdsInPicks < 2) return "FAIL";
  return "PASS";
}

function playerIdentityGrade(input: SeasonIntegrityInput): IntegrityGrade {
  if (input.pickCount <= 0) return "FAIL";
  if (input.identifiablePct < LIMITED_MIN_IDENTIFIABLE) return "FAIL";
  if (input.playerIdCoveragePct >= 95 && input.namedCoveragePct >= 95) return "PASS";
  return "WARN";
}

function draftOrderGrade(input: SeasonIntegrityInput, completeness: IntegrityGrade, team: IntegrityGrade): IntegrityGrade {
  if (team === "FAIL") return "FAIL";
  if (input.duplicateOverall > 0) return "FAIL";
  if (completeness === "FAIL") return "FAIL";
  if (input.zeroTeamIdPicks > 0) return "FAIL";
  // Keepers and traded picks break a naive snake check. Continuous overalls plus
  // valid team IDs are enough to reconstruct who was already drafted at pick N.
  if (completeness === "WARN") return "WARN";
  return "PASS";
}

function rosterGrade(input: SeasonIntegrityInput, team: IntegrityGrade, player: IntegrityGrade): IntegrityGrade {
  if (input.userPickCount <= 0 || team === "FAIL") return "FAIL";
  if (input.userPickCount < USER_PICKS_MIN) return "WARN";
  if (player === "FAIL") return "FAIL";
  if (player === "WARN") return "WARN";
  return "PASS";
}

function availabilityGrade(
  input: SeasonIntegrityInput,
  team: IntegrityGrade,
  player: IntegrityGrade,
  order: IntegrityGrade,
): AvailabilityGrade {
  if (team === "FAIL" || order === "FAIL" || player === "FAIL" || input.identifiablePct < LIMITED_MIN_IDENTIFIABLE) {
    return "IMPOSSIBLE";
  }
  if (input.identifiablePct < 95) {
    return input.identifiablePct >= FULLY_MIN_IDENTIFIABLE && input.playerIdCoveragePct >= 95 ? "MEDIUM" : "LOW";
  }
  if (order === "WARN") return "MEDIUM";
  return "HIGH";
}

function recommendationCeiling(
  rankingTier: RankingTierLabel,
  availability: AvailabilityGrade,
  superflex: SuperflexFlag,
): RecommendationCeiling {
  if (availability === "IMPOSSIBLE" || availability === "LOW") return "INSUFFICIENT";
  if (rankingTier === "TIER_4") return "INSUFFICIENT";
  if (rankingTier === "TIER_3") return "LOW";
  if (superflex === "UNKNOWN") return rankingTier === "TIER_1" ? "MEDIUM" : "LOW";
  if (rankingTier === "TIER_2") return availability === "HIGH" ? "MEDIUM" : "LOW";
  if (rankingTier === "TIER_1") return availability === "HIGH" ? "HIGH" : "MEDIUM";
  return "INSUFFICIENT";
}

function supportStatus(args: {
  pickCount: number;
  completeness: IntegrityGrade;
  team: IntegrityGrade;
  player: IntegrityGrade;
  order: IntegrityGrade;
  availability: AvailabilityGrade;
  roster: IntegrityGrade;
  settingsSource: SettingsSource;
  rankingTier: RankingTierLabel;
  ceiling: RecommendationCeiling;
}): SupportStatus {
  if (args.pickCount <= 0) return "NO_DATA";
  const criticalFail =
    args.team === "FAIL" ||
    args.order === "FAIL" ||
    args.player === "FAIL" ||
    args.roster === "FAIL" ||
    args.completeness === "FAIL" ||
    args.availability === "IMPOSSIBLE" ||
    args.availability === "LOW";
  if (criticalFail) return "UNSUPPORTED";

  const settingsUsable = args.settingsSource === "ESPN_RELIABLE" || args.settingsSource === "STORED";
  const rankingHonest = args.rankingTier === "TIER_1" || args.rankingTier === "TIER_2";
  const availabilityOk = args.availability === "HIGH" || args.availability === "MEDIUM";
  if (
    settingsUsable &&
    rankingHonest &&
    availabilityOk &&
    args.team === "PASS" &&
    args.order !== "FAIL" &&
    args.roster !== "FAIL" &&
    args.ceiling !== "INSUFFICIENT"
  ) {
    return "FULLY_SUPPORTED";
  }
  return "LIMITED_SUPPORT";
}

export function classifySeasonIntegrity(input: SeasonIntegrityInput): SeasonIntegrityResult {
  if (input.pickCount <= 0) {
    return {
      season: input.season,
      status: "NO_DATA",
      completeness: "FAIL",
      teamIdentity: "FAIL",
      playerIdentity: "FAIL",
      draftOrder: "FAIL",
      availability: "IMPOSSIBLE",
      userPicksFound: 0,
      rosterReconstruction: "FAIL",
      settingsSource: input.settingsSource,
      superflex: input.superflex,
      rankingTier: input.rankingTier,
      availabilityConfidence: "IMPOSSIBLE",
      recommendationCeiling: "INSUFFICIENT",
      reasons: ["No draft rows for this season."],
    };
  }

  const completeness = completenessGrade(input);
  const teamIdentity = teamIdentityGrade(input);
  const playerIdentity = playerIdentityGrade(input);
  const draftOrder = draftOrderGrade(input, completeness, teamIdentity);
  const rosterReconstruction = rosterGrade(input, teamIdentity, playerIdentity);
  const availability = availabilityGrade(input, teamIdentity, playerIdentity, draftOrder);
  const ceiling = recommendationCeiling(input.rankingTier, availability, input.superflex);
  const status = supportStatus({
    pickCount: input.pickCount,
    completeness,
    team: teamIdentity,
    player: playerIdentity,
    order: draftOrder,
    availability,
    roster: rosterReconstruction,
    settingsSource: input.settingsSource,
    rankingTier: input.rankingTier,
    ceiling,
  });

  const reasons: string[] = [];
  if (input.foreignLeagueEvidence) reasons.push("Recap identity does not match the expected league.");
  if (input.zeroTeamIdPicks > 0) reasons.push(`${input.zeroTeamIdPicks} picks have no usable teamId.`);
  if (input.userPickCount <= 0) reasons.push("Selected user team has no assigned picks.");
  if (input.playerIdCoveragePct < 50 && input.namedCoveragePct >= FULLY_MIN_IDENTIFIABLE) {
    reasons.push("Player IDs are sparse; identity relies on name + position.");
  }
  if (input.namedCoveragePct < 50 && input.playerIdCoveragePct >= FULLY_MIN_IDENTIFIABLE) {
    reasons.push("Player names are sparse; identity relies on ESPN player IDs.");
  }
  if (input.settingsSource === "INFERRED") reasons.push("Lineup settings are inferred, not stored historical settings.");
  if (input.settingsSource === "UNKNOWN") reasons.push("Lineup settings are unknown.");
  if (input.superflex === "UNKNOWN") reasons.push("Superflex status is unknown.");
  if (input.keeperFieldExists && input.keeperCount === 0) {
    reasons.push("Keeper field exists but no keepers are populated.");
  }
  if (!input.snakeOk) {
    reasons.push("Naive snake order does not match; keepers or traded picks may be present.");
  }
  if (input.rankingTier === "TIER_3") {
    reasons.push("Availability can be reconstructed, but no reliable external rankings exist.");
  }
  if (input.rankingTier === "TIER_4") reasons.push("Ranking evidence is insufficient.");
  if (input.duplicateOverall > 0) reasons.push("Duplicate overall pick numbers.");
  if (input.missingOverallCount > 0) reasons.push(`${input.missingOverallCount} overall pick number(s) missing.`);

  return {
    season: input.season,
    status,
    completeness,
    teamIdentity,
    playerIdentity,
    draftOrder,
    availability,
    userPicksFound: input.userPickCount,
    rosterReconstruction,
    settingsSource: input.settingsSource,
    superflex: input.superflex,
    rankingTier: input.rankingTier,
    availabilityConfidence: availability,
    recommendationCeiling: ceiling,
    reasons,
  };
}

export function rankingTierFromStoredEvidence(args: {
  contemporaneousSnapshot: boolean;
  correctSeasonRanking: boolean;
  draftOrderTrustworthy: boolean;
}): RankingTierLabel {
  if (args.contemporaneousSnapshot) return "TIER_1";
  if (args.correctSeasonRanking) return "TIER_2";
  if (args.draftOrderTrustworthy) return "TIER_3";
  return "TIER_4";
}

export type ContinuousRange = { start: number; end: number };

export function continuousRanges(
  seasons: Array<{ season: number; status: SupportStatus }>,
  allowed: SupportStatus[],
): ContinuousRange[] {
  const ok = new Set(allowed);
  const sorted = seasons.slice().sort((a, b) => a.season - b.season);
  const ranges: ContinuousRange[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const row of sorted) {
    if (ok.has(row.status)) {
      if (start == null) start = row.season;
      else if (prev != null && row.season !== prev + 1) {
        ranges.push({ start, end: prev });
        start = row.season;
      }
      prev = row.season;
    } else if (start != null && prev != null) {
      ranges.push({ start, end: prev });
      start = null;
      prev = null;
    }
  }
  if (start != null && prev != null) ranges.push({ start, end: prev });
  return ranges;
}

/** Verified Post-Draft Evaluation production window. Other product surfaces may still use older seasons. */
export const PDE_EVAL_FROM = 2018;
export const PDE_EVAL_THROUGH = 2026;

export type PdeRankingKind = "espn_season_adp" | "current_board" | "league_order" | "none";

export type PdeSeasonPolicy = {
  season: number;
  support: SupportStatus;
  rankingTier: RankingTierLabel;
  rankingKind: PdeRankingKind;
  recommendationCeiling: RecommendationCeiling;
  availabilityConfidence: AvailabilityGrade;
  limitedRankingDisclosure: boolean;
};

const LIMITED_RANKING_COPY =
  "Rivals can reliably reconstruct your draft and who was available, but player-value rankings for this season are limited. Recommendations are shown with reduced confidence.";

const UNSUPPORTED_TITLE = "Draft Evaluation Not Available";
const UNSUPPORTED_BODY =
  "Rivals has draft history for this season, but the data isn't complete enough to reliably reconstruct your draft decisions.";
const UNSUPPORTED_FOOTNOTE = "Post-Draft Evaluation is currently supported beginning with the 2018 season.";

export function pdeUnsupportedCopy(): { title: string; body: string; footnote: string } {
  return { title: UNSUPPORTED_TITLE, body: UNSUPPORTED_BODY, footnote: UNSUPPORTED_FOOTNOTE };
}

export function pdeLimitedRankingCopy(): string {
  return LIMITED_RANKING_COPY;
}

export function pdeLimitedRankingTitle(): string {
  return "Limited historical ranking data";
}

export function pdeSeasonPolicy(season: number): PdeSeasonPolicy {
  if (!Number.isFinite(season) || season < PDE_EVAL_FROM || season > PDE_EVAL_THROUGH) {
    return {
      season,
      support: season < 2010 ? "NO_DATA" : "UNSUPPORTED",
      rankingTier: "TIER_4",
      rankingKind: "none",
      recommendationCeiling: "INSUFFICIENT",
      availabilityConfidence: "IMPOSSIBLE",
      limitedRankingDisclosure: false,
    };
  }
  if (season === 2019) {
    return {
      season,
      support: "LIMITED_SUPPORT",
      rankingTier: "TIER_3",
      rankingKind: "league_order",
      recommendationCeiling: "LOW",
      availabilityConfidence: "HIGH",
      limitedRankingDisclosure: true,
    };
  }
  return {
    season,
    support: "FULLY_SUPPORTED",
    rankingTier: "TIER_2",
    rankingKind: season === 2026 ? "current_board" : "espn_season_adp",
    recommendationCeiling: "MEDIUM",
    availabilityConfidence: "HIGH",
    limitedRankingDisclosure: false,
  };
}

export function pdeMayEvaluate(status: SupportStatus | null | undefined): boolean {
  return status === "FULLY_SUPPORTED" || status === "LIMITED_SUPPORT";
}

/** Storytelling is never requested for unsupported seasons (2010–2017). */
export function pdeMayStorytell(season: number): boolean {
  return pdeMayEvaluate(pdeSeasonPolicy(season).support);
}

export function resolvePdeSeason(requested: number | null | undefined, seasons: number[]): number | null {
  if (requested && Number.isFinite(requested) && requested > 0) {
    if (seasons.length === 0 || seasons.includes(requested)) return requested;
  }
  return seasons[0] ?? (requested && requested > 0 ? requested : null);
}

/** Ignore a previously fetched board when the selected season has changed. */
export function pdeLiveBoardForSeason<T extends { season: number }>(
  data: T | null | undefined,
  season: number,
): T | null {
  return data != null && data.season === season ? data : null;
}

/**
 * League-order seasons (currently 2019) may use overall pick as a ranking proxy.
 * That is market-behavior evidence, not ESPN ADP / FantasyPros ECR.
 */
export function pdeLeagueOrderProxyRank(
  kind: PdeRankingKind,
  overallPick: number,
): { ecrRank: number | null; adp: number | null } {
  if (kind === "league_order" && Number.isFinite(overallPick) && overallPick > 0) {
    return { ecrRank: overallPick, adp: overallPick };
  }
  return { ecrRank: null, adp: null };
}

const CONF_RANK: Record<RecommendationCeiling, number> = {
  INSUFFICIENT: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function capRecommendationConfidence(
  value: RecommendationCeiling,
  ceiling: RecommendationCeiling,
): RecommendationCeiling {
  return CONF_RANK[value] <= CONF_RANK[ceiling] ? value : ceiling;
}

/**
 * Production gate: verified 2018–2026 policy plus live integrity.
 * Pre-2018 stays unsupported even if a future recap looks complete.
 */
export function rankingTierToEvalTier(
  tier: RankingTierLabel,
): "TIER_1_CONTEMPORANEOUS" | "TIER_2_SEASON_CACHE" | "TIER_3_LEAGUE_ORDER" | "TIER_4_INSUFFICIENT" {
  if (tier === "TIER_1") return "TIER_1_CONTEMPORANEOUS";
  if (tier === "TIER_2") return "TIER_2_SEASON_CACHE";
  if (tier === "TIER_3") return "TIER_3_LEAGUE_ORDER";
  return "TIER_4_INSUFFICIENT";
}

export function rankingQualityForPolicy(
  kind: PdeRankingKind,
): "archived" | "season_cache" | "current_cache" | "league_order" | "none" {
  if (kind === "espn_season_adp") return "season_cache";
  if (kind === "current_board") return "current_cache";
  if (kind === "league_order") return "league_order";
  return "none";
}

export function applyPdeSupportGate(live: SeasonIntegrityResult): SeasonIntegrityResult {
  const policy = pdeSeasonPolicy(live.season);
  if (policy.support === "UNSUPPORTED" || policy.support === "NO_DATA") {
    return {
      ...live,
      status: policy.support,
      availability: policy.availabilityConfidence,
      availabilityConfidence: policy.availabilityConfidence,
      rankingTier: policy.rankingTier,
      recommendationCeiling: policy.recommendationCeiling,
    };
  }
  if (live.status === "UNSUPPORTED" || live.status === "NO_DATA") return live;
  return {
    ...live,
    status: policy.support,
    rankingTier: policy.rankingTier,
    recommendationCeiling: policy.recommendationCeiling,
    availabilityConfidence:
      live.availability === "HIGH" || live.availability === "MEDIUM" ? "HIGH" : live.availability,
  };
}
