/**
 * Provider-neutral model pricing catalog.
 *
 * Prices are USD per 1M tokens. Rows are effective-dated so historical events
 * keep the rate that applied when they were recorded — callers must persist
 * `calculatedCost` at write time and never reprice old rows in place.
 *
 * Sources: public list prices as of the `effectiveFrom` date. Unknown models
 * are not guessed; calculateAiCost returns unpriced rather than a silent fallback.
 */

export type AiProviderId =
  | "OPENAI"
  | "ANTHROPIC"
  | "GEMINI"
  | "DEEPSEEK"
  | "QWEN"
  | "KOKORO"
  | "OTHER"
  | "UNKNOWN";

export type ModelPriceRow = {
  provider: AiProviderId;
  /** Exact model id or prefix (longest prefix wins). */
  model: string;
  /** Inclusive UTC date the rate takes effect (YYYY-MM-DD). */
  effectiveFrom: string;
  /** USD per 1M uncached input tokens. */
  inputPerMillion: number;
  /** USD per 1M cached / cache-read input tokens. 0 if unused. */
  cachedInputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
};

/**
 * Ordered catalog. Matching uses (provider, longest model prefix, latest
 * effectiveFrom <= timestamp). Keep newer rates below older ones for the same model.
 */
export const AI_PRICING_CATALOG: readonly ModelPriceRow[] = [
  // OpenAI
  { provider: "OPENAI", model: "gpt-4o-mini", effectiveFrom: "2024-07-18", inputPerMillion: 0.15, cachedInputPerMillion: 0.075, outputPerMillion: 0.60 },
  { provider: "OPENAI", model: "gpt-4o", effectiveFrom: "2024-08-06", inputPerMillion: 2.50, cachedInputPerMillion: 1.25, outputPerMillion: 10.00 },
  { provider: "OPENAI", model: "gpt-4.1-mini", effectiveFrom: "2025-04-14", inputPerMillion: 0.40, cachedInputPerMillion: 0.10, outputPerMillion: 1.60 },
  { provider: "OPENAI", model: "gpt-4.1", effectiveFrom: "2025-04-14", inputPerMillion: 2.00, cachedInputPerMillion: 0.50, outputPerMillion: 8.00 },
  { provider: "OPENAI", model: "o4-mini", effectiveFrom: "2025-04-16", inputPerMillion: 1.10, cachedInputPerMillion: 0.275, outputPerMillion: 4.40 },

  // Anthropic
  { provider: "ANTHROPIC", model: "claude-3-haiku", effectiveFrom: "2024-03-13", inputPerMillion: 0.25, cachedInputPerMillion: 0.03, outputPerMillion: 1.25 },
  { provider: "ANTHROPIC", model: "claude-3-5-haiku", effectiveFrom: "2024-10-22", inputPerMillion: 0.80, cachedInputPerMillion: 0.08, outputPerMillion: 4.00 },
  { provider: "ANTHROPIC", model: "claude-3-5-sonnet", effectiveFrom: "2024-06-20", inputPerMillion: 3.00, cachedInputPerMillion: 0.30, outputPerMillion: 15.00 },
  { provider: "ANTHROPIC", model: "claude-sonnet-4", effectiveFrom: "2025-05-14", inputPerMillion: 3.00, cachedInputPerMillion: 0.30, outputPerMillion: 15.00 },
  { provider: "ANTHROPIC", model: "claude-opus-4", effectiveFrom: "2025-05-14", inputPerMillion: 15.00, cachedInputPerMillion: 1.50, outputPerMillion: 75.00 },
  { provider: "ANTHROPIC", model: "claude-3-opus", effectiveFrom: "2024-03-04", inputPerMillion: 15.00, cachedInputPerMillion: 1.50, outputPerMillion: 75.00 },

  // Google Gemini
  { provider: "GEMINI", model: "gemini-1.5-flash", effectiveFrom: "2024-05-14", inputPerMillion: 0.075, cachedInputPerMillion: 0.01875, outputPerMillion: 0.30 },
  { provider: "GEMINI", model: "gemini-2.0-flash", effectiveFrom: "2024-12-11", inputPerMillion: 0.10, cachedInputPerMillion: 0.025, outputPerMillion: 0.40 },
  { provider: "GEMINI", model: "gemini-2.5-flash", effectiveFrom: "2025-05-01", inputPerMillion: 0.15, cachedInputPerMillion: 0.0375, outputPerMillion: 0.60 },
  { provider: "GEMINI", model: "gemini-2.5-pro", effectiveFrom: "2025-05-01", inputPerMillion: 1.25, cachedInputPerMillion: 0.315, outputPerMillion: 10.00 },

  // DeepSeek
  { provider: "DEEPSEEK", model: "deepseek-chat", effectiveFrom: "2025-08-21", inputPerMillion: 0.28, cachedInputPerMillion: 0.028, outputPerMillion: 0.42 },
  { provider: "DEEPSEEK", model: "deepseek-v4-flash", effectiveFrom: "2026-01-01", inputPerMillion: 0.14, cachedInputPerMillion: 0.014, outputPerMillion: 0.28 },
  { provider: "DEEPSEEK", model: "deepseek-reasoner", effectiveFrom: "2025-08-21", inputPerMillion: 0.28, cachedInputPerMillion: 0.028, outputPerMillion: 0.42 },

  // Qwen (DashScope)
  { provider: "QWEN", model: "qwen-plus", effectiveFrom: "2025-01-01", inputPerMillion: 0.40, cachedInputPerMillion: 0.10, outputPerMillion: 1.20 },
  { provider: "QWEN", model: "qwen-turbo", effectiveFrom: "2025-01-01", inputPerMillion: 0.05, cachedInputPerMillion: 0.02, outputPerMillion: 0.20 },
];

const PROVIDER_ALIASES: Record<string, AiProviderId> = {
  openai: "OPENAI",
  anthropic: "ANTHROPIC",
  gemini: "GEMINI",
  google: "GEMINI",
  deepseek: "DEEPSEEK",
  qwen: "QWEN",
  kokoro: "KOKORO",
  other: "OTHER",
  unknown: "UNKNOWN",
};

export function normalizeProvider(value: string | null | undefined): AiProviderId {
  if (!value || !value.trim()) return "UNKNOWN";
  const key = value.trim();
  const upper = key.toUpperCase() as AiProviderId;
  if (
    upper === "OPENAI" ||
    upper === "ANTHROPIC" ||
    upper === "GEMINI" ||
    upper === "DEEPSEEK" ||
    upper === "QWEN" ||
    upper === "KOKORO" ||
    upper === "OTHER" ||
    upper === "UNKNOWN"
  ) {
    return upper;
  }
  return PROVIDER_ALIASES[key.toLowerCase()] ?? "OTHER";
}

export function inferProviderFromModel(model: string | null | undefined): AiProviderId {
  if (!model) return "UNKNOWN";
  const m = model.toLowerCase();
  if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "OPENAI";
  if (m.startsWith("claude")) return "ANTHROPIC";
  if (m.startsWith("gemini")) return "GEMINI";
  if (m.startsWith("deepseek")) return "DEEPSEEK";
  if (m.startsWith("qwen")) return "QWEN";
  if (m.startsWith("kokoro")) return "KOKORO";
  return "UNKNOWN";
}

function toUtcDateString(timestamp: Date | string | number): string {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  return d.toISOString().slice(0, 10);
}

export function lookupModelPrice(opts: {
  provider: string | null | undefined;
  model: string | null | undefined;
  timestamp?: Date | string | number;
}): ModelPriceRow | null {
  const model = (opts.model ?? "").trim();
  if (!model) return null;
  const provider = normalizeProvider(opts.provider) === "UNKNOWN"
    ? inferProviderFromModel(model)
    : normalizeProvider(opts.provider);
  const onDate = toUtcDateString(opts.timestamp ?? new Date());
  const modelLower = model.toLowerCase();

  let best: ModelPriceRow | null = null;
  let bestPrefixLen = -1;
  let bestFrom = "";

  for (const row of AI_PRICING_CATALOG) {
    if (row.provider !== provider) continue;
    const prefix = row.model.toLowerCase();
    if (!modelLower.startsWith(prefix)) continue;
    if (row.effectiveFrom > onDate) continue;
    const betterPrefix = prefix.length > bestPrefixLen;
    const samePrefixNewer = prefix.length === bestPrefixLen && row.effectiveFrom >= bestFrom;
    if (betterPrefix || samePrefixNewer) {
      best = row;
      bestPrefixLen = prefix.length;
      bestFrom = row.effectiveFrom;
    }
  }
  return best;
}
