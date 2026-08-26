import type {
  AvailabilityConfidence,
  DataIntegrity,
  RankingEvidenceQuality,
  RankingSource,
  RankingTier,
  RecommendationConfidence,
  SuperflexStatus,
} from "./types";
import { pdeLimitedRankingCopy } from "./historicalIntegrity";

export type {
  AvailabilityConfidence,
  RankingEvidenceQuality,
  RankingTier,
  RecommendationConfidence,
  RecommendationKind,
  SuperflexStatus,
} from "./types";

export function rankingTierFromEvidence(
  quality: RankingEvidenceQuality | undefined,
  source: RankingSource,
): RankingTier {
  if (quality === "archived") return "TIER_1_CONTEMPORANEOUS";
  if (quality === "none") return "TIER_4_INSUFFICIENT";
  if (quality === "league_order" || source === "historical_draft_order_proxy") {
    return "TIER_3_LEAGUE_ORDER";
  }
  if (
    quality === "season_cache" ||
    quality === "current_cache" ||
    source === "espn_season_adp" ||
    source === "fantasypros_current" ||
    source === "mixed"
  ) {
    return "TIER_2_SEASON_CACHE";
  }
  return "TIER_4_INSUFFICIENT";
}

export function availabilityConfidenceFromAudit(args: {
  integrity: Pick<
    DataIntegrity,
    "pickCount" | "uniqueOverallPicks" | "missingPlayerNameCount" | "missingPlayerIdCount" | "duplicateOverallPicks"
  >;
  canProveAvailability: boolean;
}): AvailabilityConfidence {
  if (!args.canProveAvailability) return "LOW";
  const unnamed = args.integrity.missingPlayerNameCount;
  const noId = args.integrity.missingPlayerIdCount;
  if (unnamed > 0 && noId > args.integrity.pickCount * 0.05) return "LOW";
  if (
    args.integrity.duplicateOverallPicks > 0 ||
    args.integrity.missingPlayerIdCount > args.integrity.pickCount * 0.35
  ) {
    return "MEDIUM";
  }
  return "HIGH";
}

export function recommendationConfidenceFrom(args: {
  rankingTier: RankingTier;
  availability: AvailabilityConfidence;
  superflexStatus: SuperflexStatus;
  rankingCoveragePct: number;
}): RecommendationConfidence {
  if (args.availability === "LOW") return "INSUFFICIENT";
  if (args.rankingTier === "TIER_4_INSUFFICIENT") return "INSUFFICIENT";
  if (args.rankingCoveragePct < 40) return "INSUFFICIENT";
  if (args.superflexStatus === "unknown" && args.rankingTier === "TIER_3_LEAGUE_ORDER") {
    return "INSUFFICIENT";
  }
  if (args.rankingTier === "TIER_3_LEAGUE_ORDER") return "LOW";
  if (args.superflexStatus === "unknown") return "LOW";
  if (args.rankingCoveragePct < 70 || args.availability === "MEDIUM") {
    return args.rankingTier === "TIER_1_CONTEMPORANEOUS" ? "MEDIUM" : "LOW";
  }
  if (args.rankingTier === "TIER_1_CONTEMPORANEOUS") return "HIGH";
  if (args.rankingTier === "TIER_2_SEASON_CACHE") return "MEDIUM";
  return "LOW";
}

export function rankingSourceNoteFor(args: {
  source: RankingSource;
  quality: RankingEvidenceQuality;
  season: number;
}): string {
  if (args.quality === "archived") {
    return "Rankings are contemporaneous draft-period evidence for this season.";
  }
  if (args.source === "espn_season_adp" || args.quality === "season_cache") {
    return `Season-labeled ESPN ADP for ${args.season}. This is not a proven draft-week archive, so recommendation confidence is capped at medium.`;
  }
  if (args.source === "fantasypros_current" || args.quality === "current_cache") {
    return `FantasyPros ECR/ADP is the current in-app cache, not a proven draft-week archive for ${args.season}. Treat it as season-appropriate ranking evidence, not contemporaneous.`;
  }
  if (args.source === "mixed") {
    return "Matched players use the current FantasyPros cache (not a draft-week archive). Unmatched names prove availability only and are not treated as talent rankings.";
  }
  return "Rivals can reconstruct who was available from this league's draft history, but reliable draft-time rankings are unavailable for this season. Recommendations are shown with reduced confidence.";
}

export function historicalDisclosureFor(tier: RankingTier, season: number): string | null {
  if (tier === "TIER_3_LEAGUE_ORDER" || tier === "TIER_4_INSUFFICIENT") {
    return pdeLimitedRankingCopy();
  }
  void season;
  return null;
}

export const CONFIDENCE_WEIGHT: Record<RecommendationConfidence, number> = {
  HIGH: 1,
  MEDIUM: 0.7,
  LOW: 0.35,
  INSUFFICIENT: 0,
};
