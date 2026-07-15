/**
 * League Keeper Forecast — a convenience VIEW, not a new intelligence engine.
 *
 * Resolves ONE likely keeper per owner using only existing systems:
 *   1. MANUAL    — a user's manual keeper selection (getManualKeeperSelections)
 *   2. CONFIRMED — an ESPN-stored keeper (pool row whose costSource === "espn_stored")
 *   3. PREDICTED — the highest-value keeper on the roster (computeKeeperValuations)
 *
 * No new prediction model, no confidence math, no valuation engine. Confidence is a
 * fixed display label (MANUAL/CONFIRMED = 100, PREDICTED = 75). All joins by playerId.
 */
import { computeKeeperValuations, type KeeperValuation } from "./keeperValuationService";
import { getManualKeeperSelections } from "./manualKeeperSelections";

export type KeeperForecastStatus = "MANUAL" | "CONFIRMED" | "PREDICTED";

export interface KeeperForecastRow {
  ownerKey: string;
  ownerName: string;
  playerId: number;
  playerName: string;
  position: string;
  keeperRound: number;          // keeper cost (round)
  roundsSaved: number | null;   // keeperRoundCost − adpRound, from the shared valuation
  status: KeeperForecastStatus;
  confidence: number;           // display label only: 100 / 100 / 75
  reason: string;
}

/** Minimal pool shape (a subset of KeeperPoolEntry) the forecast resolves over. */
export interface KeeperForecastPoolRow {
  ownerKey: string;
  ownerName: string;
  playerId: number;
  playerName: string;
  position: string;
  keeperRoundCost: number;
  costSource: "espn_stored" | "draft_history_round" | "fa_fixed";
}

const TIER_RANK: Record<KeeperValuation["valueTier"], number> = {
  elite: 4, strong: 3, viable: 2, borderline: 1, pass: 0,
};

/** Highest keeper value first: tier, then rounds saved, then market value. */
function byValueDesc(a: KeeperValuation, b: KeeperValuation): number {
  const t = TIER_RANK[b.valueTier] - TIER_RANK[a.valueTier];
  if (t !== 0) return t;
  const rs = (b.roundSavings ?? -Infinity) - (a.roundSavings ?? -Infinity);
  if (rs !== 0) return rs;
  return (b.marketValue ?? 0) - (a.marketValue ?? 0);
}

export async function computeLeagueKeeperForecast(args: {
  pool: KeeperForecastPoolRow[];
  season: number;
  leagueId: string;
  userId?: number;
}): Promise<KeeperForecastRow[]> {
  const { pool, season, leagueId, userId } = args;
  if (!pool || pool.length === 0) return [];

  // Shared valuation engine — never a new model.
  const valuations = await computeKeeperValuations({
    pool: pool.map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      position: p.position,
      nflTeam: "",
      ownerKey: p.ownerKey,
      ownerName: p.ownerName,
      keeperRoundCost: p.keeperRoundCost,
    })),
    season,
    leagueId,
    userId,
  });
  const valByPid = new Map(valuations.map((v) => [v.playerId, v]));

  // Manual selections (override #1), keyed by owner.
  const manual = userId ? await getManualKeeperSelections({ userId, leagueId, season }) : [];
  const manualByOwner = new Map<string, (typeof manual)[number]>();
  for (const m of manual) if (!manualByOwner.has(m.ownerKey)) manualByOwner.set(m.ownerKey, m);

  // Group pool rows by owner.
  const owners = new Map<string, { ownerName: string; rows: KeeperForecastPoolRow[] }>();
  for (const p of pool) {
    if (!p.ownerKey) continue;
    if (!owners.has(p.ownerKey)) owners.set(p.ownerKey, { ownerName: p.ownerName, rows: [] });
    owners.get(p.ownerKey)!.rows.push(p);
  }

  const forecast: KeeperForecastRow[] = [];
  for (const [ownerKey, { ownerName, rows }] of owners) {
    // 1) MANUAL
    const m = manualByOwner.get(ownerKey);
    if (m) {
      const v = valByPid.get(m.playerId);
      const poolRow = rows.find((r) => r.playerId === m.playerId);
      forecast.push({
        ownerKey, ownerName,
        playerId: m.playerId,
        playerName: m.playerName || v?.playerName || poolRow?.playerName || "",
        position: m.position || v?.position || poolRow?.position || "?",
        keeperRound: poolRow?.keeperRoundCost ?? v?.keeperRoundCost ?? 0,
        roundsSaved: v?.roundSavings ?? null,
        status: "MANUAL", confidence: 100, reason: "Manual keeper selection",
      });
      continue;
    }
    // 2) CONFIRMED — ESPN-stored keeper
    const confirmed = rows.find((r) => r.costSource === "espn_stored");
    if (confirmed) {
      const v = valByPid.get(confirmed.playerId);
      forecast.push({
        ownerKey, ownerName,
        playerId: confirmed.playerId,
        playerName: confirmed.playerName,
        position: confirmed.position,
        keeperRound: confirmed.keeperRoundCost,
        roundsSaved: v?.roundSavings ?? null,
        status: "CONFIRMED", confidence: 100, reason: "Confirmed ESPN keeper",
      });
      continue;
    }
    // 3) PREDICTED — highest keeper value on roster
    const ownerVals = valuations.filter((v) => v.ownerKey === ownerKey).sort(byValueDesc);
    if (ownerVals.length === 0) continue;
    const best = ownerVals[0];
    forecast.push({
      ownerKey, ownerName,
      playerId: best.playerId,
      playerName: best.playerName,
      position: best.position,
      keeperRound: best.keeperRoundCost,
      roundsSaved: best.roundSavings,
      status: "PREDICTED", confidence: 75, reason: "Highest keeper value on roster",
    });
  }

  // Stable display order: by owner name.
  return forecast.sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}
