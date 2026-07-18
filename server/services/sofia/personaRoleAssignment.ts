/**
 * Phase 3 — role-first persona assignment (who speaks), not what they say.
 * Does not change prompts, generation, TTS, timing, or draft logic.
 */
import type { BroadcastMoment } from "./broadcastMomentTypes";
import type { EditorialPlanId, VoiceId } from "./editorialPlans";

/** Short window for consecutive-appearance soft limit. */
export const PERSONA_SHORT_WINDOW = 2;

/** Soft consecutive-lead cap before preferring a secondary owner. */
export const PERSONA_MAX_CONSECUTIVE_LEADS = 2;

export type EventRoleCategory =
  | "silence"
  | "strategy" // Coach
  | "analysis" // Sofia
  | "entertainment" // Roxanne
  | "mixed_analysis_strategy";

export type AssignmentReasonCode =
  | "role_coach_reach"
  | "role_coach_steal"
  | "role_coach_construction"
  | "role_coach_positional_run"
  | "role_coach_strategy_plan"
  | "role_sofia_value"
  | "role_sofia_analysis_plan"
  | "role_sofia_default"
  | "role_roxanne_rivalry"
  | "role_roxanne_entertainment_plan"
  | "role_roxanne_historic_override"
  | "rotation_secondary_owner"
  | "rotation_override_historic"
  | "plan_default_lead"
  | "silence";

export type PersonaAssignmentDecision = {
  lead: VoiceId;
  category: EventRoleCategory;
  reason: AssignmentReasonCode;
  rotationOverride: boolean;
  rotationOverrideReason?: string;
  primaryOwner: VoiceId | null;
  secondaryOwner: VoiceId | null;
};

export type PersonaMetricBucket = {
  opportunities: number;
  assigned: number;
  skipped: number;
};

export type PersonaAssignmentMetricsSnapshot = {
  sofia: PersonaMetricBucket;
  coach: PersonaMetricBucket;
  roxanne: PersonaMetricBucket;
  consecutiveAppearances: Partial<Record<VoiceId, number>>;
  recentLeads: readonly VoiceId[];
  lastReason: AssignmentReasonCode | null;
  lastRotationOverrideReason: string | null;
  decisions: readonly {
    lead: VoiceId;
    reason: AssignmentReasonCode;
    category: EventRoleCategory;
    rotationOverride: boolean;
  }[];
};

function emptyBucket(): PersonaMetricBucket {
  return { opportunities: 0, assigned: 0, skipped: 0 };
}

/** Dev-only in-memory metrics — not exposed in production UI. */
export class PersonaAssignmentMetrics {
  sofia = emptyBucket();
  coach = emptyBucket();
  roxanne = emptyBucket();
  consecutiveAppearances: Partial<Record<VoiceId, number>> = {};
  recentLeads: VoiceId[] = [];
  lastReason: AssignmentReasonCode | null = null;
  lastRotationOverrideReason: string | null = null;
  decisions: PersonaAssignmentMetricsSnapshot["decisions"][number][] = [];

  private bucket(v: VoiceId): PersonaMetricBucket {
    return v === "sofia" ? this.sofia : v === "coach" ? this.coach : this.roxanne;
  }

  recordOpportunity(voices: readonly VoiceId[]): void {
    for (const v of voices) this.bucket(v).opportunities += 1;
  }

  recordAssignment(decision: PersonaAssignmentDecision, considered: readonly VoiceId[]): void {
    this.lastReason = decision.reason;
    this.lastRotationOverrideReason = decision.rotationOverrideReason ?? null;
    this.decisions.push({
      lead: decision.lead,
      reason: decision.reason,
      category: decision.category,
      rotationOverride: decision.rotationOverride,
    });
    for (const v of considered) {
      if (v === decision.lead) this.bucket(v).assigned += 1;
      else this.bucket(v).skipped += 1;
    }
    const prev = this.recentLeads[this.recentLeads.length - 1];
    if (prev === decision.lead) {
      this.consecutiveAppearances[decision.lead] =
        (this.consecutiveAppearances[decision.lead] ?? 1) + 1;
    } else {
      this.consecutiveAppearances[decision.lead] = 1;
    }
    this.recentLeads.push(decision.lead);
    if (this.recentLeads.length > 48) this.recentLeads.shift();
  }

  recordSilence(): void {
    this.lastReason = "silence";
    this.decisions.push({
      lead: "sofia",
      reason: "silence",
      category: "silence",
      rotationOverride: false,
    });
  }

  snapshot(): PersonaAssignmentMetricsSnapshot {
    return {
      sofia: { ...this.sofia },
      coach: { ...this.coach },
      roxanne: { ...this.roxanne },
      consecutiveAppearances: { ...this.consecutiveAppearances },
      recentLeads: [...this.recentLeads],
      lastReason: this.lastReason,
      lastRotationOverrideReason: this.lastRotationOverrideReason,
      decisions: [...this.decisions],
    };
  }

  reset(): void {
    this.sofia = emptyBucket();
    this.coach = emptyBucket();
    this.roxanne = emptyBucket();
    this.consecutiveAppearances = {};
    this.recentLeads = [];
    this.lastReason = null;
    this.lastRotationOverrideReason = null;
    this.decisions = [];
  }
}

/** Process-local metrics sink for verification (tests / seeded drafts). */
let _metrics: PersonaAssignmentMetrics | null = null;

export function enablePersonaAssignmentMetrics(metrics?: PersonaAssignmentMetrics): PersonaAssignmentMetrics {
  _metrics = metrics ?? new PersonaAssignmentMetrics();
  return _metrics;
}

export function getPersonaAssignmentMetrics(): PersonaAssignmentMetrics | null {
  return _metrics;
}

export function disablePersonaAssignmentMetrics(): void {
  _metrics = null;
}

function hasSignal(moment: BroadcastMoment, prefix: string): boolean {
  return moment.signals.some(
    (s) => s === prefix || s === `${prefix}:strong` || s.startsWith(`${prefix}:`),
  );
}

function hasReceipt(moment: BroadcastMoment, id: string, type?: string): boolean {
  return moment.receipts.some((r) => r.id === id && (type == null || r.type === type));
}

/**
 * Map moment + plan → role category (event owns the analyst).
 */
export function classifyEventRole(
  moment: BroadcastMoment,
  planId: EditorialPlanId,
): { category: EventRoleCategory; primary: VoiceId | null; reason: AssignmentReasonCode } {
  if (planId === "routine_pick") {
    return { category: "silence", primary: null, reason: "silence" };
  }

  // Entertainment first when rivalry / championship drama is grounded.
  if (
    planId === "rivalry_receipt" ||
    planId === "rivalry_trade" ||
    planId === "playoff_upset" ||
    hasReceipt(moment, "rivalry", "rivalry")
  ) {
    return { category: "entertainment", primary: "roxanne", reason: "role_roxanne_rivalry" };
  }

  if (
    planId === "championship" ||
    planId === "hall_of_fame" ||
    planId === "dynasty_moment"
  ) {
    return { category: "entertainment", primary: "roxanne", reason: "role_roxanne_entertainment_plan" };
  }

  // Strategy — Coach owns ordinary reaches; Roxanne only when classifier marks outrageous (40+ massive).
  if (hasSignal(moment, "REACH") || planId === "slight_reach" || planId === "major_reach" || planId === "historic_reach") {
    if (moment.reachClassification?.personaOwner === "roxanne") {
      return { category: "entertainment", primary: "roxanne", reason: "role_roxanne_historic_override" };
    }
    return { category: "strategy", primary: "coach", reason: "role_coach_reach" };
  }
  if (hasSignal(moment, "STEAL")) {
    return { category: "strategy", primary: "coach", reason: "role_coach_steal" };
  }
  if (
    planId === "position_run" ||
    planId === "draft_run" ||
    moment.context.kind === "position_run" ||
    moment.primaryStoryline === "POSITION_RUN" ||
    hasSignal(moment, "CONSEQUENTIAL_RUN")
  ) {
    return { category: "strategy", primary: "coach", reason: "role_coach_positional_run" };
  }
  if (
    hasSignal(moment, "STARTER_NEED") ||
    hasSignal(moment, "HERO_RB") ||
    moment.primaryStoryline === "ROSTER_NEED" ||
    moment.primaryStoryline === "HERO_RB" ||
    planId === "value_trade" ||
    planId === "season_story" ||
    planId === "weekly_story" ||
    planId === "keeper_surprise"
  ) {
    return { category: "strategy", primary: "coach", reason: "role_coach_construction" };
  }

  // Analysis — Sofia
  if (
    planId === "value_pick" ||
    planId === "breaking_news" ||
    planId === "league_record" ||
    planId === "commissioner_news" ||
    planId === "documentary" ||
    planId === "draft_wrap_up"
  ) {
    return { category: "analysis", primary: "sofia", reason: "role_sofia_value" };
  }

  return { category: "analysis", primary: "sofia", reason: "role_sofia_default" };
}

export function secondaryOwnerFor(primary: VoiceId, category: EventRoleCategory): VoiceId | null {
  if (category === "strategy") return primary === "coach" ? "sofia" : "coach";
  if (category === "analysis") return primary === "sofia" ? "coach" : "sofia";
  if (category === "entertainment") return "sofia";
  return null;
}

export function isHistoricOrExtraordinary(moment: BroadcastMoment): boolean {
  return (
    moment.significance === "historic" ||
    moment.momentType === "championship" ||
    hasReceipt(moment, "rivalry", "rivalry")
  );
}

/**
 * Soft conversation memory: if primary already led the last N speaking turns,
 * prefer secondary unless historic/extraordinary override.
 */
export function applyConversationMemory(input: {
  primary: VoiceId;
  secondary: VoiceId | null;
  recentLeads: readonly VoiceId[];
  moment: BroadcastMoment;
  window?: number;
  maxConsecutive?: number;
}): {
  lead: VoiceId;
  rotationOverride: boolean;
  rotationOverrideReason?: string;
  reasonSuffix?: AssignmentReasonCode;
} {
  const window = input.window ?? PERSONA_SHORT_WINDOW;
  const maxConsecutive = input.maxConsecutive ?? PERSONA_MAX_CONSECUTIVE_LEADS;
  const recent = input.recentLeads.slice(-window);
  const dominated =
    recent.length >= maxConsecutive && recent.every((v) => v === input.primary);

  if (!dominated) {
    return { lead: input.primary, rotationOverride: false };
  }

  if (isHistoricOrExtraordinary(input.moment)) {
    return {
      lead: input.primary,
      rotationOverride: true,
      rotationOverrideReason: "historic_or_extraordinary_moment",
      reasonSuffix: "rotation_override_historic",
    };
  }

  if (input.secondary && input.secondary !== input.primary) {
    return {
      lead: input.secondary,
      rotationOverride: false,
      rotationOverrideReason: undefined,
      reasonSuffix: "rotation_secondary_owner",
    };
  }

  return { lead: input.primary, rotationOverride: false };
}

/**
 * Role-first lead resolution for a speaking moment.
 */
export function resolveRoleFirstLead(input: {
  moment: BroadcastMoment;
  planId: EditorialPlanId;
  recentLeads: readonly VoiceId[];
  allowedVoices: readonly VoiceId[];
}): PersonaAssignmentDecision {
  const role = classifyEventRole(input.moment, input.planId);
  if (role.category === "silence" || role.primary == null) {
    return {
      lead: "sofia",
      category: "silence",
      reason: "silence",
      rotationOverride: false,
      primaryOwner: null,
      secondaryOwner: null,
    };
  }

  let primary = role.primary;
  let reason = role.reason;
  const secondary = secondaryOwnerFor(primary, role.category);

  // Historic reach: Coach still owns the reach; Roxanne may override lead only when
  // she is allowed and the moment is extraordinary entertainment.
  if (
    input.planId === "historic_reach" &&
    input.allowedVoices.includes("roxanne") &&
    isHistoricOrExtraordinary(input.moment) &&
    hasSignal(input.moment, "REACH")
  ) {
    // Keep coach as primary owner of the reach; optional Roxanne is plan-driven.
    // Lead stays coach unless rivalry evidence already set entertainment above.
  }

  if (!input.allowedVoices.includes(primary)) {
    const fallback =
      (secondary && input.allowedVoices.includes(secondary) ? secondary : null) ??
      input.allowedVoices[0] ??
      primary;
    primary = fallback;
    reason = primary === "sofia" ? "role_sofia_default" : reason;
  }

  const mem = applyConversationMemory({
    primary,
    secondary:
      secondary && input.allowedVoices.includes(secondary) ? secondary : input.allowedVoices.find((v) => v !== primary) ?? null,
    recentLeads: input.recentLeads,
    moment: input.moment,
  });

  let finalReason: AssignmentReasonCode = reason;
  if (mem.reasonSuffix === "rotation_secondary_owner") finalReason = "rotation_secondary_owner";
  if (mem.reasonSuffix === "rotation_override_historic") finalReason = "rotation_override_historic";

  return {
    lead: mem.lead,
    category: role.category,
    reason: finalReason,
    rotationOverride: mem.rotationOverride,
    rotationOverrideReason: mem.rotationOverrideReason,
    primaryOwner: role.primary,
    secondaryOwner: secondary,
  };
}
