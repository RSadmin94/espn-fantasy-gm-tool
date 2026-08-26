/**
 * In-memory ring of recent AI usage traces for local/dev verification.
 * Never exposed as a public endpoint — adminProcedure only.
 */

export type AiUsageTrace = {
  at: string;
  requestId: string;
  parentRequestId: string | null;
  retryCount: number;
  userId: string | null;
  leagueId: string | null;
  feature: string;
  intent: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  calculatedCost: number;
  priced: boolean;
  status: "SUCCESS" | "ERROR";
  latencyMs: number;
  errorCode: string | null;
};

const MAX_TRACES = 50;
const traces: AiUsageTrace[] = [];

export function recordAiUsageTrace(trace: AiUsageTrace): void {
  traces.unshift(trace);
  if (traces.length > MAX_TRACES) traces.length = MAX_TRACES;
}

export function getRecentAiUsageTraces(limit = 20): AiUsageTrace[] {
  return traces.slice(0, Math.max(1, Math.min(limit, MAX_TRACES)));
}

export function findAiUsageTrace(requestId: string): AiUsageTrace | undefined {
  return traces.find((t) => t.requestId === requestId);
}

/** Test helper. */
export function clearAiUsageTraces(): void {
  traces.length = 0;
}
