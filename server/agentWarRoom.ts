// FILE: server/agentWarRoom.ts
/**
 * Phase 4 — Multi-Agent War Room
 *
 * Runs 5 specialist AI agents in parallel on any decision, then aggregates
 * their verdicts into a consensus score, confidence band, and disagreement
 * analysis.
 *
 * Agents:
 *   Floor Agent      — safest outcome, minimize bust risk
 *   Upside Agent     — league-winning ceiling, accept volatility
 *   Counter Agent    — blocks your 13 specific opponents' tendencies
 *   Keeper Agent     — future value, 2026/2027 cost vs production
 *   Playoff Agent    — weeks 14-17 schedule, playoff path optimization
 *
 * Architecture:
 *   All 5 agents receive the same calculated facts (injury scores,
 *   simulation output, DNA profiles) as ground truth in their system prompts.
 *   Each agent has a different optimization target — the disagreement IS
 *   the signal. 5/5 agree = high confidence. 3/2 split = genuinely close call.
 *
 * Exports:
 *   runAgentDebate()        — core parallel agent runner
 *   buildAgentContext()     — assembles shared fact block for all agents
 *   parseAgentVerdicts()    — normalizes raw LLM responses to typed verdicts
 */

import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentRole = "floor" | "upside" | "counter" | "keeper" | "playoff";

export type Verdict = "A" | "B" | "NEUTRAL";

export interface AgentVerdictRaw {
  role: AgentRole;
  label: string;
  verdict: Verdict;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  primaryReason: string;
  riskOrConcern: string;
  recommendation: string;
}

export interface AgentDebateResult {
  question: string;
  verdicts: AgentVerdictRaw[];
  consensus: {
    verdict: Verdict;
    /** How many of 5 agents agree with the majority verdict */
    agreeCount: number;
    /** 0-100 */
    confidenceScore: number;
    confidenceLabel: "DECISIVE" | "LEAN" | "CONTESTED" | "SPLIT";
  };
  disagreements: string[];   // what the minority agents flag
  summaryText: string;       // plain English for UI display
  promptBlockForAdvisor: string; // inject into GM Advisor for follow-up
}

export interface AgentContext {
  /** The decision being made — plain English */
  question: string;
  /** Option A description */
  optionA: string;
  /** Option B description (or empty for open-ended questions) */
  optionB: string;
  /** Pre-calculated facts injected as ground truth */
  calculatedFacts: string;
  /** Current league context (standings, week, Rod's record) */
  leagueContext: string;
}

// ─── Agent system prompts ─────────────────────────────────────────────────────

const AGENT_CONFIGS: Record<AgentRole, { label: string; systemPrompt: string }> = {
  floor: {
    label: "Floor Agent",
    systemPrompt: `You are the Floor Agent in a 5-agent fantasy football war room for "ATLANTAS FINEST FF" (14-team PPR keeper league).

YOUR OPTIMIZATION TARGET: Minimize weekly bust risk and maximize consistent floor production.
- Favor players with high workload confidence and predictable usage
- Heavily penalize injury uncertainty — a doubtful player with upside is never worth the risk
- Prefer proven starters over emerging contributors
- In trades: prefer guaranteed production over ceiling
- In drafts: floor at each position beats upside at a position you don't need

You will receive calculated facts (injury scores, simulation data, DNA profiles) — treat these as ground truth.
Respond ONLY in this exact JSON format, no markdown:
{
  "verdict": "A" or "B" or "NEUTRAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "primaryReason": "1-2 sentences from a floor/stability perspective",
  "riskOrConcern": "The main risk you see with the recommended option",
  "recommendation": "One decisive sentence starting with START, KEEP, TRADE, or DRAFT"
}`,
  },

  upside: {
    label: "Upside Agent",
    systemPrompt: `You are the Upside Agent in a 5-agent fantasy football war room for "ATLANTAS FINEST FF" (14-team PPR keeper league).

YOUR OPTIMIZATION TARGET: Maximize league-winning ceiling production. Championships are won by boom weeks.
- Accept bust risk in exchange for ceiling — a safe 12 points never wins a championship
- Favor high-target-share players in favorable matchups
- In trades: prioritize players with championship upside over reliable starters
- In drafts: ceiling at a scarce position beats safe floor at a deep position
- Injury risk is acceptable if the reward is high enough — a healthy game from an upside play > a floor game
- Look for leverage: unique roster construction that others won't have

You will receive calculated facts — treat these as ground truth.
Respond ONLY in this exact JSON format, no markdown:
{
  "verdict": "A" or "B" or "NEUTRAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "primaryReason": "1-2 sentences from an upside/ceiling perspective",
  "riskOrConcern": "The main downside risk you acknowledge",
  "recommendation": "One decisive sentence starting with START, KEEP, TRADE, or DRAFT"
}`,
  },

  counter: {
    label: "Opponent Counter Agent",
    systemPrompt: `You are the Opponent Counter Agent in a 5-agent fantasy football war room for "ATLANTAS FINEST FF" (14-team PPR keeper league).

YOUR OPTIMIZATION TARGET: Block and counter the specific behavioral tendencies of the other 13 managers.
- Use opponent DNA profiles to anticipate their moves before they happen
- In drafts: if an opponent historically reaches for a position, let them overpay and take value elsewhere
- In trades: identify when an opponent is in a desperation window and extract maximum value
- In waiver decisions: claim players opponents will panic-bid on before they do
- Consider head-to-head history with Rod — who does he consistently beat or lose to?
- Think 1-2 moves ahead: what does this decision set up for future exploitation?

You will receive opponent DNA profiles and calculated facts — treat these as ground truth.
Respond ONLY in this exact JSON format, no markdown:
{
  "verdict": "A" or "B" or "NEUTRAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "primaryReason": "1-2 sentences from a counter-strategy perspective, referencing specific opponent tendencies",
  "riskOrConcern": "What opponent behavior could backfire on this recommendation",
  "recommendation": "One decisive sentence starting with START, KEEP, TRADE, or DRAFT"
}`,
  },

  keeper: {
    label: "Keeper Agent",
    systemPrompt: `You are the Keeper Agent in a 5-agent fantasy football war room for "ATLANTAS FINEST FF" (14-team PPR keeper league, 1 keeper per team, keeper costs 1 round more than previous draft round).

YOUR OPTIMIZATION TARGET: Maximize multi-year roster value. Think 2026 and 2027, not just this week.
- Keeper cost vs ADP surplus is the primary valuation metric
- Age trajectory matters: a 24-year-old WR kept in round 8 is worth far more than a 30-year-old RB
- Consider the 2-consecutive-year rule — if a player will hit the limit, their value resets
- In trades: heavily weight keeper eligibility and future draft cost
- In drafts: players that fall to rounds 8-12 but have elite keeper potential are the biggest prizes
- RBs age fast — discount anyone over 27 for keeper value
- TE scarcity makes elite TEs extremely keepable

You will receive calculated facts including keeper round costs — treat these as ground truth.
Respond ONLY in this exact JSON format, no markdown:
{
  "verdict": "A" or "B" or "NEUTRAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "primaryReason": "1-2 sentences from a keeper value / long-term perspective",
  "riskOrConcern": "The main keeper risk — cost escalation, age, or eligibility concern",
  "recommendation": "One decisive sentence starting with START, KEEP, TRADE, or DRAFT"
}`,
  },

  playoff: {
    label: "Playoff Agent",
    systemPrompt: `You are the Playoff Agent in a 5-agent fantasy football war room for "ATLANTAS FINEST FF" (14-team PPR keeper league, playoffs are weeks 15-17).

YOUR OPTIMIZATION TARGET: Maximize championship probability specifically for playoff weeks 14-17.
- Regular season production is irrelevant if the player has a brutal playoff schedule
- Prioritize players whose NFL teams have strong playoff matchups (weak defenses in weeks 15-17)
- Accept lower floor now in exchange for playoff schedule upside
- Dome players, pass-catching RBs, and high-target WRs in good playoff matchups are gold
- Consider injury timing: a player who is banged up now but will be healthy for the playoffs is worth holding
- Bye weeks and playoff matchup strength should heavily influence start/sit and trade decisions

You will receive calculated facts — treat these as ground truth.
Respond ONLY in this exact JSON format, no markdown:
{
  "verdict": "A" or "B" or "NEUTRAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "primaryReason": "1-2 sentences from a playoff schedule / championship probability perspective",
  "riskOrConcern": "The main playoff risk — schedule, injury timing, or usage concern",
  "recommendation": "One decisive sentence starting with START, KEEP, TRADE, or DRAFT"
}`,
  },
};

// ─── Run a single agent ───────────────────────────────────────────────────────

async function runAgent(
  role: AgentRole,
  context: AgentContext
): Promise<AgentVerdictRaw> {
  const config = AGENT_CONFIGS[role];

  const userMessage = [
    `DECISION: ${context.question}`,
    `OPTION A: ${context.optionA}`,
    context.optionB ? `OPTION B: ${context.optionB}` : "",
    "",
    "CALCULATED FACTS (ground truth — do not contradict):",
    context.calculatedFacts,
    "",
    "LEAGUE CONTEXT:",
    context.leagueContext,
  ].filter(s => s !== undefined).join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: `${role}_verdict`,
          strict: true,
          schema: {
            type: "object",
            properties: {
              verdict: { type: "string", enum: ["A", "B", "NEUTRAL"] },
              confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
              primaryReason: { type: "string" },
              riskOrConcern: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["verdict", "confidence", "primaryReason", "riskOrConcern", "recommendation"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    return {
      role,
      label: config.label,
      verdict: parsed.verdict as Verdict,
      confidence: parsed.confidence as AgentVerdictRaw["confidence"],
      primaryReason: parsed.primaryReason,
      riskOrConcern: parsed.riskOrConcern,
      recommendation: parsed.recommendation,
    };
  } catch (err) {
    // Agent failed — return neutral so debate continues
    console.error(`[agentWarRoom] ${role} agent failed:`, err);
    return {
      role,
      label: config.label,
      verdict: "NEUTRAL",
      confidence: "LOW",
      primaryReason: "Agent unavailable.",
      riskOrConcern: "Could not retrieve analysis.",
      recommendation: "Consult other agents.",
    };
  }
}

// ─── Aggregate verdicts ───────────────────────────────────────────────────────

function aggregateVerdicts(
  verdicts: AgentVerdictRaw[],
  question: string,
  optionA: string,
  optionB: string
): AgentDebateResult {
  const validVerdicts = verdicts.filter(v => v.verdict !== "NEUTRAL");
  const aCount = validVerdicts.filter(v => v.verdict === "A").length;
  const bCount = validVerdicts.filter(v => v.verdict === "B").length;
  const neutralCount = verdicts.filter(v => v.verdict === "NEUTRAL").length;

  // Determine consensus
  let consensusVerdict: Verdict = "NEUTRAL";
  let agreeCount = 0;
  if (aCount > bCount) { consensusVerdict = "A"; agreeCount = aCount; }
  else if (bCount > aCount) { consensusVerdict = "B"; agreeCount = bCount; }
  else { consensusVerdict = "NEUTRAL"; agreeCount = 0; }

  const total = verdicts.length;
  const rawConfidence = total > 0 ? (agreeCount / total) * 100 : 0;

  // Weight by individual agent confidence
  const highConfidenceBonus = verdicts
    .filter(v => v.verdict === consensusVerdict && v.confidence === "HIGH")
    .length * 5;
  const lowConfidencePenalty = verdicts
    .filter(v => v.confidence === "LOW")
    .length * 3;

  const confidenceScore = Math.min(100, Math.max(0, Math.round(
    rawConfidence + highConfidenceBonus - lowConfidencePenalty
  )));

  const confidenceLabel: AgentDebateResult["consensus"]["confidenceLabel"] =
    confidenceScore >= 85 ? "DECISIVE" :
    confidenceScore >= 65 ? "LEAN" :
    confidenceScore >= 45 ? "CONTESTED" :
    "SPLIT";

  // Disagreements: minority agents and their reasons
  const minorityAgents = verdicts.filter(v =>
    v.verdict !== consensusVerdict && v.verdict !== "NEUTRAL"
  );
  const disagreements = minorityAgents.map(a =>
    `${a.label}: ${a.primaryReason}`
  );
  // Also surface any neutral agents as uncertainty signals
  if (neutralCount > 0) {
    const neutralAgents = verdicts.filter(v => v.verdict === "NEUTRAL");
    for (const n of neutralAgents) {
      if (n.primaryReason !== "Agent unavailable.") {
        disagreements.push(`${n.label} (neutral): ${n.primaryReason}`);
      }
    }
  }

  // Build summary text
  const winnerName = consensusVerdict === "A" ? optionA : consensusVerdict === "B" ? optionB : "No clear winner";
  const majorityLabel = agreeCount > 0 ? `${agreeCount}/5 agents` : "Agents split";
  const minorityLabel = minorityAgents.length > 0
    ? ` | Dissent: ${minorityAgents.map(a => a.label).join(", ")}`
    : "";

  const summaryText = [
    `WAR ROOM VERDICT: ${confidenceLabel === "SPLIT" ? "SPLIT DECISION" : winnerName}`,
    `Consensus: ${majorityLabel} (${confidenceScore}% confidence — ${confidenceLabel})${minorityLabel}`,
    "",
    ...verdicts.map(v => `  ${v.label}: ${v.verdict === "NEUTRAL" ? "NEUTRAL" : v.verdict === "A" ? optionA.split(" ")[0] : optionB.split(" ")[0]} (${v.confidence}) — ${v.recommendation}`),
    disagreements.length > 0 ? `\nKey disagreements:\n${disagreements.map(d => `  • ${d}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  // Prompt block for GM Advisor injection
  const promptBlockForAdvisor = [
    `MULTI-AGENT WAR ROOM ANALYSIS for: "${question}"`,
    `Consensus: ${agreeCount}/5 agents favor ${winnerName} (${confidenceScore}% confidence — ${confidenceLabel})`,
    `Agent breakdown:`,
    ...verdicts.map(v => `  ${v.label}: ${v.verdict} — ${v.primaryReason}`),
    disagreements.length > 0 ? `Minority concerns: ${disagreements.join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  return {
    question,
    verdicts,
    consensus: { verdict: consensusVerdict, agreeCount, confidenceScore, confidenceLabel },
    disagreements,
    summaryText,
    promptBlockForAdvisor,
  };
}

// ─── Core parallel runner ─────────────────────────────────────────────────────

/**
 * Runs all 5 agents in parallel and returns the aggregated debate result.
 * Total latency = single agent latency (they run concurrently, not sequentially).
 */
export async function runAgentDebate(context: AgentContext): Promise<AgentDebateResult> {
  const roles: AgentRole[] = ["floor", "upside", "counter", "keeper", "playoff"];

  const verdicts = await Promise.all(
    roles.map(role => runAgent(role, context))
  );

  return aggregateVerdicts(verdicts, context.question, context.optionA, context.optionB);
}

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Assembles the shared fact block injected into every agent's prompt.
 * Accepts pre-built strings from Phase 1, 2, and 3 outputs.
 */
export function buildAgentContext(params: {
  question: string;
  optionA: string;
  optionB?: string;
  injuryBlock?: string;       // from Phase 1: buildInjuryPromptBlock()
  simulationBlock?: string;   // from Phase 2: simResult.summaryText
  dnaBlock?: string;          // from Phase 3: buildDNAPromptBlock()
  leagueContext?: string;     // standings, week, Rod's record
  extraFacts?: string;        // any additional calculated facts
}): AgentContext {
  const factParts: string[] = [];

  if (params.injuryBlock) factParts.push(params.injuryBlock);
  if (params.simulationBlock) factParts.push(params.simulationBlock);
  if (params.dnaBlock) factParts.push(params.dnaBlock);
  if (params.extraFacts) factParts.push(params.extraFacts);

  return {
    question: params.question,
    optionA: params.optionA,
    optionB: params.optionB ?? "",
    calculatedFacts: factParts.length > 0
      ? factParts.join("\n\n")
      : "No pre-calculated facts provided — reason from general knowledge.",
    leagueContext: params.leagueContext ?? "ATLANTAS FINEST FF, 14-team PPR keeper league, 2025 season.",
  };
}
