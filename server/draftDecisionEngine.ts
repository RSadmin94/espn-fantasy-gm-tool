/**
 * draftDecisionEngine.ts — Phase 3 Draft Decision Intelligence Engine.
 *
 * Architecture-only: documents WHY a pick was made. Does not select players.
 * Future intelligence modules register as pipeline factors via registerDraftFactor().
 */

import type { PickIntelligence, PickIntelligenceSection, PickPrimaryFactor } from "./draftPickIntelligence";
import type { PositionTimingProfile } from "./leagueDraftTimingProfile";

export type DraftDecisionPrimaryFactor =
  | "BPA"
  | "OWNER_DNA"
  | "ROSTER_NEED"
  | "LEAGUE_TIMING"
  | "POSITION_RUN"
  | "KEEPER"
  | "SCARCITY";

export type DecisionConfidence = "Low" | "Medium" | "High";

export type DecisionFactorStance = "recommend" | "support" | "neutral" | "oppose" | "block";

export type DraftPipelineStage =
  | "board"
  | "rosterConstruction"
  | "leagueHistory"
  | "ownerDna"
  | "need"
  | "scarcity"
  | "value";

export interface DecisionFactor {
  id: string;
  label: string;
  stage: DraftPipelineStage;
  stance: DecisionFactorStance;
  confidence: DecisionConfidence;
  /** Normalized influence weight 0–1 for this pick. */
  influence: number;
  detail: string;
}

export interface DraftDecisionExplanationSections {
  board: string;
  owner: string;
  roster: string;
  history: string;
  finalDecision: string;
}

export interface DraftDecision {
  primaryFactor: DraftDecisionPrimaryFactor;
  confidence: DecisionConfidence;
  factors: DecisionFactor[];
  blockedFactors: DecisionFactor[];
  explanation: string;
  explanationSections: DraftDecisionExplanationSections;
  /** Human-readable decision ledger (UI-ready). */
  ledger: string;
  /** Backward-compatible Phase 1/2a intelligence payload. */
  pickIntelligence: PickIntelligence | null;
}

export interface DraftPoolPlayerSnapshot {
  name: string;
  position: string;
  adp: number | null;
  projectedPoints: number;
  marketValue: number | null;
}

export interface OwnerDnaDecisionMeta {
  applied: boolean;
  closeBlocked: boolean;
  positionProbabilities: Array<{ position: string; probability: number }>;
  explanation: string | null;
  blockedReason: string | null;
  structuredSections: PickIntelligenceSection[];
}

/** Snapshot of a resolved pick — passed to factor evaluators after selection. */
export interface DraftDecisionContext {
  pickNum: number;
  round: number;
  ownerName: string;
  teamName: string;
  player: DraftPoolPlayerSnapshot;
  targetPosition: string;
  primaryFactor: PickPrimaryFactor;
  pickReason: string;
  blockedOverrides: string[];
  bpa: DraftPoolPlayerSnapshot;
  needUrgency: string | null;
  teamNeeds: Array<{ position: string; urgency: string }>;
  dpTiming: PositionTimingProfile | null;
  ownerDnaMeta: OwnerDnaDecisionMeta | null;
  ownerConfidence: string | null;
  isKeeper: boolean;
  keeperRound?: number;
  pickIntelligence: PickIntelligence | null;
  confidenceScore: number;
}

export type DraftFactorEvaluator = (ctx: DraftDecisionContext) => DecisionFactor | null;

export interface RegisteredDraftFactor {
  id: string;
  label: string;
  stage: DraftPipelineStage;
  evaluate: DraftFactorEvaluator;
}

const PIPELINE_ORDER: DraftPipelineStage[] = [
  "board",
  "rosterConstruction",
  "leagueHistory",
  "ownerDna",
  "need",
  "scarcity",
  "value",
];

const factorRegistry: RegisteredDraftFactor[] = [];

export function registerDraftFactor(factor: RegisteredDraftFactor): void {
  if (factorRegistry.some((f) => f.id === factor.id)) {
    throw new Error(`Draft factor already registered: ${factor.id}`);
  }
  factorRegistry.push(factor);
}

export function getRegisteredDraftFactors(): readonly RegisteredDraftFactor[] {
  return factorRegistry;
}

export function evaluateDraftFactor(id: string, ctx: DraftDecisionContext): DecisionFactor | null {
  const reg = factorRegistry.find((f) => f.id === id);
  return reg ? reg.evaluate(ctx) : null;
}

export function mapPickPrimaryToDecisionFactor(
  primary: PickPrimaryFactor,
): DraftDecisionPrimaryFactor {
  switch (primary) {
    case "ESPN_ADP":
    case "POSITION_CAP":
      return "BPA";
    case "ROSTER_NEED":
      return "ROSTER_NEED";
    case "LEAGUE_TIMING":
      return "LEAGUE_TIMING";
    case "OWNER_DNA":
      return "OWNER_DNA";
    case "KEEPER":
      return "KEEPER";
    default:
      return "BPA";
  }
}

export function confidenceFromScore(score: number): DecisionConfidence {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

function stanceLabel(stance: DecisionFactorStance): string {
  switch (stance) {
    case "recommend": return "Recommended";
    case "support": return "Supported";
    case "neutral": return "Neutral";
    case "oppose": return "Opposed";
    case "block": return "Blocked";
  }
}

function buildExplanationSections(
  ctx: DraftDecisionContext,
  factors: DecisionFactor[],
): DraftDecisionExplanationSections {
  const byStage = (stage: DraftPipelineStage) =>
    factors.filter((f) => f.stage === stage).map((f) => `${f.label}: ${f.detail}`).join(" ") || "Neutral.";

  const ownerLines = factors.filter((f) => f.stage === "ownerDna");
  const owner = ownerLines.length
    ? ownerLines.map((f) => f.detail).join(" ")
    : ctx.ownerDnaMeta?.blockedReason
      ? `Owner DNA evaluated but not applied: ${ctx.ownerDnaMeta.blockedReason}`
      : "Owner DNA not evaluated on this pick.";

  const finalDecision = ctx.pickIntelligence?.plainEnglish?.trim()
    || ctx.pickReason
    || `${ctx.player.name} selected.`;

  return {
    board: byStage("board"),
    owner,
    roster: [byStage("rosterConstruction"), byStage("need")].filter(Boolean).join(" "),
    history: byStage("leagueHistory"),
    finalDecision,
  };
}

export function formatDecisionLedger(decision: DraftDecision): string {
  const lines: string[] = [];
  for (const stage of PIPELINE_ORDER) {
    const stageFactors = decision.factors.filter((f) => f.stage === stage);
    if (!stageFactors.length) continue;
    for (const f of stageFactors) {
      lines.push(
        `${f.label}`,
        "----------------",
        f.detail,
        "",
        `Result:`,
        stanceLabel(f.stance),
        "",
      );
    }
  }
  for (const f of decision.blockedFactors) {
    lines.push(
      `${f.label} (blocked)`,
      "----------------",
      f.detail,
      "",
      `Result:`,
      "Blocked",
      "",
    );
  }
  lines.push(
    "Decision",
    "----------------",
    decision.explanationSections.finalDecision,
    "",
    "Confidence:",
    decision.confidence,
  );
  return lines.join("\n");
}

export class DraftDecisionEngine {
  evaluateAll(ctx: DraftDecisionContext): DecisionFactor[] {
    const ordered = [...factorRegistry].sort(
      (a, b) => PIPELINE_ORDER.indexOf(a.stage) - PIPELINE_ORDER.indexOf(b.stage),
    );
    const out: DecisionFactor[] = [];
    for (const reg of ordered) {
      const result = reg.evaluate(ctx);
      if (result) out.push(result);
    }
    return out;
  }

  buildDecision(ctx: DraftDecisionContext): DraftDecision {
    const factors = this.evaluateAll(ctx);
    const blockedFactors = factors.filter((f) => f.stance === "block" || f.stance === "oppose");
    const explanationSections = buildExplanationSections(ctx, factors);
    const explanation = ctx.pickIntelligence?.plainEnglish?.trim()
      || ctx.pickReason
      || `${ctx.player.name} (${ctx.targetPosition}) selected.`;

    const decision: DraftDecision = {
      primaryFactor: mapPickPrimaryToDecisionFactor(ctx.primaryFactor),
      confidence: confidenceFromScore(ctx.confidenceScore),
      factors: factors.filter((f) => f.stance !== "block"),
      blockedFactors,
      explanation,
      explanationSections,
      ledger: "",
      pickIntelligence: ctx.pickIntelligence,
    };
    decision.ledger = formatDecisionLedger(decision);
    return decision;
  }
}

export interface FactorInfluenceRow {
  id: string;
  label: string;
  evaluatedCount: number;
  appliedPct: number;
  supportedPct: number;
  blockedPct: number;
  avgConfidence: number;
  avgInfluence: number;
}

export interface FactorInfluenceReport {
  totalPicks: number;
  factors: FactorInfluenceRow[];
}

const CONF_NUM: Record<DecisionConfidence, number> = { Low: 0.33, Medium: 0.66, High: 1 };

export function buildFactorInfluenceReport(
  picks: Array<{ draftDecision?: DraftDecision | null; isKeeperSlot?: boolean }>,
): FactorInfluenceReport {
  const nonKeeper = picks.filter((p) => !p.isKeeperSlot && p.draftDecision);
  const byId = new Map<string, {
    label: string;
    evaluated: number;
    supported: number;
    blocked: number;
    applied: number;
    confSum: number;
    inflSum: number;
  }>();

  for (const p of nonKeeper) {
    const d = p.draftDecision!;
    const primary = d.primaryFactor;
    for (const f of [...d.factors, ...d.blockedFactors]) {
      const row = byId.get(f.id) ?? {
        label: f.label,
        evaluated: 0,
        supported: 0,
        blocked: 0,
        applied: 0,
        confSum: 0,
        inflSum: 0,
      };
      row.evaluated++;
      row.confSum += CONF_NUM[f.confidence];
      row.inflSum += f.influence;
      if (f.stance === "block" || f.stance === "oppose") row.blocked++;
      else if (f.stance === "support" || f.stance === "recommend") row.supported++;
      const factorPrimaryMap: Record<string, DraftDecisionPrimaryFactor> = {
        "roster-need": "ROSTER_NEED",
        "league-dp-timing": "LEAGUE_TIMING",
        "owner-dna": "OWNER_DNA",
        "board-bpa": "BPA",
        "espn-value": "BPA",
        "roster-cap": "BPA",
        "scarcity": "SCARCITY",
      };
      if (factorPrimaryMap[f.id] === primary) row.applied++;
      byId.set(f.id, row);
    }
  }

  const factors: FactorInfluenceRow[] = [...byId.entries()].map(([id, row]) => ({
    id,
    label: row.label,
    evaluatedCount: row.evaluated,
    appliedPct: row.evaluated ? Math.round((row.applied / row.evaluated) * 1000) / 10 : 0,
    supportedPct: row.evaluated ? Math.round((row.supported / row.evaluated) * 1000) / 10 : 0,
    blockedPct: row.evaluated ? Math.round((row.blocked / row.evaluated) * 1000) / 10 : 0,
    avgConfidence: row.evaluated ? Math.round((row.confSum / row.evaluated) * 100) / 100 : 0,
    avgInfluence: row.evaluated ? Math.round((row.inflSum / row.evaluated) * 100) / 100 : 0,
  }));

  factors.sort((a, b) => b.evaluatedCount - a.evaluatedCount);
  return { totalPicks: nonKeeper.length, factors };
}
