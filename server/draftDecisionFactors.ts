/**
 * draftDecisionFactors.ts — Built-in draft decision factor registry (Phase 3).
 *
 * Factors document resolved picks; they do not alter selection logic.
 */

import {
  evaluateDpDraftability,
  isDpWindowOpen,
} from "./draftPickIntelligence";
import {
  DraftDecisionEngine,
  registerDraftFactor,
  type DraftDecisionContext,
  type DecisionFactor,
  confidenceFromScore,
} from "./draftDecisionEngine";

function factor(
  partial: Omit<DecisionFactor, "confidence"> & { confidence?: DecisionFactor["confidence"] },
  ctx: DraftDecisionContext,
): DecisionFactor {
  return {
    confidence: partial.confidence ?? confidenceFromScore(ctx.confidenceScore),
    ...partial,
  };
}

function registerBuiltInDraftFactors(): DraftDecisionEngine {
  registerDraftFactor({
    id: "board-bpa",
    label: "Board",
    stage: "board",
    evaluate(ctx) {
      const adpTxt = ctx.bpa.adp != null ? `ADP ${ctx.bpa.adp}` : "no ADP";
      const selected = ctx.player.name === ctx.bpa.name;
      return factor({
        id: "board-bpa",
        label: "Board",
        stage: "board",
        stance: selected ? "support" : ctx.primaryFactor === "ROSTER_NEED" ? "neutral" : "recommend",
        influence: selected ? 0.45 : 0.25,
        detail: selected
          ? `${ctx.bpa.name} — ${adpTxt} (best player available).`
          : `BPA was ${ctx.bpa.name} (${adpTxt}); ${ctx.player.name} selected instead.`,
      }, ctx);
    },
  });

  registerDraftFactor({
    id: "roster-cap",
    label: "Roster Construction",
    stage: "rosterConstruction",
    evaluate(ctx) {
      if (ctx.primaryFactor !== "POSITION_CAP") {
        return factor({
          id: "roster-cap",
          label: "Roster Construction",
          stage: "rosterConstruction",
          stance: "neutral",
          influence: 0.1,
          detail: "Position caps satisfied for selected player.",
        }, ctx);
      }
      return factor({
        id: "roster-cap",
        label: "Roster Construction",
        stage: "rosterConstruction",
        stance: "block",
        influence: 0.35,
        detail: `${ctx.bpa.position} roster slots full — slid to ${ctx.player.name} (${ctx.player.position}).`,
      }, ctx);
    },
  });

  registerDraftFactor({
    id: "league-dp-timing",
    label: "League History",
    stage: "leagueHistory",
    evaluate(ctx) {
      const prof = ctx.dpTiming;
      if (!prof || ctx.player.position !== "DP") {
        if (prof && ctx.bpa.position === "DP" && !isDpWindowOpen(ctx.pickNum, prof)) {
          return factor({
            id: "league-dp-timing",
            label: "League History",
            stage: "leagueHistory",
            stance: "block",
            influence: 0.3,
            detail: `DP window not open until pick ${prof.windowStartPick ?? "?"}.`,
          }, ctx);
        }
        return factor({
          id: "league-dp-timing",
          label: "League History",
          stage: "leagueHistory",
          stance: "neutral",
          influence: 0.05,
          detail: "No league timing constraint on this pick.",
        }, ctx);
      }
      const draftability = evaluateDpDraftability(ctx.pickNum, prof);
      const stance = ctx.primaryFactor === "LEAGUE_TIMING"
        ? "recommend"
        : draftability.selectable
          ? "support"
          : "block";
      return factor({
        id: "league-dp-timing",
        label: "League History",
        stage: "leagueHistory",
        stance,
        influence: ctx.primaryFactor === "LEAGUE_TIMING" ? 0.5 : 0.25,
        detail: prof.interpretation.slice(0, 180),
        confidence: prof.confidence,
      }, ctx);
    },
  });

  registerDraftFactor({
    id: "owner-dna",
    label: "Owner DNA",
    stage: "ownerDna",
    evaluate(ctx) {
      const meta = ctx.ownerDnaMeta;
      if (!meta) {
        return factor({
          id: "owner-dna",
          label: "Owner DNA",
          stage: "ownerDna",
          stance: "neutral",
          influence: 0,
          detail: "Owner DNA not evaluated (DP path, need pick, or obvious value).",
        }, ctx);
      }
      if (meta.applied) {
        const top = meta.positionProbabilities[0];
        return factor({
          id: "owner-dna",
          label: "Owner DNA",
          stage: "ownerDna",
          stance: "recommend",
          influence: 0.4,
          detail: meta.explanation ?? (top ? `Owner lean ${top.position} ${Math.round(top.probability * 100)}%.` : "Owner tendency applied."),
        }, ctx);
      }
      if (meta.closeBlocked) {
        return factor({
          id: "owner-dna",
          label: "Owner DNA",
          stage: "ownerDna",
          stance: "oppose",
          influence: 0.2,
          detail: meta.blockedReason ?? "Owner lean considered but value held.",
        }, ctx);
      }
      return factor({
        id: "owner-dna",
        label: "Owner DNA",
        stage: "ownerDna",
        stance: "neutral",
        influence: 0.05,
        detail: "Owner DNA evaluated — no nudge applied.",
      }, ctx);
    },
  });

  registerDraftFactor({
    id: "roster-need",
    label: "Need",
    stage: "need",
    evaluate(ctx) {
      const urg = ctx.needUrgency;
      if (ctx.primaryFactor === "ROSTER_NEED" && urg) {
        return factor({
          id: "roster-need",
          label: "Need",
          stage: "need",
          stance: "recommend",
          influence: 0.4,
          detail: `${urg} roster need at ${ctx.targetPosition}.`,
        }, ctx);
      }
      if (urg) {
        return factor({
          id: "roster-need",
          label: "Need",
          stage: "need",
          stance: "support",
          influence: 0.15,
          detail: `${urg} need at ${ctx.targetPosition} — value pick taken.`,
        }, ctx);
      }
      return factor({
        id: "roster-need",
        label: "Need",
        stage: "need",
        stance: "neutral",
        influence: 0.05,
        detail: "No pressing roster need at selected position.",
      }, ctx);
    },
  });

  registerDraftFactor({
    id: "scarcity",
    label: "Scarcity",
    stage: "scarcity",
    evaluate(ctx) {
      const mv = ctx.player.marketValue;
      const detail = mv != null
        ? `Market value ${Math.round(mv)}/100 at ${ctx.targetPosition}.`
        : "Scarcity signal not available for this player.";
      return factor({
        id: "scarcity",
        label: "Scarcity",
        stage: "scarcity",
        stance: "neutral",
        influence: 0.1,
        detail,
      }, ctx);
    },
  });

  registerDraftFactor({
    id: "espn-value",
    label: "Value",
    stage: "value",
    evaluate(ctx) {
      const adp = ctx.player.adp;
      const detail = adp != null
        ? `${ctx.player.name} — ESPN ADP ${adp}.`
        : `${ctx.player.name} — no ESPN ADP on file.`;
      const stance = ctx.primaryFactor === "ESPN_ADP" || ctx.primaryFactor === "POSITION_CAP"
        ? "recommend"
        : "support";
      return factor({
        id: "espn-value",
        label: "Value",
        stage: "value",
        stance,
        influence: ctx.primaryFactor === "ESPN_ADP" ? 0.45 : 0.2,
        detail,
      }, ctx);
    },
  });

  return new DraftDecisionEngine();
}

/** Singleton engine with built-in factors (lazy init avoids ESM circular import). */
let _defaultEngine: DraftDecisionEngine | undefined;

export function getDefaultDraftDecisionEngine(): DraftDecisionEngine {
  if (!_defaultEngine) _defaultEngine = registerBuiltInDraftFactors();
  return _defaultEngine;
}

/** @deprecated use getDefaultDraftDecisionEngine() */
export const defaultDraftDecisionEngine = {
  evaluateAll(ctx: Parameters<DraftDecisionEngine["evaluateAll"]>[0]) {
    return getDefaultDraftDecisionEngine().evaluateAll(ctx);
  },
  buildDecision(ctx: Parameters<DraftDecisionEngine["buildDecision"]>[0]) {
    return getDefaultDraftDecisionEngine().buildDecision(ctx);
  },
};
