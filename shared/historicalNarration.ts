/**
 * RFSN-053H — Narration prompt + output contract.
 * LLM receives ONLY the Story Package. No ESPN. No new stats.
 */
import {
  NARRATION_PROMPT_VERSION,
  NARRATION_VOICES,
  isNarrationVoice,
  storyPackageHashInput,
  type HistoricalStoryPackage,
  type NarrationVoice,
} from "./historicalStoryPackage";

export const NARRATION_EXPORT_ERROR = "Unable to generate narration.";

export type HistoricalNarration = {
  headline: string;
  subheadline: string;
  intro: string;
  story: string;
  closing: string;
  quote?: string | null;
  voice: NarrationVoice;
};

export const NARRATION_VOICE_PROFILES: Record<
  NarrationVoice,
  { id: NarrationVoice; label: string; style: string }
> = {
  sofia: {
    id: "sofia",
    label: "Sofia",
    style: "Professional fantasy analyst. Precise, calm, evidence-first. No slang.",
  },
  coach: {
    id: "coach",
    label: "Coach",
    style: "Old-school football coach. Direct, gruff, short sentences. Still only the supplied facts.",
  },
  roxanne: {
    id: "roxanne",
    label: "Roxanne",
    style: "Trash talk. Sharp, competitive, needling. Never invent extra losses or fake records.",
  },
  cashier: {
    id: "cashier",
    label: "Cashier",
    style: "Receipt collector. Scoreboard clerk energy. Recite the printed numbers like a receipt.",
  },
  historian: {
    id: "historian",
    label: "Historian",
    style: "NFL Films documentary narrator. Gravitas and atmosphere. No invented years or dynasties.",
  },
};

export function inferNarrationVoice(message: string): NarrationVoice {
  const t = String(message ?? "").toLowerCase();
  if (/\broxanne\b|\btrash talk\b|\btrash-talk\b/.test(t)) return "roxanne";
  if (/\bcoach\b|\bold[-\s]?school\b/.test(t)) return "coach";
  if (/\bcashier\b|\breceipt\b/.test(t)) return "cashier";
  if (/\bhistorian\b|\bdocumentary\b|\bnfl films\b/.test(t)) return "historian";
  if (/\bsofia\b|\banalyst\b|\bprofessional\b/.test(t)) return "sofia";
  return "sofia";
}

export function buildNarrationPrompt(
  pkg: HistoricalStoryPackage,
  voice: NarrationVoice,
): { system: string; user: string; promptVersion: string } {
  const profile = NARRATION_VOICE_PROFILES[voice];
  const system = [
    "You are Fantasy Football Rivals historical narration.",
    `Voice: ${profile.label}. ${profile.style}`,
    "You receive a HistoricalStoryPackage of already-verified league facts.",
    "You NEVER query ESPN. You NEVER compute statistics. You NEVER change facts.",
    "Never invent statistics, years, records, owners, scores, playoff rounds, or rivalries.",
    "Only describe supplied facts. If a detail is missing, omit it.",
    "Every number and named owner in your output must appear in FACTS_JSON.",
    "Voice changes style only. Facts stay identical.",
    "Return JSON only with keys: headline, subheadline, intro, story, closing, quote.",
    `promptVersion=${NARRATION_PROMPT_VERSION}`,
  ].join("\n");
  const user = `FACTS_JSON:\n${JSON.stringify(storyPackageHashInput(pkg))}\n\nWrite the ${profile.label} narration now.`;
  return { system, user, promptVersion: NARRATION_PROMPT_VERSION };
}

export function parseHistoricalNarration(raw: unknown, voice: NarrationVoice): HistoricalNarration | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      value = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const headline = typeof o.headline === "string" ? o.headline.trim() : "";
  const subheadline = typeof o.subheadline === "string" ? o.subheadline.trim() : "";
  const intro = typeof o.intro === "string" ? o.intro.trim() : "";
  const story = typeof o.story === "string" ? o.story.trim() : "";
  const closing = typeof o.closing === "string" ? o.closing.trim() : "";
  if (!headline || !intro || !story || !closing) return null;
  const quote = typeof o.quote === "string" && o.quote.trim() ? o.quote.trim() : null;
  const parsedVoice = typeof o.voice === "string" && isNarrationVoice(o.voice) ? o.voice : voice;
  return {
    headline,
    subheadline,
    intro,
    story,
    closing,
    quote,
    voice: parsedVoice,
  };
}

export function formatNarrationMessage(n: HistoricalNarration): string {
  const parts = [`${n.headline}`, n.subheadline, n.intro, n.story, n.closing];
  if (n.quote) parts.push(`“${n.quote}”`);
  return parts.filter(Boolean).join("\n\n");
}

export function narrationCorpus(n: HistoricalNarration): string {
  return [n.headline, n.subheadline, n.intro, n.story, n.closing, n.quote ?? ""].join("\n");
}

export { NARRATION_VOICES };
