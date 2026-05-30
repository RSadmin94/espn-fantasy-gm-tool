/**
 * Recent completed transaction events for dashboard / league feed.
 * Reads persisted `gmTransactions` only (no fabricated events).
 */
import { gmTeams, gmTransactions } from "../drizzle/schema";
import { and as andDrizzle, desc as descDrizzle, eq as eqDrizzle, inArray as inArrayDrizzle } from "drizzle-orm";
import type { AppDb } from "./db";

export type RecentLeagueEventRow = {
  eventType: string;
  teamLabel: string;
  playersLine: string;
  processedMs: number;
  season: number;
};

function normStatus(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase();
}

function isTradeType(type: string | undefined): boolean {
  const t = (type || "").toUpperCase();
  return t === "TRADE" || t.startsWith("TRADE_");
}

function tradeClusterKey(r: {
  type: string;
  transactionId: string;
  relatedTransactionId: string | null;
}): string {
  const t = r.type || "";
  if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") {
    return String(r.relatedTransactionId || r.transactionId || "");
  }
  return String(r.transactionId || "");
}

function eventMs(processedDate: number | null, proposedDate: number | null): number {
  const p = processedDate != null ? Number(processedDate) : NaN;
  if (Number.isFinite(p) && p > 0) return p;
  const d = proposedDate != null ? Number(proposedDate) : 0;
  return Number.isFinite(d) ? d : 0;
}

function teamLabelFromMap(
  map: Map<string, string>,
  season: number,
  teamId: number | null | undefined,
): string {
  if (teamId == null || !Number.isFinite(teamId) || teamId <= 0) return "—";
  return map.get(`${season}:${teamId}`) || `Team ${teamId}`;
}

/**
 * Load recent completed-style transactions for a league across the given seasons
 * (newest first after merge).
 */
export async function loadRecentLeagueTransactionEvents(args: {
  db: AppDb;
  leagueId: string;
  seasons: number[];
  limit: number;
}): Promise<RecentLeagueEventRow[]> {
  const { db, leagueId: lid } = args;
  const seasons = [...new Set(args.seasons.filter((s) => Number.isFinite(s) && s > 0))].sort((a, b) => b - a);
  const limit = Math.min(40, Math.max(1, args.limit));

  if (seasons.length === 0) return [];

  const teamRows = await db
    .select({
      season: gmTeams.season,
      teamId: gmTeams.teamId,
      name: gmTeams.name,
      ownerName: gmTeams.ownerName,
    })
    .from(gmTeams)
    .where(andDrizzle(eqDrizzle(gmTeams.leagueId, lid), inArrayDrizzle(gmTeams.season, seasons)));

  const teamLabel = new Map<string, string>();
  for (const t of teamRows) {
    const tid = Number(t.teamId);
    if (!tid) continue;
    const own = String(t.ownerName ?? "").trim();
    const nm = String(t.name ?? "").trim();
    const label = own && nm ? `${own} (${nm})` : own || nm || `Team ${tid}`;
    teamLabel.set(`${t.season}:${tid}`, label);
  }

  const txRows = await db
    .select({
      season: gmTransactions.season,
      transactionId: gmTransactions.transactionId,
      relatedTransactionId: gmTransactions.relatedTransactionId,
      type: gmTransactions.type,
      status: gmTransactions.status,
      playerId: gmTransactions.playerId,
      playerName: gmTransactions.playerName,
      fromTeamId: gmTransactions.fromTeamId,
      toTeamId: gmTransactions.toTeamId,
      proposedDate: gmTransactions.proposedDate,
      processedDate: gmTransactions.processedDate,
    })
    .from(gmTransactions)
    .where(andDrizzle(eqDrizzle(gmTransactions.leagueId, lid), inArrayDrizzle(gmTransactions.season, seasons)))
    .orderBy(descDrizzle(gmTransactions.processedDate), descDrizzle(gmTransactions.season));

  type Tx = (typeof txRows)[number];

  const isCompleted = (r: Tx): boolean => {
    const st = normStatus(r.status);
    if (st === "EXECUTED") return true;
    /** Some normalized legs omit status but have a processed waiver / add timestamp. */
    if (st === "" && eventMs(r.processedDate, r.proposedDate) > 0) {
      const typ = (r.type || "").toUpperCase();
      if (typ === "ADD" || typ === "DROP" || typ === "WAIVER" || typ === "FREEAGENT" || typ === "ROSTER") {
        return true;
      }
    }
    return false;
  };

  const completed = txRows.filter(isCompleted);
  if (completed.length === 0) return [];

  const tradeBuckets = new Map<string, Tx[]>();
  const simple: Tx[] = [];
  for (const r of completed) {
    if (isTradeType(r.type)) {
      const k = tradeClusterKey(r);
      if (!k) continue;
      const arr = tradeBuckets.get(k) ?? [];
      arr.push(r);
      tradeBuckets.set(k, arr);
    } else {
      simple.push(r);
    }
  }

  const events: RecentLeagueEventRow[] = [];

  /** Executed trade: cluster must include a parent-ish row whose status is EXECUTED (or uphold/accept types). */
  for (const [, group] of tradeBuckets) {
    const hasExecutedParent = group.some((r) => {
      const t = (r.type || "").toUpperCase();
      if (t === "TRADE_UPHOLD" || t === "TRADE_ACCEPT") return normStatus(r.status) === "EXECUTED" || normStatus(r.status) === "";
      if (t === "TRADE" && normStatus(r.status) === "EXECUTED") return true;
      const st = normStatus(r.status);
      if (t === "TRADE_PROPOSAL" && st === "EXECUTED") return true;
      return false;
    });
    if (!hasExecutedParent) continue;

    const ms = Math.max(0, ...group.map((r) => eventMs(r.processedDate, r.proposedDate)));
    const season = group[0]!.season;
    const names = [
      ...new Set(
        group
          .map((r) => String(r.playerName ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const involved = new Set<number>();
    for (const r of group) {
      if (r.toTeamId != null && r.toTeamId > 0) involved.add(Number(r.toTeamId));
      if (r.fromTeamId != null && r.fromTeamId > 0) involved.add(Number(r.fromTeamId));
    }
    const teamBits = [...involved]
      .slice(0, 4)
      .map((tid) => teamLabelFromMap(teamLabel, season, tid))
      .join(" · ");

    events.push({
      eventType: "Trade completed",
      teamLabel: teamBits || "League",
      playersLine: names.length ? names.slice(0, 8).join(", ") : "(see Transactions for details)",
      processedMs: ms,
      season,
    });
  }

  for (const r of simple) {
    const typ = (r.type || "").toUpperCase();
    let eventType = typ || "Transaction";
    if (typ === "ADD") eventType = "Player added";
    else if (typ === "DROP") eventType = "Player dropped";
    else if (typ === "WAIVER") eventType = "Waiver claim";
    else if (typ === "FREEAGENT") eventType = "Free agent add";
    else if (typ === "ROSTER") eventType = "Roster move";

    const tid = r.toTeamId ?? r.fromTeamId;
    const team = teamLabelFromMap(teamLabel, r.season, tid);
    const pname = String(r.playerName ?? "").trim() || (r.playerId ? `Player #${r.playerId}` : "");
    events.push({
      eventType,
      teamLabel: team,
      playersLine: pname || "—",
      processedMs: eventMs(r.processedDate, r.proposedDate),
      season: r.season,
    });
  }

  events.sort((a, b) => b.processedMs - a.processedMs);
  const out = events.slice(0, limit);
  return out;
}
