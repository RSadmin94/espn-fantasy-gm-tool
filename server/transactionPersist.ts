/**
 * Canonical mapping from normalized ESPN transaction legs → gmTransactions columns.
 * Downstream trade features should reconstruct completed trades from these fields
 * without re-reading espn_raw_cache.
 */

export type TradeLegAsset = {
  fromTeamId: number | null;
  toTeamId: number | null;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  itemType: string | null;
  overallPickNumber: number | null;
  round: number | null;
  pickInRound: number | null;
  pickSeason: number | null;
};

export type GmTransactionLegPersist = {
  leagueId: string;
  season: number;
  transactionId: string;
  relatedTransactionId: string | null;
  type: string;
  status: string;
  playerId: number | null;
  playerKey: number;
  playerName: string | null;
  fromTeamId: number | null;
  toTeamId: number | null;
  teamId: number | null;
  itemType: string | null;
  position: string | null;
  round: number | null;
  pickInRound: number | null;
  overallPickNumber: number | null;
  pickSeason: number | null;
  legIndex: number;
  executionType: string | null;
  bidAmount: number;
  proposedDate: number | null;
  processedDate: number | null;
  rawTransaction: string;
};

function finiteInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function finitePosInt(v: unknown): number | null {
  const n = finiteInt(v);
  return n != null && n > 0 ? n : null;
}

function strOrNull(v: unknown, max = 255): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function txPlayerKey(transactionId: string, legIndex: number): number {
  let h = 0;
  const s = `${transactionId}#${legIndex}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

/** True when a persisted row represents a draft pick leg (not a player). */
export function isDraftPickLeg(row: {
  itemType?: string | null;
  playerId?: number | null;
  overallPickNumber?: number | null;
  round?: number | null;
  pickInRound?: number | null;
}): boolean {
  const it = String(row.itemType ?? "").toUpperCase();
  if (it.includes("DRAFT")) return true;
  if (row.playerId != null && row.playerId > 0) return false;
  return row.overallPickNumber != null || row.round != null || row.pickInRound != null;
}

/** Map one normalizeTransactions() leg row to gmTransactions persist columns. */
export function mapNormalizedLegToPersist(args: {
  leagueId: string;
  season: number;
  legIndex: number;
  row: Record<string, unknown>;
  rawTransaction: string;
}): GmTransactionLegPersist {
  const { leagueId, season, legIndex, row, rawTransaction } = args;
  const tid = String(row.transactionId ?? row.id ?? "");
  const pid = finitePosInt(row.playerId);

  const relRaw = row.relatedTransactionId;
  const relatedTransactionId =
    relRaw != null && String(relRaw).trim() !== "" ? String(relRaw).slice(0, 64) : null;

  const proposedDate = finiteInt(row.proposedDate);
  const processedDate = finiteInt(row.processedDate);
  const bidRaw = row.bidAmount;
  const bidAmount =
    bidRaw != null && Number.isFinite(Number(bidRaw)) ? Number(bidRaw) : 0;

  const teamId = finitePosInt(row.teamId);
  const fromTeamId = finiteInt(row.fromTeamId);
  const toTeamId =
    finiteInt(row.toTeamId) ?? (teamId != null && !finiteInt(row.fromTeamId) ? teamId : null);

  return {
    leagueId: String(leagueId).slice(0, 32),
    season: Math.floor(Number(season)),
    transactionId: tid.slice(0, 64),
    relatedTransactionId,
    type: String(row.type ?? ""),
    status: String(row.status ?? ""),
    playerId: pid,
    playerKey: txPlayerKey(tid, legIndex),
    playerName: strOrNull(row.playerName),
    fromTeamId,
    toTeamId,
    teamId,
    itemType: strOrNull(row.itemType, 32),
    position: strOrNull(row.position, 16),
    round: finiteInt(row.round),
    pickInRound: finiteInt(row.pickInRound),
    overallPickNumber: finiteInt(row.overallPickNumber),
    pickSeason: finiteInt(row.pickSeason),
    legIndex,
    executionType: strOrNull(row.executionType, 32),
    bidAmount,
    proposedDate,
    processedDate,
    rawTransaction,
  };
}

/** Reconstruct trade assets from persisted gmTransactions legs (no cache required). */
export function tradeAssetsFromGmLegs(
  rows: Array<{
    playerId?: number | null;
    playerName?: string | null;
    position?: string | null;
    itemType?: string | null;
    fromTeamId?: number | null;
    toTeamId?: number | null;
    overallPickNumber?: number | null;
    round?: number | null;
    pickInRound?: number | null;
    pickSeason?: number | null;
    legIndex?: number | null;
  }>,
): TradeLegAsset[] {
  const sorted = [...rows].sort((a, b) => (a.legIndex ?? 0) - (b.legIndex ?? 0));
  const out: TradeLegAsset[] = [];
  for (const r of sorted) {
    const hasPlayer = r.playerId != null && r.playerId > 0;
    if (!hasPlayer && !isDraftPickLeg(r)) continue;
    out.push({
      fromTeamId: r.fromTeamId != null ? Number(r.fromTeamId) : null,
      toTeamId: r.toTeamId != null ? Number(r.toTeamId) : null,
      playerId: hasPlayer ? Number(r.playerId) : null,
      playerName: r.playerName ?? null,
      position: r.position ?? null,
      itemType: r.itemType ?? null,
      overallPickNumber: r.overallPickNumber != null ? Number(r.overallPickNumber) : null,
      round: r.round != null ? Number(r.round) : null,
      pickInRound: r.pickInRound != null ? Number(r.pickInRound) : null,
      pickSeason: r.pickSeason != null ? Number(r.pickSeason) : null,
    });
  }
  return out;
}

/** Cluster key for completed trade grouping (matches Transactions page). */
export function tradeClusterKeyFromLeg(row: {
  type: string;
  transactionId: string;
  relatedTransactionId?: string | null;
}): string {
  const t = row.type || "";
  if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") {
    return String(row.relatedTransactionId || row.transactionId || "");
  }
  return String(row.transactionId || "");
}

function ordinal(n: number): string {
  const v = Math.floor(Math.abs(n)) * Math.sign(n || 1);
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}st`;
  if (j === 2 && k !== 12) return `${v}nd`;
  if (j === 3 && k !== 13) return `${v}rd`;
  return `${v}th`;
}

function padPickInRound(p: number): string {
  return String(Math.max(0, Math.floor(Math.abs(p)))).padStart(2, "0");
}

/** Human-readable label for one trade leg (player or pick). */
export function formatTradeLegAssetLabel(asset: TradeLegAsset, fallbackSeason: number): string {
  if (asset.playerId != null && asset.playerId > 0) {
    const name = (asset.playerName || "Unknown player").trim();
    const pos = (asset.position || "").trim();
    return pos && pos !== "?" ? `${name} (${pos})` : name;
  }

  const pickYear = asset.pickSeason ?? fallbackSeason;
  const rnd = asset.round != null ? Number(asset.round) : NaN;
  const pir = asset.pickInRound != null ? Number(asset.pickInRound) : NaN;
  const hasR = Number.isFinite(rnd) && rnd > 0;
  const hasPir = Number.isFinite(pir) && pir > 0;

  if (hasR && hasPir) {
    return `${pickYear} ${ordinal(Math.floor(rnd))} Round Pick R${Math.floor(rnd)}.${padPickInRound(pir)}`;
  }
  if (hasR) {
    return `${pickYear} ${ordinal(Math.floor(rnd))} Round Pick`;
  }
  const ov = asset.overallPickNumber != null ? Number(asset.overallPickNumber) : NaN;
  if (Number.isFinite(ov) && ov > 0) {
    return `${pickYear} Draft Pick #${Math.floor(ov)}`;
  }
  return "Draft pick";
}

function tradeAssetDedupeKey(a: TradeLegAsset): string {
  if (a.playerId != null && a.playerId > 0) {
    return `p:${a.playerId}:${a.toTeamId ?? ""}`;
  }
  return `k:${a.toTeamId ?? ""}:${a.round ?? ""}:${a.pickInRound ?? ""}:${a.overallPickNumber ?? ""}`;
}

export function dedupeTradeLegAssets(assets: TradeLegAsset[]): TradeLegAsset[] {
  const seen = new Set<string>();
  const out: TradeLegAsset[] = [];
  for (const a of assets) {
    const key = tradeAssetDedupeKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * Build per-side "Owner received: …" lines for a completed trade cluster.
 * Returns null when no reconstructable assets exist (caller should fall back).
 */
export function formatCompletedTradePlayersLine(args: {
  assets: TradeLegAsset[];
  season: number;
  ownerNameByTeam: Map<string, string>;
}): string | null {
  const assets = dedupeTradeLegAssets(args.assets);
  if (assets.length === 0) return null;

  const byReceiver = new Map<number, string[]>();
  for (const a of assets) {
    const tid = a.toTeamId;
    if (tid == null || tid <= 0) continue;
    const label = formatTradeLegAssetLabel(a, args.season);
    const list = byReceiver.get(tid) ?? [];
    list.push(label);
    byReceiver.set(tid, list);
  }
  if (byReceiver.size === 0) return null;

  const lines: string[] = [];
  for (const [tid, items] of byReceiver) {
    const name = args.ownerNameByTeam.get(`${args.season}:${tid}`) || `Team ${tid}`;
    lines.push(`${name} received: ${items.join(", ")}`);
  }
  return lines.join("\n");
}
