/**
 * keeperValuationService.ts — Keeper Intelligence Step 2.
 *
 * THE single authoritative keeper valuation. Pure consumer of the enhanced
 * `espn.keeperPool` output (which now carries real `playerId` + canonical
 * `ownerKey`). This service introduces NO new valuation engine, NO ADP
 * estimator, and NO hardcoded ADP tables. It only joins existing, trusted
 * sources BY playerId (never by name):
 *
 *   • keeperPool        → eligibility, keeper round cost, player/owner identity
 *   • getEspnAdpMap     → real ESPN live ADP (player.ownership.averageDraftPosition)
 *   • computeMarketValues → trusted within-position player value (0–100)
 *
 * Core concept:  Keeper Value = Player Value − Keeper Cost
 *   roundSavings = keeperRoundCost − adpRound
 *   (keep a Rd2-ADP player for a Rd8 pick → +6 rounds saved → elite;
 *    keep a Rd4-ADP player for a Rd2 pick → −2 → pass)
 */
import { getCachedView } from "./db";
import { normalizeRosters } from "./espnService";
import { computeMarketValues, type MarketValueInput } from "./marketValue";
import { getEspnAdpMap } from "./playerStatsRouter";

export type KeeperValueTier = "elite" | "strong" | "viable" | "borderline" | "pass";

/** Structural subset of an enhanced keeperPool row this service consumes. */
export interface KeeperPoolRowLite {
  playerId: number;
  playerName: string;
  ownerKey: string;
  ownerName: string;
  position: string;
  nflTeam: string;
  keeperRoundCost: number;
}

export interface KeeperValuation {
  playerId: number;
  playerName: string;
  position: string;
  nflTeam: string;
  ownerKey: string;
  ownerName: string;
  keeperRoundCost: number;
  marketValue: number | null;       // trusted within-position value, 0–100 (computeMarketValues)
  marketConfidence: number | null;  // percent-started confidence component, 0–100
  adp: number | null;               // real ESPN live ADP (overall pick), or null when unranked
  adpRound: number | null;          // adp → draft round for THIS league size
  roundSavings: number | null;      // keeperRoundCost − adpRound (positive = value retained)
  valueTier: KeeperValueTier;       // machine key for sorting / UI styling
  recommendation: string;           // display label: Elite/Strong/Viable Keeper, Borderline, Pass
  explanation: string;              // deterministic, data-backed one-liner
}

// ── deterministic tier + explanation (NO LLM; labels derive only from data) ──

const TIER_LABEL: Record<KeeperValueTier, string> = {
  elite: "Elite Keeper",
  strong: "Strong Keeper",
  viable: "Viable Keeper",
  borderline: "Borderline",
  pass: "Pass",
};

function ordinal(n: number): string {
  const v = Math.abs(Math.round(n));
  const s = ["th", "st", "nd", "rd"];
  const m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

/** "a" vs "an" for an ordinal-round phrase (eighth/eleventh/eighteenth take "an"). */
function article(n: number): string {
  const v = Math.abs(Math.round(n));
  return v === 8 || v === 11 || v === 18 || (v >= 80 && v < 90) ? "an" : "a";
}

/** Map round savings → tier. Pure thresholds, matching the spec's worked examples. */
function classifyTier(roundSavings: number | null): KeeperValueTier {
  if (roundSavings == null) return "borderline"; // no ADP benchmark — can't price the keep
  if (roundSavings >= 5) return "elite";
  if (roundSavings >= 3) return "strong";
  if (roundSavings >= 1) return "viable";
  if (roundSavings === 0) return "borderline";
  return "pass";
}

function buildExplanation(args: {
  tier: KeeperValueTier;
  playerName: string;
  keeperRoundCost: number;
  adpRound: number | null;
  roundSavings: number | null;
  marketValue: number | null;
}): string {
  const { tier, playerName, keeperRoundCost, adpRound, roundSavings, marketValue } = args;
  const mvSuffix = marketValue != null ? ` Market value ${Math.round(marketValue)}/100.` : "";

  if (roundSavings == null || adpRound == null) {
    return `No current ADP for ${playerName} — draft value can't be benchmarked against the ${ordinal(keeperRoundCost)}-round keeper cost.${mvSuffix}`;
  }
  if (tier === "pass") {
    return `Costs ${article(keeperRoundCost)} ${ordinal(keeperRoundCost)}-round pick for round ${adpRound} draft value — ${Math.abs(roundSavings)} round${Math.abs(roundSavings) === 1 ? "" : "s"} above market.${mvSuffix}`;
  }
  if (roundSavings === 0) {
    return `Keeper cost (round ${keeperRoundCost}) matches draft value (round ${adpRound}) — break-even.${mvSuffix}`;
  }
  return `Round ${adpRound} draft value at ${article(keeperRoundCost)} ${ordinal(keeperRoundCost)}-round cost — ${roundSavings} round${roundSavings === 1 ? "" : "s"} of draft capital saved.${mvSuffix}`;
}

// ── main: one authoritative valuation per keeper-eligible player ──────────────

/**
 * Produce keeper valuations for an enhanced keeperPool result.
 * Joins are BY playerId only — ADP and market value are never matched by name.
 */
export async function computeKeeperValuations(args: {
  pool: KeeperPoolRowLite[];
  season: number;
  leagueId?: string;
  userId?: number;
  leagueSize?: number;
}): Promise<KeeperValuation[]> {
  const { pool, season, leagueId, userId } = args;
  if (!pool || pool.length === 0) return [];

  // League size for adp→round: explicit override, else distinct owners in the pool.
  const distinctOwners = new Set(pool.map((p) => p.ownerKey).filter(Boolean)).size;
  const leagueSize = args.leagueSize && args.leagueSize > 1 ? args.leagueSize : distinctOwners > 1 ? distinctOwners : 12;

  // 1) Trusted within-position market value over the whole league roster pool —
  //    SAME engine + reduced inputs the dynasty model was validated on (projection +
  //    percent-started; ADP/keeper kept out so marketValue stays an independent signal).
  const cached: any = await getCachedView(season, "combined", leagueId, { userId });
  const rosters: any[] = cached?.payload ? normalizeRosters(cached.payload) : [];
  const mvInputs: MarketValueInput[] = rosters.map((p) => ({
    playerId: Number(p.playerId),
    position: String(p.position || "?"),
    adpRank: null,
    projection: (Number(p.projectedTotal) || (Number(p.appliedAverage) || 0) * 17) || null,
    keeperRoundSavings: null,
    percentStarted: p.percentStarted != null ? Number(p.percentStarted) : null,
    currentSeasonWeekly: [],
    history: [],
    currentSeason: season,
  }));
  const mv = computeMarketValues(mvInputs, { playedWeeks: 0 });

  // 2) Real ESPN live ADP (single shared source; keyed by ESPN playerId string).
  let adpMap = new Map<string, number>();
  try { adpMap = await getEspnAdpMap(); } catch { /* ADP unavailable → null adp downstream */ }

  // 3) Join each keeper row BY playerId.
  const out: KeeperValuation[] = pool.map((row) => {
    const pid = Number(row.playerId);
    const mvRow = pid > 0 ? mv.get(pid) : undefined;
    const marketValue = mvRow ? Math.round(mvRow.value * 10) / 10 : null;
    const marketConfidence = mvRow?.components?.marketConfidence ?? null;

    const adp = pid > 0 ? adpMap.get(String(pid)) ?? null : null;
    const adpRound = adp != null ? Math.max(1, Math.ceil(adp / leagueSize)) : null;
    const roundSavings = adpRound != null ? row.keeperRoundCost - adpRound : null;

    const valueTier = classifyTier(roundSavings);
    const explanation = buildExplanation({
      tier: valueTier,
      playerName: row.playerName,
      keeperRoundCost: row.keeperRoundCost,
      adpRound,
      roundSavings,
      marketValue,
    });

    return {
      playerId: pid,
      playerName: row.playerName,
      position: row.position,
      nflTeam: row.nflTeam,
      ownerKey: row.ownerKey,
      ownerName: row.ownerName,
      keeperRoundCost: row.keeperRoundCost,
      marketValue,
      marketConfidence: marketConfidence != null ? Math.round(marketConfidence * 10) / 10 : null,
      adp,
      adpRound,
      roundSavings,
      valueTier,
      recommendation: TIER_LABEL[valueTier],
      explanation,
    };
  });

  // Best deals first: by round savings, then market value (nulls last).
  out.sort((a, b) => {
    const sa = a.roundSavings ?? -Infinity;
    const sb = b.roundSavings ?? -Infinity;
    if (sb !== sa) return sb - sa;
    return (b.marketValue ?? -Infinity) - (a.marketValue ?? -Infinity);
  });
  return out;
}
