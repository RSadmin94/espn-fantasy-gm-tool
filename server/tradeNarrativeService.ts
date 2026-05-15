/**
 * tradeNarrativeService.ts
 * Sprint 2: Emotional Trade Narratives
 *
 * Deterministic label assignment (no LLM) → cached LLM narrative sentence.
 * Labels: Quiet Fleece | Panic Move | Future Sacrificed | Win-Now Desperation |
 *         Calculated Gamble | League-Altering Trade | Mutual Destruction | Phantom Trade
 *
 * All inputs come from the existing TradeRecord shape — no new ESPN API calls.
 */

import { getDb } from "./db";
import { tradeNarratives } from "../drizzle/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ── Label definitions ─────────────────────────────────────────────────────────

export type NarrativeLabel =
  | "Quiet Fleece"
  | "Panic Move"
  | "Future Sacrificed"
  | "Win-Now Desperation"
  | "Calculated Gamble"
  | "League-Altering Trade"
  | "Mutual Destruction"
  | "Phantom Trade";

export interface NarrativeLabelMeta {
  label: NarrativeLabel;
  color: string;       // Tailwind text color class
  bg: string;          // Tailwind bg class
  border: string;      // Tailwind border class
  emoji: string;
}

export const NARRATIVE_META: Record<NarrativeLabel, NarrativeLabelMeta> = {
  "Quiet Fleece":          { label: "Quiet Fleece",          color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/30", emoji: "🤫" },
  "Panic Move":            { label: "Panic Move",            color: "text-red-300",     bg: "bg-red-500/15",     border: "border-red-500/30",     emoji: "😱" },
  "Future Sacrificed":     { label: "Future Sacrificed",     color: "text-orange-300",  bg: "bg-orange-500/15",  border: "border-orange-500/30",  emoji: "⏳" },
  "Win-Now Desperation":   { label: "Win-Now Desperation",   color: "text-yellow-300",  bg: "bg-yellow-500/15",  border: "border-yellow-500/30",  emoji: "🔥" },
  "Calculated Gamble":     { label: "Calculated Gamble",     color: "text-blue-300",    bg: "bg-blue-500/15",    border: "border-blue-500/30",    emoji: "🎯" },
  "League-Altering Trade": { label: "League-Altering Trade", color: "text-purple-300",  bg: "bg-purple-500/15",  border: "border-purple-500/30",  emoji: "⚡" },
  "Mutual Destruction":    { label: "Mutual Destruction",    color: "text-slate-300",   bg: "bg-slate-500/15",   border: "border-slate-500/30",   emoji: "💥" },
  "Phantom Trade":         { label: "Phantom Trade",         color: "text-slate-400",   bg: "bg-slate-700/30",   border: "border-slate-600/30",   emoji: "👻" },
};

// ── TradeRecord input shape (mirrors routers.ts internal type) ────────────────

export interface NarrativeTradeSide {
  teamId: number;
  ownerName: string;
  players: { playerId: number; playerName: string; position: string; avgPoints: number; seasonPoints: number; compositeValue: number }[];
  picks: { label: string; round: number; pickInRound: number; value: number }[];
  totalValue: number;
}

export interface NarrativeTradeInput {
  season: number;
  tradeId: string;
  proposedDate: number;
  sideA: NarrativeTradeSide;
  sideB: NarrativeTradeSide;
  verdict: "sideA" | "sideB" | "even";
  verdictMargin: number;
}

// ── Deterministic label engine ────────────────────────────────────────────────

/**
 * Assigns a narrative label deterministically from trade fields.
 * No LLM needed — pure math on existing TradeRecord data.
 *
 * Priority order (first match wins):
 * 1. Phantom Trade    — both sides have 0 total value (all items unscored)
 * 2. League-Altering  — combined value > 1200 OR 4+ players involved
 * 3. Quiet Fleece     — winner margin > 60% of loser's value AND loser had real value
 * 4. Mutual Destruction — even verdict AND both sides gave up high value (>= 200 each)
 * 5. Future Sacrificed — winner gave picks (future assets) to get players
 * 6. Win-Now Desperation — loser gave picks away AND was losing side
 * 7. Panic Move       — loser's side had only 1 player AND high value disparity
 * 8. Calculated Gamble — default for all other decisive trades
 */
export function assignNarrativeLabel(trade: NarrativeTradeInput): NarrativeLabel {
  const { sideA, sideB, verdict, verdictMargin } = trade;

  const totalPlayers = sideA.players.length + sideB.players.length;
  const totalPicks   = sideA.picks.length + sideB.picks.length;
  const combinedValue = sideA.totalValue + sideB.totalValue;

  // 1. Phantom Trade — nothing scored (all players had 0 stats, e.g. future picks only or off-season)
  if (combinedValue === 0 && totalPicks === 0) return "Phantom Trade";
  if (combinedValue === 0 && totalPlayers === 0) return "Phantom Trade";

  // 2. League-Altering — massive combined value or many players
  if (combinedValue > 1200 || totalPlayers >= 4) return "League-Altering Trade";

  // 3. Quiet Fleece — winner got significantly more value than loser
  if (verdict !== "even") {
    const winnerValue = verdict === "sideA" ? sideA.totalValue : sideB.totalValue;
    const loserValue  = verdict === "sideA" ? sideB.totalValue : sideA.totalValue;
    if (loserValue > 50 && verdictMargin > loserValue * 0.6) return "Quiet Fleece";
  }

  // 4. Mutual Destruction — even trade but both sides gave up significant value
  if (verdict === "even" && sideA.totalValue >= 200 && sideB.totalValue >= 200) {
    return "Mutual Destruction";
  }

  // 5. Future Sacrificed — winning side gave picks to acquire players
  if (verdict !== "even") {
    const winnerSide = verdict === "sideA" ? sideA : sideB;
    const loserSide  = verdict === "sideA" ? sideB : sideA;
    // Winner gave picks (future assets) and received players
    if (winnerSide.picks.length > 0 && loserSide.players.length > 0) {
      return "Future Sacrificed";
    }
  }

  // 6. Win-Now Desperation — losing side gave away picks
  if (verdict !== "even") {
    const loserSide = verdict === "sideA" ? sideB : sideA;
    if (loserSide.picks.length > 0 && loserSide.players.length > 0) {
      return "Win-Now Desperation";
    }
  }

  // 7. Panic Move — losing side had only 1 player and gave up a lot of value
  if (verdict !== "even") {
    const loserSide = verdict === "sideA" ? sideB : sideA;
    if (loserSide.players.length === 1 && verdictMargin > 80) {
      return "Panic Move";
    }
  }

  // 8. Default — all other decisive trades
  return "Calculated Gamble";
}

// ── Desperation score (0–100) ─────────────────────────────────────────────────

/**
 * Measures how "desperate" a side was based on:
 * - Picks given away (future assets) = high desperation
 * - High value given up for low value received = high desperation
 * - Even trade = low desperation
 */
export function computeDesperationScore(side: NarrativeTradeSide, otherSide: NarrativeTradeSide): number {
  let score = 0;
  // Gave away picks (sacrificing future)
  score += side.picks.length * 15;
  // Gave up more value than received
  const valueDiff = side.totalValue - otherSide.totalValue;
  if (valueDiff > 0) score += Math.min(40, Math.floor(valueDiff / 5));
  // Many players given up
  score += Math.min(20, side.players.length * 5);
  return Math.min(100, score);
}

// ── LLM narrative sentence generation ────────────────────────────────────────

export async function generateNarrativeSentence(
  trade: NarrativeTradeInput,
  label: NarrativeLabel
): Promise<string> {
  const winnerName = trade.verdict === "sideA"
    ? trade.sideA.ownerName.split(";")[0].trim()
    : trade.verdict === "sideB"
    ? trade.sideB.ownerName.split(";")[0].trim()
    : null;

  const sideAPlayers = trade.sideA.players.map(p => p.playerName).join(", ") || "(picks only)";
  const sideBPlayers = trade.sideB.players.map(p => p.playerName).join(", ") || "(picks only)";
  const sideAPicks   = trade.sideA.picks.map(p => p.label).join(", ");
  const sideBPicks   = trade.sideB.picks.map(p => p.label).join(", ");

  const sideADesc = [sideAPlayers, sideAPicks].filter(Boolean).join(" + ");
  const sideBDesc = [sideBPlayers, sideBPicks].filter(Boolean).join(" + ");

  const prompt = `You are a fantasy football league historian writing a one-sentence trade narrative for a league's Hall of Records.

Trade details:
- Season: ${trade.season}
- ${trade.sideA.ownerName.split(";")[0].trim()} gave: ${sideADesc} (value: ${trade.sideA.totalValue})
- ${trade.sideB.ownerName.split(";")[0].trim()} gave: ${sideBDesc} (value: ${trade.sideB.totalValue})
- Verdict: ${trade.verdict === "even" ? "Even trade" : `${winnerName} won by ${trade.verdictMargin} value points`}
- Narrative label: "${label}"

Write EXACTLY one sentence (max 25 words) that captures the emotional essence of this trade using the "${label}" narrative. Be specific about the players/picks involved. Use dramatic, punchy language. No fluff.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You write punchy one-sentence fantasy football trade narratives. Always respond with exactly one sentence, no quotes, no period at the end." },
        { role: "user", content: prompt },
      ],
    });
    const text = (response?.choices?.[0]?.message?.content as string || "").trim();
    // Truncate to 200 chars max
    return text.slice(0, 200);
  } catch {
    // Fallback: deterministic sentence
    return buildFallbackSentence(trade, label, winnerName);
  }
}

function buildFallbackSentence(
  trade: NarrativeTradeInput,
  label: NarrativeLabel,
  winnerName: string | null
): string {
  const a = trade.sideA.ownerName.split(";")[0].trim();
  const b = trade.sideB.ownerName.split(";")[0].trim();
  switch (label) {
    case "Quiet Fleece":          return `${winnerName} quietly dismantled ${winnerName === a ? b : a} in the ${trade.season} trade that nobody saw coming`;
    case "Panic Move":            return `${winnerName === a ? b : a} panicked in ${trade.season} and handed ${winnerName} a decisive edge`;
    case "Future Sacrificed":     return `${winnerName} mortgaged the future in ${trade.season}, trading picks for immediate firepower`;
    case "Win-Now Desperation":   return `${winnerName === a ? b : a} went all-in for ${trade.season}, surrendering draft capital for a shot at glory`;
    case "Calculated Gamble":     return `${winnerName} made the right call in ${trade.season}, emerging from a calculated exchange with the edge`;
    case "League-Altering Trade": return `The ${trade.season} blockbuster between ${a} and ${b} reshaped the entire league landscape`;
    case "Mutual Destruction":    return `${a} and ${b} traded blow for blow in ${trade.season} — neither side clearly won`;
    case "Phantom Trade":         return `The ${trade.season} trade between ${a} and ${b} was a ghost — no stats, no verdict, no legacy`;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function getTradeNarrativeFromDb(tradeId: string) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database.select().from(tradeNarratives).where(eq(tradeNarratives.tradeId, tradeId)).limit(1);
  return rows[0] ?? null;
}

export async function getTradeNarrativesFromDb(tradeIds: string[]) {
  if (tradeIds.length === 0) return [];
  const database = await getDb();
  if (!database) return [];
  return database.select().from(tradeNarratives).where(inArray(tradeNarratives.tradeId, tradeIds));
}

export async function getNotoriousTradesFromDb(limit = 10) {
  const database = await getDb();
  if (!database) return [];
  // "Notorious" = League-Altering, Quiet Fleece, Phantom Trade, Mutual Destruction — sorted by verdictMargin desc
  return database
    .select()
    .from(tradeNarratives)
    .where(
      inArray(tradeNarratives.narrativeLabel, [
        "League-Altering Trade",
        "Quiet Fleece",
        "Phantom Trade",
        "Mutual Destruction",
        "Win-Now Desperation",
      ] as string[])
    )
    .orderBy(desc(tradeNarratives.verdictMargin))
    .limit(limit);
}

export async function upsertTradeNarrative(
  trade: NarrativeTradeInput,
  label: NarrativeLabel,
  sentence: string,
  sideADesperation: number,
  sideBDesperation: number
) {
  const database = await getDb();
  if (!database) return;
  await database
    .insert(tradeNarratives)
    .values({
      tradeId: trade.tradeId,
      season: trade.season,
      proposedDate: Math.floor(trade.proposedDate / 1000), // store as unix seconds
      sideAOwner: trade.sideA.ownerName.split(";")[0].trim(),
      sideBOwner: trade.sideB.ownerName.split(";")[0].trim(),
      verdict: trade.verdict,
      verdictMargin: Math.round(trade.verdictMargin),
      narrativeLabel: label,
      narrativeSentence: sentence,
      sideADesperation,
      sideBDesperation,
    })
    .onDuplicateKeyUpdate({
      set: {
        narrativeLabel: label,
        // Only update sentence if it was previously null (preserve cached LLM output)
        updatedAt: new Date(),
      },
    });
}

// ── Main refresh function ─────────────────────────────────────────────────────

/**
 * Processes all trades from the tradeAging procedure output:
 * 1. Assigns deterministic label
 * 2. Generates LLM sentence if not already cached
 * 3. Persists to trade_narratives table
 *
 * Called after the ESPN data refresh pipeline.
 * No new ESPN API calls — reads from existing TradeRecord data.
 */
export async function refreshTradeNarratives(
  trades: NarrativeTradeInput[],
  opts: { generateLLM?: boolean } = {}
): Promise<{ processed: number; newLLM: number; skipped: number }> {
  const { generateLLM = true } = opts;
  let processed = 0;
  let newLLM = 0;
  let skipped = 0;

  // Get existing narratives to avoid re-generating LLM sentences
  const existingMap = new Map<string, { narrativeSentence: string | null; narrativeLabel: string }>();
  const allTradeIds = trades.map(t => t.tradeId);
  const existing = await getTradeNarrativesFromDb(allTradeIds);
  for (const row of existing) {
    existingMap.set(row.tradeId, { narrativeSentence: row.narrativeSentence, narrativeLabel: row.narrativeLabel });
  }

  for (const trade of trades) {
    try {
      const label = assignNarrativeLabel(trade);
      const sideADesperation = computeDesperationScore(trade.sideA, trade.sideB);
      const sideBDesperation = computeDesperationScore(trade.sideB, trade.sideA);

      const cached = existingMap.get(trade.tradeId);
      let sentence: string;

      if (cached?.narrativeSentence) {
        // Already have a cached sentence — use it
        sentence = cached.narrativeSentence;
        skipped++;
      } else if (generateLLM) {
        // Generate new LLM sentence
        sentence = await generateNarrativeSentence(trade, label);
        newLLM++;
      } else {
        // Fallback without LLM
        sentence = buildFallbackSentence(
          trade,
          label,
          trade.verdict === "sideA"
            ? trade.sideA.ownerName.split(";")[0].trim()
            : trade.verdict === "sideB"
            ? trade.sideB.ownerName.split(";")[0].trim()
            : null
        );
      }

      await upsertTradeNarrative(trade, label, sentence, sideADesperation, sideBDesperation);
      processed++;
    } catch (err) {
      console.error(`[tradeNarrative] Failed to process trade ${trade.tradeId}:`, err);
    }
  }

  return { processed, newLLM, skipped };
}
