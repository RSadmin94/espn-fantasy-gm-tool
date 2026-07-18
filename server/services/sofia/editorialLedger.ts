/**
 * Session editorial ledger — ephemeral producer memory for one broadcast.
 * Not conversation memory; not persisted. Injectable and deterministic.
 */
import type { BroadcastMoment } from "./broadcastMomentTypes";
import type { EditorialEnergyLevel, EditorialPlan, VoiceId } from "./editorialPlans";
import { hasSubstantiveRivalryEvidence } from "./personaRoleAssignment";

export type EditorialLedgerSnapshot = {
  momentIndex: number;
  recentLeadVoices: readonly VoiceId[];
  recentVoiceUsage: readonly VoiceId[];
  activeStorylines: readonly string[];
  decompressionRemaining: number;
  energyLevel: EditorialEnergyLevel;
  callbackHistorySize: number;
};

export type LedgerFrameRecord = {
  planId: string;
  leadVoice: VoiceId | null;
  voicesOnAir: readonly VoiceId[];
  silenced: boolean;
  significance: BroadcastMoment["significance"];
  storylines: readonly string[];
  callbackKeys: readonly string[];
  acceptedTexts: Readonly<Partial<Record<VoiceId, string | null>>>;
  planEnergy: EditorialEnergyLevel;
  decompressionTriggered: boolean;
  decompressionWindow?: number;
};

export type EditorialPlanResolution = {
  plan: EditorialPlan;
  silenced: boolean;
  silenceReason?: string;
  leadRotated: boolean;
  callbackSuppressed: boolean;
};

export interface EditorialLedger {
  snapshot(): EditorialLedgerSnapshot;
  resolveForMoment(basePlan: EditorialPlan, moment: BroadcastMoment): EditorialPlanResolution;
  recordFrame(record: LedgerFrameRecord): void;
  reset(): void;
}

const MAX_LEAD_HISTORY = 8;
const MAX_VOICE_HISTORY = 24;
const MAX_CATCHPHRASE_HISTORY = 6;
const CALLBACK_COOLDOWN_PICKS = 4;
/** Soft preference: any persona ≤2 consecutive leads before preferring an optional alt. */
const PERSONA_LEAD_STREAK_LIMIT = 2;

const ROXANNE_CATCHPHRASE_PATTERNS = [
  /\bdid\s+.+\s+just\b/i,
  /\bbookmark\s+this\b/i,
  /\bscreenshot\s+this\b/i,
];

function normalizeCatchphrase(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

function extractCatchphrases(text: string): string[] {
  const normalized = normalizeCatchphrase(text);
  const hits = ROXANNE_CATCHPHRASE_PATTERNS.filter((p) => p.test(text)).map(() => normalized);
  return hits.length > 0 ? hits : [normalized.slice(0, 40)];
}

function consecutiveLeadStreak(leads: readonly VoiceId[], voice: VoiceId): number {
  let n = 0;
  for (let i = leads.length - 1; i >= 0; i--) {
    if (leads[i] === voice) n++;
    else break;
  }
  return n;
}

export class SessionEditorialLedger implements EditorialLedger {
  private momentIndex = 0;
  private recentLeadVoices: VoiceId[] = [];
  private recentVoiceUsage: VoiceId[] = [];
  private catchphraseHistory = new Map<VoiceId, string[]>();
  private referencedFacts = new Map<string, number>();
  private callbackHistory = new Map<string, number>();
  private activeStorylines: string[] = [];
  private decompressionRemaining = 0;
  private energyLevel: EditorialEnergyLevel = "low";

  snapshot(): EditorialLedgerSnapshot {
    return {
      momentIndex: this.momentIndex,
      recentLeadVoices: [...this.recentLeadVoices],
      recentVoiceUsage: [...this.recentVoiceUsage],
      activeStorylines: [...this.activeStorylines],
      decompressionRemaining: this.decompressionRemaining,
      energyLevel: this.energyLevel,
      callbackHistorySize: this.callbackHistory.size,
    };
  }

  resolveForMoment(basePlan: EditorialPlan, moment: BroadcastMoment): EditorialPlanResolution {
    let plan = basePlan;
    let leadRotated = false;
    let callbackSuppressed = false;

    if (this.shouldSuppressForDecompression(plan, moment)) {
      return {
        plan,
        silenced: true,
        silenceReason: "decompression — booth reset after exceptional moment",
        leadRotated: false,
        callbackSuppressed: false,
      };
    }

    // Soft rotation: any lead voice that dominated the short window yields to an optional alt
    // unless this is a historic/major extraordinary plan with no safe alt.
    const leadStreak = consecutiveLeadStreak(this.recentLeadVoices, plan.leadVoice);
    if (leadStreak >= PERSONA_LEAD_STREAK_LIMIT) {
      const historic =
        moment.significance === "historic" ||
        moment.momentType === "championship" ||
        hasSubstantiveRivalryEvidence(moment);
      if (!historic) {
        const alt = plan.optionalVoices.find(
          (v) => v !== plan.leadVoice && !plan.prohibitedVoices.includes(v),
        );
        if (alt) {
          plan = {
            ...plan,
            leadVoice: alt,
            optionalVoices: [plan.leadVoice, ...plan.optionalVoices.filter((v) => v !== alt)],
          };
          leadRotated = true;
        }
      }
    }

    const roxanneHistory = this.catchphraseHistory.get("roxanne") ?? [];
    if (plan.leadVoice === "roxanne" && roxanneHistory.length >= 2) {
      const last = roxanneHistory[roxanneHistory.length - 1]!;
      const prev = roxanneHistory[roxanneHistory.length - 2]!;
      if (last === prev) {
        const alt = plan.optionalVoices.find((v) => v !== "roxanne" && !plan.prohibitedVoices.includes(v));
        if (alt) {
          plan = {
            ...plan,
            leadVoice: alt,
            optionalVoices: ["roxanne", ...plan.optionalVoices.filter((v) => v !== alt && v !== "roxanne")],
          };
          leadRotated = true;
        }
      }
    }

    const keys = moment.callbackKeys ?? [];
    if (plan.callbackEligible && keys.length > 0 && this.shouldSuppressCallback(keys)) {
      callbackSuppressed = true;
      plan = {
        ...plan,
        optionalVoices: plan.optionalVoices.filter((v) => v !== plan.leadVoice),
        maxVoices: Math.min(plan.maxVoices, 1),
        callbackEligible: false,
      };
    }

    if (!moment.commentaryBudget.enabled || (plan.maxVoices === 0 && plan.silenceEligible)) {
      return {
        plan,
        silenced: true,
        silenceReason: "commentary budget or routine silence plan",
        leadRotated,
        callbackSuppressed,
      };
    }

    return { plan, silenced: false, leadRotated, callbackSuppressed };
  }

  shouldSuppressForDecompression(plan: EditorialPlan, moment: BroadcastMoment): boolean {
    if (moment.overrideDecompression) return false;
    if (this.decompressionRemaining <= 0) return false;
    if (!plan.silenceEligible) return false;
    if (moment.significance === "major" || moment.significance === "historic") return false;
    return true;
  }

  shouldSuppressCallback(keys: readonly string[]): boolean {
    for (const key of keys) {
      const last = this.callbackHistory.get(key);
      if (last != null && this.momentIndex - last < CALLBACK_COOLDOWN_PICKS) return true;
    }
    return false;
  }

  recordFrame(record: LedgerFrameRecord): void {
    this.momentIndex++;

    if (!record.silenced && record.leadVoice) {
      this.recentLeadVoices.push(record.leadVoice);
      if (this.recentLeadVoices.length > MAX_LEAD_HISTORY) {
        this.recentLeadVoices.shift();
      }
    }

    for (const v of record.voicesOnAir) {
      this.recentVoiceUsage.push(v);
    }
    while (this.recentVoiceUsage.length > MAX_VOICE_HISTORY) {
      this.recentVoiceUsage.shift();
    }

    for (const [voice, text] of Object.entries(record.acceptedTexts) as [VoiceId, string | null][]) {
      if (!text) continue;
      const phrases = extractCatchphrases(text);
      const hist = this.catchphraseHistory.get(voice) ?? [];
      hist.push(...phrases);
      while (hist.length > MAX_CATCHPHRASE_HISTORY) hist.shift();
      this.catchphraseHistory.set(voice, hist);

      for (const fact of record.storylines) {
        this.referencedFacts.set(`${voice}:${fact}`, this.momentIndex);
      }
    }

    for (const key of record.callbackKeys) {
      this.callbackHistory.set(key, this.momentIndex);
    }

    for (const s of record.storylines) {
      if (!this.activeStorylines.includes(s)) this.activeStorylines.push(s);
    }
    if (this.activeStorylines.length > 12) {
      this.activeStorylines = this.activeStorylines.slice(-12);
    }

    this.energyLevel = record.planEnergy;

    if (record.decompressionTriggered && !record.silenced) {
      const window = record.decompressionWindow ?? 0;
      if (window > 0) this.decompressionRemaining = window;
    } else if (this.decompressionRemaining > 0 && record.silenced) {
      this.decompressionRemaining = Math.max(0, this.decompressionRemaining - 1);
    } else if (this.decompressionRemaining > 0 && !record.silenced) {
      this.decompressionRemaining = Math.max(0, this.decompressionRemaining - 1);
    }
  }

  reset(): void {
    this.momentIndex = 0;
    this.recentLeadVoices = [];
    this.recentVoiceUsage = [];
    this.catchphraseHistory.clear();
    this.referencedFacts.clear();
    this.callbackHistory.clear();
    this.activeStorylines = [];
    this.decompressionRemaining = 0;
    this.energyLevel = "low";
  }
}

export function createEditorialLedger(): EditorialLedger {
  return new SessionEditorialLedger();
}
