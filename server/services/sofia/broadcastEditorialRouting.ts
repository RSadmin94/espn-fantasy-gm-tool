/**
 * Editorial director — resolves plans, applies ledger, assigns roles by lead voice.
 * The orchestrator executes; this module produces like a television producer.
 */
import type { BroadcastVoiceDiagnostics } from "./broadcastFrameContract";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import type { EditorialLedger } from "./editorialLedger";
import {
  EDITORIAL_PLANS,
  getEditorialPlan,
  voicesForPlan,
  type EditorialPlan,
  type EditorialPlanId,
  type VoiceId,
} from "./editorialPlans";
import {
  getPersonaAssignmentMetrics,
  resolveRoleFirstLead,
  classifyEventRole,
} from "./personaRoleAssignment";
import { editorialPlanForReach } from "../draftMoments/reachClassification";

export type { VoiceId, EditorialPlanId };

export type EditorialAssignment = {
  planId: EditorialPlanId;
  plan: EditorialPlan;
  silence: boolean;
  silenceReason?: string;
  request: VoiceId[];
  leadVoice: VoiceId;
  leadRotated: boolean;
  callbackSuppressed: boolean;
  /** Dev/verification — role-first assignment reason. */
  assignmentReason?: string;
  rotationOverrideReason?: string;
};

export type RoleAssignment = {
  primary: BroadcastVoiceDiagnostics | null;
  secondary: BroadcastVoiceDiagnostics | null;
  deferred: BroadcastVoiceDiagnostics[];
};

function hasReceipt(moment: BroadcastMoment, id: string, type?: string): boolean {
  return moment.receipts.some((r) => r.id === id && (type == null || r.type === type));
}

function hasSignal(moment: BroadcastMoment, prefix: string, strong = false): boolean {
  return moment.signals.some((s) => s === prefix || s === `${prefix}:strong` || (!strong && s.startsWith(`${prefix}:`)));
}

function hasStrongSignal(moment: BroadcastMoment, prefix: string): boolean {
  return moment.signals.some((s) => s === `${prefix}:strong`);
}

const ROXANNE_DRAMA_RE =
  /\b(rival|rivalry|drama|revenge|feud|receipt|temperature|consequence|upset|championship|dynasty|trade war)\b/i;

const COACH_EVIDENCE_RE =
  /\b(need|starter|roster|lineup|construction|fit|build|depth|hole|slot|flex|bench|positional)\b/i;
const SOFIA_EVIDENCE_RE =
  /\b(ADP|ahead|fell|behind|reach|steal|consensus|tier|board|trend|value|history|record|earliest|latest|zero.?rb|stack|waiting|strategy|specialist|defense|kicker)\b/i;

/**
 * One lead for ordinary value picks.
 * Coach owns reaches/steals/construction; Sofia owns ADP/value/tier analysis.
 * Never Roxanne on ordinary value.
 */
export function resolveValueLeadVoice(moment: BroadcastMoment): { lead: VoiceId; reason: string } {
  const corpus = [
    ...moment.signals,
    ...moment.factPacket.verifiedFacts,
    ...moment.storylines,
    moment.primaryStoryline ?? "",
  ].join(" | ");

  // Role-first: reaches and steals belong to Coach (strategy), not Sofia.
  if (hasSignal(moment, "REACH") || hasSignal(moment, "STEAL")) {
    return { lead: "coach", reason: "reach_or_steal_strategy" };
  }

  const constructionLead =
    hasSignal(moment, "STARTER_NEED") ||
    hasSignal(moment, "HERO_RB") ||
    moment.primaryStoryline === "ROSTER_NEED" ||
    moment.primaryStoryline === "HERO_RB";
  if (constructionLead) return { lead: "coach", reason: "roster_construction_or_need" };

  if (COACH_EVIDENCE_RE.test(corpus)) return { lead: "coach", reason: "roster_construction_or_need" };
  if (SOFIA_EVIDENCE_RE.test(corpus)) return { lead: "sofia", reason: "adp_value_or_trend" };
  return { lead: "sofia", reason: "default_analytical_value" };
}

/**
 * Roxanne stays selective: rivalry/drama evidence, or an outrageous reach (massive + 40+ early).
 * Ordinary mild/big reaches are Coach — Roxanne is not the default analyst.
 */
export function roxanneEligible(moment: BroadcastMoment): boolean {
  if (hasReceipt(moment, "rivalry", "rivalry")) return true;
  if (moment.primaryStoryline && ROXANNE_DRAMA_RE.test(moment.primaryStoryline)) return true;
  if (moment.storylines.some((s) => ROXANNE_DRAMA_RE.test(s))) return true;
  if (moment.factPacket.verifiedFacts.some((f) => ROXANNE_DRAMA_RE.test(f))) return true;
  if (moment.reachClassification?.personaOwner === "roxanne") return true;
  if (hasSignal(moment, "STEAL") && moment.factPacket.verifiedFacts.some((f) => ROXANNE_DRAMA_RE.test(f))) {
    return true;
  }
  return false;
}

/** Classify moment into an editorial plan — explicit rules, not significance passthrough. */
export function resolveEditorialPlanId(moment: BroadcastMoment): EditorialPlanId {
  if (moment.editorialPlanId) return moment.editorialPlanId;

  const ctx = moment.context;
  const mt = moment.momentType;

  if (mt === "documentary" || mt === "historical_feature") return "documentary";
  if (mt === "weekly_recap") return "weekly_story";
  if (mt === "championship") return "championship";
  if (mt === "commissioner_announcement") return "commissioner_news";

  if (ctx.kind === "breaking_news") return "breaking_news";

  if (hasReceipt(moment, "rivalry", "rivalry")) {
    if (ctx.kind === "league_storyline" && /trade/i.test(ctx.title)) return "rivalry_trade";
    if (moment.primaryStoryline === "TRADE" || moment.signals.some((s) => s.startsWith("TRADE"))) {
      return "rivalry_trade";
    }
    return "rivalry_receipt";
  }

  if (hasReceipt(moment, "keeper", "keeper") || moment.primaryStoryline === "KEEPER_SURPRISE") {
    return "keeper_surprise";
  }

  if (hasReceipt(moment, "league_record") || moment.primaryStoryline === "LEAGUE_RECORD") {
    return "league_record";
  }

  if (hasReceipt(moment, "playoff_upset") || moment.primaryStoryline === "PLAYOFF_UPSET") {
    return "playoff_upset";
  }

  if (ctx.kind === "league_storyline") {
    if (/trade/i.test(ctx.title)) return "value_trade";
    if (/season|dynasty/i.test(ctx.body)) return "season_story";
    return "season_story";
  }

  if (ctx.kind === "position_run" || moment.primaryStoryline === "POSITION_RUN") {
    return "position_run";
  }

  if (hasSignal(moment, "CONSEQUENTIAL_RUN") || moment.primaryStoryline === "CONSEQUENTIAL_RUN") {
    return "draft_run";
  }

  // Prefer centralized reach severity → plan mapping when REACH is present.
  const reachPlan = moment.reachClassification
    ? editorialPlanForReach(moment.reachClassification)
    : null;
  if (
    reachPlan &&
    (hasSignal(moment, "REACH") || hasStrongSignal(moment, "REACH"))
  ) {
    return reachPlan;
  }

  if (moment.significance === "historic") {
    if (hasSignal(moment, "REACH") || hasStrongSignal(moment, "REACH")) return "historic_reach";
    if (moment.primaryStoryline === "DYNASTY" || moment.storylines.some((s) => /dynasty/i.test(s))) {
      return "dynasty_moment";
    }
    return "hall_of_fame";
  }

  if (moment.significance === "major") {
    if (hasSignal(moment, "REACH") || hasStrongSignal(moment, "REACH")) return "major_reach";
    return "major_reach";
  }

  if (moment.significance === "notable") {
    if (hasSignal(moment, "STEAL")) return "value_pick";
    if (hasSignal(moment, "REACH")) return "slight_reach";
    return "value_pick";
  }

  return "routine_pick";
}

export function buildEditorialAssignment(
  moment: BroadcastMoment,
  ledger: EditorialLedger,
): EditorialAssignment {
  const planId = resolveEditorialPlanId(moment);
  let basePlan = getEditorialPlan(planId);
  const metrics = getPersonaAssignmentMetrics();

  // Ordinary value picks get a single analytical/strategy lead — never Roxanne.
  if (planId === "value_pick") {
    const { lead } = resolveValueLeadVoice(moment);
    const others = (["sofia", "coach", "roxanne"] as VoiceId[]).filter((v) => v !== lead);
    basePlan = {
      ...basePlan,
      leadVoice: lead,
      optionalVoices: [],
      prohibitedVoices: others,
      maxVoices: 1,
    };
  }

  // Strip optional Roxanne unless grounded eligibility OR she owns the event role.
  const rolePreview = classifyEventRole(moment, planId);
  const roxanneOwnsEvent = rolePreview.primary === "roxanne";
  if (basePlan.optionalVoices.includes("roxanne") && !roxanneEligible(moment) && !roxanneOwnsEvent) {
    basePlan = {
      ...basePlan,
      optionalVoices: basePlan.optionalVoices.filter((v) => v !== "roxanne"),
      prohibitedVoices: basePlan.prohibitedVoices.includes("roxanne")
        ? basePlan.prohibitedVoices
        : [...basePlan.prohibitedVoices, "roxanne"],
    };
  }
  if (basePlan.leadVoice === "roxanne" && !roxanneEligible(moment) && !roxanneOwnsEvent) {
    basePlan = {
      ...basePlan,
      leadVoice: "sofia",
      optionalVoices: basePlan.optionalVoices.filter((v) => v !== "sofia"),
      prohibitedVoices: [...new Set<VoiceId>([...basePlan.prohibitedVoices, "roxanne"])],
    };
  }

  // Role-first once: event → best persona (before ledger silence / soft rotation).
  const snap = ledger.snapshot();
  // Ordinary value: Sofia/Coach only — allow both so conversation memory can rotate.
  const allowedPreview =
    planId === "value_pick"
      ? (["sofia", "coach"] as VoiceId[])
      : voicesForPlan(basePlan).length > 0
        ? voicesForPlan(basePlan)
        : [basePlan.leadVoice];
  const decision = resolveRoleFirstLead({
    moment,
    planId,
    recentLeads: snap.recentLeadVoices,
    allowedVoices: allowedPreview,
  });

  if (decision.category !== "silence" && allowedPreview.includes(decision.lead)) {
    if (planId === "value_pick") {
      const others = (["sofia", "coach", "roxanne"] as VoiceId[]).filter((v) => v !== decision.lead);
      basePlan = {
        ...basePlan,
        leadVoice: decision.lead,
        optionalVoices: [],
        prohibitedVoices: others,
        maxVoices: 1,
      };
    } else if (decision.lead !== basePlan.leadVoice) {
      const prevLead = basePlan.leadVoice;
      basePlan = {
        ...basePlan,
        leadVoice: decision.lead,
        optionalVoices: [
          prevLead,
          ...basePlan.optionalVoices.filter((v) => v !== decision.lead && v !== prevLead),
        ].filter((v) => !basePlan.prohibitedVoices.includes(v)),
      };
    }
  }

  const considered: VoiceId[] = [];
  if (decision.primaryOwner) considered.push(decision.primaryOwner);
  if (decision.secondaryOwner && !considered.includes(decision.secondaryOwner)) {
    considered.push(decision.secondaryOwner);
  }
  if (considered.length === 0) considered.push("sofia", "coach", "roxanne");
  metrics?.recordOpportunity(considered);

  const resolution = ledger.resolveForMoment(basePlan, moment);
  const plan = resolution.plan;

  if (resolution.silenced) {
    metrics?.recordSilence();
    return {
      planId: plan.id,
      plan,
      silence: true,
      silenceReason: resolution.silenceReason,
      request: [],
      leadVoice: plan.leadVoice,
      leadRotated: resolution.leadRotated,
      callbackSuppressed: resolution.callbackSuppressed,
      assignmentReason: "silence",
    };
  }

  // Ledger may soft-rotate after role-first; do not re-apply role-first (would undo ledger).
  let finalDecision = decision;
  let assignmentReason = decision.reason;
  let rotationOverrideReason = decision.rotationOverrideReason;
  if (resolution.leadRotated && plan.leadVoice !== decision.lead) {
    finalDecision = {
      ...decision,
      lead: plan.leadVoice,
      reason: "rotation_secondary_owner",
      rotationOverride: false,
      rotationOverrideReason: undefined,
    };
    assignmentReason = "rotation_secondary_owner";
    rotationOverrideReason = undefined;
  }

  const request = voicesForPlan(plan);
  metrics?.recordAssignment(finalDecision, considered);

  return {
    planId: plan.id,
    plan,
    silence: false,
    request,
    leadVoice: plan.leadVoice,
    leadRotated: resolution.leadRotated || decision.reason === "rotation_secondary_owner",
    callbackSuppressed: resolution.callbackSuppressed,
    assignmentReason,
    rotationOverrideReason,
  };
}

/**
 * Assign roles from editorial plan lead — not fixed Sofia/Coach/Roxanne order.
 */
export function assignEditorialRoles(
  assignment: EditorialAssignment,
  attempts: readonly BroadcastVoiceDiagnostics[],
): RoleAssignment {
  const accepted = attempts.filter((v) => v.accepted);
  const byVoice = new Map(accepted.map((v) => [v.voice as VoiceId, v]));

  const slotOrder: VoiceId[] = [
    assignment.leadVoice,
    ...assignment.plan.optionalVoices.filter((v) => v !== assignment.leadVoice),
  ];

  const onAir: BroadcastVoiceDiagnostics[] = [];
  for (const id of slotOrder) {
    if (onAir.length >= assignment.plan.maxVoices) break;
    if (assignment.plan.prohibitedVoices.includes(id)) continue;
    const hit = byVoice.get(id);
    if (hit) onAir.push(hit);
  }

  return {
    primary: onAir[0] ?? null,
    secondary: onAir[1] ?? null,
    deferred: onAir.slice(2),
  };
}

/** @deprecated Use resolveEditorialPlanId — kept for transitional imports. */
export function significanceFromMoment(level: BroadcastMoment["significance"]): BroadcastMoment["significance"] {
  return level;
}

/** @deprecated Use buildEditorialAssignment */
export function planEditorialAssignment(): never {
  throw new Error("planEditorialAssignment removed — use buildEditorialAssignment(moment, ledger)");
}

/** @deprecated Use assignEditorialRoles */
export function assignVoiceRoles(): never {
  throw new Error("assignVoiceRoles removed — use assignEditorialRoles");
}

export function listEditorialPlanIds(): EditorialPlanId[] {
  return Object.keys(EDITORIAL_PLANS) as EditorialPlanId[];
}
