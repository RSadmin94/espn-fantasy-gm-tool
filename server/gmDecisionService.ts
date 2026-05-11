/**
 * GM Decision Memory Service
 *
 * Tracks every decision Rod makes across all tools (Start/Sit, Trade Analyzer,
 * Waiver Wire, Trade Offer Generator) with outcomes, patterns, and retrospective
 * LLM analysis.
 */
import { eq, desc, and, sql, gte, lte, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import {
  gmDecisions,
  gmDecisionTags,
  type GmDecision,
  type InsertGmDecision,
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogDecisionInput {
  toolSource: InsertGmDecision["toolSource"];
  decisionType: InsertGmDecision["decisionType"];
  description: string;
  recommendation?: string;
  followedRecommendation?: boolean;
  accepted: boolean;
  playersInvolved?: string[];
  counterparty?: string;
  aiContext?: string;
  season: number;
  weekNum?: number;
  tags?: string[];
}

export interface ResolveOutcomeInput {
  decisionId: number;
  outcome: "correct" | "incorrect" | "neutral";
  outcomeScore?: number; // -100 to +100
  outcomeNotes?: string;
}

export interface DecisionAccuracyStats {
  total: number;
  resolved: number;
  pending: number;
  correct: number;
  incorrect: number;
  neutral: number;
  accuracyPct: number;          // correct / (correct + incorrect) * 100
  followedRecommendationPct: number;
  followedAndCorrectPct: number;
  ignoredAndCorrectPct: number; // ignored recommendation but outcome was correct
  avgOutcomeScore: number;
  byTool: Record<string, { total: number; correct: number; incorrect: number; accuracyPct: number }>;
  byDecisionType: Record<string, { total: number; correct: number; incorrect: number; accuracyPct: number }>;
}

export interface DecisionPattern {
  pattern: string;
  frequency: number;
  successRate: number;
  description: string;
}

// ─── Log a Decision ───────────────────────────────────────────────────────────

export async function logDecision(input: LogDecisionInput): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [result] = await db.insert(gmDecisions).values({
    toolSource: input.toolSource,
    decisionType: input.decisionType,
    description: input.description,
    recommendation: input.recommendation,
    followedRecommendation: input.followedRecommendation,
    accepted: input.accepted,
    playersInvolved: input.playersInvolved ? JSON.stringify(input.playersInvolved) : null,
    counterparty: input.counterparty,
    aiContext: input.aiContext,
    season: input.season,
    weekNum: input.weekNum,
    outcome: "pending",
  });

  const decisionId = (result as any).insertId as number;

  // Insert tags
  if (input.tags && input.tags.length > 0) {
    await db.insert(gmDecisionTags).values(
      input.tags.map((tag) => ({ decisionId, tag: tag.toLowerCase().trim() }))
    );
  }

  return decisionId;
}

// ─── Resolve Outcome ─────────────────────────────────────────────────────────

export async function resolveOutcome(input: ResolveOutcomeInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(gmDecisions)
    .set({
      outcome: input.outcome,
      outcomeScore: input.outcomeScore,
      outcomeNotes: input.outcomeNotes,
      resolvedAt: new Date(),
    })
    .where(eq(gmDecisions.id, input.decisionId));
}

// ─── Get Decision Feed ────────────────────────────────────────────────────────

export async function getDecisionFeed(options: {
  season?: number;
  toolSource?: string;
  outcome?: string;
  limit?: number;
  offset?: number;
}): Promise<GmDecision[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (options.season) conditions.push(eq(gmDecisions.season, options.season));
  if (options.toolSource) conditions.push(eq(gmDecisions.toolSource, options.toolSource as any));
  if (options.outcome) conditions.push(eq(gmDecisions.outcome, options.outcome as any));

  const rows = await db
    .select()
    .from(gmDecisions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(gmDecisions.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);

  return rows;
}

// ─── Get Accuracy Stats ───────────────────────────────────────────────────────

export async function getAccuracyStats(season?: number): Promise<DecisionAccuracyStats> {
  const db = await getDb();
  if (!db) return emptyStats();

  const conditions = season ? [eq(gmDecisions.season, season)] : [];
  const rows = await db
    .select()
    .from(gmDecisions)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return computeAccuracyStats(rows);
}

export function computeAccuracyStats(rows: GmDecision[]): DecisionAccuracyStats {
  const total = rows.length;
  const resolved = rows.filter((r) => r.outcome !== "pending").length;
  const pending = total - resolved;
  const correct = rows.filter((r) => r.outcome === "correct").length;
  const incorrect = rows.filter((r) => r.outcome === "incorrect").length;
  const neutral = rows.filter((r) => r.outcome === "neutral").length;

  const accuracyPct = correct + incorrect > 0
    ? Math.round((correct / (correct + incorrect)) * 100)
    : 0;

  const followed = rows.filter((r) => r.followedRecommendation === true);
  const followedAndCorrect = followed.filter((r) => r.outcome === "correct").length;
  const followedAndCorrectPct = followed.length > 0
    ? Math.round((followedAndCorrect / followed.length) * 100)
    : 0;
  const followedRecommendationPct = total > 0
    ? Math.round((followed.length / total) * 100)
    : 0;

  const ignored = rows.filter((r) => r.followedRecommendation === false);
  const ignoredAndCorrect = ignored.filter((r) => r.outcome === "correct").length;
  const ignoredAndCorrectPct = ignored.length > 0
    ? Math.round((ignoredAndCorrect / ignored.length) * 100)
    : 0;

  const scoredRows = rows.filter((r) => r.outcomeScore !== null && r.outcomeScore !== undefined);
  const avgOutcomeScore = scoredRows.length > 0
    ? Math.round(scoredRows.reduce((sum, r) => sum + (r.outcomeScore ?? 0), 0) / scoredRows.length)
    : 0;

  // By tool
  const byTool: DecisionAccuracyStats["byTool"] = {};
  for (const row of rows) {
    const key = row.toolSource;
    if (!byTool[key]) byTool[key] = { total: 0, correct: 0, incorrect: 0, accuracyPct: 0 };
    byTool[key].total++;
    if (row.outcome === "correct") byTool[key].correct++;
    if (row.outcome === "incorrect") byTool[key].incorrect++;
  }
  for (const key of Object.keys(byTool)) {
    const b = byTool[key];
    b.accuracyPct = b.correct + b.incorrect > 0
      ? Math.round((b.correct / (b.correct + b.incorrect)) * 100)
      : 0;
  }

  // By decision type
  const byDecisionType: DecisionAccuracyStats["byDecisionType"] = {};
  for (const row of rows) {
    const key = row.decisionType;
    if (!byDecisionType[key]) byDecisionType[key] = { total: 0, correct: 0, incorrect: 0, accuracyPct: 0 };
    byDecisionType[key].total++;
    if (row.outcome === "correct") byDecisionType[key].correct++;
    if (row.outcome === "incorrect") byDecisionType[key].incorrect++;
  }
  for (const key of Object.keys(byDecisionType)) {
    const b = byDecisionType[key];
    b.accuracyPct = b.correct + b.incorrect > 0
      ? Math.round((b.correct / (b.correct + b.incorrect)) * 100)
      : 0;
  }

  return {
    total,
    resolved,
    pending,
    correct,
    incorrect,
    neutral,
    accuracyPct,
    followedRecommendationPct,
    followedAndCorrectPct,
    ignoredAndCorrectPct,
    avgOutcomeScore,
    byTool,
    byDecisionType,
  };
}

function emptyStats(): DecisionAccuracyStats {
  return {
    total: 0, resolved: 0, pending: 0, correct: 0, incorrect: 0, neutral: 0,
    accuracyPct: 0, followedRecommendationPct: 0, followedAndCorrectPct: 0,
    ignoredAndCorrectPct: 0, avgOutcomeScore: 0, byTool: {}, byDecisionType: {},
  };
}

// ─── Get Pattern Analysis ─────────────────────────────────────────────────────

export async function getPatternAnalysis(season?: number): Promise<DecisionPattern[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = season ? [eq(gmDecisions.season, season)] : [];
  const rows = await db
    .select()
    .from(gmDecisions)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return computePatterns(rows);
}

export function computePatterns(rows: GmDecision[]): DecisionPattern[] {
  const patterns: DecisionPattern[] = [];

  // Pattern 1: Following AI recommendations
  const followed = rows.filter((r) => r.followedRecommendation === true && r.outcome !== "pending");
  if (followed.length >= 3) {
    const correct = followed.filter((r) => r.outcome === "correct").length;
    patterns.push({
      pattern: "Followed AI Recommendation",
      frequency: followed.length,
      successRate: Math.round((correct / followed.length) * 100),
      description: `${followed.length} decisions where Rod followed the AI. ${correct} correct outcomes.`,
    });
  }

  // Pattern 2: Ignoring AI recommendations
  const ignored = rows.filter((r) => r.followedRecommendation === false && r.outcome !== "pending");
  if (ignored.length >= 3) {
    const correct = ignored.filter((r) => r.outcome === "correct").length;
    patterns.push({
      pattern: "Ignored AI Recommendation",
      frequency: ignored.length,
      successRate: Math.round((correct / ignored.length) * 100),
      description: `${ignored.length} decisions where Rod went against the AI. ${correct} correct outcomes.`,
    });
  }

  // Pattern 3: Trade acceptance
  const tradeAccept = rows.filter((r) => r.decisionType === "trade_accept" && r.outcome !== "pending");
  if (tradeAccept.length >= 2) {
    const correct = tradeAccept.filter((r) => r.outcome === "correct").length;
    patterns.push({
      pattern: "Trade Acceptance",
      frequency: tradeAccept.length,
      successRate: Math.round((correct / tradeAccept.length) * 100),
      description: `${tradeAccept.length} accepted trades resolved. ${correct} were favorable outcomes.`,
    });
  }

  // Pattern 4: Trade rejection
  const tradeReject = rows.filter((r) => r.decisionType === "trade_reject" && r.outcome !== "pending");
  if (tradeReject.length >= 2) {
    const correct = tradeReject.filter((r) => r.outcome === "correct").length;
    patterns.push({
      pattern: "Trade Rejection",
      frequency: tradeReject.length,
      successRate: Math.round((correct / tradeReject.length) * 100),
      description: `${tradeReject.length} rejected trades resolved. ${correct} were correct to reject.`,
    });
  }

  // Pattern 5: Start/Sit decisions
  const startSit = rows.filter((r) => r.decisionType === "start_sit" && r.outcome !== "pending");
  if (startSit.length >= 3) {
    const correct = startSit.filter((r) => r.outcome === "correct").length;
    patterns.push({
      pattern: "Start/Sit Calls",
      frequency: startSit.length,
      successRate: Math.round((correct / startSit.length) * 100),
      description: `${startSit.length} start/sit decisions resolved. ${correct} correct calls.`,
    });
  }

  // Pattern 6: Waiver wire
  const waiver = rows.filter((r) => (r.decisionType === "waiver_add" || r.decisionType === "waiver_pass") && r.outcome !== "pending");
  if (waiver.length >= 2) {
    const correct = waiver.filter((r) => r.outcome === "correct").length;
    patterns.push({
      pattern: "Waiver Wire Moves",
      frequency: waiver.length,
      successRate: Math.round((correct / waiver.length) * 100),
      description: `${waiver.length} waiver decisions resolved. ${correct} correct moves.`,
    });
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

// ─── Get Retrospective Analysis (LLM) ────────────────────────────────────────

export async function getRetrospectiveAnalysis(season?: number): Promise<string> {
  const db = await getDb();
  if (!db) return "Database unavailable.";

  const conditions = season ? [eq(gmDecisions.season, season)] : [];
  const rows = await db
    .select()
    .from(gmDecisions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(gmDecisions.createdAt))
    .limit(50);

  if (rows.length === 0) {
    return "No decisions logged yet. Start logging decisions from the Start/Sit, Trade Analyzer, Waiver Wire, and Trade Offer Generator tools to build your GM memory.";
  }

  const stats = computeAccuracyStats(rows);
  const patterns = computePatterns(rows);

  const decisionSummary = rows
    .filter((r) => r.outcome !== "pending")
    .slice(0, 20)
    .map((r) => `- [${r.outcome.toUpperCase()}] ${r.description} (${r.toolSource}, Week ${r.weekNum ?? "?"})${r.outcomeNotes ? ` → ${r.outcomeNotes}` : ""}`)
    .join("\n");

  const prompt = `You are analyzing the GM decision history for Rod Sellers, owner of "Atlantas Finest" in an ESPN 14-team fantasy football league.

DECISION STATISTICS:
- Total decisions logged: ${stats.total}
- Resolved: ${stats.resolved} | Pending: ${stats.pending}
- Overall accuracy: ${stats.accuracyPct}%
- Followed AI recommendation: ${stats.followedRecommendationPct}% of the time
- When followed AI: ${stats.followedAndCorrectPct}% correct
- When ignored AI: ${stats.ignoredAndCorrectPct}% correct
- Average outcome score: ${stats.avgOutcomeScore}/100

PATTERNS DETECTED:
${patterns.map((p) => `- ${p.pattern}: ${p.frequency} decisions, ${p.successRate}% success rate`).join("\n") || "Not enough data for patterns yet."}

RECENT RESOLVED DECISIONS:
${decisionSummary || "No resolved decisions yet."}

Write a 3-4 paragraph retrospective analysis for Rod covering:
1. His overall decision-making accuracy and whether following the AI recommendations is helping him
2. His strongest and weakest decision categories (start/sit, trades, waiver wire)
3. Specific behavioral patterns you notice (e.g., tends to ignore AI on trades, strong at waiver wire)
4. One concrete recommendation for how Rod can improve his decision-making this season

Be direct, specific, and honest. Use actual numbers from the data. Write in second person ("you").`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are an expert fantasy football GM coach analyzing decision history." },
      { role: "user", content: prompt },
    ],
  });

  return (response.choices[0]?.message?.content as string) ?? "Analysis unavailable.";
}
