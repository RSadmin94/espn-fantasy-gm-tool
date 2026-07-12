/**
 * Editorial plans — explicit broadcast situations from the Broadcast Direction Bible.
 * Plans define booth composition and producer behavior; they are not inferred from significance alone.
 */
export type VoiceId = "sofia" | "coach" | "roxanne";

export type EditorialPlanId =
  | "routine_pick"
  | "value_pick"
  | "slight_reach"
  | "major_reach"
  | "historic_reach"
  | "position_run"
  | "draft_run"
  | "keeper_surprise"
  | "rivalry_trade"
  | "value_trade"
  | "breaking_news"
  | "league_record"
  | "playoff_upset"
  | "championship"
  | "dynasty_moment"
  | "commissioner_news"
  | "rivalry_receipt"
  | "hall_of_fame"
  | "season_story"
  | "weekly_story"
  | "documentary";

export type DecompressionBehavior = "none" | "trigger" | "inherit";

export type EditorialEnergyLevel = "low" | "medium" | "high" | "peak";

export type EditorialPlan = {
  readonly id: EditorialPlanId;
  readonly leadVoice: VoiceId;
  readonly optionalVoices: readonly VoiceId[];
  readonly prohibitedVoices: readonly VoiceId[];
  readonly maxVoices: number;
  readonly silenceEligible: boolean;
  readonly decompressionBehavior: DecompressionBehavior;
  /** Picks to hold silence after a trigger plan (routine/notable only). */
  readonly decompressionWindowPicks: number;
  readonly callbackEligible: boolean;
  readonly energyLevel: EditorialEnergyLevel;
};

const ALL_VOICES: readonly VoiceId[] = ["sofia", "coach", "roxanne"];

function plan(
  id: EditorialPlanId,
  lead: VoiceId,
  optional: readonly VoiceId[],
  prohibited: readonly VoiceId[],
  maxVoices: number,
  opts: Partial<Pick<EditorialPlan, "silenceEligible" | "decompressionBehavior" | "decompressionWindowPicks" | "callbackEligible" | "energyLevel">> = {},
): EditorialPlan {
  return {
    id,
    leadVoice: lead,
    optionalVoices: optional,
    prohibitedVoices: prohibited,
    maxVoices,
    silenceEligible: opts.silenceEligible ?? false,
    decompressionBehavior: opts.decompressionBehavior ?? "none",
    decompressionWindowPicks: opts.decompressionWindowPicks ?? 0,
    callbackEligible: opts.callbackEligible ?? false,
    energyLevel: opts.energyLevel ?? "medium",
  };
}

/** Frozen plan registry — television producer defaults. */
export const EDITORIAL_PLANS: Record<EditorialPlanId, EditorialPlan> = {
  routine_pick: plan("routine_pick", "coach", [], ALL_VOICES, 0, {
    silenceEligible: true,
    energyLevel: "low",
  }),

  value_pick: plan("value_pick", "coach", [], ["sofia", "roxanne"], 1, {
    energyLevel: "medium",
    callbackEligible: true,
  }),

  slight_reach: plan("slight_reach", "coach", ["sofia"], ["roxanne"], 2, {
    energyLevel: "medium",
    callbackEligible: true,
  }),

  major_reach: plan("major_reach", "sofia", ["coach"], ["roxanne"], 2, {
    energyLevel: "high",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 1,
    callbackEligible: true,
  }),

  historic_reach: plan("historic_reach", "sofia", ["coach", "roxanne"], [], 3, {
    energyLevel: "peak",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 2,
    callbackEligible: true,
  }),

  position_run: plan("position_run", "coach", ["sofia"], ["roxanne"], 2, {
    energyLevel: "medium",
    callbackEligible: true,
  }),

  draft_run: plan("draft_run", "coach", ["roxanne"], ["sofia"], 2, {
    energyLevel: "high",
    callbackEligible: true,
  }),

  keeper_surprise: plan("keeper_surprise", "sofia", ["coach", "roxanne"], [], 3, {
    energyLevel: "high",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 1,
    callbackEligible: true,
  }),

  rivalry_trade: plan("rivalry_trade", "roxanne", ["coach", "sofia"], [], 3, {
    energyLevel: "peak",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 2,
    callbackEligible: true,
  }),

  value_trade: plan("value_trade", "coach", ["sofia"], ["roxanne"], 2, {
    energyLevel: "medium",
    callbackEligible: true,
  }),

  breaking_news: plan("breaking_news", "sofia", ["coach", "roxanne"], [], 3, {
    energyLevel: "peak",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 2,
    callbackEligible: true,
  }),

  league_record: plan("league_record", "sofia", ["coach"], ["roxanne"], 2, {
    energyLevel: "peak",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 2,
    callbackEligible: true,
  }),

  playoff_upset: plan("playoff_upset", "roxanne", ["coach", "sofia"], [], 3, {
    energyLevel: "high",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 1,
    callbackEligible: true,
  }),

  championship: plan("championship", "sofia", ["coach", "roxanne"], [], 3, {
    energyLevel: "peak",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 3,
    callbackEligible: true,
  }),

  dynasty_moment: plan("dynasty_moment", "sofia", ["coach"], ["roxanne"], 2, {
    energyLevel: "peak",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 2,
    callbackEligible: true,
  }),

  commissioner_news: plan("commissioner_news", "sofia", ["coach"], ["roxanne"], 2, {
    energyLevel: "high",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 1,
    callbackEligible: true,
  }),

  rivalry_receipt: plan("rivalry_receipt", "roxanne", ["coach", "sofia"], [], 3, {
    energyLevel: "high",
    callbackEligible: true,
  }),

  hall_of_fame: plan("hall_of_fame", "sofia", ["coach", "roxanne"], [], 3, {
    energyLevel: "peak",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 2,
    callbackEligible: true,
  }),

  season_story: plan("season_story", "coach", ["sofia"], ["roxanne"], 2, {
    energyLevel: "medium",
    callbackEligible: true,
  }),

  weekly_story: plan("weekly_story", "coach", ["sofia"], ["roxanne"], 2, {
    energyLevel: "medium",
    silenceEligible: true,
    callbackEligible: true,
  }),

  documentary: plan("documentary", "sofia", ["coach"], ["roxanne"], 2, {
    energyLevel: "high",
    decompressionBehavior: "trigger",
    decompressionWindowPicks: 1,
    callbackEligible: true,
  }),
};

export function getEditorialPlan(id: EditorialPlanId): EditorialPlan {
  return EDITORIAL_PLANS[id];
}

export function voicesForPlan(p: EditorialPlan): VoiceId[] {
  const ordered = [p.leadVoice, ...p.optionalVoices.filter((v) => v !== p.leadVoice)];
  const allowed = ordered.filter((v) => !p.prohibitedVoices.includes(v));
  return allowed.slice(0, p.maxVoices);
}
