/**
 * RFSN-029 — Enrich incomplete accepted ESPN trade clusters with asset legs
 * from completed-trade reconstruction (`gmTransactions` / same authority as Owner Dossier).
 *
 * Does not fabricate assets: enrichment only injects legs already present in reconstruction.
 */
import {
  dedupeTradeLegAssets,
  isDraftPickLeg,
  tradeAssetsFromGmLegs,
  tradeClusterKeyFromLeg,
  type TradeLegAsset,
} from "./transactionPersist";
import {
  selectLegsForAssetReconstruction,
  type GmTradeLegRow,
} from "./completedTradeAuthority";

export type NormalizedTxnLeg = Record<string, unknown>;

function isTradeType(type: unknown): boolean {
  const t = String(type ?? "").toUpperCase();
  return t === "TRADE" || t.startsWith("TRADE_");
}

function tradeClusterKeyFromNormalized(row: NormalizedTxnLeg): string {
  return tradeClusterKeyFromLeg({
    type: String(row.type ?? ""),
    transactionId: String(row.transactionId ?? row.id ?? ""),
    relatedTransactionId:
      row.relatedTransactionId != null && String(row.relatedTransactionId).trim() !== ""
        ? String(row.relatedTransactionId)
        : null,
  });
}

function hasAcceptOrUphold(rows: NormalizedTxnLeg[]): boolean {
  return rows.some((r) => {
    const t = String(r.type ?? "").toUpperCase();
    return t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT";
  });
}

function assetsFromNormalizedLegs(rows: NormalizedTxnLeg[]): TradeLegAsset[] {
  return tradeAssetsFromGmLegs(
    rows.map((r, i) => ({
      playerId: r.playerId != null ? Number(r.playerId) : null,
      playerName: r.playerName != null ? String(r.playerName) : null,
      position: r.position != null ? String(r.position) : null,
      itemType: r.itemType != null ? String(r.itemType) : null,
      fromTeamId: r.fromTeamId != null ? Number(r.fromTeamId) : null,
      toTeamId: r.toTeamId != null ? Number(r.toTeamId) : null,
      overallPickNumber: r.overallPickNumber != null ? Number(r.overallPickNumber) : null,
      round: r.round != null ? Number(r.round) : null,
      pickInRound: r.pickInRound != null ? Number(r.pickInRound) : null,
      pickSeason: r.pickSeason != null ? Number(r.pickSeason) : null,
      legIndex: i,
    })),
  );
}

function assetDedupeKey(a: TradeLegAsset): string {
  if (a.playerId != null && a.playerId > 0) {
    return `p:${a.playerId}:${a.toTeamId ?? ""}`;
  }
  return `k:${a.toTeamId ?? ""}:${a.round ?? ""}:${a.pickInRound ?? ""}:${a.overallPickNumber ?? ""}`;
}

function clusterNormalizedTradeRows(rows: NormalizedTxnLeg[]): Map<string, NormalizedTxnLeg[]> {
  const buckets = new Map<string, NormalizedTxnLeg[]>();
  for (const r of rows) {
    if (!isTradeType(r.type)) continue;
    const key = tradeClusterKeyFromNormalized(r);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }
  return buckets;
}

function clusterReconstructionLegs(legs: GmTradeLegRow[]): Map<string, GmTradeLegRow[]> {
  const buckets = new Map<string, GmTradeLegRow[]>();
  for (const r of legs) {
    if (!isTradeType(r.type)) continue;
    const key = tradeClusterKeyFromLeg(r);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }
  return buckets;
}

function gmAssetLegToNormalizedRow(leg: GmTradeLegRow, season: number, clusterKey: string): NormalizedTxnLeg {
  const hasPlayer = leg.playerId != null && leg.playerId > 0;
  const typ = String(leg.type || "").toUpperCase();
  const isHeader = typ === "TRADE_UPHOLD" || typ === "TRADE_ACCEPT";
  return {
    season,
    // Proposal id keeps the same cluster key as the ESPN uphold/accept header.
    transactionId: isHeader ? clusterKey : leg.transactionId || clusterKey,
    relatedTransactionId: null,
    type: typ === "TRADE" ? "TRADE" : "TRADE_PROPOSAL",
    status: leg.status || "EXECUTED",
    playerId: hasPlayer ? leg.playerId : null,
    playerName: leg.playerName,
    position: leg.position,
    fromTeamId: leg.fromTeamId,
    toTeamId: leg.toTeamId,
    teamId: leg.toTeamId ?? leg.fromTeamId,
    itemType: leg.itemType ?? (hasPlayer ? "ADD" : "DRAFT_TRADE"),
    overallPickNumber: leg.overallPickNumber,
    round: leg.round,
    pickInRound: leg.pickInRound,
    pickSeason: leg.pickSeason,
    proposedDate: leg.proposedDate,
    processedDate: leg.processedDate,
    _source: "completed_trade_reconstruction",
  };
}

/**
 * For accepted/upheld ESPN clusters missing assets (or missing some reconstruction assets),
 * inject reconstruction legs so Transactions history can render pick-only / incomplete trades.
 */
export function enrichNormalizedTransactionsWithReconstruction(
  espnRows: NormalizedTxnLeg[],
  reconstructionLegs: GmTradeLegRow[],
  season: number,
): NormalizedTxnLeg[] {
  if (espnRows.length === 0 || reconstructionLegs.length === 0) return espnRows;

  const espnClusters = clusterNormalizedTradeRows(espnRows);
  const reconClusters = clusterReconstructionLegs(reconstructionLegs);
  const injected: NormalizedTxnLeg[] = [];

  for (const [key, group] of espnClusters) {
    if (!hasAcceptOrUphold(group)) continue;

    const existingAssets = assetsFromNormalizedLegs(group);
    const reconGroup = reconClusters.get(key);
    if (!reconGroup || reconGroup.length === 0) continue;

    const assetLegs = selectLegsForAssetReconstruction(reconGroup).filter((leg) => {
      const hasPlayer = leg.playerId != null && leg.playerId > 0;
      return hasPlayer || isDraftPickLeg(leg);
    });
    const reconAssets = dedupeTradeLegAssets(tradeAssetsFromGmLegs(assetLegs));
    if (reconAssets.length === 0) continue;

    const existingKeys = new Set(existingAssets.map(assetDedupeKey));
    const missingKeys = new Set(
      reconAssets.map(assetDedupeKey).filter((k) => !existingKeys.has(k)),
    );
    if (missingKeys.size === 0) continue;

    for (const leg of assetLegs) {
      const asset = tradeAssetsFromGmLegs([leg])[0];
      if (!asset) continue;
      if (!missingKeys.has(assetDedupeKey(asset))) continue;
      injected.push(gmAssetLegToNormalizedRow(leg, season, key));
      // Avoid injecting the same asset twice from duplicate legs.
      missingKeys.delete(assetDedupeKey(asset));
    }
  }

  if (injected.length === 0) return espnRows;
  return [...espnRows, ...injected];
}
