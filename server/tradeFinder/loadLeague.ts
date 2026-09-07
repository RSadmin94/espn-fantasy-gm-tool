/**
 * Assemble a TradeFinderLeague from ESPN combined-cache payload + canonical values.
 * Valuation still comes from Market Value / calcTradeValue / tradePickValueAuthority.
 */
import { calcKeeperEfficiency, calcROSValue, calcTradeValue, calcVORP, type PlayerRow } from "../analytics";
import { computeMarketValues, type MarketValueResult } from "../marketValue";
import { normalizeRosters, normalizeTeams } from "../espnService";
import { resolveAndValueTradePick } from "../tradePickValueAuthority";
import type {
  ManagerBehaviorEvidence,
  TradeFinderAsset,
  TradeFinderLeague,
  TradeFinderPick,
  TradeFinderTeam,
} from "./types";
import { DEFAULT_ROSTER_SLOTS } from "./types";
import { canonicalPosition, isStarterSlot, isUnavailable, rosterSlotsFromLineupSlotCounts } from "./positions";

type Row = Record<string, unknown>;

function weeklyProjection(r: Row): number | null {
  const avg = Number(r.appliedAverage);
  if (Number.isFinite(avg) && avg > 0) return Math.round(avg * 10) / 10;
  const proj = Number(r.projectedTotal);
  if (Number.isFinite(proj) && proj > 0) return Math.round((proj / 17) * 10) / 10;
  return null;
}

export function extractLineupSlotCounts(payload: Record<string, unknown>): Record<string, unknown> | null {
  const settings = payload.settings as Record<string, unknown> | undefined;
  const rosterSettings = settings?.rosterSettings as Record<string, unknown> | undefined;
  const counts = rosterSettings?.lineupSlotCounts as Record<string, unknown> | undefined;
  return counts && typeof counts === "object" ? counts : null;
}

export function buildPlayerRows(rosters: Row[]): PlayerRow[] {
  return rosters.map((r) => ({
    playerId: Number(r.playerId) || 0,
    playerName: String(r.playerName ?? ""),
    position: String(r.position ?? ""),
    avgPoints: Number(r.appliedAverage ?? r.avgPoints ?? 0) || 0,
    seasonPoints: Number(r.appliedTotal ?? 0) || 0,
    teamId: Number(r.teamId) || 0,
    ownerName: String(r.ownerName ?? r.teamName ?? ""),
    projectedTotal: r.projectedTotal == null ? null : Number(r.projectedTotal),
    keeperValue: Number(r.keeperValue ?? 0) || 0,
    keeperValueFuture: Number(r.keeperValueFuture ?? 0) || 0,
    injuryStatus: String(r.injuryStatus ?? ""),
    appliedStats: {},
  }));
}

export function assembleMarketValueInputs(args: {
  payload: Record<string, unknown>;
  players: PlayerRow[];
  season: number;
  weeklyById?: Map<number, Map<number, Map<number, number>>>;
  keeperSavingsById?: Map<number, number>;
}): Map<number, MarketValueResult> {
  type Enrich = { adp: number | null; projection: number | null; pctStarted: number | null };
  const enrichById = new Map<number, Enrich>();
  const teamsRaw = (args.payload as { teams?: unknown }).teams;
  const teamsArr = Array.isArray(teamsRaw)
    ? teamsRaw
    : teamsRaw && typeof teamsRaw === "object"
      ? Object.values(teamsRaw as Record<string, unknown>)
      : [];
  for (const t of teamsArr as Array<{ roster?: { entries?: unknown[] } }>) {
    for (const e of (t.roster?.entries ?? []) as Array<{ playerPoolEntry?: { player?: Record<string, unknown> } }>) {
      const p = e.playerPoolEntry?.player;
      const id = p?.id as number | undefined;
      if (id == null) continue;
      const ranks = p?.draftRanksByRankType as Record<string, { rank?: number }> | undefined;
      const adp = ranks?.PPR?.rank ?? ranks?.STANDARD?.rank ?? null;
      const stats = (p?.stats as Array<Record<string, unknown>> | undefined) ?? [];
      const projBlock =
        stats.find((s) => s.statSourceId === 1 && s.seasonId === args.season && s.statSplitTypeId === 0) ??
        stats.find((s) => s.statSourceId === 1 && s.seasonId === args.season) ??
        stats.find((s) => s.statSourceId === 1);
      const projection = typeof projBlock?.appliedTotal === "number" ? (projBlock.appliedTotal as number) : null;
      const ownership = p?.ownership as { percentStarted?: number; percentOwned?: number } | undefined;
      const pctStarted = ownership?.percentStarted ?? ownership?.percentOwned ?? null;
      enrichById.set(id, { adp, projection, pctStarted });
    }
  }

  const inputs = args.players.map((p) => {
    const en = enrichById.get(p.playerId);
    const bySeason = args.weeklyById?.get(p.playerId);
    const currentWeekMap = bySeason?.get(args.season);
    const currentSeasonWeekly = currentWeekMap
      ? [...currentWeekMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
      : [];
    const history = bySeason
      ? [...bySeason.entries()]
          .filter(([s]) => s < args.season)
          .map(([season, weeks]) => {
            const vals = [...weeks.values()];
            const avg = vals.length ? vals.reduce((s2, v) => s2 + v, 0) / vals.length : 0;
            const variance =
              vals.length > 1 ? vals.reduce((s2, v) => s2 + (v - avg) * (v - avg), 0) / (vals.length - 1) : 0;
            return { season, avg, stdev: vals.length > 1 ? Math.sqrt(variance) : null, weeks: vals.length };
          })
      : [];
    return {
      playerId: p.playerId,
      position: p.position,
      adpRank: en?.adp ?? null,
      projection: en?.projection ?? p.projectedTotal ?? null,
      keeperRoundSavings: args.keeperSavingsById?.get(p.playerId) ?? null,
      percentStarted: en?.pctStarted ?? null,
      currentSeasonWeekly,
      history,
      currentSeason: args.season,
    };
  });
  return computeMarketValues(inputs);
}

export function valuePlayers(
  players: PlayerRow[],
  marketValues: Map<number, MarketValueResult>,
): Map<number, number> {
  const vorp = calcVORP(players);
  const keepers = calcKeeperEfficiency(players, vorp);
  const ros = calcROSValue(players, 10);
  const out = new Map<number, number>();
  for (const p of players) {
    const tv = calcTradeValue(
      p,
      vorp.find((v) => v.playerId === p.playerId),
      ros.find((r) => r.playerId === p.playerId),
      undefined,
      keepers.find((k) => k.playerId === p.playerId),
      marketValues.get(p.playerId),
    );
    out.set(p.playerId, tv.compositeValue);
  }
  return out;
}

export function buildTradeFinderLeague(args: {
  leagueId: string;
  provider: string;
  season: number;
  userTeamId: number;
  payload: Record<string, unknown>;
  valuesByPlayerId: Map<number, number>;
  picksByTeam?: Map<number, TradeFinderPick[]>;
  behaviorByTeam?: Record<number, ManagerBehaviorEvidence>;
  format?: TradeFinderLeague["format"];
  disclaimers?: string[];
}): TradeFinderLeague {
  const rosters = normalizeRosters(args.payload) as Row[];
  const teamsRows = normalizeTeams(args.payload) as Row[];
  const { slots } = rosterSlotsFromLineupSlotCounts(extractLineupSlotCounts(args.payload), DEFAULT_ROSTER_SLOTS);

  const byTeam = new Map<number, Row[]>();
  for (const r of rosters) {
    const tid = Number(r.teamId);
    if (!Number.isFinite(tid)) continue;
    if (!byTeam.has(tid)) byTeam.set(tid, []);
    byTeam.get(tid)!.push(r);
  }

  const teams: TradeFinderTeam[] = teamsRows.map((t) => {
    const teamId = Number(t.teamId);
    const rows = byTeam.get(teamId) ?? [];
    const seen = new Set<number>();
    const roster: TradeFinderAsset[] = [];
    for (const r of rows) {
      const pid = Number(r.playerId);
      if (!Number.isFinite(pid) || pid <= 0 || seen.has(pid)) continue;
      seen.add(pid);
      const pos = canonicalPosition(String(r.position ?? ""));
      if (!pos) continue;
      const slot = String(r.lineupSlot ?? "Bench");
      const injury = String(r.injuryStatus ?? "");
      const unavailable = isUnavailable(injury, slot);
      roster.push({
        kind: "player",
        assetId: `p:${pid}`,
        playerId: pid,
        name: String(r.playerName ?? `Player ${pid}`),
        position: pos,
        nflTeam: String(r.proTeam ?? ""),
        tradeValue: args.valuesByPlayerId.get(pid) ?? 0,
        weeklyProjection: weeklyProjection(r),
        starter: isStarterSlot(slot) && slot !== "IR",
        bench: slot === "Bench" || slot === "BE",
        ir: slot === "IR" || injury.toUpperCase() === "IR" || injury.toUpperCase() === "INJURY_RESERVE",
        injuryStatus: injury,
        unavailable,
      });
    }
    return {
      teamId,
      displayName: String(t.teamName ?? `Team ${teamId}`),
      ownerName: String(t.owners ?? t.teamName ?? `Team ${teamId}`),
      roster,
      picks: args.picksByTeam?.get(teamId) ?? [],
      needs: [],
    };
  });

  return {
    leagueId: args.leagueId,
    provider: args.provider,
    season: args.season,
    userTeamId: args.userTeamId,
    format: args.format ?? "unknown",
    slots,
    teamCount: teams.length,
    teams,
    behaviorByTeam: args.behaviorByTeam ?? {},
    disclaimers: args.disclaimers ?? [],
  };
}

export function valueOwnedPicks(
  picks: Array<{ teamId: number; round: number; pickInRound: number }>,
  teamCount: number,
): Map<number, TradeFinderPick[]> {
  const out = new Map<number, TradeFinderPick[]>();
  for (const p of picks) {
    if (p.round < 1 || p.pickInRound < 1) continue;
    const resolved = resolveAndValueTradePick({
      round: p.round,
      pickInRound: p.pickInRound,
      teamCount,
      scale: "market",
    });
    if (resolved.source === "unknown" || resolved.marketValue <= 0) continue;
    const rec: TradeFinderPick = {
      pickId: `pick:${p.teamId}:${p.round}.${p.pickInRound}`,
      round: p.round,
      pickInRound: p.pickInRound,
      label: resolved.label,
      tradeValue: resolved.marketValue,
    };
    const list = out.get(p.teamId) ?? [];
    list.push(rec);
    out.set(p.teamId, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.tradeValue - a.tradeValue);
  return out;
}
