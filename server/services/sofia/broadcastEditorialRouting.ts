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

const ROXANNE_DRAMA_RE =
  /\b(rival|rivalry|drama|revenge|feud|receipt|temperature|consequence|upset|championship|dynasty|trade war)\b/i;

const COACH_EVIDENCE_RE =
  /\b(need|starter|roster|lineup|construction|fit|build|depth|hole|slot|flex|bench|positional)\b/i;
const SOFIA_EVIDENCE_RE =
  /\b(ADP|ahead|fell|behind|reach|steal|consensus|tier|board|trend|value|history|record|earliest|latest|zero.?rb|stack|waiting|strategy|specialist|defense|kicker)\b/i;

/**
 * One lead for ordinary value picks: Coach = construction/need; Sofia = ADP/value/reach/steal/strategy.
 * Never Roxanne on ordinary value. Restores Sofia as the regular analytical lead.
 */
export function resolveValueLeadVoice(moment: BroadcastMoment): { lead: VoiceId; reason: string } {
  const corpus = [
    ...moment.signals,
    ...moment.factPacket.verifiedFacts,
    ...moment.storylines,
    moment.primaryStoryline ?? "",
  ].join(" | ");

  const constructionLead =
    hasSignal(moment, "STARTER_NEED") ||
    hasSignal(moment, "HERO_RB") ||
    moment.primaryStoryline === "ROSTER_NEED" ||
    moment.primaryStoryline === "HERO_RB";
  if (constructionLead) return { lead: "coach", reason: "roster_construction_or_need" };

  if (hasSignal(moment, "STEAL") || hasSignal(moment, "REACH") || SOFIA_EVIDENCE_RE.test(corpus)) {
    return { lead: "sofia", reason: "adp_value_reach_or_steal" };
  }
  if (COACH_EVIDENCE_RE.test(corpus)) return { lead: "coach", reason: "roster_construction_or_need" };
  return { lead: "sofia", reason: "default_analytical_value" };
}

/**
 * Roxanne stays selective: rivalry/drama evidence, a historic reach, or a steal with drama.
 * Ordinary notable/major value picks are Sofia/Coach — Roxanne no longer rides along on every reach/steal.
 */
export function roxanneEligible(moment: BroadcastMoment): boolean {
  if (hasReceipt(moment, "rivalry", "rivalry")) return true;
  if (moment.primaryStoryline && ROXANNE_DRAMA_RE.test(moment.primaryStoryline)) return true;
  if (moment.storylines.some((s) => ROXANNE_DRAMA_RE.test(s))) return true;
  if (moment.factPacket.verifiedFacts.some((f) => ROXANNE_DRAMA_RE.test(f))) return true;
  if (hasSignal(moment, "REACH") && moment.significance === "historic") return true;
  if (hasStrongSignal(moment, "REACH") && moment.significance === "historic") return true;
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

  if (moment.significance === "historic") {
    if (hasSignal(moment, "REACH") || hasStrongSignal(moment, "REACH")) return "historic_reach";
    if (moment.primaryStoryline === "DYNASTY" || moment.storylines.some((s) => /dynasty/i.test(s))) {
      return "dynasty_moment";
    }
    return "hall_of_fame";
  }

  if (moment.significance === "major") {
    // Any major REACH is major_reach (Roxanne eligible). Slight_reach is notable-only.
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

  // Ordinary value picks get a single analytical lead (Sofia by default, Coach on
  // construction/need) — never Roxanne. This restores Sofia's regular airtime and
  // stops Roxanne riding along on every notable value pick.
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

  // Strip optional Roxanne unless grounded eligibility exists.
  if (basePlan.optionalVoices.includes("roxanne") && !roxanneEligible(moment)) {
    basePlan = {
      ...basePlan,
      optionalVoices: basePlan.optionalVoices.filter((v) => v !== "roxanne"),
      prohibitedVoices: basePlan.prohibitedVoices.includes("roxanne")
        ? basePlan.prohibitedVoices
        : [...basePlan.prohibitedVoices, "roxanne"],
    };
  }
  if (basePlan.leadVoice === "roxanne" && !roxanneEligible(moment)) {
    basePlan = {
      ...basePlan,
      leadVoice: "sofia",
      optionalVoices: basePlan.optionalVoices.filter((v) => v !== "sofia"),
      prohibitedVoices: [...new Set<VoiceId>([...basePlan.prohibitedVoices, "roxanne"])],
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
