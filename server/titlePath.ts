import type { ChampionshipReadiness } from "./careerReportService";

/**
 * Title Path - the "okay, now what?" transformation product.
 *
 * Deterministic transform of ChampionshipReadiness (positional gaps vs league
 * champions + recommended actions). No LLM: cheap to compute on every view,
 * fully evidenced from the owner's own data (satisfies the G2 guardrail in
 * docs/FREEMIUM_GATING_SPEC.md - hope must be evidenced, not generic).
 *
 * Gating: the teaser (moveCount + targetTier + summary) is free; the actual
 * `moves` are paid and redacted server-side in leagueIntelGating.ts.
 */
const TIER_LADDER = ["Foundation", "Rebuilding", "Rising", "Contender", "Championship-Ready"];

export type TitleMove = {
  rank: number;
  position: string | null;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
};

export type TitlePath = {
  available: boolean;
  moveCount: number;
  currentScore: number;
  currentTier: string;
  targetTier: string;
  moves: TitleMove[];
  summary: string;
};

export function computeTitlePath(readiness: ChampionshipReadiness | null): TitlePath {
  if (!readiness) {
    return {
      available: false, moveCount: 0, currentScore: 0,
      currentTier: "Foundation", targetTier: "Rising", moves: [],
      summary: "Connect more league history to build your title path.",
    };
  }

  const { score, tier, positional, topActions } = readiness;
  const idx = TIER_LADDER.indexOf(tier);
  const targetTier = idx >= 0 && idx < TIER_LADDER.length - 1 ? TIER_LADDER[idx + 1] : tier;

  const moves: TitleMove[] = [];

  // Positional gap moves (owner below champion), worst-first - already sorted.
  for (const g of positional) {
    if (moves.length >= 3) break;
    if (g.gap > 0) {
      const impact: TitleMove["impact"] = g.gapPct >= 20 ? "high" : g.gapPct >= 10 ? "medium" : "low";
      moves.push({
        rank: moves.length + 1,
        position: g.position,
        title: `Upgrade your ${g.position} room`,
        detail: `You average ${g.ownerAvg.toFixed(1)} pts/game at ${g.position}; champions average ${g.championAvg.toFixed(1)} - a ${Math.round(g.gapPct)}% gap to close.`,
        impact,
      });
    }
  }

  // Fill remaining slots from recommended actions (non-positional moves).
  for (const act of topActions) {
    if (moves.length >= 3) break;
    moves.push({ rank: moves.length + 1, position: null, title: act, detail: "Recommended from your league history.", impact: "medium" });
  }

  const moveCount = moves.length;
  const top = moves[0];
  const summary = top
    ? `Your title path starts with ${top.position ? `your ${top.position} room` : top.title.toLowerCase()}. ${moveCount} move${moveCount === 1 ? "" : "s"} to ${targetTier}.`
    : `You're already at ${tier} (${score}). Hold your roster and the title window stays open.`;

  return { available: moveCount > 0, moveCount, currentScore: score, currentTier: tier, targetTier, moves, summary };
}
