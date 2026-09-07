/**
 * Hard invalidity (RFSN-061C).
 *
 * Validity ≠ quality. Only structurally impossible / unsafe packages die here.
 * Fairness, partner rationality, signed deltas, and 2-for-1 clutter are quality.
 */
import type { TradeFinderAsset, TradeFinderLeague, TradeFinderTeam } from "./types";
import { TRADE_FINDER_SANITY } from "./weights";
import { applyTradeToRoster, bestLegalLineup } from "./lineup";
import type { GeneratedTrade } from "./generate";
import { isCanonicalDuplicateSafe } from "./generate";

export type HardInvalidReason =
  | "unowned"
  | "duplicate_identity"
  | "unresolved_identity"
  | "same_asset_both_sides"
  | "invalid_shape"
  | "illegal_roster"
  | "incomplete_data"
  | "non_tradeable"
  | "sanity_mismatch";

function owned(team: TradeFinderTeam, asset: TradeFinderAsset): boolean {
  if (asset.kind === "pick") {
    return team.picks.some((p) => p.pickId === asset.assetId) || team.roster.some((a) => a.assetId === asset.assetId);
  }
  return team.roster.some((a) => a.assetId === asset.assetId);
}

function unfilledCount(roster: TradeFinderAsset[], league: TradeFinderLeague): number {
  const snap = bestLegalLineup(roster, league.slots);
  return Object.values(snap.unfilledDedicated).reduce((s, n) => s + (n ?? 0), 0);
}

export function hardInvalid(
  league: TradeFinderLeague,
  user: TradeFinderTeam,
  gen: GeneratedTrade,
): HardInvalidReason | null {
  if (gen.give.length === 0 || gen.receive.length === 0) return "invalid_shape";
  if (gen.give.length > 2 || gen.receive.length > 2) return "invalid_shape";

  for (const a of gen.give) {
    if (!owned(user, a)) return "unowned";
  }
  for (const a of gen.receive) {
    if (!owned(gen.partner, a)) return "unowned";
  }

  const giveIds = gen.give.map((a) => a.assetId);
  const receiveIds = gen.receive.map((a) => a.assetId);
  const allIds = [...giveIds, ...receiveIds];
  if (new Set(allIds).size !== allIds.length) return "same_asset_both_sides";
  if (giveIds.some((id) => receiveIds.includes(id))) return "same_asset_both_sides";

  const playerIds = [...gen.give, ...gen.receive]
    .filter((a) => a.kind === "player")
    .map((a) => a.playerId);
  if (playerIds.some((id) => id == null || !Number.isFinite(id) || id <= 0)) return "unresolved_identity";
  if (!isCanonicalDuplicateSafe(gen.give, gen.receive)) return "duplicate_identity";

  const giveValue = gen.give.reduce((s, a) => s + (Number.isFinite(a.tradeValue) ? a.tradeValue : 0), 0);
  const receiveValue = gen.receive.reduce((s, a) => s + (Number.isFinite(a.tradeValue) ? a.tradeValue : 0), 0);
  if (giveValue <= 0 || receiveValue <= 0) return "incomplete_data";
  const ratio = receiveValue / giveValue;
  if (ratio < TRADE_FINDER_SANITY.minGainRatio || ratio > TRADE_FINDER_SANITY.maxGainRatio) {
    return "sanity_mismatch";
  }

  if (gen.give.some((a) => a.kind === "player" && a.ir)) return "non_tradeable";
  if (gen.receive.some((a) => a.kind === "player" && (a.ir || a.unavailable))) return "non_tradeable";

  const userAfter = applyTradeToRoster(user.roster, new Set(giveIds), gen.receive);
  const partnerAfter = applyTradeToRoster(gen.partner.roster, new Set(receiveIds), gen.give);
  const userUnfilledBefore = unfilledCount(user.roster, league);
  const userUnfilledAfter = unfilledCount(userAfter, league);
  const partnerUnfilledBefore = unfilledCount(gen.partner.roster, league);
  const partnerUnfilledAfter = unfilledCount(partnerAfter, league);
  if (userUnfilledAfter > userUnfilledBefore) return "illegal_roster";
  if (partnerUnfilledAfter > partnerUnfilledBefore) return "illegal_roster";

  return null;
}
