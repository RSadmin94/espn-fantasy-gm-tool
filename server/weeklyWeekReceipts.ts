/**
 * Week 1 receipt overlays: rivalry (existing H2H authority) and draft
 * (existing roster acquisition + draft transactions). Not a new engine.
 */
import { and, eq, like, or } from "drizzle-orm";
import { gmRosterEntries, gmTransactions } from "../drizzle/schema";
import { getDb } from "./db";
import { buildH2HAuthority } from "./h2hAuthority";
import { buildOwnerIdentityAuthority } from "./ownerIdentityAuthority";
import type { InspectedMatchup } from "./weeklyWeekInspect";
import type { BenchRegret, LineupPlayer } from "./weeklyLineupOutcomes";

export type RivalryReceipt = {
  homeOwner: string;
  awayOwner: string;
  qualifying: boolean;
  careerEntering: string | null;
  careerAfter: string | null;
  streak: string | null;
  closeGames: number;
  playoffMeetings: number;
  note: string;
};

export type DraftReceipt = {
  playerName: string;
  ownerName: string;
  classification: "early positive signal" | "early negative signal" | "inconclusive";
  kind: "EARLY_VICTORY_LAP" | "EARLY_WARNING" | "BENCH_EMERGENCE";
  facts: Record<string, string | number | boolean | null>;
};

export type TeamWeekPacket = {
  teamId: number;
  teamName: string;
  ownerName: string;
  result?: string;
  score?: number;
  opponent?: string;
  scoringRank?: number;
  bestStarter?: { name: string; points: number };
  meaningfulBenchIssue?: BenchRegret | null;
  rivalryContext?: string;
  draftReceipt?: string;
  championshipPathMovement?: "improved" | "slightly improved" | "unchanged" | "slightly weakened" | "weakened";
  actionableConcern?: string;
};

function rec(r: { wins: number; losses: number; ties: number }): string {
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

export async function rivalryReceiptsForWeek(opts: {
  leagueId: string;
  season: number;
  week: number;
  matchups: InspectedMatchup[];
}): Promise<RivalryReceipt[]> {
  const identity = await buildOwnerIdentityAuthority(opts.leagueId);
  const h2h = await buildH2HAuthority(opts.leagueId);
  const out: RivalryReceipt[] = [];
  for (const m of opts.matchups) {
    const home = identity.resolve(opts.season, m.homeTeamId);
    const away = identity.resolve(opts.season, m.awayTeamId);
    if (home.status !== "resolved" || away.status !== "resolved" || !home.canonicalPersonId || !away.canonicalPersonId) {
      continue;
    }
    const full = h2h.getH2H(home.canonicalPersonId, away.canonicalPersonId);
    const priorMeetings = full.meetings.filter(
      (x) => x.season < opts.season || (x.season === opts.season && x.week < opts.week),
    );
    const priorReg = priorMeetings.filter((x) => !x.isPlayoff);
    let w = 0, l = 0, t = 0;
    for (const x of priorReg) {
      if (x.winner === home.canonicalPersonId) w += 1;
      else if (x.winner == null) t += 1;
      else l += 1;
    }
    const playoffMeetings = priorMeetings.filter((x) => x.isPlayoff).length;
    const closeGames = priorReg.filter((x) => Math.abs(x.marginA) < 8).length;
    const qualifying = priorReg.length >= 4 || playoffMeetings >= 1 || (full.streak.count >= 3 && priorReg.length >= 2);
    if (!qualifying) continue;
    out.push({
      homeOwner: m.homeOwner,
      awayOwner: m.awayOwner,
      qualifying: true,
      careerEntering: rec({ wins: w, losses: l, ties: t }),
      careerAfter: rec(full.career),
      streak: full.streak.type === "none" ? null : `${full.streak.type}${full.streak.count}`,
      closeGames,
      playoffMeetings,
      note: `${m.homeOwner} vs ${m.awayOwner}: ${priorReg.length} regular-season meetings entering Week ${opts.week}${playoffMeetings ? `, ${playoffMeetings} playoff meeting(s)` : ""}.`,
    });
  }
  return out;
}

export async function draftReceiptsForWeek(opts: {
  leagueId: string;
  season: number;
  week: number;
  players: LineupPlayer[];
  regrets: BenchRegret[];
}): Promise<DraftReceipt[]> {
  const db = await getDb();
  if (!db) return [];
  const [roster, drafts] = await Promise.all([
    db
      .select({
        playerId: gmRosterEntries.playerId,
        playerName: gmRosterEntries.playerName,
        teamId: gmRosterEntries.teamId,
        acquisitionType: gmRosterEntries.acquisitionType,
        slotId: gmRosterEntries.slotId,
      })
      .from(gmRosterEntries)
      .where(
        and(
          eq(gmRosterEntries.leagueId, opts.leagueId),
          eq(gmRosterEntries.season, opts.season),
          eq(gmRosterEntries.week, opts.week),
        ),
      ),
    db
      .select({
        playerId: gmTransactions.playerId,
        playerName: gmTransactions.playerName,
        overallPickNumber: gmTransactions.overallPickNumber,
        round: gmTransactions.round,
        toTeamId: gmTransactions.toTeamId,
        type: gmTransactions.type,
      })
      .from(gmTransactions)
      .where(
        and(
          eq(gmTransactions.leagueId, opts.leagueId),
          eq(gmTransactions.season, opts.season),
          or(like(gmTransactions.type, "%DRAFT%"), eq(gmTransactions.itemType, "DRAFT")),
        ),
      ),
  ]);
  const pickByPlayer = new Map<number, { overall: number | null; round: number | null }>();
  for (const d of drafts) {
    if (d.playerId == null) continue;
    pickByPlayer.set(d.playerId, { overall: d.overallPickNumber, round: d.round });
  }
  const drafted = new Set(
    roster.filter((r) => String(r.acquisitionType).toUpperCase().includes("DRAFT")).map((r) => r.playerId),
  );
  const out: DraftReceipt[] = [];
  for (const p of opts.players) {
    if (!drafted.has(p.playerId)) continue;
    const pick = pickByPlayer.get(p.playerId);
    const round = pick?.round ?? (pick?.overall != null ? Math.ceil(pick.overall / 14) : null);
    if (p.slotId !== 20 && p.slotId !== 21 && p.points >= 22 && round != null && round <= 3) {
      out.push({
        playerName: p.playerName,
        ownerName: p.ownerName,
        classification: "early positive signal",
        kind: "EARLY_VICTORY_LAP",
        facts: { points: p.points, round, overall: pick?.overall ?? null, week: opts.week },
      });
    }
  }
  for (const r of opts.regrets) {
    if (r.impact !== "WIN_FLIP" && r.netImprovement < 12) continue;
    const pick = pickByPlayer.get(r.playerId);
    const round = pick?.round ?? null;
    if (round != null && round >= 8) {
      out.push({
        playerName: r.playerName,
        ownerName: r.ownerName,
        classification: "early positive signal",
        kind: "BENCH_EMERGENCE",
        facts: { benchPoints: r.benchPoints, net: r.netImprovement, impact: r.impact, round },
      });
    }
  }
  return out;
}

export function teamPacketsFromInspect(opts: {
  matchups: InspectedMatchup[];
  leagueAverage: number;
  rivalry: RivalryReceipt[];
  drafts: DraftReceipt[];
}): TeamWeekPacket[] {
  const scores: Array<{ teamId: number; name: string; owner: string; score: number; opp: string; won: boolean; regret: BenchRegret | null; best: { name: string; points: number } | null }> = [];
  for (const m of opts.matchups) {
    const homeWon = m.winnerTeamId === m.homeTeamId;
    const awayWon = m.winnerTeamId === m.awayTeamId;
    scores.push({
      teamId: m.homeTeamId,
      name: m.homeName,
      owner: m.homeOwner,
      score: m.homeScore,
      opp: m.awayName,
      won: homeWon,
      regret: m.benchRegret?.teamId === m.homeTeamId ? m.benchRegret : null,
      best: m.highestStarter?.teamId === m.homeTeamId ? m.highestStarter : null,
    });
    scores.push({
      teamId: m.awayTeamId,
      name: m.awayName,
      owner: m.awayOwner,
      score: m.awayScore,
      opp: m.homeName,
      won: awayWon,
      regret: m.benchRegret?.teamId === m.awayTeamId ? m.benchRegret : null,
      best: m.highestStarter?.teamId === m.awayTeamId ? m.highestStarter : null,
    });
  }
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  return ranked.map((row, i) => {
    const riv = opts.rivalry.find((r) => r.homeOwner === row.owner || r.awayOwner === row.owner);
    const draft = opts.drafts.find((d) => d.ownerName === row.owner);
    let movement: TeamWeekPacket["championshipPathMovement"] = "unchanged";
    if (row.won && row.score >= opts.leagueAverage + 15) movement = "slightly improved";
    else if (!row.won && row.score <= opts.leagueAverage - 15) movement = "slightly weakened";
    const packet: TeamWeekPacket = {
      teamId: row.teamId,
      teamName: row.name,
      ownerName: row.owner,
      result: row.won ? "W" : "L",
      score: row.score,
      opponent: row.opp,
      scoringRank: i + 1,
      championshipPathMovement: movement,
    };
    if (row.best) packet.bestStarter = row.best;
    if (row.regret && row.regret.impact !== "INSIGNIFICANT") packet.meaningfulBenchIssue = row.regret;
    if (riv) packet.rivalryContext = riv.note;
    if (draft) packet.draftReceipt = `${draft.kind}: ${draft.playerName} (${draft.classification})`;
    if (row.regret?.impact === "WIN_FLIP") {
      packet.actionableConcern = `Legal swap of ${row.regret.playerName} for ${row.regret.replacedStarterName} would have flipped the result (+${row.regret.netImprovement}).`;
    }
    return packet;
  });
}
