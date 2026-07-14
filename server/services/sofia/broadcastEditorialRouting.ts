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

  if (moment.significance === "historic") {
    if (hasSignal(moment, "REACH") || hasStrongSignal(moment, "REACH")) return "historic_reach";
    if (moment.primaryStoryline === "DYNASTY" || moment.storylines.some((s) => /dynasty/i.test(s))) {
      return "dynasty_moment";
    }
    return "hall_of_fame";
  }

  if (moment.significance === "major") {
    if (hasStrongSignal(moment, "REACH")) return "major_reach";
    if (hasSignal(moment, "REACH")) return "slight_reach";
    return "major_reach";
  }

  if (moment.significance === "notable") {
    if (hasSignal(moment, "STEAL")) return "value_pick";
    if (hasSignal(moment, "REACH")) return "slight_reach";
    // Early written floor + receipt-first notables — Sofia lead (ledger rotates streaks).
    if (hasSignal(moment, "EARLY_ROUND_FLOOR") || moment.signals.length === 0) {
      return "written_notable";
    }
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

  // Spread early written leads so Sofia / Coach / Roxanne each appear naturally.
  if (planId === "written_notable" && moment.identity.kind === "draft_pick") {
    const rotation: VoiceId[] = ["sofia", "coach", "roxanne"];
    const lead = rotation[moment.identity.pickNumber % 3]!;
    basePlan = {
      ...basePlan,
      leadVoice: lead,
      optionalVoices: rotation.filter((v) => v !== lead),
    };
  }

  const resolution = ledger.resolveForMoment(basePlan, moment);
  const plan = resolution.plan;

  if (resolution.silenced) {
    return {
      planId: plan.id,
      plan,
      silence: true,
      silenceReason: resolution.silenceReason,
      request: [],
      leadVoice: plan.leadVoice,
      leadRotated: resolution.leadRotated,
      callbackSuppressed: resolution.callbackSuppressed,
    };
  }

  return {
    planId: plan.id,
    plan,
    silence: false,
    request: voicesForPlan(plan),
    leadVoice: plan.leadVoice,
    leadRotated: resolution.leadRotated,
    callbackSuppressed: resolution.callbackSuppressed,
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
