/**
 * RFSN-003 — Rival storylines framework (Phase 1).
 * Builds rivalry HistoricalContext from H2H evidence only.
 * Aggregate eliminations only — no season-specific elim phrasing until confirmed.
 */

import type { HistoricalContext } from "./historicalContext";
import { scoreNarrativeHeat } from "./narrativeHeat";
import type { CachedRivalry } from "./leagueContextCache";

/**
 * Observable rivalry fact from H2H record + aggregate playoff elimination counts.
 */
export function buildRivalryHistoricalContext(
  pair: CachedRivalry,
  significance: number,
): HistoricalContext | null {
  const rival = pair.rivalOwnerName?.trim();
  const focal = pair.focalOwnerName?.trim();
  if (!rival || !focal) return null;

  const wins = pair.rivalWins;
  const losses = pair.rivalLosses;
  if (wins + losses < 1 && pair.playoffEliminations < 1) return null;

  const skew = Math.abs(wins - losses);
  const parts: string[] = [];
  if (wins + losses > 0) {
    parts.push(`${focal} and ${rival} are ${wins}-${losses} all-time in head-to-head`);
  }
  if (pair.playoffEliminations > 0) {
    parts.push(
      pair.playoffEliminations === 1
        ? `${rival} has knocked ${focal} out of the playoffs once`
        : `${rival} has knocked ${focal} out of the playoffs ${pair.playoffEliminations} times`,
    );
  }

  const fact = `${parts.join("; ")}.`;

  return {
    fact,
    evidence: [
      {
        source: "biggestThreatService/rivalryService",
        ref: `h2h:${focal}|${rival}:${pair.h2hRecord}`,
      },
      ...(pair.playoffEliminations > 0
        ? [
            {
              source: "rivalryService",
              ref: `playoffEliminations:${focal}|${rival}:${pair.playoffEliminations}`,
            },
          ]
        : []),
    ],
    confidence: pair.playoffEliminations > 0 && wins + losses > 0 ? 0.9 : wins + losses > 0 ? 0.9 : 0.85,
    significance,
    narrativeType: "rivalry",
    narrativeHeat: scoreNarrativeHeat("rivalry", {
      rivalrySkew: skew,
      playoffEliminations: pair.playoffEliminations,
    }),
  };
}
