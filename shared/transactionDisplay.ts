/**
 * RFSN-056A — Transactions display / filter / grouping helpers.
 *
 * ESPN 2026 executed trades arrive as TRADE_UPHOLD + TRADE_ACCEPT headers
 * (often no items) linked via relatedTransactionId to a TRADE_PROPOSAL that
 * may still say PENDING, or may have vanished from mTransactions2 entirely.
 *
 * Does not change grading / completed-trade authority scoring.
 */

export type TradeDisplayRow = {
  type?: string | null;
  status?: string | null;
  executionType?: string | null;
  transactionId?: string | null;
  relatedTransactionId?: string | null;
  teamId?: number | null;
  fromTeamId?: number | null;
  toTeamId?: number | null;
  playerId?: number | null;
  playerName?: string | null;
  itemType?: string | null;
  overallPickNumber?: number | null;
  round?: number | null;
  pickInRound?: number | null;
};

export type TradeStatusFilter = "ALL" | "EXECUTED" | "PROPOSED" | "CANCELED";

export type TradeClusterEval = {
  key: string;
  ok: boolean;
  reason: string;
  types: string[];
  statuses: string[];
  execTypes: string[];
  teams: number[];
  assetCount: number;
  executed: boolean;
};

function upper(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

export function isTradeType(type: string | null | undefined): boolean {
  const t = upper(type);
  return t === "TRADE" || t.startsWith("TRADE_");
}

export function isTradeDeclineType(type: string | null | undefined): boolean {
  return upper(type) === "TRADE_DECLINE";
}

export function tradeClusterKey(r: TradeDisplayRow): string {
  const t = upper(r.type);
  if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") {
    return String(r.relatedTransactionId || r.transactionId || "");
  }
  return String(r.transactionId || "");
}

/** Map ESPN status / executionType aliases onto display buckets. */
export function normalizeTradeStatusToken(
  status: string | null | undefined,
  type?: string | null,
  executionType?: string | null,
): string {
  const t = upper(type);
  if (t === "TRADE_DECLINE") return "CANCELED";

  const s = upper(status);
  const e = upper(executionType);

  if (s === "COMPLETED" || s === "PROCESSED" || s === "EXECUTED") return "EXECUTED";
  if (e === "PROCESS" && (t === "TRADE_ACCEPT" || t === "TRADE" || t === "TRADE_UPHOLD")) {
    return "EXECUTED";
  }
  if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") {
    if (s === "" || s === "PENDING") return "EXECUTED";
  }
  if (s === "PROPOSED" || s === "PENDING") return "PENDING";
  if (s === "CANCELED" || s === "CANCELLED") return "CANCELED";
  return s;
}

export function rowLooksLikeAsset(r: TradeDisplayRow): boolean {
  const pid = r.playerId != null ? Number(r.playerId) : NaN;
  if (Number.isFinite(pid) && pid > 0) return true;
  const it = upper(r.itemType);
  if (it.includes("DRAFT")) return true;
  const ov = Number(r.overallPickNumber);
  const rd = Number(r.round);
  const pir = Number(r.pickInRound);
  if (Number.isFinite(ov) && ov > 0) return true;
  if (
    (r.playerId == null || !Number.isFinite(pid) || pid <= 0) &&
    ((Number.isFinite(rd) && rd > 0) || (Number.isFinite(pir) && pir > 0))
  ) {
    return true;
  }
  return false;
}

function validTeamId(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Trade parties (not league voters).
 * Prefer asset from/to + TRADE_ACCEPT + TRADE/PROPOSAL item teams.
 * Include TRADE_UPHOLD teamId only when that set has fewer than 2 teams
 * (2026 one side may only appear as an uphold header).
 */
export function tradePartyTeamIds(rows: TradeDisplayRow[]): number[] {
  const fromAssets = new Set<number>();
  const fromAcceptOrItems = new Set<number>();
  const fromUphold = new Set<number>();

  for (const r of rows) {
    const t = upper(r.type);
    if (t === "TRADE_DECLINE") continue;
    if (rowLooksLikeAsset(r)) {
      if (validTeamId(r.fromTeamId)) fromAssets.add(r.fromTeamId);
      if (validTeamId(r.toTeamId)) fromAssets.add(r.toTeamId);
    }
    if (t === "TRADE_ACCEPT") {
      if (validTeamId(r.teamId)) fromAcceptOrItems.add(r.teamId);
      if (validTeamId(r.fromTeamId)) fromAcceptOrItems.add(r.fromTeamId);
      if (validTeamId(r.toTeamId)) fromAcceptOrItems.add(r.toTeamId);
    }
    if (t === "TRADE_PROPOSAL" || t === "TRADE") {
      if (validTeamId(r.fromTeamId)) fromAcceptOrItems.add(r.fromTeamId);
      if (validTeamId(r.toTeamId)) fromAcceptOrItems.add(r.toTeamId);
      if (t === "TRADE" && validTeamId(r.teamId)) fromAcceptOrItems.add(r.teamId);
    }
    if (t === "TRADE_UPHOLD" && validTeamId(r.teamId)) fromUphold.add(r.teamId);
  }

  const primary = new Set<number>([...fromAssets, ...fromAcceptOrItems]);
  if (primary.size >= 2) return [...primary].sort((a, b) => a - b);
  for (const id of fromUphold) primary.add(id);
  return [...primary].sort((a, b) => a - b);
}

export function clusterIsDeclineOnly(rows: TradeDisplayRow[]): boolean {
  const types = rows.map((r) => upper(r.type)).filter(Boolean);
  if (types.length === 0) return false;
  return types.every((t) => t === "TRADE_DECLINE");
}

export function clusterIsExecuted(rows: TradeDisplayRow[]): boolean {
  if (clusterIsDeclineOnly(rows)) return false;
  for (const r of rows) {
    const t = upper(r.type);
    if (t === "TRADE_DECLINE") continue;
    if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") return true;
    const n = normalizeTradeStatusToken(r.status, r.type, r.executionType);
    if (n === "EXECUTED" && (t === "TRADE" || t === "TRADE_PROPOSAL")) return true;
    if (upper(r.executionType) === "PROCESS" && (t === "TRADE" || t === "TRADE_ACCEPT" || t === "TRADE_UPHOLD")) {
      return true;
    }
  }
  return false;
}

export function clusterIsCanceled(rows: TradeDisplayRow[]): boolean {
  if (clusterIsDeclineOnly(rows)) return true;
  if (clusterIsExecuted(rows)) return false;
  return rows.some((r) => {
    const n = normalizeTradeStatusToken(r.status, r.type, r.executionType);
    return n === "CANCELED";
  });
}

export function clusterIsProposed(rows: TradeDisplayRow[]): boolean {
  if (clusterIsExecuted(rows) || clusterIsCanceled(rows)) return false;
  return rows.some((r) => isTradeType(r.type) && !isTradeDeclineType(r.type));
}

export function displayedClusterStatus(rows: TradeDisplayRow[]): string | null {
  if (clusterIsExecuted(rows)) return "EXECUTED";
  if (clusterIsCanceled(rows)) return "CANCELED";
  if (clusterIsProposed(rows)) return "PENDING";
  const any = rows.find((r) => r.status != null && String(r.status).trim() !== "");
  return any?.status != null ? String(any.status) : null;
}

export function clusterMatchesStatusFilter(
  rows: TradeDisplayRow[],
  filter: Exclude<TradeStatusFilter, "ALL">,
): boolean {
  if (filter === "EXECUTED") return clusterIsExecuted(rows);
  if (filter === "CANCELED") return clusterIsCanceled(rows);
  return clusterIsProposed(rows);
}

export function evaluateTradeCluster(key: string, rows: TradeDisplayRow[]): TradeClusterEval {
  const types = [...new Set(rows.map((r) => String(r.type || "")).filter(Boolean))];
  const statuses = [...new Set(rows.map((r) => String(r.status ?? "")).filter((s) => s !== ""))];
  const execTypes = [...new Set(rows.map((r) => String(r.executionType || "")).filter(Boolean))];
  const teams = tradePartyTeamIds(rows);
  const assetCount = rows.filter(rowLooksLikeAsset).length;
  const executed = clusterIsExecuted(rows);

  if (clusterIsDeclineOnly(rows)) {
    return {
      key,
      ok: false,
      reason: "trade_decline (not a completed trade)",
      types,
      statuses,
      execTypes,
      teams,
      assetCount,
      executed,
    };
  }

  if (assetCount === 0) {
    if (executed && teams.length >= 2) {
      return {
        key,
        ok: true,
        reason: "kept_executed_headers (assets unavailable)",
        types,
        statuses,
        execTypes,
        teams,
        assetCount,
        executed,
      };
    }
    if (teams.length < 2) {
      return {
        key,
        ok: false,
        reason: `fewer_than_2_teams (${teams.length})`,
        types,
        statuses,
        execTypes,
        teams,
        assetCount,
        executed,
      };
    }
    return {
      key,
      ok: false,
      reason: "no_assets (isMeaningfulEntry trade)",
      types,
      statuses,
      execTypes,
      teams,
      assetCount,
      executed,
    };
  }

  if (teams.length < 2) {
    return {
      key,
      ok: false,
      reason: `fewer_than_2_teams (${teams.length})`,
      types,
      statuses,
      execTypes,
      teams,
      assetCount,
      executed,
    };
  }

  return {
    key,
    ok: true,
    reason: "kept",
    types,
    statuses,
    execTypes,
    teams,
    assetCount,
    executed,
  };
}

export function clusterTradeRows<T extends TradeDisplayRow>(rows: T[]): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    if (!isTradeType(r.type)) continue;
    const k = tradeClusterKey(r);
    if (!k) continue;
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }
  return buckets;
}

export function orphanExecutedProposalIds(rows: TradeDisplayRow[]): string[] {
  const proposalIds = new Set(
    rows
      .filter((r) => upper(r.type) === "TRADE_PROPOSAL")
      .map((r) => String(r.transactionId || "").trim())
      .filter(Boolean),
  );
  const orphans = new Set<string>();
  for (const r of rows) {
    const t = upper(r.type);
    if (t !== "TRADE_UPHOLD" && t !== "TRADE_ACCEPT") continue;
    const rel = String(r.relatedTransactionId || "").trim();
    if (rel && !proposalIds.has(rel)) orphans.add(rel);
  }
  return [...orphans];
}

export type TradePipelineSummary = {
  rawTradeRows: number;
  clusterCount: number;
  displayedTrades: number;
  filteredTrades: number;
  executedClusters: number;
  displayedExecuted: number;
  filtered: TradeClusterEval[];
  kept: TradeClusterEval[];
};

export function summarizeTradePipeline<T extends TradeDisplayRow>(
  rows: T[],
  statusFilter: TradeStatusFilter = "ALL",
): TradePipelineSummary {
  const tradeRows = rows.filter((r) => isTradeType(r.type));
  const buckets = clusterTradeRows(tradeRows);
  const kept: TradeClusterEval[] = [];
  const filtered: TradeClusterEval[] = [];

  for (const [key, group] of buckets) {
    if (statusFilter !== "ALL" && !clusterMatchesStatusFilter(group, statusFilter)) {
      filtered.push({
        ...evaluateTradeCluster(key, group),
        ok: false,
        reason: `status_filter_${statusFilter.toLowerCase()}`,
      });
      continue;
    }
    const evald = evaluateTradeCluster(key, group);
    if (evald.ok) kept.push(evald);
    else filtered.push(evald);
  }

  return {
    rawTradeRows: tradeRows.length,
    clusterCount: buckets.size,
    displayedTrades: kept.length,
    filteredTrades: filtered.length,
    executedClusters: [...buckets.values()].filter((g) => clusterIsExecuted(g)).length,
    displayedExecuted: kept.filter((k) => k.executed).length,
    filtered,
    kept,
  };
}
