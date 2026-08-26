/**
 * Stable, machine-readable AI feature IDs for usage attribution.
 * Mapped from real call sites — not invented product names.
 */

export const AI_FEATURE_IDS = [
  "ADVISOR",
  "DRAFT_COMMENTARY",
  "PICK_GRADING",
  "DRAFT_ANALYSIS",
  "RIVALRY_HISTORY",
  "LEAGUE_HISTORY",
  "OWNER_COMPARISON",
  "TEAM_IMPROVEMENT",
  "TRADE_ANALYSIS",
  "WEEKLY_INTEL",
  "BEAT_REPORTER",
  "REPUTATION",
  "INJURY",
  "SIMULATION",
  "NEWSROOM",
  "OFFSEASON",
  "DNA",
  "TTS",
  "ENTAILMENT",
  "POST_DRAFT_EVALUATION",
  "POST_DRAFT_STORYTELLING",
  "OTHER",
  "UNATTRIBUTED",
] as const;

export type AiFeatureId = (typeof AI_FEATURE_IDS)[number];

export const UNATTRIBUTED = "UNATTRIBUTED" as const;
export const UNKNOWN = "UNKNOWN" as const;

export const FEATURE_LABELS: Record<AiFeatureId, string> = {
  ADVISOR: "Advisor",
  DRAFT_COMMENTARY: "Draft Commentary",
  PICK_GRADING: "Pick Grading",
  DRAFT_ANALYSIS: "Draft Analysis",
  RIVALRY_HISTORY: "Rivalry / History",
  LEAGUE_HISTORY: "League History",
  OWNER_COMPARISON: "Owner Comparison",
  TEAM_IMPROVEMENT: "Team Analysis / Improvement",
  TRADE_ANALYSIS: "Trade Analysis",
  WEEKLY_INTEL: "Weekly Intel",
  BEAT_REPORTER: "Beat Reporter",
  REPUTATION: "Reputation",
  INJURY: "Injury",
  SIMULATION: "Simulation",
  NEWSROOM: "League Newsroom",
  OFFSEASON: "Offseason",
  DNA: "League / Owner DNA",
  TTS: "Broadcast TTS",
  ENTAILMENT: "Commentary Entailment",
  POST_DRAFT_EVALUATION: "Post-Draft Evaluation",
  POST_DRAFT_STORYTELLING: "Post-Draft Storytelling",
  OTHER: "Other",
  UNATTRIBUTED: "Unattributed",
};

/** Legacy invokeLLM `callType` → feature ID. */
const CALL_TYPE_TO_FEATURE: Record<string, AiFeatureId> = {
  advisor: "ADVISOR",
  chat: "ADVISOR",
  draft_helper: "DRAFT_ANALYSIS",
  war_room_agent: "DRAFT_ANALYSIS",
  weekly_briefing: "WEEKLY_INTEL",
  retrospective: "LEAGUE_HISTORY",
  json_structured: "OTHER",
};

const FEATURE_NAME_TO_FEATURE: Record<string, AiFeatureId> = {
  "advisor.chat": "ADVISOR",
  "advisor.stream": "ADVISOR",
  "tradeNarrative.generateSentence": "TRADE_ANALYSIS",
  "draftHelper.getPickRecommendation": "DRAFT_ANALYSIS",
};

const FEATURE_SET = new Set<string>(AI_FEATURE_IDS);

export function isAiFeatureId(value: string | null | undefined): value is AiFeatureId {
  return !!value && FEATURE_SET.has(value);
}

export function normalizeFeatureId(
  value: string | null | undefined,
  fallback: AiFeatureId = "UNATTRIBUTED",
): AiFeatureId {
  if (!value || !value.trim()) return fallback;
  const raw = value.trim();
  if (isAiFeatureId(raw)) return raw;
  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (isAiFeatureId(upper)) return upper;
  const fromCall = CALL_TYPE_TO_FEATURE[raw] ?? CALL_TYPE_TO_FEATURE[raw.toLowerCase()];
  if (fromCall) return fromCall;
  const fromName = FEATURE_NAME_TO_FEATURE[raw];
  if (fromName) return fromName;
  return fallback;
}

export function featureFromCallType(callType: string | null | undefined): AiFeatureId {
  if (!callType || callType === "unspecified") return "UNATTRIBUTED";
  return CALL_TYPE_TO_FEATURE[callType] ?? CALL_TYPE_TO_FEATURE[callType.toLowerCase()] ?? "UNATTRIBUTED";
}

export function resolveFeatureId(opts: {
  feature?: string | null;
  callType?: string | null;
  featureName?: string | null;
}): AiFeatureId {
  if (opts.feature) return normalizeFeatureId(opts.feature);
  if (opts.callType) {
    const mapped = featureFromCallType(opts.callType);
    if (mapped !== "UNATTRIBUTED") return mapped;
  }
  if (opts.featureName) return normalizeFeatureId(opts.featureName);
  return "UNATTRIBUTED";
}

export type AiUsageContext = {
  feature?: string | null;
  intent?: string | null;
  userId?: string | number | null;
  leagueId?: string | null;
  requestId?: string | null;
  parentRequestId?: string | null;
  retryCount?: number | null;
  generated?: boolean;
  delivered?: boolean;
  displayed?: boolean | null;
  discarded?: boolean;
};

export function aiUsage(
  feature: AiFeatureId,
  extra: Omit<AiUsageContext, "feature"> = {},
): AiUsageContext {
  return { feature, ...extra };
}

export function stringifyUserId(userId: string | number | null | undefined): string | undefined {
  if (userId == null || userId === "") return undefined;
  return String(userId);
}
