/**
 * completedTradeAuthority.ts
 *
 * Single source of truth for completed trade clusters from gmTransactions.
 * Pick valuation and winner comparison delegate to tradePickValueAuthority.
 * No LLM verdicts. No ESPN raw cache reads.
 */
import { and, eq, inArray } from "drizzle-orm";
import { gmRosterEntries, gmTeams, gmTransactions } from "../drizzle/schema";
import type { AppDb } from "./db";
import { buildOwnerIdentityAuthority } from "./ownerIdentityAuthority";
import { calcVORP, calcROSValue, type PlayerRow } from "./analytics";
import {
  compareReceivedSideTotals,
  resolveAndValueTradePick,
  type TradeWinner,
} from "./tradePickValueAuthority";
import {
  dedupeTradeLegAssets,
  formatTradeLegAssetLabel,
  isDraftPickLeg,
  tradeAssetsFromGmLegs,
  tradeClusterKeyFromLeg,
  type TradeLegAsset,
} from "./transactionPersist";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompletedTradeKind = "pick_only" | "player_only" | "mixed";

export type TradeConfidence = "high" | "medium" | "low";

export interface CompletedTradeAssetIntel {
  kind: "player" | "pick";
  displayLabel: string;
  playerId: number | null;
  position: string | null;
  pickSeason: number | null;
  round: number | null;
  pickInRound: number | null;
  rawValue: number;
}

export interface CompletedTradeSideIntel {
  teamId: number;
  ownerKey: string | null;
  ownerName: string;
  teamName: string;
  assetsReceived: CompletedTradeAssetIntel[];
  valueReceived: number;
}

export interface CompletedTradeIntel {
  clusterId: string;
  tradeId: string;
  season: number;
  processedDate: number;
  kind: CompletedTradeKind;
  sideA: CompletedTradeSideIntel;
  sideB: CompletedTradeSideIntel;
  /** Team id of winner; null when even. */
  winnerTeamId: number | null;
  winnerOwnerKey: string | null;
  loserTeamId: number | null;
  loserOwnerKey: string | null;
  margin: number;
  verdictLabel: string;
  confidence: TradeConfidence;
  receiptText: string;
  /** Side A received minus side B received (signed). */
  netValueA: number;
}

export interface OwnerTradeHistorySummary {
  ownerKey: string;
  ownerName: string;
  tradeCount: number;
  wins: number;
  losses: number;
  ties: number;
  pickOnlyCount: number;
  playerOnlyCount: number;
  mixedCount: number;
  totalValueGained: number;
  totalValueLost: number;
  netValue: number;
  biggestWin: CompletedTradeIntel | null;
  biggestLoss: CompletedTradeIntel | null;
  trades: OwnerTradeHistoryEntry[];
}

export interface OwnerTradeHistoryEntry {
  trade: CompletedTradeIntel;
  ownerSide: "A" | "B";
  result: "win" | "loss" | "tie";
  valueReceived: number;
  valueGiven: number;
  netReceived: number;
}

export interface RivalryTradeLedger {
  ownerAKey: string;
  ownerBKey: string;
  ownerAName: string;
  ownerBName: string;
  tradeCount: number;
  /** Wins for owner A by value verdict. */
  recordA: number;
  recordB: number;
  ties: number;
  ledgerWinnerKey: string | null;
  ledgerWinnerName: string | null;
  biggestFleece: CompletedTradeIntel | null;
  mostBalanced: CompletedTradeIntel | null;
  trades: RivalryTradeEntry[];
}

export interface RivalryTradeEntry {
  trade: CompletedTradeIntel;
  winnerOwnerKey: string | null;
  margin: number;
}

export interface NotoriousTradesReport {
  biggestValueGap: CompletedTradeIntel | null;
  mostLopsided: CompletedTradeIntel | null;
  closestFairTrade: CompletedTradeIntel | null;
  biggestPickOnlyGap: CompletedTradeIntel | null;
  biggestPlayerTrade: CompletedTradeIntel | null;
  biggestMixedTrade: CompletedTradeIntel | null;
  mostActivePair: { ownerAKey: string; ownerBKey: string; ownerAName: string; ownerBName: string; count: number } | null;
  mostSuccessfulOwner: { ownerKey: string; ownerName: string; wins: number; netValue: number } | null;
  rankedByMargin: CompletedTradeIntel[];
}

// ── Internal row shape ────────────────────────────────────────────────────────

export type GmTradeLegRow = {
  season: number;
  transactionId: string;
  relatedTransactionId: string | null;
  type: string;
  status: string;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  fromTeamId: number | null;
  toTeamId: number | null;
  itemType: string | null;
  round: number | null;
  pickInRound: number | null;
  overallPickNumber: number | null;
  pickSeason: number | null;
  legIndex: number;
  proposedDate: number | null;
  processedDate: number | null;
};

type TeamMeta = {
  ownerName: string;
  teamName: string;
  ownerKey: string | null;
};

type SeasonGeometry = { teamCount: number; roundCount: number };

type PlayerValueRow = {
  playerId: number;
  playerName: string;
  position: string;
  avgPoints: number;
  compositeValue: number;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function normStatus(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase();
}

function isTradeType(type: string | undefined): boolean {
  const t = (type || "").toUpperCase();
  return t === "TRADE" || t.startsWith("TRADE_");
}

function eventMs(processedDate: number | null, proposedDate: number | null): number {
  const p = processedDate != null ? Number(processedDate) : NaN;
  if (Number.isFinite(p) && p > 0) return p;
  const d = proposedDate != null ? Number(proposedDate) : 0;
  return Number.isFinite(d) ? d : 0;
}

function isCompletedLeg(r: GmTradeLegRow): boolean {
  const st = normStatus(r.status);
  if (st === "EXECUTED") return true;
  if (st === "" && eventMs(r.processedDate, r.proposedDate) > 0) {
    const typ = (r.type || "").toUpperCase();
    if (typ === "ADD" || typ === "DROP" || typ === "WAIVER" || typ === "FREEAGENT" || typ === "ROSTER") {
      return true;
    }
  }
  return false;
}

function isExecutedTradeCluster(group: GmTradeLegRow[]): boolean {
  return group.some((r) => {
    const t = (r.type || "").toUpperCase();
    if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") {
      return normStatus(r.status) === "EXECUTED" || normStatus(r.status) === "";
    }
    if (t === "TRADE" && normStatus(r.status) === "EXECUTED") return true;
    if (t === "TRADE_PROPOSAL" && normStatus(r.status) === "EXECUTED") return true;
    return false;
  });
}

/** Prefer TRADE_PROPOSAL / TRADE legs with full pick metadata; keep player legs from legacy TRADE rows. */
export function selectLegsForAssetReconstruction(group: GmTradeLegRow[]): GmTradeLegRow[] {
  const proposals = group.filter((r) => r.type === "TRADE_PROPOSAL");
  const legacy = group.filter((r) => r.type === "TRADE");

  if (tradeAssetsFromGmLegs(proposals).length > 0) {
    const merged = [...proposals];
    for (const r of legacy) {
      if (r.playerId != null && r.playerId > 0) merged.push(r);
    }
    if (tradeAssetsFromGmLegs(merged).length > 0) return merged;
  }
  if (tradeAssetsFromGmLegs(legacy).length > 0) return legacy;
  return group;
}

function classifyTradeKind(assets: TradeLegAsset[]): CompletedTradeKind {
  const hasPlayer = assets.some((a) => a.playerId != null && a.playerId > 0);
  const hasPick = assets.some((a) => isDraftPickLeg(a));
  if (hasPlayer && hasPick) return "mixed";
  if (hasPick) return "pick_only";
  return "player_only";
}

function playerCompositeFromAvg(avgPoints: number, position: string, vorp: number): number {
  const fakePlayer: PlayerRow = {
    playerId: 0,
    playerName: "",
    position,
    teamId: 0,
    ownerName: "",
    seasonPoints: 0,
    avgPoints,
    projectedTotal: null,
    keeperValue: 0,
    keeperValueFuture: 0,
    injuryStatus: "",
    appliedStats: {},
  };
  const rosResults = calcROSValue([fakePlayer], 10);
  const rosAdjusted = rosResults[0]?.rosAdjusted ?? avgPoints * 10;
  return Math.round(rosAdjusted + vorp * 5);
}

function assetToIntel(
  asset: TradeLegAsset,
  season: number,
  geometry: SeasonGeometry,
  playerValues: Map<number, PlayerValueRow>,
): CompletedTradeAssetIntel {
  const hasPlayer = asset.playerId != null && asset.playerId > 0;
  if (hasPlayer) {
    const pv = playerValues.get(asset.playerId!);
    const pos = asset.position || pv?.position || "?";
    const label = formatTradeLegAssetLabel(asset, season);
    const rawValue = pv?.compositeValue ?? 0;
    return {
      kind: "player",
      displayLabel: label,
      playerId: asset.playerId,
      position: pos,
      pickSeason: null,
      round: null,
      pickInRound: null,
      rawValue,
    };
  }

  const resolved = resolveAndValueTradePick({
    round: asset.round,
    pickInRound: asset.pickInRound,
    overallPickNumber: asset.overallPickNumber,
    teamCount: geometry.teamCount,
    roundCount: geometry.roundCount,
    scale: "raw",
  });
  return {
    kind: "pick",
    displayLabel: formatTradeLegAssetLabel(asset, season),
    playerId: null,
    position: null,
    pickSeason: asset.pickSeason ?? season,
    round: resolved.round > 0 ? resolved.round : asset.round,
    pickInRound: resolved.pickInRound > 0 ? resolved.pickInRound : asset.pickInRound,
    rawValue: resolved.rawValue,
  };
}

function assessConfidence(assets: CompletedTradeAssetIntel[], kind: CompletedTradeKind): TradeConfidence {
  if (assets.length === 0) return "low";
  if (kind === "pick_only") {
    const unknown = assets.filter((a) => a.kind === "pick" && a.rawValue <= 0);
    if (unknown.length === 0) return "high";
    if (unknown.length < assets.length) return "medium";
    return "low";
  }
  if (kind === "player_only") {
    const missing = assets.filter((a) => a.kind === "player" && a.rawValue <= 0);
    if (missing.length === 0) return "high";
    if (missing.length < assets.length) return "medium";
    return "low";
  }
  const zero = assets.filter((a) => a.rawValue <= 0);
  if (zero.length === 0) return "high";
  if (zero.length <= Math.floor(assets.length / 2)) return "medium";
  return "low";
}

function buildReceiptText(args: {
  sideA: CompletedTradeSideIntel;
  sideB: CompletedTradeSideIntel;
  winnerTeamId: number | null;
  margin: number;
  verdictLabel: string;
}): string {
  const fmtSide = (s: CompletedTradeSideIntel) => {
    const items = s.assetsReceived.map((a) => a.displayLabel);
    return items.length ? items.join(", ") : "nothing";
  };
  const aLine = `${args.sideA.ownerName} received: ${fmtSide(args.sideA)}.`;
  const bLine = `${args.sideB.ownerName} received: ${fmtSide(args.sideB)}.`;
  if (args.winnerTeamId == null) {
    return `Even trade (${args.verdictLabel}). ${aLine} ${bLine}`;
  }
  const winner =
    args.winnerTeamId === args.sideA.teamId ? args.sideA.ownerName : args.sideB.ownerName;
  return `${winner} won the trade by ${Math.round(args.margin)} value points (${args.verdictLabel}). ${aLine} ${bLine}`;
}

function winnerToTeamId(winner: TradeWinner, teamAId: number, teamBId: number): number | null {
  if (winner === "A") return teamAId;
  if (winner === "B") return teamBId;
  return null;
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadTeamMeta(
  db: AppDb,
  leagueId: string,
  seasons: number[],
): Promise<{ teamMeta: Map<string, TeamMeta>; identity: Awaited<ReturnType<typeof buildOwnerIdentityAuthority>> }> {
  const identity = await buildOwnerIdentityAuthority(leagueId);
  const teamRows = await db
    .select({
      season: gmTeams.season,
      teamId: gmTeams.teamId,
      name: gmTeams.name,
      ownerName: gmTeams.ownerName,
    })
    .from(gmTeams)
    .where(and(eq(gmTeams.leagueId, leagueId), inArray(gmTeams.season, seasons)));

  const teamMeta = new Map<string, TeamMeta>();
  for (const t of teamRows) {
    const tid = Number(t.teamId);
    if (!tid) continue;
    const res = identity.resolve(t.season, tid);
    const own = String(t.ownerName ?? "").trim();
    const nm = String(t.name ?? "").trim();
    teamMeta.set(`${t.season}:${tid}`, {
      ownerName: res.canonicalName || own || nm || `Team ${tid}`,
      teamName: nm || `Team ${tid}`,
      ownerKey: res.canonicalPersonId,
    });
  }
  return { teamMeta, identity };
}

async function loadSeasonGeometry(
  db: AppDb,
  leagueId: string,
  seasons: number[],
): Promise<Map<number, SeasonGeometry>> {
  const out = new Map<number, SeasonGeometry>();
  for (const season of seasons) {
    const rows = await db
      .select({ teamId: gmTeams.teamId })
      .from(gmTeams)
      .where(and(eq(gmTeams.leagueId, leagueId), eq(gmTeams.season, season)));
    const teamCount = rows.filter((r) => Number(r.teamId) > 0).length;
    out.set(season, { teamCount: Math.max(teamCount, 1), roundCount: 20 });
  }
  return out;
}

async function loadPlayerValuesForSeason(
  db: AppDb,
  leagueId: string,
  season: number,
): Promise<Map<number, PlayerValueRow>> {
  const rows = await db
    .select({
      playerId: gmRosterEntries.playerId,
      playerName: gmRosterEntries.playerName,
      position: gmRosterEntries.position,
      actualPoints: gmRosterEntries.actualPoints,
      week: gmRosterEntries.week,
    })
    .from(gmRosterEntries)
    .where(and(eq(gmRosterEntries.leagueId, leagueId), eq(gmRosterEntries.season, season)));

  const byPlayer = new Map<number, { name: string; position: string; points: number[] }>();
  for (const r of rows) {
    const pid = Number(r.playerId);
    if (!pid) continue;
    const pts = Number(r.actualPoints ?? 0);
    const cur = byPlayer.get(pid) ?? {
      name: String(r.playerName ?? ""),
      position: String(r.position ?? "?"),
      points: [],
    };
    if (pts > 0) cur.points.push(pts);
    byPlayer.set(pid, cur);
  }

  const playerRows: PlayerRow[] = [];
  const avgById = new Map<number, number>();
  for (const [pid, info] of byPlayer) {
    const avg =
      info.points.length > 0
        ? info.points.reduce((s, v) => s + v, 0) / info.points.length
        : 0;
    avgById.set(pid, avg);
    playerRows.push({
      playerId: pid,
      playerName: info.name,
      position: info.position,
      teamId: 0,
      ownerName: "",
      seasonPoints: 0,
      avgPoints: avg,
      projectedTotal: null,
      keeperValue: 0,
      keeperValueFuture: 0,
      injuryStatus: "",
      appliedStats: {},
    });
  }

  const vorpMap = new Map<number, number>();
  try {
    for (const v of calcVORP(playerRows)) {
      if (v.playerId) vorpMap.set(v.playerId, v.vorp);
    }
  } catch {
    /* non-fatal */
  }

  const out = new Map<number, PlayerValueRow>();
  for (const [pid, info] of byPlayer) {
    const avg = avgById.get(pid) ?? 0;
    const vorp = vorpMap.get(pid) ?? 0;
    out.set(pid, {
      playerId: pid,
      playerName: info.name,
      position: info.position,
      avgPoints: avg,
      compositeValue: playerCompositeFromAvg(avg, info.position, vorp),
    });
  }
  return out;
}

export async function loadGmTradeLegs(
  db: AppDb,
  leagueId: string,
  seasons: number[],
): Promise<GmTradeLegRow[]> {
  if (seasons.length === 0) return [];
  const rows = await db
    .select({
      season: gmTransactions.season,
      transactionId: gmTransactions.transactionId,
      relatedTransactionId: gmTransactions.relatedTransactionId,
      type: gmTransactions.type,
      status: gmTransactions.status,
      playerId: gmTransactions.playerId,
      playerName: gmTransactions.playerName,
      position: gmTransactions.position,
      fromTeamId: gmTransactions.fromTeamId,
      toTeamId: gmTransactions.toTeamId,
      itemType: gmTransactions.itemType,
      round: gmTransactions.round,
      pickInRound: gmTransactions.pickInRound,
      overallPickNumber: gmTransactions.overallPickNumber,
      pickSeason: gmTransactions.pickSeason,
      legIndex: gmTransactions.legIndex,
      proposedDate: gmTransactions.proposedDate,
      processedDate: gmTransactions.processedDate,
    })
    .from(gmTransactions)
    .where(and(eq(gmTransactions.leagueId, leagueId), inArray(gmTransactions.season, seasons)));

  return rows.filter((r) => isTradeType(r.type));
}

function clusterCompletedTradeLegs(legs: GmTradeLegRow[]): Map<string, GmTradeLegRow[]> {
  const completed = legs.filter(isCompletedLeg);
  const buckets = new Map<string, GmTradeLegRow[]>();
  for (const r of completed) {
    const key = tradeClusterKeyFromLeg(r);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }
  const executed = new Map<string, GmTradeLegRow[]>();
  for (const [key, group] of buckets) {
    if (isExecutedTradeCluster(group)) executed.set(key, group);
  }
  return executed;
}

function buildSideIntel(
  teamId: number,
  season: number,
  assets: TradeLegAsset[],
  teamMeta: Map<string, TeamMeta>,
  geometry: SeasonGeometry,
  playerValues: Map<number, PlayerValueRow>,
): CompletedTradeSideIntel {
  const meta = teamMeta.get(`${season}:${teamId}`);
  const received = assets.filter((a) => a.toTeamId === teamId);
  const intelAssets = dedupeTradeLegAssets(received).map((a) =>
    assetToIntel(a, season, geometry, playerValues),
  );
  const valueReceived = intelAssets.reduce((s, a) => s + a.rawValue, 0);
  return {
    teamId,
    ownerKey: meta?.ownerKey ?? null,
    ownerName: meta?.ownerName ?? `Team ${teamId}`,
    teamName: meta?.teamName ?? `Team ${teamId}`,
    assetsReceived: intelAssets,
    valueReceived,
  };
}

export function buildCompletedTradeIntelFromLegs(args: {
  clusterId: string;
  legs: GmTradeLegRow[];
  teamMeta: Map<string, TeamMeta>;
  geometryBySeason: Map<number, SeasonGeometry>;
  playerValuesBySeason: Map<number, Map<number, PlayerValueRow>>;
}): CompletedTradeIntel | null {
  const assetLegs = selectLegsForAssetReconstruction(args.legs);
  const assets = tradeAssetsFromGmLegs(assetLegs);
  if (assets.length === 0) return null;

  const season = args.legs[0]!.season;
  const geometry = args.geometryBySeason.get(season) ?? { teamCount: 14, roundCount: 20 };
  const playerValues = args.playerValuesBySeason.get(season) ?? new Map();

  const teamIds = new Set<number>();
  for (const a of assets) {
    if (a.fromTeamId != null && a.fromTeamId > 0) teamIds.add(a.fromTeamId);
    if (a.toTeamId != null && a.toTeamId > 0) teamIds.add(a.toTeamId);
  }
  if (teamIds.size < 2) return null;

  const [teamAId, teamBId] = [...teamIds].sort((a, b) => a - b);
  const sideA = buildSideIntel(teamAId, season, assets, args.teamMeta, geometry, playerValues);
  const sideB = buildSideIntel(teamBId, season, assets, args.teamMeta, geometry, playerValues);

  const cmp = compareReceivedSideTotals(sideA.valueReceived, sideB.valueReceived);
  const winnerTeamId = winnerToTeamId(cmp.winner, teamAId, teamBId);
  const loserTeamId =
    winnerTeamId == null ? null : winnerTeamId === teamAId ? teamBId : teamAId;

  const kind = classifyTradeKind(assets);
  const allAssets = [...sideA.assetsReceived, ...sideB.assetsReceived];
  const confidence = assessConfidence(allAssets, kind);
  const processedDate = Math.max(0, ...args.legs.map((r) => eventMs(r.processedDate, r.proposedDate)));
  const tradeId = args.legs.find((r) => r.type === "TRADE_PROPOSAL")?.transactionId ?? args.clusterId;

  const receiptText = buildReceiptText({
    sideA,
    sideB,
    winnerTeamId,
    margin: cmp.margin,
    verdictLabel: cmp.fairnessGrade,
  });

  return {
    clusterId: args.clusterId,
    tradeId,
    season,
    processedDate,
    kind,
    sideA,
    sideB,
    winnerTeamId,
    winnerOwnerKey:
      winnerTeamId == null
        ? null
        : winnerTeamId === teamAId
          ? sideA.ownerKey
          : sideB.ownerKey,
    loserTeamId,
    loserOwnerKey:
      loserTeamId == null ? null : loserTeamId === teamAId ? sideA.ownerKey : sideB.ownerKey,
    margin: cmp.margin,
    verdictLabel: cmp.fairnessGrade,
    confidence,
    receiptText,
    netValueA: sideA.valueReceived - sideB.valueReceived,
  };
}

/** Load all completed trades for a league across seasons (newest first). */
export async function loadCompletedTradeIntelligence(args: {
  db: AppDb;
  leagueId: string;
  seasons: number[];
}): Promise<CompletedTradeIntel[]> {
  const seasons = [...new Set(args.seasons.filter((s) => Number.isFinite(s) && s > 0))].sort((a, b) => a - b);
  if (seasons.length === 0) return [];

  const { teamMeta } = await loadTeamMeta(args.db, args.leagueId, seasons);
  const geometryBySeason = await loadSeasonGeometry(args.db, args.leagueId, seasons);
  const playerValuesBySeason = new Map<number, Map<number, PlayerValueRow>>();
  for (const s of seasons) {
    playerValuesBySeason.set(s, await loadPlayerValuesForSeason(args.db, args.leagueId, s));
  }

  const legs = await loadGmTradeLegs(args.db, args.leagueId, seasons);
  const clusters = clusterCompletedTradeLegs(legs);
  const trades: CompletedTradeIntel[] = [];

  for (const [clusterId, group] of clusters) {
    const intel = buildCompletedTradeIntelFromLegs({
      clusterId,
      legs: group,
      teamMeta,
      geometryBySeason,
      playerValuesBySeason,
    });
    if (intel) trades.push(intel);
  }

  trades.sort((a, b) => b.processedDate - a.processedDate);
  return trades;
}

// ── Owner history ─────────────────────────────────────────────────────────────

function ownerInTrade(trade: CompletedTradeIntel, ownerKey: string): "A" | "B" | null {
  if (trade.sideA.ownerKey === ownerKey) return "A";
  if (trade.sideB.ownerKey === ownerKey) return "B";
  return null;
}

function sideFor(trade: CompletedTradeIntel, which: "A" | "B"): CompletedTradeSideIntel {
  return which === "A" ? trade.sideA : trade.sideB;
}

function opponentSide(trade: CompletedTradeIntel, which: "A" | "B"): CompletedTradeSideIntel {
  return which === "A" ? trade.sideB : trade.sideA;
}

export function buildOwnerTradeHistory(
  trades: CompletedTradeIntel[],
  ownerKey: string,
  ownerName = "Owner",
): OwnerTradeHistorySummary {
  const entries: OwnerTradeHistoryEntry[] = [];
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let pickOnly = 0;
  let playerOnly = 0;
  let mixed = 0;
  let totalGained = 0;
  let totalLost = 0;
  let biggestWin: CompletedTradeIntel | null = null;
  let biggestLoss: CompletedTradeIntel | null = null;
  let maxWinMargin = -1;
  let maxLossMargin = -1;

  for (const trade of trades) {
    const side = ownerInTrade(trade, ownerKey);
    if (!side) continue;

    const mine = sideFor(trade, side);
    const opp = opponentSide(trade, side);
    const net = mine.valueReceived - opp.valueReceived;

    let result: "win" | "loss" | "tie" = "tie";
    if (trade.winnerTeamId === mine.teamId) {
      result = "win";
      wins++;
      totalGained += trade.margin;
      if (trade.margin > maxWinMargin) {
        maxWinMargin = trade.margin;
        biggestWin = trade;
      }
    } else if (trade.winnerTeamId === opp.teamId) {
      result = "loss";
      losses++;
      totalLost += trade.margin;
      if (trade.margin > maxLossMargin) {
        maxLossMargin = trade.margin;
        biggestLoss = trade;
      }
    } else {
      ties++;
    }

    if (trade.kind === "pick_only") pickOnly++;
    else if (trade.kind === "player_only") playerOnly++;
    else mixed++;

    entries.push({
      trade,
      ownerSide: side,
      result,
      valueReceived: mine.valueReceived,
      valueGiven: opp.valueReceived,
      netReceived: net,
    });
  }

  entries.sort((a, b) => b.trade.processedDate - a.trade.processedDate);

  return {
    ownerKey,
    ownerName: entries[0] ? sideFor(entries[0].trade, entries[0].ownerSide).ownerName : ownerName,
    tradeCount: entries.length,
    wins,
    losses,
    ties,
    pickOnlyCount: pickOnly,
    playerOnlyCount: playerOnly,
    mixedCount: mixed,
    totalValueGained: Math.round(totalGained),
    totalValueLost: Math.round(totalLost),
    netValue: Math.round(totalGained - totalLost),
    biggestWin,
    biggestLoss,
    trades: entries,
  };
}

// ── Rivalry ledger ────────────────────────────────────────────────────────────

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function buildRivalryTradeLedger(
  trades: CompletedTradeIntel[],
  ownerAKey: string,
  ownerBKey: string,
  ownerAName = "Owner A",
  ownerBName = "Owner B",
): RivalryTradeLedger {
  const entries: RivalryTradeEntry[] = [];
  let recordA = 0;
  let recordB = 0;
  let ties = 0;
  let biggestFleece: CompletedTradeIntel | null = null;
  let maxMargin = -1;
  let mostBalanced: CompletedTradeIntel | null = null;
  let minMargin = Number.POSITIVE_INFINITY;

  for (const trade of trades) {
    const hasA = ownerInTrade(trade, ownerAKey) != null;
    const hasB = ownerInTrade(trade, ownerBKey) != null;
    if (!hasA || !hasB) continue;

    entries.push({
      trade,
      winnerOwnerKey: trade.winnerOwnerKey,
      margin: trade.margin,
    });

    if (trade.winnerOwnerKey === ownerAKey) recordA++;
    else if (trade.winnerOwnerKey === ownerBKey) recordB++;
    else ties++;

    if (trade.margin > maxMargin) {
      maxMargin = trade.margin;
      biggestFleece = trade;
    }
    if (trade.margin < minMargin) {
      minMargin = trade.margin;
      mostBalanced = trade;
    }
  }

  entries.sort((a, b) => b.trade.processedDate - a.trade.processedDate);

  let ledgerWinnerKey: string | null = null;
  if (recordA > recordB) ledgerWinnerKey = ownerAKey;
  else if (recordB > recordA) ledgerWinnerKey = ownerBKey;

  return {
    ownerAKey,
    ownerBKey,
    ownerAName,
    ownerBName,
    tradeCount: entries.length,
    recordA,
    recordB,
    ties,
    ledgerWinnerKey,
    ledgerWinnerName:
      ledgerWinnerKey === ownerAKey ? ownerAName : ledgerWinnerKey === ownerBKey ? ownerBName : null,
    biggestFleece,
    mostBalanced: entries.length > 0 ? mostBalanced : null,
    trades: entries,
  };
}

// ── Notorious trades ──────────────────────────────────────────────────────────

export function buildNotoriousTradesReport(trades: CompletedTradeIntel[]): NotoriousTradesReport {
  const ranked = [...trades].sort((a, b) => b.margin - a.margin);
  const pickOnly = trades.filter((t) => t.kind === "pick_only");
  const playerOnly = trades.filter((t) => t.kind === "player_only");
  const mixed = trades.filter((t) => t.kind === "mixed");
  const lopsided = trades.filter((t) => t.verdictLabel === "LOPSIDED");
  const fairish = trades.filter(
    (t) => t.verdictLabel === "FAIR" || t.winnerTeamId == null,
  );

  const pairCounts = new Map<string, { a: string; b: string; aName: string; bName: string; n: number }>();
  for (const t of trades) {
    const ka = t.sideA.ownerKey;
    const kb = t.sideB.ownerKey;
    if (!ka || !kb || ka === kb) continue;
    const key = pairKey(ka, kb);
    const cur = pairCounts.get(key) ?? {
      a: ka,
      b: kb,
      aName: t.sideA.ownerName,
      bName: t.sideB.ownerName,
      n: 0,
    };
    cur.n++;
    pairCounts.set(key, cur);
  }
  let mostActivePair: NotoriousTradesReport["mostActivePair"] = null;
  for (const p of pairCounts.values()) {
    if (!mostActivePair || p.n > mostActivePair.count) {
      mostActivePair = {
        ownerAKey: p.a,
        ownerBKey: p.b,
        ownerAName: p.aName,
        ownerBName: p.bName,
        count: p.n,
      };
    }
  }

  const winCounts = new Map<string, { name: string; wins: number; net: number }>();
  for (const t of trades) {
    if (!t.winnerOwnerKey) continue;
    const side =
      t.winnerOwnerKey === t.sideA.ownerKey
        ? t.sideA
        : t.winnerOwnerKey === t.sideB.ownerKey
          ? t.sideB
          : null;
    if (!side?.ownerKey) continue;
    const cur = winCounts.get(side.ownerKey) ?? { name: side.ownerName, wins: 0, net: 0 };
    cur.wins++;
    cur.net += t.margin;
    winCounts.set(side.ownerKey, cur);
  }
  let mostSuccessfulOwner: NotoriousTradesReport["mostSuccessfulOwner"] = null;
  for (const [key, v] of winCounts) {
    if (
      !mostSuccessfulOwner ||
      v.wins > mostSuccessfulOwner.wins ||
      (v.wins === mostSuccessfulOwner.wins && v.net > mostSuccessfulOwner.netValue)
    ) {
      mostSuccessfulOwner = { ownerKey: key, ownerName: v.name, wins: v.wins, netValue: Math.round(v.net) };
    }
  }

  return {
    biggestValueGap: ranked[0] ?? null,
    mostLopsided: lopsided.sort((a, b) => b.margin - a.margin)[0] ?? null,
    closestFairTrade: fairish.sort((a, b) => a.margin - b.margin)[0] ?? null,
    biggestPickOnlyGap: [...pickOnly].sort((a, b) => b.margin - a.margin)[0] ?? null,
    biggestPlayerTrade: [...playerOnly].sort((a, b) => b.margin - a.margin)[0] ?? null,
    biggestMixedTrade: [...mixed].sort((a, b) => b.margin - a.margin)[0] ?? null,
    mostActivePair,
    mostSuccessfulOwner,
    rankedByMargin: ranked,
  };
}

/** Resolve owner key by display name match (first exact canonical name). */
export function findOwnerKeyByName(
  trades: CompletedTradeIntel[],
  nameSubstring: string,
): { ownerKey: string; ownerName: string } | null {
  const q = nameSubstring.trim().toLowerCase();
  if (!q) return null;
  for (const t of trades) {
    for (const s of [t.sideA, t.sideB]) {
      if (s.ownerKey && s.ownerName.toLowerCase().includes(q)) {
        return { ownerKey: s.ownerKey, ownerName: s.ownerName };
      }
    }
  }
  return null;
}
