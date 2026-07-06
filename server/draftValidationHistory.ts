/**
 * draftValidationHistory.ts — Read-only historical draft profiles for validation.
 * Does not modify draft behavior.
 */

import { sql as drizzleSql } from "drizzle-orm";
import { normOwnerKey, OFFENSE_DNA_POSITIONS } from "./ownerDraftDnaModel";
import { normalizeDefensivePosition } from "./leagueIdpDraftProfile";

export interface HistoricalPickRow {
  ownerKey: string;
  ownerName: string;
  season: number;
  round: number;
  position: string;
}

export interface PositionDistribution {
  [position: string]: number;
}

export interface OwnerHistoricalProfile {
  ownerKey: string;
  ownerName: string;
  offensePickCount: number;
  positionDistribution: PositionDistribution;
  avgRoundByPosition: Record<string, number>;
  avgFirstQbRound: number | null;
  avgFirstTeRound: number | null;
  rbWrBalance: number | null;
}

export interface LeagueHistoricalProfile {
  offensePickCount: number;
  positionDistribution: PositionDistribution;
  positionDistributionByRound: Record<number, PositionDistribution>;
  avgRoundByPosition: Record<string, number>;
  avgFirstQbRound: number | null;
  avgFirstTeRound: number | null;
  avgFirstRbRound: number | null;
  avgFirstWrRound: number | null;
  avgFirstDpRound: number | null;
  rbWrBalance: number | null;
}

export interface HistoricalProfileBundle {
  leagueId: string;
  owners: OwnerHistoricalProfile[];
  league: LeagueHistoricalProfile;
}

function normalizePos(pos: string): string {
  const p = normalizeDefensivePosition(pos);
  if (p === "DP") return "DP";
  return OFFENSE_DNA_POSITIONS.has(p) ? p : p;
}

function buildDistribution(counts: Map<string, number>): PositionDistribution {
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  const out: PositionDistribution = {};
  for (const [pos, c] of counts) out[pos] = c / total;
  return out;
}

function avgFirstRound(
  picks: HistoricalPickRow[],
  position: string,
  groupKey: (p: HistoricalPickRow) => string,
): number | null {
  const byGroupSeason = new Map<string, number>();
  for (const p of picks) {
    if (p.position !== position) continue;
    const k = `${groupKey(p)}_${p.season}`;
    const prev = byGroupSeason.get(k);
    if (prev == null || p.round < prev) byGroupSeason.set(k, p.round);
  }
  const rounds = [...byGroupSeason.values()];
  if (!rounds.length) return null;
  return rounds.reduce((a, b) => a + b, 0) / rounds.length;
}

function rbWrBalanceFromDist(dist: PositionDistribution): number | null {
  const rb = dist.RB ?? 0;
  const wr = dist.WR ?? 0;
  const total = rb + wr;
  if (total <= 0) return null;
  return rb / total;
}

function buildOwnerProfile(ownerKey: string, ownerName: string, picks: HistoricalPickRow[]): OwnerHistoricalProfile {
  const offense = picks.filter((p) => OFFENSE_DNA_POSITIONS.has(p.position));
  const posCounts = new Map<string, number>();
  const roundSum = new Map<string, number>();
  const roundCount = new Map<string, number>();

  for (const p of offense) {
    posCounts.set(p.position, (posCounts.get(p.position) ?? 0) + 1);
    roundSum.set(p.position, (roundSum.get(p.position) ?? 0) + p.round);
    roundCount.set(p.position, (roundCount.get(p.position) ?? 0) + 1);
  }

  const avgRoundByPosition: Record<string, number> = {};
  for (const [pos, sum] of roundSum) {
    avgRoundByPosition[pos] = sum / (roundCount.get(pos) ?? 1);
  }

  return {
    ownerKey,
    ownerName,
    offensePickCount: offense.length,
    positionDistribution: buildDistribution(posCounts),
    avgRoundByPosition,
    avgFirstQbRound: avgFirstRound(offense, "QB", (p) => p.ownerKey),
    avgFirstTeRound: avgFirstRound(offense, "TE", (p) => p.ownerKey),
    rbWrBalance: rbWrBalanceFromDist(buildDistribution(posCounts)),
  };
}

function buildLeagueProfile(picks: HistoricalPickRow[]): LeagueHistoricalProfile {
  const offense = picks.filter((p) => OFFENSE_DNA_POSITIONS.has(p.position));
  const dp = picks.filter((p) => p.position === "DP");
  const posCounts = new Map<string, number>();
  const roundSum = new Map<string, number>();
  const roundCount = new Map<string, number>();
  const byRound = new Map<number, Map<string, number>>();

  for (const p of [...offense, ...dp]) {
    posCounts.set(p.position, (posCounts.get(p.position) ?? 0) + 1);
    roundSum.set(p.position, (roundSum.get(p.position) ?? 0) + p.round);
    roundCount.set(p.position, (roundCount.get(p.position) ?? 0) + 1);
    if (!byRound.has(p.round)) byRound.set(p.round, new Map());
    const rm = byRound.get(p.round)!;
    rm.set(p.position, (rm.get(p.position) ?? 0) + 1);
  }

  const avgRoundByPosition: Record<string, number> = {};
  for (const [pos, sum] of roundSum) {
    avgRoundByPosition[pos] = sum / (roundCount.get(pos) ?? 1);
  }

  const positionDistributionByRound: Record<number, PositionDistribution> = {};
  for (const [round, rm] of byRound) {
    positionDistributionByRound[round] = buildDistribution(rm);
  }

  return {
    offensePickCount: offense.length,
    positionDistribution: buildDistribution(posCounts),
    positionDistributionByRound,
    avgRoundByPosition,
    avgFirstQbRound: avgFirstRound(offense, "QB", () => "league"),
    avgFirstTeRound: avgFirstRound(offense, "TE", () => "league"),
    avgFirstRbRound: avgFirstRound(offense, "RB", () => "league"),
    avgFirstWrRound: avgFirstRound(offense, "WR", () => "league"),
    avgFirstDpRound: avgFirstRound(dp, "DP", () => "league"),
    rbWrBalance: rbWrBalanceFromDist(buildDistribution(posCounts)),
  };
}

/** Load historical offense + DP picks for validation dashboards (read-only). */
export async function loadHistoricalProfileBundle(opts: {
  db: { execute: (q: unknown) => Promise<unknown> };
  leagueId: string;
}): Promise<HistoricalProfileBundle> {
  const { db, leagueId } = opts;
  const [rows] = (await db.execute(drizzleSql`
    SELECT d.season, d.roundId, d.position, t.ownerName
    FROM draft_picks d
    JOIN teams t ON t.leagueId = d.leagueId AND t.season = d.season AND t.teamId = d.teamId
    WHERE d.leagueId = ${leagueId}
      AND d.playerName IS NOT NULL AND d.playerName != ''
      AND d.isKeeper = 0
  `)) as [Array<{ season: number; roundId: number; position: string; ownerName: string }>];

  const picks: HistoricalPickRow[] = [];
  for (const r of rows) {
    const pos = normalizePos(String(r.position ?? ""));
    if (!OFFENSE_DNA_POSITIONS.has(pos) && pos !== "DP") continue;
    const ownerName = String(r.ownerName ?? "").trim();
    const ownerKey = normOwnerKey(ownerName);
    if (!ownerKey) continue;
    picks.push({
      ownerKey,
      ownerName,
      season: Number(r.season),
      round: Number(r.roundId),
      position: pos,
    });
  }

  const byOwner = new Map<string, HistoricalPickRow[]>();
  for (const p of picks) {
    if (!byOwner.has(p.ownerKey)) byOwner.set(p.ownerKey, []);
    byOwner.get(p.ownerKey)!.push(p);
  }

  const owners: OwnerHistoricalProfile[] = [];
  for (const [ownerKey, ownerPicks] of byOwner) {
    const ownerName = ownerPicks[0]?.ownerName ?? ownerKey;
    owners.push(buildOwnerProfile(ownerKey, ownerName, ownerPicks));
  }

  return {
    leagueId,
    owners: owners.sort((a, b) => a.ownerName.localeCompare(b.ownerName)),
    league: buildLeagueProfile(picks),
  };
}
