import { inferProviderFromModel, lookupModelPrice, normalizeProvider } from "./aiPricingCatalog";

export type CalculateAiCostInput = {
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  timestamp?: Date | string | number;
};

export type CalculateAiCostResult = {
  calculatedCost: number;
  priced: boolean;
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  rate?: {
    inputPerMillion: number;
    cachedInputPerMillion: number;
    outputPerMillion: number;
    effectiveFrom: string;
  };
};

function nonNegInt(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * Central cost calculator. Persist the returned `calculatedCost` on the usage
 * event — do not re-run this against historical rows when catalog rates change.
 */
export function calculateAiCost(input: CalculateAiCostInput): CalculateAiCostResult {
  const model = (input.model ?? "").trim() || "UNKNOWN";
  const provider = input.provider
    ? normalizeProvider(input.provider)
    : inferProviderFromModel(model);
  const inputTokens = nonNegInt(input.inputTokens);
  const outputTokens = nonNegInt(input.outputTokens);
  let cachedInputTokens = nonNegInt(input.cachedInputTokens);
  if (cachedInputTokens > inputTokens) cachedInputTokens = inputTokens;

  const row = lookupModelPrice({
    provider,
    model,
    timestamp: input.timestamp,
  });

  if (!row) {
    return {
      calculatedCost: 0,
      priced: false,
      provider,
      model,
      inputTokens,
      cachedInputTokens,
      outputTokens,
    };
  }

  const uncachedInput = Math.max(0, inputTokens - cachedInputTokens);
  const calculatedCost =
    (uncachedInput * row.inputPerMillion) / 1_000_000 +
    (cachedInputTokens * row.cachedInputPerMillion) / 1_000_000 +
    (outputTokens * row.outputPerMillion) / 1_000_000;

  return {
    calculatedCost,
    priced: true,
    provider,
    model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    rate: {
      inputPerMillion: row.inputPerMillion,
      cachedInputPerMillion: row.cachedInputPerMillion,
      outputPerMillion: row.outputPerMillion,
      effectiveFrom: row.effectiveFrom,
    },
  };
}
