/**
 * Beat Reporter Signal Extractor
 *
 * Uses the built-in LLM to convert raw NFL news items into structured
 * PlayerNewsSignal objects. Processes items in batches to avoid prompt overflow.
 */

import { invokeLLM } from "./_core/llm";
import type { RawNewsItem } from "./beatReporterService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedSignal {
  playerName: string;
  espnPlayerId?: number;
  nflTeam?: string;
  position?: string;
  signalType:
    | "role_up"
    | "role_down"
    | "injury_risk"
    | "workload_risk"
    | "hidden_opportunity"
    | "depth_chart_change"
    | "coach_trust_up"
    | "coach_trust_down"
    | "return_from_injury"
    | "neutral";
  magnitude: number; // 0.0 – 1.0
  projectionImpactPct: number; // -25 to +25
  summary: string;
  confidence: number; // 0 – 100
  headline?: string;
  articleDescription?: string;
  sourceType?: string;
  publishedAt?: Date;
}

// ─── Batch size ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 15; // items per LLM call

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert fantasy football analyst. Your job is to read NFL news items and extract structured signals about individual players that are relevant for weekly fantasy football projections.

For each news item, determine:
1. The primary player affected (if any — skip team/league news with no specific player impact)
2. The signal type:
   - "role_up": player's role, snap share, or target share is increasing
   - "role_down": player's role, snap share, or target share is decreasing
   - "injury_risk": player has an injury that may limit availability or performance
   - "workload_risk": player faces increased workload risk (fatigue, overuse, backup competition)
   - "hidden_opportunity": player has an underrated opportunity (backup becoming starter, target vacuum, etc.)
   - "depth_chart_change": player's depth chart position changed (promotion or demotion)
   - "coach_trust_up": coach has publicly expressed increased trust/usage plans for player
   - "coach_trust_down": coach has expressed reduced trust or limited role for player
   - "return_from_injury": player is returning from injury and reclaiming role
   - "neutral": news exists but has no clear fantasy impact
3. Magnitude: 0.0 (very weak signal) to 1.0 (very strong signal)
4. Projection impact: percentage change to apply to weekly fantasy projection (-25 to +25)
   - Strong positive signals (starter returning, role_up, hidden_opportunity): +5 to +20
   - Strong negative signals (injury, role_down, depth_chart_change downward): -5 to -20
   - Neutral or weak signals: -3 to +3
5. A one-sentence summary of the signal
6. Confidence: 0-100 (how confident you are in this signal extraction)

Return ONLY a JSON array. Skip items that are not player-specific or have no fantasy relevance.`;

// ─── Main extractor ───────────────────────────────────────────────────────────

export async function extractSignalsFromNewsItems(
  items: RawNewsItem[]
): Promise<ExtractedSignal[]> {
  if (items.length === 0) return [];

  const allSignals: ExtractedSignal[] = [];

  // Process in batches
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchSignals = await extractBatch(batch);
    allSignals.push(...batchSignals);
  }

  return allSignals;
}

async function extractBatch(items: RawNewsItem[]): Promise<ExtractedSignal[]> {
  const newsBlock = items
    .map((item, idx) => {
      const parts = [
        `[${idx + 1}] Player: ${item.playerName || "Unknown"}`,
        `Headline: ${item.headline}`,
        item.description ? `Details: ${item.description.slice(0, 300)}` : "",
        item.nflTeam ? `Team: ${item.nflTeam}` : "",
        item.position ? `Position: ${item.position}` : "",
        item.sourceType ? `Source: ${item.sourceType}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return parts;
    })
    .join("\n\n---\n\n");

  const userPrompt = `Extract fantasy football signals from these ${items.length} NFL news items. Return a JSON array where each element has: playerName, signalType, magnitude, projectionImpactPct, summary, confidence. Skip items with no player-specific fantasy impact.

NEWS ITEMS:
${newsBlock}

Return ONLY a valid JSON array, no markdown, no explanation.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "beat_reporter_signals",
          strict: true,
          schema: {
            type: "object",
            properties: {
              signals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    playerName: { type: "string" },
                    signalType: {
                      type: "string",
                      enum: [
                        "role_up",
                        "role_down",
                        "injury_risk",
                        "workload_risk",
                        "hidden_opportunity",
                        "depth_chart_change",
                        "coach_trust_up",
                        "coach_trust_down",
                        "return_from_injury",
                        "neutral",
                      ],
                    },
                    magnitude: { type: "number" },
                    projectionImpactPct: { type: "number" },
                    summary: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: [
                    "playerName",
                    "signalType",
                    "magnitude",
                    "projectionImpactPct",
                    "summary",
                    "confidence",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["signals"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    if (!rawContent) return [];
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

    const parsed = JSON.parse(content) as { signals: any[] };
    const rawSignals = parsed.signals ?? [];

    // Merge back metadata from original items
    return rawSignals
      .map((s: any) => {
        // Try to find the matching original item by player name
        const original = items.find(
          (item) =>
            item.playerName &&
            s.playerName &&
            item.playerName.toLowerCase().includes(s.playerName.toLowerCase().split(" ")[0])
        );

        return {
          playerName: s.playerName as string,
          espnPlayerId: original?.espnPlayerId,
          nflTeam: original?.nflTeam,
          position: original?.position,
          signalType: s.signalType as ExtractedSignal["signalType"],
          magnitude: Math.min(1, Math.max(0, Number(s.magnitude) || 0)),
          projectionImpactPct: Math.min(
            25,
            Math.max(-25, Number(s.projectionImpactPct) || 0)
          ),
          summary: String(s.summary || ""),
          confidence: Math.min(100, Math.max(0, Number(s.confidence) || 70)),
          headline: original?.headline,
          articleDescription: original?.description,
          sourceType: original?.sourceType,
          publishedAt: original?.publishedAt,
        } satisfies ExtractedSignal;
      })
      .filter((s) => s.playerName && s.signalType !== "neutral");
  } catch {
    return [];
  }
}

// ─── Pure helper: compute Monte Carlo adjustment from signals ─────────────────

/**
 * Given a list of signals for a player, compute the net projection adjustment
 * to apply in Monte Carlo simulation.
 * Returns a multiplier: 1.0 = no change, 1.15 = +15%, 0.85 = -15%
 */
export function computeBeatReporterAdjustment(
  signals: Array<{ projectionImpactPct: number; confidence: number; magnitude: number }>
): number {
  if (signals.length === 0) return 1.0;

  // Weighted average by confidence × magnitude
  let totalWeight = 0;
  let weightedImpact = 0;

  for (const s of signals) {
    const weight = (s.confidence / 100) * s.magnitude;
    weightedImpact += s.projectionImpactPct * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 1.0;

  const avgImpactPct = weightedImpact / totalWeight;
  // Cap at ±20% total adjustment
  const cappedPct = Math.min(20, Math.max(-20, avgImpactPct));
  return 1 + cappedPct / 100;
}

/**
 * Summarize signals for a player into a human-readable string for LLM prompt injection.
 */
export function formatSignalsForPrompt(
  playerName: string,
  signals: Array<{
    signalType: string;
    summary: string;
    projectionImpactPct: number;
    confidence: number;
  }>
): string {
  if (signals.length === 0) return "";
  const lines = signals.map(
    (s) =>
      `  • [${s.signalType.toUpperCase()}] ${s.summary} (impact: ${s.projectionImpactPct > 0 ? "+" : ""}${s.projectionImpactPct}%, confidence: ${s.confidence}%)`
  );
  return `Beat Reporter Signals for ${playerName}:\n${lines.join("\n")}`;
}
