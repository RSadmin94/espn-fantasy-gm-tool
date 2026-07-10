/**
 * Baseline harness normalization helpers (Step 2.5).
 * Does not alter production Draft War Room logic.
 */

/** ESPN live ADP jitters by ~0.01–0.03 between captures; integer rounding stabilizes the hash. */
export function roundLiveAdp(adp: unknown): number | null {
  if (adp == null || !Number.isFinite(Number(adp))) return null;
  return Math.round(Number(adp));
}

/** Semantic Draft War Room snapshot for migration regression (volatile fields normalized). */
export function buildDraftWarRoomBaselinePayload(dwr: Record<string, unknown>, season: number): Record<string, unknown> {
  const pool = [...((dwr.availablePool as unknown[]) ?? [])].sort(
    (a: any, b: any) => (a.adp ?? 9999) - (b.adp ?? 9999),
  );
  return {
    season,
    teamCount: dwr.teamCount,
    keeperCount: ((dwr.keepers as unknown[]) ?? []).length,
    keepersTop10: ((dwr.keepers as unknown[]) ?? [])
      .slice()
      .sort((a: any, b: any) => (b.keeperValueScore ?? 0) - (a.keeperValueScore ?? 0))
      .slice(0, 10)
      .map((k: any) => ({
        playerName: k.playerName,
        position: k.position,
        ownerName: k.ownerName,
        keeperValueScore: k.keeperValueScore,
        keeperRoundCost: k.keeperRoundCost,
      })),
    poolTop25: pool.slice(0, 25).map((p: any) => ({
      name: p.name,
      position: p.position,
      adp: roundLiveAdp(p.adp),
      marketValue: p.marketValue,
    })),
    scarcityAlerts: ((dwr.scarcityAlerts as unknown[]) ?? []).map((a: any) => ({
      position: a.position,
      severity: a.severity,
      message: a.message,
    })),
    positionRunAlerts: ((dwr.positionRunAlerts as unknown[]) ?? []).map((a: any) => ({
      position: a.position,
      runRisk: a.runRisk,
      picksUntilWindowCloses: a.picksUntilWindowCloses,
    })),
    draftBoardPressure: dwr.draftBoardPressure ?? null,
    mockDraftFirst28: ((dwr.mockDraft as unknown[]) ?? []).slice(0, 28).map((p: any) => ({
      overall: p.overall ?? p.overallPick,
      playerName: p.playerName ?? p.name,
      position: p.position,
      teamId: p.teamId,
    })),
  };
}

export const DWR_NORMALIZED_FIELDS = [
  {
    engine: "draft_war_room",
    path: "payload.poolTop25[].adp",
    normalization: "round to nearest integer before hash",
    classification: "time-dependent (live ESPN ADP feed micro-drift)",
    source: "draftWarRoomRouter.getDraftWarRoomData → availablePool → ESPN ADP cache (espnAdpByPlayerId)",
    userVisibleImpact: "Pool rank/order and marketValue unchanged; raw ADP display may differ by ≤0.05 in UI",
  },
] as const;
