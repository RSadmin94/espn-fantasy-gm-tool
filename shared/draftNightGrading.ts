/**
 * Shared draft-night grading — same War Room curve (ADP value + roster strength).
 * No new evaluation engine: mirrors client DraftWarRoom draftGrades math.
 */

export type DraftNightPickInput = {
  teamId: string;
  ownerName: string;
  playerName: string;
  position: string;
  overallPick: number;
  round: number;
  adp: number | null;
  /** Optional — when absent, strength uses ADP-rank proxy. */
  marketValue?: number | null;
};

export type OwnerDraftMetrics = {
  teamId: string;
  ownerKey: string;
  ownerName: string;
  pickCount: number;
  /** 0..1 War Room blend score before curve. */
  rawScore: number;
  /** ADP value component 0..1 (later than ADP = better). */
  valueScore: number;
  /** Roster strength / construction proxy 0..1. */
  constructionScore: number;
  /** Lineup/depth proxy — same strength basis (existing War Room signal). */
  lineupScore: number;
  avgAdpDelta: number;
  letter: string;
  /** Rank 0 = best. */
  rank: number;
  worstReach?: {
    playerName: string;
    pick: number;
    adp: number;
    reachDelta: number;
    round: number;
  };
  bestValuePick?: {
    playerName: string;
    pick: number;
    adp: number;
    valueDelta: number;
  };
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function letterFromPercentile(rankIndex: number, total: number, pickCount: number): string {
  if (pickCount < 3) return "—";
  const p = rankIndex / Math.max(1, total);
  if (p < 0.14) return "A";
  if (p < 0.36) return "B";
  if (p < 0.68) return "C";
  if (p < 0.90) return "D";
  return "F";
}

/**
 * Per-owner metrics using the War Room formula:
 * valueScore = clamp(0.5 + avgDelta/50) where avgDelta = pick − ADP (positive = value)
 * strengthScore = avg marketValue/100 OR ADP-rank proxy when marketValue missing
 * rawScore = 0.5 * value + 0.5 * strength
 */
export function computeOwnerDraftMetrics(
  picks: readonly DraftNightPickInput[],
): OwnerDraftMetrics[] {
  const byOwner = new Map<string, DraftNightPickInput[]>();
  for (const p of picks) {
    const key = `${p.teamId}::${p.ownerName.trim().toLowerCase()}`;
    const list = byOwner.get(key) ?? [];
    list.push(p);
    byOwner.set(key, list);
  }

  type Raw = {
    teamId: string;
    ownerName: string;
    pickCount: number;
    rawScore: number;
    valueScore: number;
    constructionScore: number;
    lineupScore: number;
    avgAdpDelta: number;
    worstReach?: OwnerDraftMetrics["worstReach"];
    bestValuePick?: OwnerDraftMetrics["bestValuePick"];
  };

  const raws: Raw[] = [];

  for (const [, list] of byOwner) {
    const ownerName = list[0]!.ownerName;
    const teamId = list[0]!.teamId;
    const withAdp = list.filter((p) => p.adp != null && Number.isFinite(p.adp));
    const avgDelta = withAdp.length
      ? withAdp.reduce((s, p) => s + (p.overallPick - Number(p.adp)), 0) / withAdp.length
      : 0;
    const valueScore = clamp01(0.5 + avgDelta / 50);

    const withMv = list.filter((p) => p.marketValue != null && Number.isFinite(Number(p.marketValue)));
    let strength: number;
    if (withMv.length > 0) {
      strength = withMv.reduce((s, p) => s + Number(p.marketValue), 0) / withMv.length;
    } else if (withAdp.length > 0) {
      // ADP-rank proxy: earlier ADP ≈ stronger board presence (0–100 scale)
      const avgAdp = withAdp.reduce((s, p) => s + Number(p.adp), 0) / withAdp.length;
      strength = clamp01(1 - avgAdp / 180) * 100;
    } else {
      strength = 0;
    }
    const constructionScore = clamp01(strength / 100);
    const lineupScore = constructionScore;
    const rawScore = 0.5 * valueScore + 0.5 * constructionScore;

    let worstReach: Raw["worstReach"];
    let bestValuePick: Raw["bestValuePick"];
    for (const p of withAdp) {
      const adp = Number(p.adp);
      const reachDelta = adp - p.overallPick; // positive = early = reach
      const valueDelta = adp - p.overallPick; // same convention as wrap-up best value (picks past ADP)
      // For value: picked later than ADP → overallPick > adp → value = overall - adp
      const stealDelta = p.overallPick - adp;
      if (reachDelta >= 8) {
        if (!worstReach || reachDelta > worstReach.reachDelta) {
          worstReach = {
            playerName: p.playerName,
            pick: p.overallPick,
            adp,
            reachDelta,
            round: p.round,
          };
        }
      }
      if (stealDelta >= 3) {
        if (!bestValuePick || stealDelta > bestValuePick.valueDelta) {
          bestValuePick = {
            playerName: p.playerName,
            pick: p.overallPick,
            adp,
            valueDelta: stealDelta,
          };
        }
      }
    }

    raws.push({
      teamId,
      ownerName,
      pickCount: list.length,
      rawScore,
      valueScore,
      constructionScore,
      lineupScore,
      avgAdpDelta: avgDelta,
      worstReach,
      bestValuePick,
    });
  }

  const ranked = [...raws].sort((a, b) => b.rawScore - a.rawScore);
  return ranked.map((r, i) => ({
    teamId: r.teamId,
    ownerKey: `team:${r.teamId}`,
    ownerName: r.ownerName,
    pickCount: r.pickCount,
    rawScore: r.rawScore,
    valueScore: r.valueScore,
    constructionScore: r.constructionScore,
    lineupScore: r.lineupScore,
    avgAdpDelta: r.avgAdpDelta,
    letter: letterFromPercentile(i, ranked.length, r.pickCount),
    rank: i,
    worstReach: r.worstReach,
    bestValuePick: r.bestValuePick,
  }));
}
